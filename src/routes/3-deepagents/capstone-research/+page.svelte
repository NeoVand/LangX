<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ResearchDesk, { type DeskPhase, type StationState } from '$lib/components/ResearchDesk.svelte';
	import TodoListView from '$lib/components/TodoListView.svelte';
	import type { CompiledDeepAgent, HarnessInterrupt, Todo, VirtualFile } from '$lib/deepagents';
	import type { BaseMessage } from '@langchain/core/messages';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		buildResearchAgent,
		EXAMPLE_QUESTIONS,
		type ResearchPlan,
		type Lens
	} from '$lib/demos/da-capstone-research';
	import type { Source } from '$lib/runtime/research';
	import daResearchSrc from '$lib/demos/da-capstone-research.ts?raw';
	import researchSkill from '$lib/demos/skills/deepagents-deep-research.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-capstone-research',
		title: 'Capstone — Deep Research',
		summary:
			'A research lead plans, pauses for your approval, fans real-source research out to docs / code / concepts subagents, and synthesizes a cited report. Sources are live and keyless: the official docs repo, the code repos, and Wikipedia.',
		entries: [{ path: 'lib/demos/da-capstone-research.ts', code: daResearchSrc }],
		skill: researchSkill,
		runner: `import { runResearchCapstone } from './lib/demos/da-capstone-research';

// A CLI host that approves the first plan it's shown.
const out = await runResearchCapstone(
	'How do subagents keep their own context, and when should I use async subagents?',
	() => ({ type: 'approve' }),
	{ onPlan: (p) => console.log('plan:', p.plan.map((q) => q.lens).join(', ')) }
);

console.log('\\nSources:', out.sources.length);
console.log(out.report);
`
	};

	let question = $state(EXAMPLE_QUESTIONS[0]);
	let busy = $state(false);
	let started = $state(false);
	let msgs = $state<BaseMessage[]>([]);
	let events = $state<TraceEvent[]>([]);
	let pending = $state<HarnessInterrupt | null>(null);
	let plan = $state<ResearchPlan | null>(null);
	let sources = $state<Source[]>([]);
	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let report = $state('');
	let comment = $state('');
	let agent: CompiledDeepAgent | null = null;
	let thread = '';

	const LENS_LABEL: Record<Lens, string> = { docs: 'Docs', code: 'Code', concepts: 'Concepts' };

	// The plan currently at the gate (from the interrupt args).
	const proposedPlan = $derived(
		pending?.tool === 'present_plan' ? (pending.args as unknown as ResearchPlan) : null
	);

	// Which researchers are idle / working / done, from the subagent trace events.
	const researchers = $derived.by(() => {
		const r: Record<string, StationState> = {};
		for (const e of events) {
			const name = (e.data as { name?: string })?.name;
			if (!name) continue;
			if (e.kind === 'subagent_spawn') r[name] = 'working';
			else if (e.kind === 'subagent_return') r[name] = 'done';
		}
		return r;
	});

	const phase = $derived.by((): DeskPhase => {
		if (!started) return 'idle';
		if (report) return 'done';
		if (proposedPlan && !plan) return 'awaiting';
		if (plan) {
			const researchFiles = files.filter((f) => f.path.startsWith('/research/')).length;
			return researchFiles >= plan.plan.length && plan.plan.length > 0 ? 'synthesizing' : 'researching';
		}
		return 'planning';
	});

	function settle(res: { status: string; interrupt?: HarnessInterrupt; state?: { files?: VirtualFile[] } }) {
		if (res.status === 'interrupted' && res.interrupt) {
			pending = res.interrupt;
		} else {
			pending = null;
			const f = res.state?.files ?? [];
			report = f.find((x) => x.path === '/report/report.md')?.content ?? report;
		}
	}

	async function run() {
		busy = true;
		started = true;
		msgs = [];
		events = [];
		pending = null;
		plan = null;
		sources = [];
		todos = [];
		files = [];
		report = '';
		const built = await buildResearchAgent(question.trim(), {
			onTrace: (ev) => (events = ev),
			onProgress: (s) => {
				todos = s.todos;
				files = s.files;
				const r = s.files.find((f) => f.path === '/report/report.md');
				if (r) report = r.content;
			},
			onSources: (s) => (sources = s),
			onPlan: (p) => (plan = p)
		});
		agent = built.agent;
		thread = built.thread;
		agent.subscribe((s) => (msgs = [...s.messages]));
		try {
			settle(await agent.start({ input: built.input, thread }));
		} finally {
			busy = false;
		}
	}

	async function decide(decision: { type: string; message?: string }) {
		if (!agent || !pending) return;
		busy = true;
		if (decision.type === 'approve') plan = proposedPlan; // lock the approved plan
		comment = '';
		pending = null;
		try {
			settle(await agent.resume(decision, thread));
		} finally {
			busy = false;
		}
	}

	function reset() {
		started = false;
		busy = false;
		plan = null;
		report = '';
		sources = [];
		todos = [];
		files = [];
		msgs = [];
		events = [];
		pending = null;
		comment = '';
		agent = null;
	}

	const SOURCE_GLYPH: Record<Source['source'], string> = { docs: '📘', wikipedia: '🌐', web: '⚙' };

	const interruptCode = `createDeepAgent({
  model, backend,
  subagents: [docsResearcher, codeResearcher, conceptsResearcher],
  tools: [search_docs, read_doc, search_code, read_url, search_web, read_wikipedia, present_plan],
  interruptOn: {
    present_plan: { allowedDecisions: ['approve', 'respond', 'reject'] }  // pause for the human
  },
  compaction: { maxTokens: 32000 }   // long research → context compaction
});`;

	const sourcesCode = `// Real, keyless, CORS-clean reach — no API key, no proxy:
search_docs(q)   → langchain-ai/docs index (the source of docs.langchain.com)
read_doc(id)     → raw.githubusercontent.com/langchain-ai/docs/main/src/oss/…
read_url(url)    → any raw GitHub source or example file
search_web(q)    → en.wikipedia.org  (Pregel, bulk-synchronous-parallel, papers)

// Every read registers a numbered source, so the whole run cites [S1], [S2], …
// the SAME way — across subagents and the final report.`;
</script>

