<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { subagentIsolation } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import SubAgentTimeline from '$lib/components/SubAgentTimeline.svelte';
	import SubagentCard from '$lib/components/SubagentCard.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { type SubAgentReport } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import { runSubagentsDemo, type SubagentsRunResult } from '$lib/demos/da-subagents';
	import subagentsSrc from '$lib/demos/da-subagents.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-subagents',
		title: 'Subagents',
		summary:
			'A research lead delegating to three isolated subagents (researcher → writer → critic) via the task tool.',
		entries: [{ path: 'lib/demos/da-subagents.ts', code: subagentsSrc }],
		runner: `import { runSubagentsDemo } from './lib/demos/da-subagents';

const { reports, finalText } = await runSubagentsDemo({
	onReports: (live) => console.log('  · reports so far:', live.length)
});

console.log('\\nReturned reports:');
for (const r of reports) console.log('\\n[' + r.name + ']\\n' + r.summary);
console.log('\\nSummary:', finalText);
`
	};

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let reports = $state<SubAgentReport[]>([]);
	let finalText = $state<string>('');

	async function run() {
		busy = true;
		events = [];
		reports = [];
		finalText = '';
		try {
			const result = await withRunCache<SubagentsRunResult>(
				{ demoId: 'l3-subagents-run' },
				async () =>
					runSubagentsDemo({
						onReports: (r) => (reports = r),
						onTrace: (e) => (events = e)
					})
			);
			events = result.events;
			reports = result.reports;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<SubagentsRunResult>({ demoId: 'l3-subagents-run' });
			if (cached) {
				events = cached.payload.events;
				reports = cached.payload.reports;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `const subagents = [
  {
    name: 'researcher',
    description: 'Web-search and synthesise findings.',
    prompt: 'You are a meticulous research assistant.',
    run: async ({ description }) => {
      const result = await researchSubagentGraph.invoke({ task: description });
      return { summary: result.summary };
    }
  },
  /* writer, critic */
];

createDeepAgent({ model, subagents, /* ... */ });

// The agent now has a 'task' tool:
// task({ subagent: 'researcher', description: '...' })
//   → spawns a fresh subagent, gets back a single concise summary,
//     and the parent never sees the subagent's internal messages.`;
</script>

<Lesson
	title="Subagents"
	eyebrow="Level 3 · Lesson 06"
	hero={{
		id: 'l3-subagents',
		alt: 'A central scholar gestures to three smaller assistants at flanking desks'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		When a task needs its own working memory, you don't expand the parent's <Term t="Context window">context</Term> — you spawn a <Term t="Subagent">subagent</Term>. The <Term t="task"><code>task</code></Term> tool is delegation made first-class.
	{/snippet}

	{#snippet intro()}
		<p>
			A <Term t="Subagent" /> is an ephemeral child agent with its own <Term t="Context window">context window</Term>, its own
			<Term t="tool">tools</Term>, and its own goal. The parent calls <Term t="task"><code>task(name, description)</code></Term> and gets
			back one concise summary — never the subagent's internal messages.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Context quarantine, not context inflation" variant="dropcap">
			<p>
				The naïve way to do "research, then write, then critique" is to keep every fetched
				URL, every revision, every margin note in a single conversation. That conversation
				crosses the <Term t="Context window">token horizon</Term> before it produces anything useful, and the model spends
				half its budget remembering why it was looking at <code>example.com</code> in the
				first place.
			</p>
			<p>
				A <Term t="Subagent">subagent</Term> is the inverse: <Term t="context quarantine">context quarantine</Term> — a child with its own context, its own tools, its own
				50-message argument about which URL to fetch — and a single-line report back to the
				parent. The parent never sees the debate; it sees the conclusion. The same loop a
				senior engineer would use to delegate, expressed as <Term t="task"><code>task</code></Term>.
			</p>
		</Slide>

		<Slide title="The pattern" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="A researcher–writer–critic team in 30 lines." />
		</Slide>

		<Diagram spec={subagentIsolation} />

		<Slide variant="pull-quote">
			<p>
				The first thing a long-horizon task stops being is "a conversation". It starts being
				a team — and the task tool is how the harness names that team.
			</p>
		</Slide>

		<Slide title="Why isolation matters">
			<p>
				The parent's context stays small because the subagent's internal debate never
				enters the parent's view. This is the single biggest reason <Term t="Long-horizon">long-horizon</Term> tasks
				remain coherent in practice — and why the <Term t="Harness">harness</Term> treats <Term t="Subagent">subagents</Term> as a first-class
				primitive rather than an optional pattern.
			</p>
		</Slide>

		<Slide title="Demo · 3 subagents in series">
			<p>
				The parent agent dispatches research, then writing, then critique — three distinct
				subagents, each calling its own model invocation. The right pane shows each spawn
				as a span in the timeline and adds a report row when the summary returns.
			</p>
		</Slide>

		<Slide ornament>
			<p>· delegate · summarise · return ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Plan + delegate" />
		</Panel>

		<Panel title="Subagent timeline">
			<SubAgentTimeline {events} />
		</Panel>

		<Panel title="Returned reports">
			{#if reports.length === 0}
				<p class="empty">No reports yet.</p>
			{:else}
				<div class="cards">
					{#each reports as r, i (i)}
						<SubagentCard
							name={r.name}
							status="done"
							report={r.summary}
							durationMs={r.durationMs}
						/>
					{/each}
				</div>
			{/if}
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.empty {
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
		margin: 0;
		font-family: var(--font-prose);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
