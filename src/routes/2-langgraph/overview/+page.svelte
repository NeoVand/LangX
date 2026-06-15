<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo, type EdgeDetail } from '$lib/components/LiveGraph.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import { MemorySaver, Command } from '@langchain/langgraph';
	import {
		buildAuditGraph,
		runAuditTurn,
		type AuditSnapshot,
		type Edit,
		type Decision,
		type Verdict
	} from '$lib/demos/lg-edgar-audit';
	import edgarSrc from '$lib/runtime/edgar/index.ts?raw';
	import auditSrc from '$lib/demos/lg-edgar-audit.ts?raw';
	import graphRunSrc from '$lib/demos/graph-run.ts?raw';
	import lgOverviewSkill from '$lib/demos/skills/langgraph-overview.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	// ── Sample statements, each with planted errors EDGAR will catch ──────────
	// Each blurb plants at most THREE checkable errors, so the review modal never
	// overflows. (Correct facts are left in so some claims come back ✓ supported.)
	const SAMPLES: Record<string, string> = {
		AAPL: 'Apple Inc., the Cupertino-based software company, trades on the New York Stock Exchange under the ticker AAPL. Its fiscal year ends in December.',
		MSFT: 'Microsoft Corporation, the Redmond software giant, is listed on the New York Stock Exchange under the symbol MSFT, and it remains incorporated in Delaware.',
		KO: 'The Coca-Cola Company trades on the Nasdaq under the ticker KO. It operates in the beverages industry and is incorporated in the state of Georgia.',
		CAT: 'Caterpillar Inc., the heavy-equipment manufacturer, trades on the Nasdaq under the ticker CAT, and is incorporated in Illinois.'
	};

	// The box is the primary entry — a custom blurb about ANY public company.
	// The agent figures out which company it is; the examples below just pre-fill.
	let statement = $state('');
	const activeTemplate = $derived(
		Object.keys(SAMPLES).find((t) => SAMPLES[t] === statement.trim()) ?? null
	);
	function fillTemplate(t: string) {
		statement = SAMPLES[t];
		reset();
	}

	// ── Graph layout — big nodes, long lines, columns aligned at the turns ────
	// Snake: row 1 L→R, drop to row 2 R→L, drop to row 3 L→R. Triage sits under
	// Verify (rightmost column) and Apply under Review (leftmost) so the two
	// turn-edges are clean verticals. The "all clear" bypass is an orthogonal
	// (elbow) edge from Triage's bottom to Report's top.
	const R1 = 50, R2 = 196, R3 = 342;
	const BW = 112, BH = 54;
	const COL_L = 150, COL_M = 314, COL_R = 500; // three aligned columns (wide gaps for labels)
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 46, cy: R1, w: 56, h: 28, shape: 'pill' as const },
		{ id: 'resolve_company', label: 'Resolve', sub: 'model + EDGAR', cx: COL_L, cy: R1, w: BW, h: BH, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'extract_claims', label: 'Extract', sub: 'LLM · structured', cx: COL_M, cy: R1, w: BW, h: BH, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'verify', label: 'Verify ⇉', sub: 'Send · fan-out', cx: COL_R, cy: R1, w: BW, h: BH, shape: 'box' as const, variant: 'fanout' as const },
		{ id: 'triage', label: 'Triage', sub: 'cond. edge', cx: COL_R, cy: R2, w: BW, h: BH, shape: 'box' as const, variant: 'router' as const },
		{ id: 'propose_edits', label: 'Propose', sub: 'LLM · structured', cx: COL_M, cy: R2, w: BW, h: BH, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'human_gate', label: 'Review', sub: 'interrupt()', cx: COL_L, cy: R2, w: BW, h: BH, shape: 'box' as const, variant: 'interrupt' as const },
		{ id: 'apply_edits', label: 'Apply', sub: 'code node', cx: COL_L, cy: R3, w: BW, h: BH, shape: 'box' as const, variant: 'code' as const },
		{ id: 'compose_report', label: 'Report', sub: 'code node', cx: COL_M, cy: R3, w: BW, h: BH, shape: 'box' as const, variant: 'code' as const },
		{ id: '__end__', label: 'END', cx: COL_R - 16, cy: R3, w: 56, h: 28, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'resolve_company' },
		{ from: 'resolve_company', to: 'extract_claims' },
		{ from: 'extract_claims', to: 'verify', label: 'Send ×N', bow: -20, labelDy: -9 },
		{ from: 'verify', to: 'triage' },
		{ from: 'triage', to: 'propose_edits', label: 'wrong', bow: 20, labelDy: -9 },
		{ from: 'propose_edits', to: 'human_gate' },
		{ from: 'human_gate', to: 'apply_edits' },
		{ from: 'apply_edits', to: 'compose_report' },
		{ from: 'compose_report', to: '__end__' },
		{ from: 'triage', to: 'compose_report', label: 'all clear', ortho: { from: 'bottom' as const, to: 'top' as const } }
	];

	// Edges that carry real control-flow structure get their own hover popover.
	const EDGE_DETAIL: Record<string, EdgeDetail> = {
		'extract_claims|verify': {
			title: 'Send · fan-out',
			variant: 'fanout',
			desc: 'Not a normal edge — a conditional edge that returns an array of Send objects. One Send() per claim spawns an independent verify branch; they run in parallel and a concat reducer merges every verdict back into one list.',
			code: `// one Send() per claim → N parallel 'verify' branches
.addConditionalEdges('extract_claims',
  (s) => s.claims.map(
    (claim) => new Send('verify', { claim, digest: s.digest })
  ),
  ['verify'])`
		},
		'triage|propose_edits': {
			title: 'Conditional edge · contradicted',
			variant: 'router',
			desc: 'Taken when at least one verdict came back contradicted — routes to propose_edits to draft corrected wording. Routing is a function of state, not a prompt.',
			code: `.addConditionalEdges('triage',
  (s) => s.verdicts.some((v) => v.status === 'contradicted')
    ? 'propose_edits'    // ← this branch: something to fix
    : 'compose_report',
  ['propose_edits', 'compose_report'])`
		},
		'triage|compose_report': {
			title: 'Conditional edge · all clear',
			variant: 'router',
			desc: 'Taken when every claim is supported — skips propose_edits, the human gate, and apply_edits, jumping straight to the report. A loop would still walk every step.',
			code: `.addConditionalEdges('triage',
  (s) => s.verdicts.some((v) => v.status === 'contradicted')
    ? 'propose_edits'
    : 'compose_report',  // ← this branch: nothing to fix
  ['propose_edits', 'compose_report'])`
		}
	};

	const NODE_LABEL: Record<string, string> = {
		__start__: 'Start',
		resolve_company: 'Resolve company',
		extract_claims: 'Extract claims',
		verify: 'Verify (parallel)',
		triage: 'Triage',
		propose_edits: 'Propose fixes',
		human_gate: 'Human review',
		apply_edits: 'Apply edits',
		compose_report: 'Compose report',
		__end__: 'End'
	};
	const NODE_DESC: Record<string, string> = {
		__start__: "The run begins — state is initialised with the statement + CIK.",
		resolve_company: "The model spots which company the blurb is about, then fetches that company’s live EDGAR record.",
		extract_claims: "The model parses the blurb into atomic, typed claims via withStructuredOutput.",
		verify: "One Send() per claim → N parallel branches. A reducer merges all verdicts back.",
		triage: "A conditional edge reads the merged verdicts and picks the next node — no prompt.",
		propose_edits: "The model drafts a corrected wording per contradicted claim.",
		human_gate: "interrupt() checkpoints state and pauses. Your Command({ resume }) continues it.",
		apply_edits: "A plain function string-replaces the accepted fixes into the statement.",
		compose_report: "A plain function assembles the corrected statement + audit table.",
		__end__: "The graph reached END — all state is final."
	};

	// Plain-language, beginner-friendly explanation for the popover's first tab.
	// `lead` is the one-line takeaway; `body` teaches what's really happening.
	const NODE_EXPLAIN: Record<string, { lead: string; body: string }> = {
		__start__: {
			lead: 'Press play.',
			body: 'Every run begins here. START hands your input — the paragraph to fact-check and which company it is about — to the first step, and the flow begins. Nothing is computed yet; it just kicks things off.'
		},
		resolve_company: {
			lead: 'Work out who, then get the facts.',
			body: "First the AI reads your statement and works out which public company it is about — its ticker symbol. Nothing is hard-coded: the agent decides what to look up based on what you wrote. Then a plain web request pulls that company's official record from the SEC's EDGAR database — legal name, ticker, exchange, industry, fiscal-year end, and so on. Every later step is checked against these real facts."
		},
		extract_claims: {
			lead: 'Turn the paragraph into a checklist.',
			body: "The paragraph is just prose, so the AI reads it and breaks it into separate, checkable statements — 'it trades on the NYSE', 'its fiscal year ends in December', and so on. Each becomes a 'claim' we can verify on its own. This is the language model's job: turning messy text into tidy, structured data."
		},
		verify: {
			lead: 'Fact-check every claim at once.',
			body: "Instead of checking claims one after another, the graph fires off a separate worker for each claim and runs them all at the same time. Each worker compares its claim to the EDGAR facts and returns a verdict — supported, contradicted, or can't-tell. Running them in parallel is the whole point: it's far faster than a plain loop, and it's something a simple chatbot can't do on its own."
		},
		triage: {
			lead: 'A fork in the road.',
			body: "A quick decision point with no AI involved. The graph looks at all the verdicts and asks one question: did anything come back wrong? If yes, it heads down the path to fix things. If everything checks out, it skips ahead straight to writing the report. It's just an if/else, written in code rather than left to the model."
		},
		propose_edits: {
			lead: 'Suggest fixes — but only suggest.',
			body: 'Something was wrong, so the AI drafts a corrected version of each mistaken sentence, grounded in the real EDGAR facts. Important: nothing is changed yet. These are only proposals — a human still gets the final say in the next step.'
		},
		human_gate: {
			lead: 'The program waits for you.',
			body: "This is the magic moment. The graph pauses itself, shows you the suggested fixes, and waits for you to accept or reject each one. It's called 'human-in-the-loop': the program literally stops mid-run, remembers exactly where it was, and only continues once you decide. It could wait a second or a week — this is something a normal one-shot AI call simply cannot do."
		},
		apply_edits: {
			lead: 'Carry out your decisions.',
			body: 'Now that you have chosen, this step rewrites the paragraph — swapping in the fixes you accepted and leaving everything else untouched. Plain code again: just a careful find-and-replace on the text.'
		},
		compose_report: {
			lead: 'Write up the results.',
			body: 'The final write-up. This step assembles a tidy report — the corrected paragraph plus a table showing every claim, its verdict, and what EDGAR actually says. No AI here either; it is simply formatting results we already have.'
		},
		__end__: {
			lead: 'Done.',
			body: 'The graph has reached END. All the work is finished and the final state — report and all — is locked in. The run is complete.'
		}
	};

	// ── Code snippets per node — shown in the expandable timeline ─────────────
	const NODE_CODE: Record<string, string> = {
		resolve_company: `// the model works out which company the statement is about…
const { ticker } = await model
  .withStructuredOutput(CompanySchema)
  .invoke(\`Which public company is this about?\\n\${state.statement}\`);
// …then we resolve its CIK and fetch its live EDGAR record
const facts = await fetchCompanyFacts(resolveCik(ticker));
return { company: facts, digest: factsDigest(facts) };`,
		extract_claims: `const model = getModel().withStructuredOutput(ClaimsSchema);
const { claims } = await model.invoke(messages);
return { claims };`,
		verify: `// conditional edge returns Send() per claim → parallel branches
(s) => s.claims.map(c => new Send('verify', { claim: c, digest: s.digest }))
// each verify branch:
const verdict = await model.withStructuredOutput(VerdictSchema).invoke(…);
return { verdicts: [verdict] };  // reducer: (a, b) => [...a, ...b]`,
		triage: `// conditional edge — pure code, no LLM
(s) => s.verdicts.some(v => v.status === 'contradicted')
  ? 'propose_edits'
  : 'compose_report'`,
		propose_edits: `const model = getModel().withStructuredOutput(EditsSchema);
const { edits } = await model.invoke(messages);
return { edits };`,
		human_gate: `const { decisions } = interrupt({ edits: state.edits });
// ↑ pauses the graph, checkpoints state
// Command({ resume: { decisions } }) continues it
return { decisions };`,
		apply_edits: `let text = state.statement;
for (const d of accepted) text = text.replace(original, fix);
return { corrected: text };`,
		compose_report: `return { report: buildAuditTable(state) };`
	};

	// The typed AuditState, trimmed for display (full EDGAR filings omitted).
	function buildStateObj(snap: AuditSnapshot | undefined): Record<string, unknown> {
		if (!snap) return {};
		const o: Record<string, unknown> = {};
		o.company = snap.company
			? { name: snap.company.name, tickers: snap.company.tickers, exchanges: snap.company.exchanges, industry: snap.company.sicDescription, fiscalYearEnd: snap.company.fiscalYearEndLabel, stateOfIncorporation: snap.company.stateOfIncorporation }
			: null;
		o.claims = snap.claims.map((c) => ({ id: c.id, field: c.field, text: c.text }));
		o.verdicts = snap.verdicts.map((v) => ({ id: v.id, status: v.status, truth: v.truth }));
		o.edits = snap.edits.map((e) => ({ id: e.id, suggestion: e.suggestion }));
		o.decisions = snap.decisions;
		if (snap.corrected) o.corrected = snap.corrected.slice(0, 140) + (snap.corrected.length > 140 ? '…' : '');
		if (snap.report) o.report = '(audit table)';
		return o;
	}

	// ── Run state + frame playback ────────────────────────────────────────────
	type Frame = { node: string; snap: AuditSnapshot };
	let frames = $state<Frame[]>([]);
	let frameIdx = $state(0);
	let running = $state(false);
	let error = $state('');
	let interrupted = $state(false);
	let pendingEdits = $state<Edit[]>([]);
	let reviewDecision = $state<Record<string, 'accept' | 'reject'>>({});
	let reviewText = $state<Record<string, string>>({});
	let modalTab = $state<'review' | 'code'>('review');

	function setDecision(id: string, action: 'accept' | 'reject') {
		reviewDecision = { ...reviewDecision, [id]: action };
	}

	// The interrupt()/Command code shown in the modal's "behind the scenes" tab.
	const codeGate = `// the node that paused this run:
function human_gate(state) {
  // interrupt() checkpoints the full state and stops the graph,
  // surfacing this payload to the caller:
  const { decisions } = interrupt({ edits: state.edits });
  return { decisions };          // ← becomes state once resumed
}

// your approval resumes the SAME thread from its checkpoint:
await graph.invoke(
  new Command({ resume: { decisions } }),
  { configurable: { thread_id } }
);`;

	// The compiled graph + thread persist across the pause so we can resume.
	let graph: Awaited<ReturnType<typeof buildAuditGraph>> | null = null;
	let config: { configurable: { thread_id: string } } | null = null;
	let threadCounter = 0;

	// The latest snapshot, regardless of where the playback head is — so the
	// Output panel keeps showing the full result while you scrub the graph.
	const final = $derived<AuditSnapshot | null>(frames.length ? frames[frames.length - 1].snap : null);
	const atLatest = $derived(frameIdx >= frames.length - 1);
	const pausedNode = $derived(interrupted && atLatest ? 'human_gate' : undefined);

	const STATUS_ICON: Record<Verdict['status'], string> = {
		supported: '✓',
		contradicted: '✗',
		unverifiable: '–'
	};

	// What <LiveGraph> needs from this demo: per-node popover content (meta), the
	// per-step "what happened" (describe), and the State-tab object (buildStateObj).
	const nodeMeta: Record<string, NodeMeta> = Object.fromEntries(
		graphNodes.map((n) => [
			n.id,
			{ label: NODE_LABEL[n.id], explain: NODE_EXPLAIN[n.id], desc: NODE_DESC[n.id], code: NODE_CODE[n.id] }
		])
	);

	function describe(node: string, s: AuditSnapshot, _prev: unknown, count: number): StepInfo | null {
		switch (node) {
			case '__start__':
				return { summary: 'Graph invoked with the statement' };
			case 'resolve_company':
				return {
					summary: `Identified ${s.company?.name ?? '?'} and fetched its EDGAR record`,
					stateChange: s.company
						? `company.name = "${s.company.name}"  ·  tickers = [${s.company.tickers.map((t) => `"${t}"`).join(', ')}]`
						: undefined,
					items: s.company
						? [
								{ icon: '·', text: 'Name', detail: s.company.name },
								{ icon: '·', text: 'Ticker', detail: s.company.tickers.join(', ') || '—' },
								{ icon: '·', text: 'Exchange', detail: s.company.exchanges.join(', ') || '—' },
								{ icon: '·', text: 'Industry', detail: s.company.sicDescription },
								{ icon: '·', text: 'Fiscal yr', detail: s.company.fiscalYearEndLabel },
								{ icon: '·', text: 'State', detail: s.company.stateOfIncorporation }
							]
						: undefined
				};
			case 'extract_claims':
				return {
					summary: `Parsed ${s.claims.length} checkable claims via withStructuredOutput`,
					stateChange: `claims = [${s.claims.length} items]`
				};
			case 'verify':
				return {
					summary: `${count} claim${count > 1 ? 's' : ''} checked in parallel`,
					items: s.verdicts.map((v) => ({ icon: STATUS_ICON[v.status], text: v.text, detail: v.truth || v.note, status: v.status })),
					stateChange: `verdicts = [${s.verdicts.length} merged via (a, b) => [...a, ...b]]`,
					insight: count > 1 ? `${count} branches ran in parallel — a loop would check them one by one` : undefined
				};
			case 'triage': {
				const contradicted = s.verdicts.filter((v) => v.status === 'contradicted').length;
				return {
					summary: contradicted > 0 ? `${contradicted} contradiction${contradicted > 1 ? 's' : ''} found → propose fixes` : 'All supported → skip to report',
					insight: contradicted > 0
						? 'A conditional edge reads state and picks the next node — code, not a prompt'
						: 'Skipped 3 nodes (propose, review, apply) — a loop visits every step'
				};
			}
			case 'propose_edits':
				return {
					summary: `Drafted ${s.edits.length} correction${s.edits.length !== 1 ? 's' : ''} for contradicted claims`,
					stateChange: `edits = [${s.edits.length} items]`
				};
			case 'human_gate':
				return {
					summary: 'Paused — waiting for your accept / reject decisions',
					insight: 'interrupt() checkpoints the full state — resume later, from anywhere, same thread'
				};
			case 'apply_edits': {
				const accepted = s.decisions?.filter((d) => d.action !== 'reject').length ?? 0;
				return {
					summary: `Applied ${accepted} accepted fix${accepted !== 1 ? 'es' : ''}`,
					stateChange: `decisions = [${s.decisions?.map((d) => `"${d.action}"`).join(', ') ?? ''}]`
				};
			}
			case 'compose_report':
				return { summary: 'Assembled the corrected statement + audit table' };
			case '__end__':
				return { summary: 'Graph reached END — all state is final' };
			default:
				return null;
		}
	}


	function reset() {
		frames = [];
		frameIdx = 0;
		interrupted = false;
		pendingEdits = [];
		reviewDecision = {};
		reviewText = {};
		modalTab = 'review';
		error = '';
		graph = null;
		config = null;
	}

	// Reveal each streamed step, then hold briefly so even the instant code nodes
	// (triage, compose_report) are watchable instead of flashing past in one tick.
	const STEP_MS = 480;
	async function pushFrame(node: string, s: AuditSnapshot) {
		frames = [...frames, { node, snap: s }];
		frameIdx = frames.length - 1;
		await new Promise((r) => setTimeout(r, STEP_MS));
	}

	async function run() {
		if (running || !statement.trim()) return;
		reset();
		running = true;
		try {
			graph = await buildAuditGraph(new MemorySaver());
			config = { configurable: { thread_id: `audit-${threadCounter++}` } };
			// Only the statement goes in — the graph identifies the company itself.
			const result = await runAuditTurn(
				graph,
				{ statement },
				config,
				(node, s) => pushFrame(node, s)
			);
			if (result.interrupted) {
				interrupted = true;
				modalTab = 'review';
				pendingEdits = result.pendingEdits;
				reviewDecision = Object.fromEntries(result.pendingEdits.map((e) => [e.id, 'accept']));
				reviewText = Object.fromEntries(result.pendingEdits.map((e) => [e.id, e.suggestion]));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	async function applyDecisions() {
		if (!graph || !config || running) return;
		running = true;
		const decisions: Decision[] = pendingEdits.map((e) => {
			if (reviewDecision[e.id] === 'reject') return { id: e.id, action: 'reject' };
			const edited = reviewText[e.id] ?? e.suggestion;
			return edited.trim() !== e.suggestion.trim()
				? { id: e.id, action: 'edit', text: edited }
				: { id: e.id, action: 'accept' };
		});
		interrupted = false;
		// Carry the pre-pause state across the resume so the post-resume frames
		// (apply → report → end) keep the company, claims and verdicts.
		const seed = frames.length ? frames[frames.length - 1].snap : undefined;
		try {
			await runAuditTurn(
				graph,
				new Command({ resume: { decisions } }),
				config,
				(node, s) => pushFrame(node, s),
				seed
			);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	const source: DemoManifest = {
		id: 'lg-edgar-audit',
		title: 'EDGAR Statement Auditor',
		summary:
			'A LangGraph program that fact-checks a company blurb against live SEC EDGAR — parallel verification, conditional branching, and a human-approval interrupt.',
		entries: [
			{ path: 'lib/runtime/edgar/index.ts', code: edgarSrc },
			{ path: 'lib/demos/graph-run.ts', code: graphRunSrc },
			{ path: 'lib/demos/lg-edgar-audit.ts', code: auditSrc }
		],
		runner: `import { MemorySaver, Command } from '@langchain/langgraph';
import { buildAuditGraph, runAuditTurn } from './lib/demos/lg-edgar-audit';

const graph = await buildAuditGraph(new MemorySaver());
const config = { configurable: { thread_id: 'audit-1' } };
// Just the prose — the graph identifies the company from it (no CIK needed).
const statement = 'Apple Inc., the Cupertino software company, trades on the NYSE under AAPL.';

const r1 = await runAuditTurn(graph, { statement }, config,
  (node) => console.log('  ·', node));
if (r1.interrupted) {
  const decisions = r1.pendingEdits.map((e) => ({ id: e.id, action: 'accept' }));
  const r2 = await runAuditTurn(graph, new Command({ resume: { decisions } }), config,
    (node) => console.log('  ·', node));
  console.log('\\n' + r2.snapshot.report);
}`,
		skill: lgOverviewSkill
	};

	// ── Narrative code excerpts ───────────────────────────────────────────────
	const codeState = `import { Annotation, StateGraph, Send, interrupt } from '@langchain/langgraph';

// Typed shared memory. A reducer says HOW concurrent writes merge —
// here the parallel verifiers each append one verdict.
const AuditState = Annotation.Root({
  statement: Annotation<string>(),
  company:   Annotation<CompanyFacts | null>({ reducer: (_, b) => b, default: () => null }),
  claims:    Annotation<Claim[]>({ reducer: (_, b) => b, default: () => [] }),
  verdicts:  Annotation<Verdict[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  // …edits, decisions, report
});`;

	const codeWiring = `new StateGraph(AuditState)
  .addNode('resolve_company', resolve)   // a CODE node — fetches live EDGAR
  .addNode('extract_claims', extract)    // an LLM node
  .addNode('verify', verify)             // runs once per parallel branch
  .addNode('triage', () => ({}))
  .addNode('propose_edits', propose)
  .addNode('human_gate', (s) => {        // interrupt() pauses the whole run
    const { decisions } = interrupt({ edits: s.edits });
    return { decisions };
  })
  .addEdge(START, 'resolve_company')
  .addEdge('resolve_company', 'extract_claims')
  // ONE Send per claim → N parallel 'verify' branches that merge back:
  .addConditionalEdges('extract_claims',
    (s) => s.claims.map((c) => new Send('verify', { claim: c, digest: s.digest })),
    ['verify'])
  .addEdge('verify', 'triage')
  // branch on the merged state — propose fixes only if something is wrong:
  .addConditionalEdges('triage',
    (s) => s.verdicts.some((v) => v.status === 'contradicted') ? 'propose_edits' : 'compose_report',
    ['propose_edits', 'compose_report'])
  .compile({ checkpointer: new MemorySaver() });`;

	const codeResume = `const config = { configurable: { thread_id: 'audit-1' } };

// 1 · run until interrupt() pauses the graph (state is checkpointed)
let state = await graph.invoke({ statement, cik }, config);

// 2 · the human reviews state.__interrupt__[0].value.edits …
const decisions = edits.map((e) => ({ id: e.id, action: 'accept' })); // or 'reject' / 'edit'

// 3 · resume from the SAME thread — picks up exactly where it paused
state = await graph.invoke(new Command({ resume: { decisions } }), config);`;

	// Accordion: the kinds of node a graph can hold (LangChain's loop only has two).
	const nodeKinds = [
		{
			title: 'A model node',
			meta: 'LLM',
			body: 'Calls the model — here, extract_claims and verify use withStructuredOutput so the model returns typed objects, not prose. The only kind of step a plain agent loop really has.'
		},
		{
			title: 'A code node',
			meta: 'plain function',
			body: 'No model at all — resolve_company fetches live EDGAR, apply_edits string-replaces the text, compose_report builds the audit table. Deterministic, testable, free. "Nodes are nothing more than functions."'
		},
		{
			title: 'A router',
			meta: 'conditional edge',
			body: 'A function that reads state and returns the name of the next node. triage routes to propose_edits or compose_report by inspecting the merged verdicts — control flow as code, not a prompt.'
		},
		{
			title: 'A fan-out',
			meta: 'Send',
			body: 'A conditional edge can return many Sends — one parallel branch per item. The verify node runs once per claim; a reducer concatenates their verdicts back into one list.'
		},
		{
			title: 'A human gate',
			meta: 'interrupt()',
			body: 'A node that calls interrupt() stops the whole run, checkpoints it, and surfaces a payload. Your Command({ resume }) becomes its return value — pause and resume, days apart if you like.'
		}
	];
</script>

<Lesson
	title="The whole graph"
	eyebrow="Level 2 · LangGraph"
	motivation="An agent loop is one fixed shape. LangGraph lets you build the shape yourself — branches, parallelism, pauses, memory. Here's a program, not a chat loop: a fact-checker that audits a company blurb against live SEC filings."
	hero={{ id: 'l2-overview', alt: 'A workshop laid out as one flowing track: a token splits into parallel rails, each checked, then merges at a desk with a lever a hand pauses before the sealed report' }}
	{source}
>
	{#snippet intro()}
		<p>
			In Level 1 every agent was the same loop: a <Term t="Model">model</Term> calling
			<Term t="tool">tools</Term> until it's done. <Term t="LangGraph" /> drops a level: you describe the
			work as a <strong>graph</strong> of <Term t="Node">nodes</Term> over a shared, typed
			<Term t="State">state</Term>, and <Term t="Edge">edges</Term> decide what runs next. Suddenly
			execution can branch, run in parallel, loop, and pause for a human. Watch one do exactly that.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The shift" title="From a loop to a program" variant="dropcap">
			<p>
				<Term t="create_agent"><code>createAgent</code></Term> gives you one control-flow shape —
				model&nbsp;⇄&nbsp;tools — and it's perfect when that's the shape you want. But real work often
				isn't a loop: you want to fan a job out across workers, take a different path when the data
				says so, stop and ask a person, and remember where you were.
			</p>
			<p>
				<Term t="LangGraph" /> is the runtime underneath <code>createAgent</code>, exposed directly. You
				wire <Term t="Node">nodes</Term> (plain functions — some call a model, some are ordinary code)
				with <Term t="Edge">edges</Term> (static or conditional), and they read and write one typed
				<Term t="State">state</Term> object. The demo on the right is a single such graph.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="langgraph-program-poster"
				alt="Left: a single closed loop, one machine running round and round. Right: an open layout that branches, fans out, pauses at a gate, and saves snapshots — the same parts, now a whole program."
			/>
			<figcaption>A loop is one shape. A graph is a layout you design — branch, fan out, pause, remember.</figcaption>
		</figure>

		<Slide title="Read the graph">
			<p>The auditor runs nine steps. Notice that a node is <em>just a function</em> — some are code, some are the model:</p>
			<ul>
				<li><strong>Resolve</strong> — the model identifies which company the blurb is about, then fetches that company's live <Term t="EDGAR">EDGAR</Term> record (identity + filing history).</li>
				<li><strong>Extract</strong> — an LLM node turns the blurb into a list of atomic, checkable claims.</li>
				<li><strong>Verify ⇉</strong> — a <Term t="Send">Send</Term> <Term t="fan-out">fans the claims out</Term> to parallel branches; each verdict <em>merges back</em> through a <Term t="reducer">reducer</Term>.</li>
				<li><strong>Triage</strong> — a <Term t="conditional edge">conditional edge</Term> reads the merged verdicts and branches: propose fixes, or skip straight to the report.</li>
				<li><strong>Review</strong> — <Term t="interrupt"><code>interrupt()</code></Term> pauses the run and hands control to you; a <Term t="Command">Command</Term> resumes it from a <Term t="checkpoint">checkpoint</Term> on the same <Term t="thread">thread</Term>.</li>
			</ul>
		</Slide>

		<Slide title="The state and the wiring" variant="code-first">
			<p>State is shared memory; a <Term t="reducer">reducer</Term> says how concurrent writes combine. The parallel verifiers each append one verdict, so <code>verdicts</code> concatenates:</p>
			<CodeBlock code={codeState} lang="ts" caption="Typed state with reducers — the graph's memory." />
			<p>Then nodes are wired with edges. Two of them are <em>conditional</em> — that's where the program branches:</p>
			<CodeBlock code={codeWiring} lang="ts" caption="Send fans out; conditional edges branch on the merged state." />
		</Slide>

		<Slide title="How a graph actually runs">
			<p>
				A graph doesn't run line by line — it runs in <Term t="super-step">super-steps</Term>. On each
				tick, every node that was triggered runs together (in parallel where it can), then their writes
				are merged through the <Term t="reducer">reducers</Term> before the next tick begins. That
				<Term t="Pregel">batch-then-merge</Term> rhythm is why the whole <Term t="fan-out">fan-out</Term>
				is a single super-step of many <code>verify</code> workers.
			</p>
			<figure class="figimg">
				<HeroImage
					id="langgraph-superstep"
					alt="One tick in three beats: idle workers, then all of them working at once producing tokens, then a funnel merges the tokens and a camera snapshots the ledger — with the next tick boxed faintly behind."
				/>
				<figcaption>One super-step: a batch of nodes runs, their writes merge, a checkpoint is saved — then the next tick.</figcaption>
			</figure>
			<p>
				Saving state every super-step is what makes the run <Term t="Durable execution">durable</Term>:
				it can pause at the human gate, survive a refresh, and even <Term t="Time travel">resume or fork</Term>
				from any saved point. Resuming continues the same <Term t="thread">thread</Term> from its
				<Term t="checkpoint">checkpoint</Term>:
			</p>
			<CodeBlock code={codeResume} lang="ts" caption="invoke → interrupt → resume, all on one thread_id." />
		</Slide>

		<Slide title="Five primitives, one demo">
			<p>This single graph previews the whole chapter — each idea gets its own lesson next:</p>
			<ul>
				<li>
					<strong>Typed <Term t="State">state</Term> &amp; <Term t="reducer">reducers</Term></strong> —
					addressable memory with explicit merge rules. <a href="/2-langgraph/stategraph">StateGraph →</a>
				</li>
				<li>
					<strong><Term t="conditional edge">Conditional edges</Term></strong> — routing as code, not a
					prompt. <a href="/2-langgraph/conditional-edges">Conditional edges &amp; reducers →</a>
				</li>
				<li>
					<strong><Term t="Send">Send</Term> <Term t="fan-out">fan-out</Term></strong> —
					<Term t="Map-reduce">map-reduce</Term> inside a graph.
					<a href="/2-langgraph/send-fanout">Send &amp; fan-out →</a>
				</li>
				<li>
					<strong><Term t="interrupt">Interrupts</Term></strong> — pause, ask a human, resume.
					<a href="/2-langgraph/interrupts">Interrupts &amp; HITL →</a>
				</li>
				<li>
					<strong><Term t="checkpoint">Checkpoints</Term></strong> — every
					<Term t="super-step">super-step</Term> is saved, so a run can pause, resume, and
					time-travel. <a href="/2-langgraph/checkpointers">Checkpointers &amp; time travel →</a>
				</li>
			</ul>
		</Slide>

		<Accordion items={nodeKinds} heading="What a node can be" />

		<Slide title="Where this goes next">
			<p>
				The rest of Level 2 takes this graph apart, one primitive per lesson — starting with
				<a href="/2-langgraph/stategraph"><Term t="StateGraph" /></a>, the bare nodes-edges-state
				machine. Seen the other way: <Term t="LangChain">LangChain</Term>'s
				<Term t="create_agent"><code>createAgent</code></Term> is just a graph someone wired for you, and
				<Term t="Deep Agents">Deep Agents</Term> (Level 3) layers planning, sub-agents, memory, and
				steering on top. Same runtime, all the way up.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>A loop hides its control flow. A graph makes it something you can read, branch, pause, and replay.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'LangGraph — core concepts',
					href: 'https://langchain-ai.github.io/langgraphjs/concepts/low_level/',
					kind: 'docs'
				},
				{
					label: 'Persistence: checkpoints & threads',
					href: 'https://langchain-ai.github.io/langgraphjs/concepts/persistence/',
					kind: 'docs'
				},
				{
					label: 'Human-in-the-loop & interrupt()',
					href: 'https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/',
					kind: 'docs'
				},
				{
					label: 'API · @langchain/langgraph',
					href: 'https://langchain-ai.github.io/langgraphjs/reference/',
					kind: 'api'
				},
				{
					label: 'SEC EDGAR — developer APIs',
					href: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="one paragraph in, a fact-checked report out">
			<ol class="howto">
				<li><strong>Write a claim — or tap a ticker.</strong> Type a sentence about any public company (or pick <code>AAPL</code>, <code>MSFT</code>, <code>KO</code>, <code>CAT</code>), then hit <em>Audit against EDGAR</em>. The graph alone works out which company you mean.</li>
				<li><strong>Watch the graph, live.</strong> Each node lights as it runs — resolve, extract, the parallel <em>Verify</em> fan-out, then triage. Hover any node or labelled edge to read what it did and the state it wrote.</li>
				<li><strong>Hold the pen at the pause.</strong> If anything contradicts EDGAR, the run stops at <code>interrupt()</code> — accept, edit, or reject each fix, then resume to see the corrected statement and audit table.</li>
			</ol>
		</Panel>

		<Panel title="The statement to audit" subtitle="write a sentence or paragraph about any public company — the agent figures out which one and checks every fact against live SEC EDGAR">
			<textarea
				class="statement"
				bind:value={statement}
				rows="4"
				spellcheck="false"
				placeholder="e.g. Apple Inc., the Cupertino software company, trades on the New York Stock Exchange under AAPL and its fiscal year ends in December."
			></textarea>
			<div class="run-row">
				<button class="run" onclick={run} disabled={running || !statement.trim()}>
					{running ? 'Auditing…' : 'Audit against EDGAR'}
				</button>
				{#if frames.length}<button class="reset" onclick={reset} disabled={running}>Clear</button>{/if}
			</div>
			<div class="examples">
				<span class="examples-label">or try an example:</span>
				{#each Object.keys(SAMPLES) as t (t)}
					<button class="chip" class:on={activeTemplate === t} onclick={() => fillTemplate(t)} disabled={running}>
						{t}
					</button>
				{/each}
			</div>
			{#if error}
				<div class="err">{error}</div>
			{/if}
		</Panel>

		{#if frames.length}
			<Panel title="The graph, live" subtitle="hover any node or labelled edge to inspect what it does">
				<LiveGraph
					nodes={graphNodes}
					edges={graphEdges}
					{frames}
					bind:frameIdx
					meta={nodeMeta}
					edgeDetails={EDGE_DETAIL}
					{describe}
					toState={buildStateObj}
					{pausedNode}
				/>
			</Panel>
		{/if}

		{#if interrupted && atLatest}
			<div class="modal-backdrop" role="dialog" aria-modal="true">
				<div class="modal-card">
					<div class="modal-head">
						<div class="modal-title"><span class="modal-pause">⏸</span> Paused at <code>interrupt()</code></div>
						<div class="modal-tabs">
							<button class:on={modalTab === 'review'} onclick={() => (modalTab = 'review')}>Review</button>
							<button class:on={modalTab === 'code'} onclick={() => (modalTab = 'code')}>Behind the scenes</button>
						</div>
					</div>

					{#if modalTab === 'review'}
						<div class="modal-sub">{pendingEdits.length} proposed {pendingEdits.length === 1 ? 'fix' : 'fixes'} — accept or reject each, then resume.</div>
						<div class="gate">
							{#each pendingEdits as e (e.id)}
								{@const rejected = reviewDecision[e.id] === 'reject'}
								<div class="edit" class:rejected>
									<div class="edit-diff">
										<span class="edit-orig">{e.original}</span>
										{#if !rejected}
											<input class="edit-sugg" bind:value={reviewText[e.id]} spellcheck="false" />
										{/if}
									</div>
									<div class="edit-why">{e.reason}</div>
									<div class="edit-actions">
										<button class="ea accept" class:on={!rejected} onclick={() => setDecision(e.id, 'accept')}>✓ Accept</button>
										<button class="ea reject" class:on={rejected} onclick={() => setDecision(e.id, 'reject')}>✗ Reject</button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="modal-sub">What the graph runtime did to pause — and what your decision resumes.</div>
						<pre class="modal-code">{codeGate}</pre>
					{/if}

					<button class="run resume" onclick={applyDecisions} disabled={running}>
						{running ? 'Resuming…' : 'Apply decisions & resume →'}
					</button>
				</div>
			</div>
		{/if}

		{#if final && final.report && !interrupted}
			<Panel title="Output" subtitle="everything the run produced — stays put as you step through the graph">
				{#if final.corrected}
					<div class="corrected"><Markdown source={final.corrected} /></div>
				{/if}
				<div class="report"><Markdown source={final.report} /></div>
			</Panel>
		{/if}

	{/snippet}
</Lesson>

<style>
	.howto {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.howto strong {
		color: var(--color-fg);
	}

	/* In-narrative images: show at natural size, no crop, hide HeroImage's alt overlay. */
	.poster {
		margin: 1.8rem 0;
	}
	.figimg {
		margin: 1.4rem 0;
	}
	.poster :global(.hero),
	.figimg :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.poster :global(.hero img),
	.figimg :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.poster :global(.hero .caption),
	.figimg :global(.hero .caption) {
		display: none;
	}
	.poster figcaption,
	.figimg figcaption {
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}

	.examples {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.7rem;
	}
	.examples-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		margin-right: 0.1rem;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.26rem 0.66rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--accent-rule);
	}
	.chip.on {
		border-color: var(--accent);
		color: var(--accent);
	}
	.statement {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font-sans);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg);
		resize: vertical;
	}
	.run-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.run {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-weight: 500;
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		background: linear-gradient(155deg, color-mix(in oklch, var(--accent) 26%, var(--color-bg-elev-2)), var(--color-bg-elev-2));
		color: var(--accent);
		cursor: pointer;
		transition: filter 0.15s ease;
	}
	.run:hover:not(:disabled) {
		filter: brightness(1.12);
	}
	.run:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.reset {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.err {
		margin-top: 0.6rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	/* ── Human-gate modal — right side only ── */
	.modal-backdrop {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 50%;
		background: color-mix(in oklch, var(--color-bg) 85%, transparent);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(8px);
	}
	.modal-card {
		background: var(--color-bg-elev-2, #1c1814);
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		padding: 1.2rem 1.4rem;
		max-width: 28rem;
		width: 90%;
		max-height: 75vh;
		overflow-y: auto;
	}
	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
	.modal-title {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-fg);
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.modal-title code {
		font-size: 0.74rem;
		color: var(--accent);
		background: none;
		padding: 0;
	}
	.modal-pause {
		color: var(--accent);
	}
	.modal-tabs {
		display: flex;
		gap: 0.2rem;
		background: color-mix(in oklch, var(--color-fg) 5%, transparent);
		border-radius: 0.4rem;
		padding: 0.15rem;
	}
	.modal-tabs button {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.2rem 0.5rem;
		border-radius: 0.3rem;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.modal-tabs button.on {
		background: var(--color-bg-elev-2, #1c1814);
		color: var(--color-fg);
	}
	.modal-sub {
		font-size: 0.7rem;
		color: var(--color-fg-muted);
		margin-bottom: 0.8rem;
		line-height: 1.4;
	}
	.modal-code {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
		background: color-mix(in oklch, var(--color-fg) 4%, transparent);
		border: 1px solid color-mix(in oklch, var(--color-rule) 50%, transparent);
		border-radius: 0.4rem;
		padding: 0.7rem 0.8rem;
		margin: 0 0 0.9rem;
		overflow-x: auto;
		white-space: pre;
	}
	.gate {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-bottom: 0.9rem;
	}
	.edit {
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		padding: 0.5rem 0.6rem;
		background: color-mix(in oklch, var(--color-fg) 3%, transparent);
	}
	.edit.rejected {
		opacity: 0.6;
	}
	.edit-diff {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.3rem;
	}
	.edit-orig {
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		text-decoration: line-through;
		text-decoration-color: color-mix(in oklch, var(--color-accent-danger) 60%, transparent);
	}
	.edit-sugg {
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font-sans);
		font-size: 0.8rem;
		color: var(--color-fg);
		background: var(--color-bg-elev, #15110d);
		border: 1px solid var(--accent-rule);
		border-radius: 0.3rem;
		padding: 0.3rem 0.45rem;
	}
	.edit-why {
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		margin: 0.25rem 0 0.4rem;
		line-height: 1.35;
	}
	.edit-actions {
		display: flex;
		gap: 0.4rem;
	}
	.ea {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.22rem 0.6rem;
		border-radius: 0.3rem;
		border: 1px solid var(--color-rule);
		background: transparent;
		color: var(--color-fg-faint);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.ea.accept.on {
		border-color: var(--color-accent-success);
		color: var(--color-accent-success);
		background: color-mix(in oklch, var(--color-accent-success) 12%, transparent);
	}
	.ea.reject.on {
		border-color: var(--color-accent-danger);
		color: var(--color-accent-danger);
		background: color-mix(in oklch, var(--color-accent-danger) 12%, transparent);
	}
	.resume {
		width: 100%;
		text-align: center;
	}

	.corrected {
		border-left: 3px solid var(--accent);
		padding: 0.2rem 0 0.2rem 0.8rem;
		margin-bottom: 0.9rem;
		font-size: 0.9rem;
	}
</style>
