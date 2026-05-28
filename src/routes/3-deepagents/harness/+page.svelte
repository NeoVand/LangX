<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { BASE_AGENT_PROMPT, assembleSystemPrompt } from '$lib/deepagents';

	let userInstructions = $state(`You are a senior researcher helping the user
write a brief on the LangGraph runtime. Always plan before you act.`);

	const todos = [
		{ content: 'Outline scope', status: 'completed' as const },
		{ content: 'Gather sources', status: 'in_progress' as const },
		{ content: 'Draft brief', status: 'pending' as const }
	];

	const files = [
		{ path: '/scratch/notes.md', content: '...', backend: 'state' },
		{ path: '/memories/glossary.md', content: '...', backend: 'store' }
	];

	const skills = [
		{ name: 'cite', description: 'Insert proper citations for any claim you write.' },
		{ name: 'summarize-pdf', description: 'Produce a 1-page summary of a PDF buffer.' }
	];

	const subagents = [
		{ name: 'researcher', description: 'Web-search and synthesise findings.' },
		{ name: 'writer', description: 'Write polished prose from notes.' }
	];

	const memorySummary =
		'You met this user yesterday. They prefer short bullet summaries and dislike emoji.';

	const composed = $derived(
		assembleSystemPrompt({
			user: userInstructions,
			todos,
			files,
			skills,
			subagents,
			memorySummary
		})
	);

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

<Lesson title="The harness" eyebrow="Phase 3 · Lesson 01">
	{#snippet intro()}
		<p>
			A <Term t="Harness" /> is what you get when LangGraph's primitives have been pre-wired into
			a working cognitive system. The harness owns planning, the virtual filesystem, subagent
			delegation, summarization, and human approval — you configure it, you don't reimplement
			it.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The factory">
			<CodeBlock code={code} caption="Everything optional except model. Everything else is middleware." />
		</Slide>

		<Slide title="What the harness owns">
			<ul>
				<li>The <strong>system prompt</strong> (assembly shown on the right).</li>
				<li>
					A <strong>graph</strong> of <code>agent → tools → agent</code> with compaction baked
					between each round.
				</li>
				<li>
					Built-in <strong>tools</strong>: write_todos, ls, read_file, write_file, edit_file,
					glob, grep, task, load_skill.
				</li>
				<li>
					<strong>Backends</strong>: where files live (state, store, or composite).
				</li>
				<li>
					<strong>Permissions</strong>: declarative allow/deny on filesystem ops.
				</li>
				<li>
					<strong>Subagents</strong>: ephemeral child agents spawned via the task tool.
				</li>
				<li>
					<strong>Skills</strong>: progressive-disclosure catalog of expertise.
				</li>
				<li>
					<strong>Interrupts</strong>: <code>interruptOn</code> wraps named tools in HITL
					gates.
				</li>
			</ul>
		</Slide>

		<Slide title="Read the source">
			<p>
				Open <code>src/lib/deepagents/</code> in this repo. The harness is built from scratch in
				about 600 lines of TypeScript so you can read it next to the lesson. Every concept in
				this chapter maps to an obvious file there.
			</p>
		</Slide>

		<Slide title="The base prompt">
			<p>
				Below is the actual <code>BASE_AGENT_PROMPT</code> the harness ships with. It is the
				smallest piece of context that gives the agent its operating shape — plan first,
				prefer files over chat, delegate to subagents, mark progress.
			</p>
			<CodeBlock code={BASE_AGENT_PROMPT} lang="md" />
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Live system-prompt assembly" subtitle="USER → BASE → MIDDLEWARE">
			<label class="field">
				<span>User instructions</span>
				<textarea bind:value={userInstructions} rows="3"></textarea>
			</label>
			<pre class="prompt scrollbar-slim">{composed}</pre>
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
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}
	textarea {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-sans);
		font-size: 0.88rem;
		color: var(--color-fg);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.prompt {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		padding: 0.85rem 1rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		max-height: 28rem;
		overflow: auto;
		white-space: pre-wrap;
		color: var(--color-fg);
	}
</style>
