/**
 * The EDGAR Statement Auditor — a LangGraph *program* (not a chat loop) that
 * fact-checks a paragraph about a public company against LIVE SEC EDGAR data and
 * lets a human accept or reject each suggested fix.
 *
 * Why this needs a graph and not a `createAgent` loop:
 *   • it FANS OUT — every claim is verified in its own parallel branch (Send),
 *     and the verdicts merge back through a reducer;
 *   • it BRANCHES — a conditional edge routes to "propose fixes" only if
 *     something is actually wrong;
 *   • it PAUSES — `interrupt()` hands control to the human at the review gate,
 *     and the run resumes from a checkpoint with their decisions.
 *
 * The shape:
 *   START → resolve_company (live EDGAR fetch) → extract_claims (LLM)
 *         → Send ⇉ verify × N (parallel) → triage
 *         → [contradictions?] → propose_edits (LLM) → ⏸ human_gate (interrupt)
 *                              → apply_edits → compose_report → END
 *         → [all clear]       → compose_report → END
 *
 * Ground truth is the company's live EDGAR "submissions" record (identity +
 * filing history). Dollar-figure claims are tagged `financial` and reported as
 * unverifiable, because EDGAR's XBRL number endpoints are not reachable from a
 * browser. See `$lib/runtime/edgar`.
 */
