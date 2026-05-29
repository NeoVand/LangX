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
	import {
		BASE_AGENT_PROMPT,
		assembleSystemPrompt,
		createDeepAgent,
		StateBackend,
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { displayContent } from '$lib/runtime/messages';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

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
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const model = await getModel({ temperature: 0, maxTokens: 400 });
			const backend = new StateBackend();
			const thread = `harness-${Math.random().toString(36).slice(2, 6)}`;
			const agent = createDeepAgent({
				model,
				backend,
				instructions: userInstructions,
				tracer,
				maxIterations: 16,
				...(useCompaction
					? { compaction: { maxTokens: 4000, evictThresholdPct: 45, summarizeThresholdPct: 80 } }
					: {}),
				...(useHitl ? { interruptOn: ['write_file'] } : {})
			});
			agent.subscribe((s) => (files = [...s.files]));

			// Drive the run; auto-approve any HITL pause so this lesson stays focused
			// on assembly (the HITL lesson covers approval UX in depth).
			let res = await agent.start({
				input: 'Plan two steps, write a one-line note to /scratch/plan.md, then summarize what you did.',
				thread
			});
			while (res.status === 'interrupted') {
				res = await agent.resume({ decision: 'approve' }, thread);
			}
			finalText = displayContent(
				(res.state.messages[res.state.messages.length - 1] as { content?: unknown })
					?.content as never
			);
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
	motivation="LangGraph gives you primitives. The harness gives you a working agent. This lesson is about the difference — and why most teams will never build their own."
	hero={{
		id: 'l3-harness',
		alt: 'An exploded diagram of a leather harness with brass fittings labeled by glyph'
	}}
>
	{#snippet intro()}
		<p>
			A <Term t="Harness" /> is what you get when LangGraph's primitives have been pre-wired into
			a working cognitive system. The harness owns planning, the virtual filesystem, subagent
			delegation, summarization, and human approval — you configure it, you don't reimplement
			it.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The promise" title="Configure, don't reimplement" variant="dropcap">
			<p>
				Most production agents reinvent the same five things: a way to plan, a place to write
				notes, a way to delegate, a way to summarize when context overflows, and a way to ask a
				human. The harness ships these as pre-wired middleware so your job becomes
				<strong>declaring policy</strong>, not assembling plumbing.
			</p>
			<p>
				If you've used LangChain's <code>create_agent</code>, the harness is the same idea taken
				one floor higher. <code>create_agent</code> wraps the ReAct loop. The harness wraps a
				planning-and-delegation loop with a virtual filesystem and skill catalog underneath.
			</p>
		</Slide>

		<Slide eyebrow="The shape" title="One factory, many middlewares">
			<p>
				The mental model: <code>createDeepAgent({'{...}'})</code> takes a model and a list of
				configurable concerns, then returns a graph you can <code>invoke</code> /
				<code>stream</code> like any other Runnable.
			</p>
			<ul>
				<li><strong>System prompt</strong> — assembled from base + your instructions + middleware.</li>
				<li><strong>Graph</strong> — <code>agent → tools → agent</code>, with compaction baked between rounds.</li>
				<li><strong>Tools</strong> — write_todos, ls/read/write/edit/glob/grep, task, load_skill.</li>
				<li><strong>Backend</strong> — where files live (state, store, or composite).</li>
				<li><strong>Permissions</strong> — declarative allow/deny on filesystem ops.</li>
				<li><strong>Subagents</strong> — ephemeral child agents spawned via <code>task</code>.</li>
				<li><strong>Skills</strong> — progressive-disclosure catalog of expertise.</li>
				<li><strong>Interrupts</strong> — <code>interruptOn</code> wraps named tools in HITL gates.</li>
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
				Here is the entire public surface. Almost every key is optional — only <code>model</code>
				is strictly required. Everything else is middleware you opt into.
			</p>
			<CodeBlock
				code={code}
				lang="ts"
				caption="The createDeepAgent factory. Optional keys default to sensible behaviours."
			/>
		</Slide>

		<Slide title="Read the source">
			<p>
				Open <code>src/lib/deepagents/</code> in this repo. The harness is built from scratch in
				about 600 lines of TypeScript so you can read it next to the lesson. Every concept in
				this chapter maps to an obvious file there.
			</p>
		</Slide>

		<Slide title="The base prompt" variant="code-first">
			<p>
				Below is the actual <code>BASE_AGENT_PROMPT</code> the harness ships with. It is the
				smallest piece of context that gives the agent its operating shape — plan first, prefer
				files over chat, delegate to subagents, mark progress.
			</p>
			<CodeBlock code={BASE_AGENT_PROMPT} lang="md" />
		</Slide>

		<Slide title="What you'll see in this chapter" ornament>
			<p>
				Each remaining lesson zooms in on one of the harness's pieces — the virtual filesystem,
				the planner, the backends, the permissions model, the subagents, the skills catalog,
				context compaction, and human-in-the-loop. By the end you'll have built two capstones
				against a real model.
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
			<pre class="prompt scrollbar-slim">{composedPreview}</pre>
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
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 0.88rem;
		color: var(--color-ink-100);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent-ink);
	}

	.prompt {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.55;
		padding: 0.95rem 1.1rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		max-height: 28rem;
		overflow: auto;
		white-space: pre-wrap;
		color: var(--color-ink-100);
	}

	.toggles {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.85rem;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.84rem;
		color: var(--color-ink-100);
		cursor: pointer;
	}
	.final {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
