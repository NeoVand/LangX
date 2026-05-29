<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { harnessLayers } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { BASE_AGENT_PROMPT, assembleSystemPrompt, type VirtualFile } from '$lib/deepagents';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import { runHarnessDemo } from '$lib/demos/da-harness';
	import harnessSrc from '$lib/demos/da-harness.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-harness',
		title: 'The deep-agent harness',
		summary:
			'Build a deep-agent harness from toggles (compaction, HITL) and drive one end-to-end run.',
		entries: [{ path: 'lib/demos/da-harness.ts', code: harnessSrc }],
		runner: `import { runHarnessDemo } from './lib/demos/da-harness';

const { finalText } = await runHarnessDemo({
	instructions: 'You are a senior researcher helping the user write a brief on the LangGraph runtime. Always plan before you act.',
	useCompaction: true,
	useHitl: false,
	onTrace: () => {},
	onFiles: (files) => console.log('  · files:', files.map((f) => f.path).join(', '))
});

console.log('\\nFinal:', finalText);
`
	};

	let userInstructions = $state(`You are a senior researcher helping the user
write a brief on the LangGraph runtime. Always plan before you act.`);

	// Middleware toggles the learner can flip before building the agent.
	let useCompaction = $state(true);
	let useHitl = $state(false);

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state('');

	const composedPreview = $derived(
		assembleSystemPrompt({
			user: userInstructions,
			todos: [],
			files: [],
			skills: undefined,
			subagents: undefined
		})
	);

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		try {
			const out = await runHarnessDemo({
				instructions: userInstructions,
				useCompaction,
				useHitl,
				onTrace: (e) => (events = e),
				onFiles: (f) => (files = f)
			});
			finalText = out.finalText;
		} catch (e) {
			finalText = `Run failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			busy = false;
		}
	}

	const code = `import { createDeepAgent, StateBackend, StoreBackend, CompositeBackend } from '$lib/deepagents';

const agent = createDeepAgent({
  model,
  instructions: 'You are a senior researcher.',
  tools: [],                                 // user-supplied tools
  backend: new CompositeBackend(             // routes paths to backends
    [{ prefix: '/memories/', backend: new StoreBackend('demo') }],
    new StateBackend()
  ),
  permissions: [
    { operations: ['write'], paths: ['**/.env'], mode: 'deny' },
    { operations: ['read', 'write'], paths: ['**'], mode: 'allow' }
  ],
  subagents: [{ name: 'researcher', description: '…', prompt: '…', run: spawn }],
  skills: [{ name: 'cite', description: '…', body: '…' }],
  compaction: { maxTokens: 2000, evictThresholdPct: 50, summarizeThresholdPct: 85 },
  interruptOn: ['write_file']                // surface for human approval
});

const result = await agent.invoke({ input: 'Brief me on LangGraph.' });`;
</script>

<Lesson
	title="The harness"
	eyebrow="Phase 3 · Lesson 01"
	hero={{
		id: 'l3-harness',
		alt: 'An exploded diagram of a leather harness with brass fittings labeled by glyph'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="LangGraph">LangGraph</Term> gives you primitives. The <Term t="Harness">harness</Term> gives
		you a working agent. This lesson is about the difference — and why most teams will never build
		their own.
	{/snippet}

	{#snippet intro()}
		<p>
			A <Term t="Harness" /> is what you get when <Term t="LangGraph">LangGraph</Term>'s primitives have been pre-wired into
			a working cognitive system. The harness owns <Term t="Planning">planning</Term>, the <Term t="Virtual filesystem">virtual filesystem</Term>, <Term t="Subagent">subagent</Term>
			delegation, <Term t="Summarization">summarization</Term>, and <Term t="HITL">human approval</Term> — you configure it, you don't reimplement
			it.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The promise" title="Configure, don't reimplement" variant="dropcap">
			<p>
				Most production agents reinvent the same five things: a way to plan, a place to write
				notes, a way to delegate, a way to summarize when context overflows, and a way to ask a
				human. The harness ships these as pre-wired <Term t="Middleware">middleware</Term> so your job becomes
				<strong>declaring policy</strong>, not assembling plumbing.
			</p>
			<p>
				If you've used LangChain's <Term t="create_agent"><code>create_agent</code></Term>, the harness is the same idea taken
				one floor higher. <Term t="create_agent"><code>create_agent</code></Term> wraps the <Term t="ReAct">ReAct</Term> loop. The harness wraps a
				planning-and-delegation loop with a <Term t="Virtual filesystem">virtual filesystem</Term> and <Term t="Skill">skill</Term> catalog underneath.
			</p>
		</Slide>

		<Slide eyebrow="The shape" title="One factory, many middlewares">
			<p>
				The mental model: <Term t="createDeepAgent"><code>createDeepAgent({'{...}'})</code></Term> takes a <Term t="Model">model</Term> and a list of
				configurable concerns, then returns a graph you can <Term t="invoke"><code>invoke</code></Term> /
				<Term t="stream"><code>stream</code></Term> like any other <Term t="Runnable">Runnable</Term>.
			</p>
			<ul>
				<li><strong><Term t="System prompt">System prompt</Term></strong> — assembled from base + your instructions + middleware.</li>
				<li><strong>Graph</strong> — <code>agent → tools → agent</code>, with <Term t="Context compaction">compaction</Term> baked between rounds.</li>
				<li><strong><Term t="tool">Tools</Term></strong> — <Term t="write_todos"><code>write_todos</code></Term>, <Term t="ls"><code>ls</code></Term>/<Term t="read_file"><code>read</code></Term>/<Term t="write_file"><code>write</code></Term>/<Term t="edit_file"><code>edit</code></Term>/<Term t="glob"><code>glob</code></Term>/<Term t="grep"><code>grep</code></Term>, <Term t="task"><code>task</code></Term>, <Term t="load_skill"><code>load_skill</code></Term>.</li>
				<li><strong><Term t="Backend">Backend</Term></strong> — where files live (state, store, or composite).</li>
				<li><strong><Term t="Permissions">Permissions</Term></strong> — declarative allow/deny on filesystem ops.</li>
				<li><strong><Term t="Subagent">Subagents</Term></strong> — ephemeral child agents spawned via <Term t="task"><code>task</code></Term>.</li>
				<li><strong><Term t="Skill">Skills</Term></strong> — <Term t="Progressive disclosure">progressive-disclosure</Term> catalog of expertise.</li>
				<li><strong><Term t="Interrupt">Interrupts</Term></strong> — <Term t="interruptOn"><code>interruptOn</code></Term> wraps named tools in <Term t="HITL">HITL</Term> gates.</li>
			</ul>
		</Slide>

		<Diagram spec={harnessLayers} />

		<Slide variant="pull-quote">
			<p>
				The harness is opinionated on purpose. Every decision it makes for you is one your team
				would otherwise spend a sprint re-deciding.
			</p>
		</Slide>

		<Slide title="The factory" variant="code-first">
			<p>
				Here is the entire public surface. Almost every key is optional — only <Term t="Model"><code>model</code></Term>
				is strictly required. Everything else is <Term t="Middleware">middleware</Term> you opt into.
			</p>
			<CodeBlock
				code={code}
				lang="ts"
				caption="The createDeepAgent factory. Optional keys default to sensible behaviours."
			/>
		</Slide>

		<Slide title="Read the source">
			<p>
				Open <code>src/lib/deepagents/</code> in this repo. The <Term t="Harness">harness</Term> is built from scratch in
				about 600 lines of TypeScript so you can read it next to the lesson. Every concept in
				this chapter maps to an obvious file there.
			</p>
		</Slide>

		<Slide title="The base prompt" variant="code-first">
			<p>
				Below is the actual <Term t="BASE_AGENT_PROMPT"><code>BASE_AGENT_PROMPT</code></Term> the harness ships with. It is the
				smallest piece of context that gives the agent its operating shape — plan first, prefer
				files over chat, delegate to <Term t="Subagent">subagents</Term>, mark progress.
			</p>
			<CodeBlock code={BASE_AGENT_PROMPT} lang="md" />
		</Slide>

		<Slide title="What you'll see in this chapter" ornament>
			<p>
				Each remaining lesson zooms in on one of the harness's pieces — the <Term t="Virtual filesystem">virtual filesystem</Term>,
				the planner, the <Term t="Backend">backends</Term>, the <Term t="Permissions">permissions</Term> model, the <Term t="Subagent">subagents</Term>, the <Term t="Skill">skills</Term> catalog,
				<Term t="Context compaction">context compaction</Term>, and <Term t="HITL">human-in-the-loop</Term>. By the end you'll have built two capstones
				against a real <Term t="Model">model</Term>.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Build & run a harness" subtitle="edit instructions, toggle middleware, run">
			<label class="field">
				<span>User instructions</span>
				<textarea bind:value={userInstructions} rows="3"></textarea>
			</label>
			<div class="toggles">
				<label class="toggle">
					<input type="checkbox" bind:checked={useCompaction} />
					<span>Compaction middleware</span>
				</label>
				<label class="toggle">
					<input type="checkbox" bind:checked={useHitl} />
					<span>HITL on write_file (auto-approved here)</span>
				</label>
			</div>
			<RunButton onclick={run} running={busy} label="Build & run agent" />
		</Panel>

		<Panel title="Assembled system prompt" subtitle="BASE → MIDDLEWARE → USER">
			<pre class="prompt code-surface scrollbar-slim">{composedPreview}</pre>
		</Panel>

		<Panel title="Virtual filesystem (after run)">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="final">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Live trace">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.field span {
		font-size: 0.72rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	textarea {
		resize: vertical;
	}

	.prompt {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.55;
		padding: 0.95rem 1.1rem;
		max-height: 28rem;
		overflow: auto;
		white-space: pre-wrap;
		color: var(--color-ink-100);
	}

	.toggles {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-bottom: 0.85rem;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background: var(--color-bg);
		font-size: 0.84rem;
		color: var(--color-ink-100);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.toggle:has(input:checked) {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}
	.toggle span {
		line-height: 1.35;
	}
	.final {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
