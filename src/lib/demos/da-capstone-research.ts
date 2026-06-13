/**
 * CAPSTONE — THE DEEP-RESEARCH AGENT.
 *
 * A research lead, built on the Deep Agents harness, answers any question about
 * LangChain, LangGraph, or Deep Agents by doing real research:
 *
 *   1. PLAN      decompose the question into focused sub-questions (write_todos)
 *   2. APPROVE   present the plan and PAUSE for the human (interruptOn) — they
 *                approve it, or send comments and the lead revises and re-presents
 *   3. RESEARCH  fan out one subagent per sub-question (docs · code · concepts),
 *                each searching REAL sources and writing cited notes to the VFS
 *   4. SYNTHESIZE read the notes and write a cited report to /report/report.md
 *
 * The sources are real and keyless (see $lib/runtime/research): the official docs
 * (langchain-ai/docs, the source of docs.langchain.com), the code repositories,
 * and Wikipedia for external concepts the docs only cite (Pregel, the
 * bulk-synchronous-parallel model, foundational papers).
 *
 * Every capability this level taught shows up here: planning, subagents, the
 * virtual filesystem, human-in-the-loop, context compaction, and durable memory.
 */
import {
	createDeepAgent,
	StateBackend,
	StoreBackend,
	CompositeBackend,
	type SubAgentSpec,
	type CompiledDeepAgent,
	type HarnessInterrupt,
	type Todo,
	type VirtualFile
} from '$lib/deepagents';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { Tracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';
import {
	searchDocs,
	searchCode,
	searchWikipedia,
	fetchDoc,
	fetchUrl,
	fetchWikipedia,
	createSourceRegistry,
	type Source,
	type SourceRegistry
} from '$lib/runtime/research';

// ── The plan the lead proposes (and you approve) ─────────────────────────────
export type Lens = 'docs' | 'code' | 'concepts';
export interface PlanItem {
	question: string;
	lens: Lens;
}
export interface ResearchPlan {
	title: string;
	plan: PlanItem[];
}

export const LENS_AGENT: Record<Lens, string> = {
	docs: 'docs-researcher',
	code: 'code-researcher',
	concepts: 'concepts-researcher'
};

export const EXAMPLE_QUESTIONS = [
	'How do subagents manage their own context, and when should I use async subagents?',
	'Explain Pregel and the bulk-synchronous-parallel model behind LangGraph.',
	'How does Deep Agents compact context — what are the exact thresholds?'
];

export interface ResearchRunResult {
	question: string;
	plan: ResearchPlan | null;
	todos: Todo[];
	files: VirtualFile[];
	sources: Source[];
	report: string;
	events: TraceEvent[];
	finalText: string;
}

export interface ResearchCallbacks {
	onTrace?: (events: TraceEvent[]) => void;
	onProgress?: (s: { todos: Todo[]; files: VirtualFile[] }) => void;
	/** Live numbered bibliography as sources are read. */
	onSources?: (sources: Source[]) => void;
	/** Fires when the lead proposes (or re-proposes) a plan for approval. */
	onPlan?: (plan: ResearchPlan) => void;
}

// ── Research tools — real fetch, shared source registry ──────────────────────
// All read tools auto-register what they read, so every subagent and the final
// report cite the same source by the same number.

function buildResearchTools(registry: SourceRegistry, cb: ResearchCallbacks, tracer?: Tracer) {
	const announce = () => cb.onSources?.(registry.list());

	const search_docs = tool(
		async ({ query }) => {
			const hits = searchDocs(query);
			tracer?.emit('note', `search_docs "${query}" → ${hits.length}`);
			if (!hits.length) return `No documentation pages matched "${query}". Try broader terms or search_web.`;
			return hits.map((h) => `- ${h.title}  [read_doc id: ${h.ref}]`).join('\n');
		},
		{
			name: 'search_docs',
			description:
				'Search the official LangChain / LangGraph / Deep Agents documentation index by keyword. Returns page titles and the id to pass to read_doc.',
			schema: z.object({ query: z.string().describe('Keywords, e.g. "subagents context window".') })
		}
	);

	const search_code = tool(
		async ({ query }) => {
			const hits = searchCode(query);
			if (!hits.length) return `No code entry points matched "${query}". Try the docs, or read a known raw GitHub URL with read_url.`;
			return hits.map((h) => `- ${h.title}  [read_url: ${h.ref}]`).join('\n');
		},
		{
			name: 'search_code',
			description:
				'Search curated entry points into the langchain-ai source repositories (README, package API, middleware source, runnable examples). Returns raw GitHub URLs to pass to read_url.',
			schema: z.object({ query: z.string() })
		}
	);

	const search_web = tool(
		async ({ query }) => {
			const hits = await searchWikipedia(query);
			if (!hits.length) return `No Wikipedia articles matched "${query}".`;
			return hits.map((h) => `- ${h.title}  [read_wikipedia title: ${h.ref}]${h.snippet ? ` — ${h.snippet.slice(0, 90)}` : ''}`).join('\n');
		},
		{
			name: 'search_web',
			description:
				'Search Wikipedia for external concepts the docs only cite — e.g. Pregel, the bulk-synchronous-parallel model, MapReduce, or a foundational paper. Returns titles to pass to read_wikipedia.',
			schema: z.object({ query: z.string() })
		}
	);

	const read_doc = tool(
		async ({ id }) => {
			const r = await fetchDoc(id);
			tracer?.emit('fs_op', `read_doc ${id}`, { result: r.ok ? 'ok' : 'fail' });
			if (!r.ok) return `Could not read "${id}": ${r.error}`;
			const n = registry.cite(r.url, r.title ?? id, 'docs');
			announce();
			return `[S${n}] ${r.title} — ${r.url}\nWhen you use a fact from this page, cite it as [S${n}].\n\n${r.text}${r.truncated ? '\n\n…(truncated)' : ''}`;
		},
		{
			name: 'read_doc',
			description: 'Read the full text of a documentation page by its id (from search_docs). Registers it as a numbered source.',
			schema: z.object({ id: z.string().describe('A doc id like "deepagents/subagents".') })
		}
	);

	const read_url = tool(
		async ({ url }) => {
			const r = await fetchUrl(url);
			tracer?.emit('fs_op', `read_url ${url}`, { result: r.ok ? 'ok' : 'fail' });
			if (!r.ok) return `Could not read ${url}: ${r.error}`;
			const n = registry.cite(r.url, r.title ?? url, 'web');
			announce();
			return `[S${n}] ${r.title ?? r.url} — ${r.url}\nCite facts from here as [S${n}].\n\n${r.text}${r.truncated ? '\n\n…(truncated)' : ''}`;
		},
		{
			name: 'read_url',
			description:
				'Fetch a raw source or example file by URL (raw.githubusercontent.com works; a github.com blob URL is auto-converted). CORS-blocked hosts fail honestly — prefer raw GitHub or Wikipedia.',
			schema: z.object({ url: z.string() })
		}
	);

	const read_wikipedia = tool(
		async ({ title }) => {
			const r = await fetchWikipedia(title);
			tracer?.emit('fs_op', `read_wikipedia ${title}`, { result: r.ok ? 'ok' : 'fail' });
			if (!r.ok) return `Could not read "${title}": ${r.error}`;
			const n = registry.cite(r.url, r.title ?? title, 'wikipedia');
			announce();
			return `[S${n}] ${r.title} — ${r.url}\nCite facts from here as [S${n}].\n\n${r.text}${r.truncated ? '\n\n…(truncated)' : ''}`;
		},
		{
			name: 'read_wikipedia',
			description: 'Read the plain-text extract of a Wikipedia article by title (from search_web). Registers it as a numbered source.',
			schema: z.object({ title: z.string() })
		}
	);

	const list_sources = tool(
		async () => {
			const all = registry.list();
			if (!all.length) return 'No sources read yet.';
			return all.map((s) => `[S${s.n}] ${s.title} — ${s.url}`).join('\n');
		},
		{
			name: 'list_sources',
			description: 'List every numbered source read so far — use it to write the "## Sources" section of the report.',
			schema: z.object({})
		}
	);

	// The plan gate. When the lead calls this, the run PAUSES (interruptOn) and
	// the human reviews args.title + args.plan. On approval the tool runs and
	// returns the go-ahead; on a rejection/response the lead revises and re-calls.
	const present_plan = tool(
		async ({ title, plan }) => {
			cb.onPlan?.({ title, plan });
			tracer?.emit('note', `plan approved: ${plan.length} sub-questions`);
			return `Plan approved. Research these ${plan.length} sub-questions now, one subagent each:\n${plan
				.map((p, i) => `${i + 1}. (${LENS_AGENT[p.lens]}) ${p.question} → write /research/q${i + 1}.md`)
				.join('\n')}`;
		},
		{
			name: 'present_plan',
			description:
				'Present the research plan to the human for approval BEFORE any research. Pass the report title and the list of sub-questions, each tagged with the best lens (docs, code, or concepts). If they send comments, revise and call this again.',
			schema: z.object({
				title: z.string().describe('A short title for the report.'),
				plan: z
					.array(
						z.object({
							question: z.string(),
							lens: z.enum(['docs', 'code', 'concepts'])
						})
					)
					.min(2)
					.max(5)
			})
		}
	);

	return [search_docs, search_code, search_web, read_doc, read_url, read_wikipedia, list_sources, present_plan];
}

// ── Subagents — each a real child agent, inheriting the research tools ────────

const RESEARCHER_COMMON = `You research ONE sub-question, then stop. Be decisive — do not over-read.
- Search ONCE with the tool for your lens, then read the 1–2 MOST relevant sources (two at most).
- Only state what the sources actually say. If a source is blocked, errors, or is thin, note it and move on — never retry the same URL.
- Write your findings to the file path given in your task (for the record), as 3–6 concise bullets, each ENDING with its citation, e.g. "[S3]".
- Then REPLY with those same 3–6 cited bullets as your result — this reply is what the lead reads to write the report, so make it complete and self-contained.`;

const SUBAGENTS: SubAgentSpec[] = [
	{
		name: 'docs-researcher',
		description: 'Researches a sub-question against the official documentation. Use for API, concepts, and how-to questions.',
		systemPrompt: `You are the Documentation Researcher. Use search_docs then read_doc. Prefer the most specific page.\n${RESEARCHER_COMMON}`,
		maxIterations: 14
	},
	{
		name: 'code-researcher',
		description: 'Researches a sub-question against the source code and runnable examples in the repositories.',
		systemPrompt: `You are the Code Researcher. Use search_code then read_url (raw GitHub). Ground claims in real source and examples.\n${RESEARCHER_COMMON}`,
		maxIterations: 14
	},
	{
		name: 'concepts-researcher',
		description: 'Researches an external concept the docs only cite — algorithms, models, or foundational papers — via Wikipedia.',
		systemPrompt: `You are the Concepts Researcher. Use search_web then read_wikipedia for the underlying idea (e.g. Pregel, bulk-synchronous-parallel). Explain it plainly.\n${RESEARCHER_COMMON}`,
		maxIterations: 14
	}
];

const SYSTEM_PROMPT = `You are a meticulous research lead. You answer questions about LangChain, LangGraph, and
Deep Agents by doing real research, never from memory. You delegate; you do not research yourself.

Follow this procedure exactly:

1. PLAN. Call write_todos with: Plan · Get approval · Research · Synthesize · Write report (first in_progress).
   Decompose the user's question into 2–5 focused sub-questions. Tag each with the best lens:
   - "docs" for API/how-to/concepts in the official documentation,
   - "code" for "how is it implemented" / examples in the source repos,
   - "concepts" for external ideas the docs only cite (algorithms, models, papers).

2. GET APPROVAL. Call present_plan({ title, plan }). The run pauses for the human.
   - If they approve, proceed.
   - If they send comments, REVISE the plan accordingly and call present_plan again. Do not start research until approved.

3. RESEARCH. For each sub-question i, call task({ subagent_type: <the lens's researcher>, description:
   "Sub-question: <question>. Write your cited findings to /research/q<i>.md." }). One subagent per sub-question.
   Each task RETURNS that researcher's cited bullets — that return is your material. Update write_todos as you go.

4. SYNTHESIZE. You already have every researcher's findings (they came back as your task results) — do NOT
   read_file the research notes again. Just call list_sources ONCE to get the numbered bibliography.

5. WRITE THE REPORT to /report/report.md in clean markdown:
   - "# <title>" then a one-paragraph summary that directly answers the question.
   - One "## <heading>" section per sub-question, written in your own words, with inline [S#] citations on every claim.
   - A final "## Sources" section listing every [S#] from list_sources, one per line, with its URL.
   Then mark all todos completed and reply with ONE sentence pointing to the report.

Rules: never invent sources or facts; every non-trivial claim needs an [S#]. Keep the report tight and readable.`;

// ── Build + drive ────────────────────────────────────────────────────────────

export interface ResearchHandle {
	agent: CompiledDeepAgent;
	thread: string;
	input: string;
	registry: SourceRegistry;
}

export async function buildResearchAgent(
	question: string,
	cb: ResearchCallbacks = {}
): Promise<ResearchHandle> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	const registry = createSourceRegistry();
	const tools = buildResearchTools(registry, cb, tracer);

	// CompositeBackend: research notes are ephemeral; the finished report is
	// written to durable /memories/ so it outlives the thread (the backends lesson).
	const backend = new CompositeBackend(
		[{ prefix: '/memories/', backend: new StoreBackend('deep-research') }],
		new StateBackend()
	);

	// The lead writes the whole report as ONE write_file argument, so it needs a
	// big output budget — too small and the content string truncates mid-call and
	// the tool rejects it (the same trap the Toymaker hit).
	const model = await getModel({ temperature: 0.2, maxTokens: 6000, reasoningEffort: 'medium' });
	const agent = createDeepAgent({
		model,
		backend,
		tools,
		subagents: SUBAGENTS,
		systemPrompt: SYSTEM_PROMPT,
		tracer,
		maxIterations: 70,
		// The report-writing gate: pause for the human before any research.
		interruptOn: {
			present_plan: {
				allowedDecisions: ['approve', 'respond', 'reject'],
				description: 'Review the research plan before the search begins.'
			}
		},
		// Subagents quarantine the big reads, so the lead's context stays lean —
		// give it a generous budget and a high eviction floor so synthesis doesn't
		// churn its own research notes to disk.
		compaction: { maxTokens: 32000, summarizeThresholdPct: 88, largeToolResultMin: 8000 }
	});
	agent.subscribe((s) => cb.onProgress?.({ todos: [...s.todos], files: [...s.files] }));

	return {
		agent,
		thread: `research-${Math.random().toString(36).slice(2, 6)}`,
		input: question,
		registry
	};
}

export type ApproveFn = (i: HarnessInterrupt) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * Drives the full plan → approve → research → report loop, asking `approve` at
 * the plan gate. The in-browser page drives the same start/resume loop with a
 * proper plan-approval card. This is the exact source the demo runs.
 */
export async function runResearchCapstone(
	question: string,
	approve: ApproveFn,
	cb: ResearchCallbacks = {}
): Promise<ResearchRunResult> {
	const { agent, thread, input, registry } = await buildResearchAgent(question, cb);
	let res = await agent.start({ input, thread });
	while (res.status === 'interrupted') {
		const decision = await approve(res.interrupt);
		res = await agent.resume(decision, thread);
	}
	const state = res.state;
	const files = state.files ?? [];
	const reportFile = files.find((f) => f.path === '/report/report.md');
	const last = state.messages?.[state.messages.length - 1];
	const finalText = typeof last?.content === 'string' ? last.content : '';
	return {
		question,
		plan: null,
		todos: state.todos ?? [],
		files,
		sources: registry.list(),
		report: reportFile?.content ?? '',
		events: [],
		finalText
	};
}