<Lesson
	title="Capstone — Deep Research"
	eyebrow="Level 3 · Lesson 10 · Capstone"
	hero={{
		id: 'l3-capstone-research',
		alt: 'A scholar automaton at a planning lectern dispatches three researcher automatons to archives of documentation, code, and citations'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Everything this level taught, in one agent. A research lead that <Term t="write_todos">plans</Term>, pauses for your <Term t="HITL">approval</Term>, fans real research out to <Term t="Subagent">subagents</Term>, and writes a cited report — over genuinely live sources.
	{/snippet}

	{#snippet intro()}
		<p>
			Ask anything about LangChain, LangGraph, or Deep Agents. The lead decomposes your question
			into focused sub-questions, <strong>shows you the plan and waits for your sign-off</strong>,
			then dispatches a <Term t="Subagent">subagent</Term> per sub-question — one reading the
			official docs, one the source code, one the external concepts a topic rests on
			(<Term t="Pregel">Pregel</Term>, the bulk-synchronous-parallel model, foundational papers).
			Each writes cited notes to the <Term t="Virtual filesystem">filesystem</Term>; the lead
			synthesizes a report where <strong>every claim carries its source</strong>.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The shape" title="Plan · approve · research · synthesize" variant="dropcap">
			<p>
				Modern deep-research agents share one architecture: a lead plans and reflects, a human
				approves the plan, a pool of researchers explores in parallel, and the lead synthesizes
				what they bring back. It is the <Term t="Orchestrator-worker">orchestrator–worker</Term>
				pattern from the <a href="/3-deepagents/subagents">subagents lesson</a>, wearing a
				<a href="/3-deepagents/hitl">human-in-the-loop</a> gate and writing to the
				<a href="/3-deepagents/virtual-fs">virtual filesystem</a>.
			</p>
			<p>
				Why this shape? Because research <em>fills context</em>. Reading a dozen pages into one
				window buries the goal (<Term t="Goal drift">goal drift</Term>). Subagents
				<Term t="Context quarantine">quarantine</Term> each reading task in its own window and
				return only a tight, cited summary — so the lead stays clear-headed enough to
				<a href="/3-deepagents/compaction">synthesize</a>.
			</p>
		</Slide>

		<Slide eyebrow="The gate" title="You approve the plan before a single search" variant="code-first">
			<p>
				A research run is expensive — dozens of model calls and fetches. So the lead must clear
				its plan with you first: it calls <code>present_plan</code>, the run
				<Term t="Checkpointer">checkpoints</Term>, and you
				<a href="/3-deepagents/hitl">approve, or send comments</a> and it revises and re-presents.
				No search begins until you say go.
			</p>
			<CodeBlock code={interruptCode} caption="The full harness — subagents, a plan gate, and compaction for the long haul." />
		</Slide>

		<Slide eyebrow="The sources" title="Real, live, and keyless" variant="code-first">
			<p>
				The agent reaches genuine sources straight from the browser — no API key, no proxy. The
				official docs come from <strong>langchain-ai/docs</strong>, the very repository that
				builds docs.langchain.com, fetched live and accurate. Code and examples come from the
				source repos. External concepts come from Wikipedia. Hosts that block cross-origin reads
				fail <em>honestly</em>, so the agent routes around them instead of inventing facts.
			</p>
			<CodeBlock code={sourcesCode} caption="Three source families — and one shared, numbered citation registry." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-research-loop"
				alt="A circular relay of five brass stations — plan, approve, research, synthesize, report — connected by glowing conduits, with a revise loop from approve back to plan."
			/>
			<figcaption>The loop: plan → approve (revise on comment) → research in parallel → synthesize → report.</figcaption>
		</figure>

		<Slide eyebrow="The output" title="A report that cites its work">
			<p>
				The lead reads the subagents' notes, pulls the numbered <Term t="Source grounding">source
				list</Term>, and writes a structured markdown report: a direct answer, a section per
				sub-question with inline <code>[S#]</code> citations, and a bibliography. Layout is pure
				code — the model writes prose and citations, the page renders them — which is exactly what
				keeps the result <Term t="Source grounding">grounded</Term> and reproducible.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-research-sources"
				alt="One question branches down to three researcher stations — docs, code, concepts — each drawing from its archive, converging into a single dossier with numbered citations."
			/>
			<figcaption>One question, three lenses, one cited dossier — every claim traceable to its source.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>A research agent is only as trustworthy as its citations. The point isn't to sound right — it's to show its work.</p>
		</Slide>

		<Slide variant="ornament">plan · approve · research · cite</Slide>

		<ReadMore
			links={[
				{ label: 'Deep Agents — overview & quickstart', href: 'https://docs.langchain.com/oss/javascript/deepagents/overview' },
				{ label: 'The official deep-research example (deepagentsjs)', href: 'https://github.com/langchain-ai/deepagentsjs/tree/main/examples/async-subagents/parallel-research' },
				{ label: 'deepagents on GitHub (Python + JS)', href: 'https://github.com/langchain-ai/deepagents' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="ask, approve, then watch it research">
			<ol class="howto">
				<li><strong>Commission the research.</strong> Type a question about LangChain, LangGraph, or Deep Agents (or pick an example) — the lead decomposes it into focused sub-questions.</li>
				<li><strong>Approve the plan.</strong> Nothing is searched until you sign off: <strong>approve &amp; begin</strong>, or drop a comment and <strong>request changes</strong> to have the lead revise and re-present.</li>
				<li><strong>Watch the bureau work.</strong> Subagents research real docs, code, and concepts in parallel; <em>Sources</em> fills with numbered live links, and the report lands with every claim carrying its <code>[S#]</code> citation.</li>
			</ol>
		</Panel>

		<Panel title="Your question" subtitle="anything about LangChain, LangGraph, or Deep Agents">
			<textarea class="q" bind:value={question} rows="2" spellcheck="false" disabled={busy || started}></textarea>
			<div class="examples">
				{#each EXAMPLE_QUESTIONS as ex (ex)}
					<button class="ex" disabled={busy || started} onclick={() => (question = ex)}>{ex}</button>
				{/each}
			</div>
			<div class="actions">
				<RunButton onclick={run} running={busy && !pending} disabled={started} label="Commission the research" />
				{#if started && !busy}
					<button class="reset" onclick={reset}>new question</button>
				{/if}
			</div>
		</Panel>

		<Panel title="The bureau" subtitle="plan → approve → research → synthesize → report">
			<ResearchDesk {phase} {researchers} sources={sources.length} />
		</Panel>

		{#if proposedPlan}
			<Panel title="Approve the research plan" subtitle="nothing is searched until you sign off">
				<div class="plan-card">
					<h4 class="plan-title">{proposedPlan.title}</h4>
					<ol class="subqs">
						{#each proposedPlan.plan as item, i (i)}
							<li>
								<span class="lens {item.lens}">{LENS_LABEL[item.lens]}</span>
								<span class="subq">{item.question}</span>
							</li>
						{/each}
					</ol>
					<label class="comment-field">
						<span>Comments (optional) — the lead will revise the plan</span>
						<textarea bind:value={comment} rows="2" disabled={busy} placeholder="e.g. Add a sub-question on async subagents, and drop the code one."></textarea>
					</label>
					<div class="plan-actions">
						<button class="act approve" disabled={busy} onclick={() => decide({ type: 'approve' })}>Approve & begin research</button>
						<button class="act" disabled={busy || !comment.trim()} onclick={() => decide({ type: 'respond', message: comment.trim() })}>Request changes</button>
					</div>
				</div>
			</Panel>
		{/if}

		{#if todos.length}
			<Panel title="Research plan" subtitle="the lead's live to-do board">
				<TodoListView {todos} />
			</Panel>
		{/if}

		{#if sources.length}
			<Panel title="Sources" subtitle="every page the researchers read, numbered for citation">
				<ol class="sources">
					{#each sources as s (s.n)}
						<li>
							<span class="snum">[S{s.n}]</span>
							<span class="sglyph">{SOURCE_GLYPH[s.source]}</span>
							<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
						</li>
					{/each}
				</ol>
			</Panel>
		{/if}

		{#if report}
			<Panel title="The report" subtitle="every claim carries its source">
				<div class="report"><Markdown source={report} /></div>
			</Panel>
		{/if}

		<Panel title="The lead's transcript" subtitle="planning, delegating, synthesizing">
			{#if msgs.length}
				<AgentFeed messages={msgs} maxHeight="20rem" />
			{:else}
				<div class="placeholder">{started ? 'planning…' : 'no run yet'}</div>
			{/if}
		</Panel>
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

	.q {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		font: inherit;
		margin-bottom: 0.6rem;
	}
	.examples {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.ex {
		text-align: left;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font: inherit;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.ex:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.ex:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.actions {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.reset {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-fg-faint);
		font: inherit;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}

	.plan-card {
		border: 1px solid color-mix(in oklch, var(--accent) 40%, var(--color-border));
		border-radius: 10px;
		padding: 0.9rem 1rem;
		background: color-mix(in oklch, var(--accent) 5%, transparent);
	}
	.plan-title {
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
	.subqs {
		margin: 0 0 0.8rem;
		padding-left: 1.3rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.subqs li {
		font-size: 0.88rem;
		line-height: 1.45;
	}
	.lens {
		display: inline-block;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.04rem 0.45rem;
		margin-right: 0.4rem;
		vertical-align: 1px;
	}
	.lens.docs {
		color: var(--accent-ink);
		border-color: color-mix(in oklch, var(--accent) 50%, var(--color-border));
	}
	.lens.code {
		color: var(--color-accent-success);
		border-color: color-mix(in oklch, var(--color-accent-success) 50%, var(--color-border));
	}
	.lens.concepts {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 50%, var(--color-border));
	}
	.comment-field span {
		display: block;
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.3rem;
	}
	.comment-field textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
	}
	.plan-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.7rem;
		flex-wrap: wrap;
	}
	.act {
		font-size: 0.82rem;
		padding: 0.4rem 0.9rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-border);
		background: var(--color-paper);
		color: var(--color-fg-default);
		cursor: pointer;
	}
	.act.approve {
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.act:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.sources {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.sources li {
		display: flex;
		gap: 0.45rem;
		align-items: baseline;
		font-size: 0.82rem;
		min-width: 0;
	}
	.snum {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		flex-shrink: 0;
	}
	.sglyph {
		flex-shrink: 0;
	}
	.sources a {
		color: var(--accent-ink);
		text-decoration: underline;
		text-underline-offset: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.report {
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 1.1rem 1.3rem;
		background: var(--color-paper);
	}

	.placeholder {
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		padding: 1.6rem 0.6rem;
		text-align: center;
		color: var(--color-fg-faint);
		font-size: 0.82rem;
	}

	.diagram {
		margin: 2.2rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		text-align: center;
	}
</style>
