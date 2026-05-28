<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import SubAgentTimeline from '$lib/components/SubAgentTimeline.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type SubAgentSpec,
		type SubAgentReport
	} from '$lib/deepagents';
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let reports = $state<SubAgentReport[]>([]);

	function makeSubagent(name: string, summaryText: string, delay: number): SubAgentSpec {
		return {
			name,
			description: `Run ${name} subagent.`,
			prompt: '...',
			run: async (input) => {
				await new Promise((r) => setTimeout(r, delay));
				return {
					summary: `[${name}] ${summaryText} (re: "${input.description}")`
				};
			}
		};
	}

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: {
							subagent: 'researcher',
							description:
								'Find 3 reputable sources on stateful agent runtimes; return a summary of each.'
						},
						id: 't1'
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: {
							subagent: 'writer',
							description:
								'Write a 1-page brief on stateful agent runtimes, citing the sources researcher found.'
						},
						id: 't2'
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'task',
						args: {
							subagent: 'critic',
							description: 'Critique the brief for clarity, accuracy, and citations.'
						},
						id: 't3'
					}
				]
			},
			{
				content:
					'Researcher gathered sources, writer drafted the brief, critic gave 3 actionable notes. Returning to user.'
			}
		];
	}

	async function run() {
		busy = true;
		events = [];
		reports = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));

			const subagents: SubAgentSpec[] = [
				makeSubagent(
					'researcher',
					'Found 3 sources: Pregel paper, LangGraph docs, and a 2025 arXiv survey.',
					650
				),
				makeSubagent('writer', 'Drafted a 280-word brief with inline citations.', 850),
				makeSubagent(
					'critic',
					'Notes: tighten intro, add a comparison table, double-check claim 2.',
					400
				)
			];

			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const agent = createDeepAgent({
				model,
				backend: new StateBackend(),
				subagents,
				instructions: 'Plan, then delegate research and writing to subagents.',
				tracer
			});
			agent.subscribe((s) => (reports = [...s.subagentReports]));
			await agent.invoke({
				input: 'Brief me on stateful agent runtimes.',
				thread: 'sub-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}

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

<Lesson title="Subagents" eyebrow="Phase 3 · Lesson 06">
	{#snippet intro()}
		<p>
			A <Term t="Subagent" /> is an ephemeral child agent with its own context window, its own
			tools, and its own goal. The parent calls <code>task(name, description)</code> and gets
			back one concise summary — never the subagent's internal messages.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The pattern">
			<CodeBlock code={code} caption="A planner–researcher–writer–critic team in 30 lines." />
		</Slide>

		<Slide title="Why isolation matters">
			<p>
				The parent's context stays small because the subagent's 50-message debate over which
				URL to fetch never enters the parent's view. The parent sees one summary. This is the
				single biggest reason long-horizon tasks remain coherent in practice.
			</p>
		</Slide>

		<Slide title="Demo · 3 subagents in series">
			<p>
				The parent agent dispatches research, then writing, then critique — three distinct
				subagents. The right pane shows each spawn as a span in the timeline and adds a
				report row when it returns.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Plan + delegate" />
		</Panel>

		<Panel title="Subagent timeline">
			<SubAgentTimeline events={events} />
		</Panel>

		<Panel title="Returned reports">
			{#if reports.length === 0}
				<p class="empty">No reports yet.</p>
			{:else}
				<ol class="reports">
					{#each reports as r, i (i)}
						<li>
							<header>
								<code>{r.name}</code>
								<span>{r.durationMs}ms</span>
							</header>
							<p>{r.summary}</p>
						</li>
					{/each}
				</ol>
			{/if}
		</Panel>

		<Panel title="Trace">
			<TraceLog events={events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
		margin: 0;
	}
	.reports {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.reports li {
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		background: var(--color-bg);
	}
	.reports header {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		margin-bottom: 0.3rem;
	}
	.reports header code {
		color: var(--accent);
	}
	.reports header span {
		color: var(--color-fg-faint);
	}
	.reports p {
		margin: 0;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
</style>