// Import the MAIN entry (not /web): in the browser Vite's "browser" condition
// resolves it to the web build (so the in-app demo + sync interrupt shim work),
// while Node — the downloaded .zip under tsx — gets the real async_hooks build,
// so the download runs standalone.
import { Annotation, StateGraph, MemorySaver, Send, START, END, interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import { getModel } from '$lib/runtime/llm';
import { fetchCompanyFacts, factsDigest, resolveSample, type CompanyFacts } from '$lib/runtime/edgar';
import { runGraphTurn, type StreamableGraph } from './graph-run';

// ── The data that flows through the graph ──────────────────────────────────
export type ClaimField =
	| 'name'
	| 'ticker'
	| 'exchange'
	| 'industry'
	| 'fiscalYear'
	| 'stateOfIncorporation'
	| 'formerName'
	| 'filing'
	| 'financial'
	| 'other';

export interface Claim {
	id: string;
	text: string;
	field: ClaimField;
}

export type VerdictStatus = 'supported' | 'contradicted' | 'unverifiable';

export interface Verdict {
	id: string;
	text: string;
	field: ClaimField;
	status: VerdictStatus;
	truth: string; // the actual EDGAR value (or '' when unverifiable)
	note: string; // one-line explanation
}

export interface Edit {
	id: string; // matches the claim/verdict id
	original: string;
	suggestion: string;
	reason: string;
}

export type DecisionAction = 'accept' | 'edit' | 'reject';

export interface Decision {
	id: string;
	action: DecisionAction;
	text?: string; // when action === 'edit'
}

// ── Typed shared state. Reducers say how concurrent writes merge ────────────
export const AuditState = Annotation.Root({
	statement: Annotation<string>(),
	cik: Annotation<string>(),
	company: Annotation<CompanyFacts | null>({ reducer: (_a, b) => b, default: () => null }),
	digest: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
	claims: Annotation<Claim[]>({ reducer: (_a, b) => b, default: () => [] }),
	// The parallel `verify` workers each append one verdict — hence a concat reducer.
	verdicts: Annotation<Verdict[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
	edits: Annotation<Edit[]>({ reducer: (_a, b) => b, default: () => [] }),
	decisions: Annotation<Decision[]>({ reducer: (_a, b) => b, default: () => [] }),
	corrected: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
	report: Annotation<string>({ reducer: (_a, b) => b, default: () => '' })
});

// ── Structured-output schemas (the model must return exactly these) ─────────
const CompanySchema = z.object({
	ticker: z
		.string()
		.describe('the stock ticker symbol (best guess, uppercase) of the single U.S. public company this statement is about, e.g. "AAPL"'),
	name: z.string().describe('the company name as written or implied in the statement')
});

const ClaimsSchema = z.object({
	claims: z
		.array(
			z.object({
				text: z.string().describe('the single factual assertion, quoted as closely as possible'),
				field: z
					.enum([
						'name',
						'ticker',
						'exchange',
						'industry',
						'fiscalYear',
						'stateOfIncorporation',
						'formerName',
						'filing',
						'financial',
						'other'
					])
					.describe('which kind of fact this claim is about')
			})
		)
		.describe('every checkable factual claim in the statement')
});

const VerdictSchema = z.object({
	status: z
		.enum(['supported', 'contradicted', 'unverifiable'])
		.describe('supported if the EDGAR facts confirm it, contradicted if they disagree, unverifiable if the facts do not cover it'),
	truth: z.string().describe('the relevant value quoted from the EDGAR facts, or "" if unverifiable'),
	note: z.string().describe('one short sentence explaining the verdict')
});

const EditsSchema = z.object({
	edits: z
		.array(
			z.object({
				claimId: z.string().describe('the id of the contradicted claim'),
				suggestion: z.string().describe('the corrected wording, grounded in the EDGAR facts'),
				reason: z.string().describe('one short sentence on why')
			})
		)
		.describe('one corrected rewrite per contradicted claim')
});

// ── Prompts (plain strings — structured output handles the formatting) ──────
const identifyInput = (statement: string) =>
	`Identify the single U.S. public company this statement is about. Return its stock ticker symbol (your best guess, uppercase) and its name. Do not explain.\n\nStatement:\n"""\n${statement}\n"""`;

const extractInput = (statement: string) =>
	`You are auditing a paragraph written about a public company. Pull out every concrete, checkable factual claim it makes about the company's IDENTITY (legal name, ticker symbol, stock exchange, industry, fiscal-year end, state of incorporation, former names) and its SEC FILINGS (which forms it filed and when). Tag any claim about dollar amounts or financial results as "financial". Split compound sentences into separate atomic claims. Keep each claim's wording close to the original.\n\nStatement:\n"""\n${statement}\n"""`;

const verifyInput = (claim: Claim, digest: string) =>
	`Verify a single claim about a company using ONLY the EDGAR facts below. Do not use outside knowledge. If the facts confirm the claim, status="supported". If they clearly disagree, status="contradicted". If the facts simply do not cover it, status="unverifiable". Quote the relevant EDGAR value in "truth".\n\nEDGAR facts (live):\n${digest}\n\nClaim to verify:\n"${claim.text}"`;

const editsInput = (bad: Verdict[]) =>
	`Each line below is a claim that was CONTRADICTED by EDGAR, with the correct value. Rewrite each into a corrected, natural phrasing that matches the EDGAR truth. Return one edit per claim id.\n\n${bad
		.map((v) => `[${v.id}] claim: "${v.text}" — EDGAR truth: ${v.truth || v.note}`)
		.join('\n')}`;

// ── A deterministic audit report (code node — reliable provenance) ──────────
function buildReport(s: typeof AuditState.State): string {
	const f = s.company;
	const icon = (st: VerdictStatus) =>
		st === 'supported' ? '✅' : st === 'contradicted' ? '❌' : '➖';
	const rows = s.verdicts
		.map((v) => `| ${icon(v.status)} | ${v.text} | ${v.truth || '—'} |`)
		.join('\n');
	const supported = s.verdicts.filter((v) => v.status === 'supported').length;
	const contradicted = s.verdicts.filter((v) => v.status === 'contradicted').length;
	const unverifiable = s.verdicts.filter((v) => v.status === 'unverifiable').length;
	const applied = s.decisions.filter((d) => d.action !== 'reject').length;
	return [
		`## Audit — ${f?.name ?? 'company'}`,
		`**${supported} supported · ${contradicted} contradicted · ${unverifiable} unverifiable.** ${applied ? `${applied} fix${applied === 1 ? '' : 'es'} applied.` : ''}`,
		'',
		'| | Claim | EDGAR says |',
		'|---|---|---|',
		rows,
		'',
		f ? `_Ground truth: live EDGAR filing record for CIK ${f.cik}, fetched ${f.fetchedAt.slice(0, 10)}._` : ''
	].join('\n');
}

// ── Build the compiled graph (await models once, then wire the nodes) ───────
export async function buildAuditGraph(checkpointer: MemorySaver) {
	const identifyModel = (await getModel({ temperature: 0, maxTokens: 80 })).withStructuredOutput(
		CompanySchema,
		{ name: 'identify_company' }
	);
	const extractModel = (await getModel({ temperature: 0, maxTokens: 700 })).withStructuredOutput(
		ClaimsSchema,
		{ name: 'extract_claims' }
	);
	const verifyModel = (await getModel({ temperature: 0, maxTokens: 300 })).withStructuredOutput(
		VerdictSchema,
		{ name: 'verdict' }
	);
	const editModel = (await getModel({ temperature: 0.2, maxTokens: 500 })).withStructuredOutput(
		EditsSchema,
		{ name: 'propose_edits' }
	);

	return new StateGraph(AuditState)
		// 1 · The agent works out WHICH company the statement is about (model),
		//     then pulls that company's live identity + filing record (EDGAR).
		//     Nothing is hard-coded — the target is derived from the prose.
		.addNode('resolve_company', async (s) => {
			if (s.company) return {}; // already resolved (e.g. on resume) — keep it
			const id = await identifyModel.invoke(identifyInput(s.statement));
			const match = resolveSample(id.ticker) ?? resolveSample(id.name);
			if (!match) {
				throw new Error(
					`Couldn't match "${id.name || id.ticker || '?'}" to a company in the offline SEC directory. ` +
						`Try one of the examples, or a large US-listed company (AAPL, MSFT, GOOGL, …).`
				);
			}
			const facts = await fetchCompanyFacts(match.cik);
			return { cik: match.cik, company: facts, digest: factsDigest(facts) };
		})
		// 2 · Turn the prose into a list of atomic, typed claims (LLM).
		.addNode('extract_claims', async (s) => {
			if (s.claims.length) return {};
			const res = await extractModel.invoke(extractInput(s.statement));
			const claims: Claim[] = res.claims.map((c, i) => ({ id: `c${i + 1}`, text: c.text, field: c.field }));
			return { claims };
		})
		// 3 · One Send per claim runs this node in parallel; results merge via the reducer.
		.addNode('verify', async (s: { claim: Claim; digest: string }) => {
			const { claim, digest } = s;
			if (claim.field === 'financial') {
				return {
					verdicts: [
						{
							id: claim.id,
							text: claim.text,
							field: claim.field,
							status: 'unverifiable' as const,
							truth: '',
							note: 'Dollar figures live in EDGAR XBRL, which is not reachable from the browser.'
						}
					]
				};
			}
			const v = await verifyModel.invoke(verifyInput(claim, digest));
			return {
				verdicts: [
					{ id: claim.id, text: claim.text, field: claim.field, status: v.status, truth: v.truth, note: v.note }
				]
			};
		})
		// 4 · Fan-in. A no-op marker node so the branch decision has a clean home.
		.addNode('triage', async () => ({}))
		// 5 · Draft a corrected rewrite for every contradicted claim (LLM).
		.addNode('propose_edits', async (s) => {
			const bad = s.verdicts.filter((v) => v.status === 'contradicted');
			if (!bad.length) return { edits: [] };
			const res = await editModel.invoke(editsInput(bad));
			const edits: Edit[] = res.edits.map((e) => {
				const v = bad.find((b) => b.id === e.claimId);
				return { id: e.claimId, original: v?.text ?? '', suggestion: e.suggestion, reason: e.reason };
			});
			return { edits };
		})
		// 6 · Hand control to the human. interrupt() pauses the run (checkpointed);
		//     the resume value becomes its return. MUST be called synchronously.
		.addNode('human_gate', (s) => {
			const resume = interrupt({ type: 'review_edits', edits: s.edits }) as {
				decisions?: Decision[];
			};
			return { decisions: resume?.decisions ?? [] };
		})
		// 7 · Apply the accepted/edited fixes to the original text (code node).
		.addNode('apply_edits', async (s) => {
			let text = s.statement;
			for (const d of s.decisions) {
				if (d.action === 'reject') continue;
				const edit = s.edits.find((e) => e.id === d.id);
				if (!edit || !edit.original) continue;
				const replacement = d.action === 'edit' ? (d.text ?? edit.suggestion) : edit.suggestion;
				if (text.includes(edit.original)) text = text.replace(edit.original, replacement);
			}
			return { corrected: text };
		})
		// 8 · Assemble the audit report (deterministic — trustworthy provenance).
		.addNode('compose_report', async (s) => ({
			report: buildReport(s),
			corrected: s.corrected || s.statement
		}))
		.addEdge(START, 'resolve_company')
		.addEdge('resolve_company', 'extract_claims')
		// Conditional fan-out: one Send('verify', …) per claim, or skip to the report.
		.addConditionalEdges(
			'extract_claims',
			(s) =>
				s.claims.length
					? s.claims.map((claim) => new Send('verify', { claim, digest: s.digest }))
					: 'compose_report',
			['verify', 'compose_report']
		)
		.addEdge('verify', 'triage')
		// Conditional branch: only propose fixes if something was contradicted.
		.addConditionalEdges(
			'triage',
			(s) => (s.verdicts.some((v) => v.status === 'contradicted') ? 'propose_edits' : 'compose_report'),
			['propose_edits', 'compose_report']
		)
		.addEdge('propose_edits', 'human_gate')
		.addEdge('human_gate', 'apply_edits')
		.addEdge('apply_edits', 'compose_report')
		.addEdge('compose_report', END)
		.compile({ checkpointer });
}

// ── A snapshot the UI can render, plus a streaming runner ───────────────────
export interface AuditSnapshot {
	company: CompanyFacts | null;
	claims: Claim[];
	verdicts: Verdict[];
	edits: Edit[];
	decisions: Decision[];
	corrected: string;
	report: string;
}

export interface TurnResult {
	lastNode: string | null;
	interrupted: boolean;
	pendingEdits: Edit[];
	snapshot: AuditSnapshot;
}

function emptySnapshot(): AuditSnapshot {
	return {
		company: null,
		claims: [],
		verdicts: [],
		edits: [],
		decisions: [],
		corrected: '',
		report: ''
	};
}

function mergeInto(snap: AuditSnapshot, partial: Record<string, unknown>) {
	if (!partial || typeof partial !== 'object') return;
	if (partial.company) snap.company = partial.company as CompanyFacts;
	if (partial.claims) snap.claims = partial.claims as Claim[];
	if (partial.verdicts) snap.verdicts = [...snap.verdicts, ...(partial.verdicts as Verdict[])];
	if (partial.edits) snap.edits = partial.edits as Edit[];
	if (partial.decisions) snap.decisions = partial.decisions as Decision[];
	if (typeof partial.corrected === 'string') snap.corrected = partial.corrected;
	if (typeof partial.report === 'string') snap.report = partial.report;
}

type CompiledAuditGraph = Awaited<ReturnType<typeof buildAuditGraph>>;

/**
 * Stream one turn of the graph. `input` is the initial state on the first call,
 * or a `Command({ resume })` to continue past the human gate. `onUpdate` fires
 * once per node as it completes (node name + the accumulated snapshot), which
 * drives the live graph + state inspector. Returns whether the run paused at an
 * interrupt and, if so, the edits awaiting review.
 */
export async function runAuditTurn(
	graph: CompiledAuditGraph,
	input: unknown,
	config: { configurable: { thread_id: string } },
	/**
	 * Called once per node as the graph streams. May return a promise — the run
	 * awaits it, so the caller can pace playback (code nodes like triage/report
	 * finish in microseconds and would otherwise flash past in a single frame).
	 */
	onUpdate?: (node: string, snapshot: AuditSnapshot) => void | Promise<void>,
	/**
	 * Prior state to continue from. When resuming after an interrupt, the second
	 * turn's stream only carries the post-resume node updates — seed it with the
	 * pre-pause snapshot so accumulated state (company, claims, verdicts…) carries
	 * across the pause instead of resetting to empty.
	 */
	seed?: AuditSnapshot
): Promise<TurnResult> {
	const r = await runGraphTurn<AuditSnapshot>(graph as unknown as StreamableGraph, input, config, {
		empty: emptySnapshot,
		merge: mergeInto,
		clone: cloneSnapshot,
		onUpdate
	});
	// The auditor pauses with an `{ edits }` payload at the human gate.
	const pendingEdits =
		(r.interruptValue as { value?: { edits?: Edit[] } }[] | undefined)?.[0]?.value?.edits ?? [];
	return {
		lastNode: r.lastNode,
		interrupted: r.interrupted,
		pendingEdits,
		snapshot: r.snapshot
	};
}

function cloneSnapshot(s: AuditSnapshot): AuditSnapshot {
	return {
		...s,
		claims: [...s.claims],
		verdicts: [...s.verdicts],
		edits: [...s.edits],
		decisions: [...s.decisions]
	};
}
