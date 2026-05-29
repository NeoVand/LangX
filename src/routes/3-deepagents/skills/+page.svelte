<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { skillsDisclosure } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import SkillInspector from '$lib/components/SkillInspector.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type Skill,
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { displayContent } from '$lib/runtime/messages';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	const skills: Skill[] = [
		{
			name: 'cite',
			description:
				'Insert proper citations for every claim in the form [Author, Year] with a sources block at the end.',
			body: `# cite

1. After each non-trivial claim, append [Author, Year].
2. At the end of the document, add a "Sources" section with a numbered list and full URLs.
3. Prefer primary sources. Avoid secondary aggregators.`
		},
		{
			name: 'shrink',
			description:
				'Reduce a markdown document by ~40% while preserving every numeric claim, every URL, and the original section headings.',
			body: `# shrink

1. Run a frequency analysis on adjectives and adverbs; remove weak ones.
2. Collapse list items that share a verb.
3. Never delete a number, a date, or a URL.
4. Keep section headings exactly as they were.`
		},
		{
			name: 'eli12',
			description:
				'Rewrite the input to be understandable to a smart 12-year-old. Maintain accuracy.',
			body: `# eli12

1. Replace jargon with plain words. Keep proper nouns.
2. Use ≤15-word sentences when possible.
3. Lead each paragraph with a concrete example.`
		}
	];

	interface RunPayload {
		events: TraceEvent[];
		files: VirtualFile[];
		finalText: string;
	}

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let files = $state<VirtualFile[]>([]);
	let finalText = $state<string>('');

	const INSTRUCTIONS = `You are writing a short paragraph and citing it properly.

Process:
1. First call load_skill({ name: 'cite' }) — read the returned skill body carefully.
2. Then write_file('/draft.md', <one paragraph applying the cite skill, with a Sources section>).
3. Do not load any other skills. Do not chat between tool calls.
4. End with one short summary sentence.`;

	async function run() {
		busy = true;
		events = [];
		files = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-skills-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const model = await getModel({ temperature: 0, maxTokens: 600 });
					const backend = new StateBackend();
					const agent = createDeepAgent({
						model,
						backend,
						skills,
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 30
					});
					agent.subscribe((s) => (files = [...s.files]));

					const out = await agent.invoke({
						input:
							'Write a single paragraph on stateful agent runtimes — and cite it properly.',
						thread: `skills-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text = displayContent(last?.content);
					return {
						events: localEvents,
						files: await backend.list(),
						finalText: text
					};
				}
			);
			events = result.events;
			files = result.files;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-skills-run' });
			if (cached) {
				events = cached.payload.events;
				files = cached.payload.files;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const skillCatalogPrompt = $derived(
		skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
	);

	// Which skills the agent actually loaded (tracer emits `load_skill <name>`).
	const loadedSkills = $derived(
		new Set(
			events
				.filter((e) => typeof e.label === 'string' && e.label.startsWith('load_skill '))
				.map((e) => e.label.replace('load_skill ', '').trim())
		)
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

<Lesson
	title="Skills (progressive disclosure)"
	eyebrow="Phase 3 · Lesson 07"
	motivation="Skills are progressively-disclosed instruction sets. Names always present, bodies loaded only when relevant — the right balance between awareness and overload."
	hero={{
		id: 'l3-skills',
		alt: 'A three-tiered apothecary cabinet with progressively expanded labels'
	}}
>
	{#snippet intro()}
		<p>
			A <Term t="Skill" /> is a small markdown file with a description and a body of
			instructions. The harness ships only the descriptions in the system prompt; bodies load
			on demand via <code>load_skill</code>. That is <Term t="Progressive disclosure" />.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Awareness without overload" variant="dropcap">
			<p>
				A modest catalog of 20 expert skills can easily be 50,000 tokens of full bodies, and
				most tasks use one or two of them. The naïve approach — ship every body in the
				system prompt — pays for capabilities the agent does not need on this particular
				turn. The exotic approach — invisible skills the model has to guess at — pays in
				missed opportunities.
			</p>
			<p>
				Progressive disclosure splits the difference. Names and one-line descriptions live
				in the system prompt so the model is <em>aware</em> of the catalog. Bodies come back
				as a tool result only when the model decides a skill applies. The agent pays tokens
				for relevance, not for the entire library.
			</p>
		</Slide>

		<Slide title="The protocol" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="The skill protocol." />
		</Slide>

		<Slide title="Progressive disclosure, drawn" variant="figure">
			<Diagram spec={skillsDisclosure} title="Skills disclosure" />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A skill catalog is the agent's table of contents. The bodies are the chapters. You
				do not photocopy the whole book to look up one chapter.
			</p>
		</Slide>

		<Slide title="What ships in the prompt" variant="code-first">
			<p>
				The harness assembles a "Skill catalog" block in the MIDDLEWARE section of the
				system prompt. Below is the actual block this lesson would emit — three skills,
				~120 tokens total instead of ~600 if we shipped the bodies.
			</p>
			<CodeBlock code={skillCatalogPrompt} lang="md" />
		</Slide>

		<Slide title="Demo">
			<p>
				The agent loads the <code>cite</code> skill (the body comes back as a
				<code>tool_result</code> visible in the trace), then writes a draft applying it.
				Skills the agent never asks for never cost any tokens.
			</p>
		</Slide>

		<Slide ornament>
			<p>· catalog · open · apply ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Catalog (descriptions only)" subtitle="expand to inspect the SKILL.md body">
			<div class="cat">
				{#each skills as s, i (i)}
					<SkillInspector skill={s} loaded={loadedSkills.has(s.name)} />
				{/each}
			</div>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Draft (what the agent wrote)">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace (look for load_skill)">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.cat {
		margin: 0 0 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
