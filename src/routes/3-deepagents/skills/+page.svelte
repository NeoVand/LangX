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
	import { type VirtualFile } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import { runSkillsDemo, SKILLS, type SkillsRunResult } from '$lib/demos/da-skills';
	import skillsSrc from '$lib/demos/da-skills.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-skills',
		title: 'Skills (progressive disclosure)',
		summary:
			'Only skill names + descriptions ship in the prompt; bodies load on demand via load_skill.',
		entries: [{ path: 'lib/demos/da-skills.ts', code: skillsSrc }],
		runner: `import { runSkillsDemo } from './lib/demos/da-skills';

const { files, finalText } = await runSkillsDemo({
	onFiles: (live) => console.log('  · files:', live.map((f) => f.path).join(', '))
});

console.log('\\nDraft written by the agent:');
for (const f of files) console.log('\\n--- ' + f.path + ' ---\\n' + f.content);
console.log('\\nSummary:', finalText);
`
	};

	const skills = SKILLS;

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let files = $state<VirtualFile[]>([]);
	let finalText = $state<string>('');

	async function run() {
		busy = true;
		events = [];
		files = [];
		finalText = '';
		try {
			const result = await withRunCache<SkillsRunResult>(
				{ demoId: 'l3-skills-run' },
				async () =>
					runSkillsDemo({
						onFiles: (f) => (files = f),
						onTrace: (e) => (events = e)
					})
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
			const cached = await loadCachedRun<SkillsRunResult>({ demoId: 'l3-skills-run' });
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
	hero={{
		id: 'l3-skills',
		alt: 'A three-tiered apothecary cabinet with progressively expanded labels'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="Skill">Skills</Term> are <Term t="Progressive disclosure">progressively-disclosed</Term> instruction sets. Names always present, bodies loaded only when relevant via <Term t="load_skill"><code>load_skill</code></Term> — the right balance between awareness and overload.
	{/snippet}

	{#snippet intro()}
		<p>
			A <Term t="Skill" /> is a small markdown file with a description and a body of
			instructions. The <Term t="Harness">harness</Term> ships only the descriptions in the <Term t="System prompt">system prompt</Term>; bodies load
			on demand via <Term t="load_skill"><code>load_skill</code></Term>. That is <Term t="Progressive disclosure" />.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Awareness without overload" variant="dropcap">
			<p>
				A modest catalog of 20 expert <Term t="Skill">skills</Term> can easily be 50,000 tokens of full bodies, and
				most tasks use one or two of them. The naïve approach — ship every body in the
				<Term t="System prompt">system prompt</Term> — pays for capabilities the agent does not need on this particular
				turn. The exotic approach — invisible skills the model has to guess at — pays in
				missed opportunities.
			</p>
			<p>
				<Term t="Progressive disclosure">Progressive disclosure</Term> splits the difference. Names and one-line descriptions live
				in the system prompt so the model is <em>aware</em> of the catalog. Bodies come back
				as a <Term t="ToolMessage">tool result</Term> only when the model calls <Term t="load_skill"><code>load_skill</code></Term>. The agent pays tokens
				for relevance, not for the entire library.
			</p>
		</Slide>

		<Slide title="The protocol" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="The skill protocol." />
		</Slide>

		<Diagram spec={skillsDisclosure} />

		<Slide variant="pull-quote">
			<p>
				A skill catalog is the agent's table of contents. The bodies are the chapters. You
				do not photocopy the whole book to look up one chapter.
			</p>
		</Slide>

		<Slide title="What ships in the prompt" variant="code-first">
			<p>
				The harness assembles a "Skill catalog" block in the <Term t="Middleware">MIDDLEWARE</Term> section of the
				<Term t="System prompt">system prompt</Term>. Below is the actual block this lesson would emit — three skills,
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
