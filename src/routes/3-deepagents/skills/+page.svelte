<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { createDeepAgent, StateBackend, type Skill } from '$lib/deepagents';
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	const skills: Skill[] = [
		{
			name: 'cite',
			description:
				'Insert proper citations for every claim in the form [Author, Year] with a sources block at the end.',
			body: `# cite\n\n1. After each non-trivial claim, append [Author, Year].\n2. At the end of the document, add a "Sources" section with a numbered list and full URLs.\n3. Prefer primary sources. Avoid secondary aggregators.`
		},
		{
			name: 'shrink',
			description:
				'Reduce a markdown document by 40% while preserving every numeric claim, every URL, and the original section headings.',
			body: `# shrink\n\n1. Run a frequency analysis on adjectives and adverbs; remove weak ones.\n2. Collapse list items that share a verb.\n3. Never delete a number, a date, or a URL.\n4. Keep section headings exactly as they were.`
		},
		{
			name: 'eli12',
			description:
				'Rewrite the input to be understandable to a smart 12-year-old. Maintain accuracy.',
			body: `# eli12\n\n1. Replace jargon with plain words. Keep proper nouns.\n2. Use ≤15-word sentences when possible.\n3. Lead each paragraph with a concrete example.`
		}
	];

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let promptPreview = $state('');

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{ name: 'load_skill', args: { name: 'cite' }, id: 's1' }
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/draft.md',
							content:
								'LangGraph models stateful agents using a directed cyclic graph [Lewis, 2024].\n\n## Sources\n1. Lewis et al., "LangGraph runtime", 2024, https://example.com/langgraph'
						}
					}
				]
			},
			{
				content: 'Loaded the cite skill and applied it while writing the draft.'
			}
		];
	}

	async function run() {
		busy = true;
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const agent = createDeepAgent({
				model,
				backend: new StateBackend(),
				skills,
				instructions: 'Use load_skill before writing if a skill applies. Then write the draft.',
				tracer
			});
			await agent.invoke({
				input: 'Write a single paragraph on stateful agent runtimes — and cite it properly.',
				thread: 'skills-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}

	const skillCatalogPrompt = $derived(
		skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
	);

	const code = `const skills = [
  {
    name: 'cite',
    description: 'Insert proper citations.',
    body: '# cite\\n... full instructions ...'
  },
  /* shrink, eli12 */
];

createDeepAgent({ model, skills, /* ... */ });

// The harness ships ONLY {name, description} for each skill in the system prompt.
// When the agent calls load_skill('cite'), the FULL body comes back as a tool result
// — paying tokens only for the skills the agent actually needs.`;
</script>

<Lesson title="Skills (progressive disclosure)" eyebrow="Phase 3 · Lesson 07">
	{#snippet intro()}
		<p>
			A <Term t="Skill" /> is a small markdown file with a frontmatter description and a body
			of instructions. The harness ships only the descriptions in the system prompt; bodies
			load on demand via <code>load_skill</code>. That's <Term t="Progressive disclosure" />.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Why not include them all">
			<p>
				A modest catalog of 20 skills can easily be 50,000 tokens of full bodies. Most tasks
				use one or two. Loading bodies on demand keeps the prompt small and predictable while
				still making the entire catalog addressable.
			</p>
			<CodeBlock code={code} caption="The skill protocol." />
		</Slide>

		<Slide title="What ships in the prompt">
			<p>
				The harness assembles a "Skill catalog" block in the MIDDLEWARE section of the system
				prompt. Below is the actual block this lesson would emit — three skills, ~120 tokens
				total instead of ~600 if we shipped the bodies.
			</p>
			<CodeBlock code={skillCatalogPrompt} lang="md" />
		</Slide>

		<Slide title="Demo">
			<p>
				The agent loads the <code>cite</code> skill (the body is shown in the trace as a
				tool_result), then writes a draft applying it. Skills the agent never asks for never
				cost any tokens.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Catalog (descriptions only)" subtitle="What the model sees up front">
			<ol class="cat">
				{#each skills as s, i (i)}
					<li>
						<code>{s.name}</code>
						<p>{s.description}</p>
					</li>
				{/each}
			</ol>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Trace">
			<TraceLog events={events} />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.cat {
		list-style: none;
		padding: 0;
		margin: 0 0 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.cat li {
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.5rem 0.7rem;
		background: var(--color-bg);
	}
	.cat code {
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.cat p {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--color-fg-muted);
	}
</style>
