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
	import {
		createDeepAgent,
		StateBackend,
		type SubAgentSpec,
		type SubAgentReport
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { HumanMessage, SystemMessage } from '@langchain/core/messages';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface RunPayload {
		events: TraceEvent[];
		reports: SubAgentReport[];
		finalText: string;
	}

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let reports = $state<SubAgentReport[]>([]);
	let finalText = $state<string>('');

	const SUBAGENT_PROMPTS: Record<string, string> = {
		researcher: `You are a research assistant. The user will give you a sub-question.
Reply with a single short paragraph (≤ 60 words) summarising what you would find — invent
plausible primary sources and one-line takeaways. Do not call tools. Do not chat. Reply
with prose only.`,
		writer: `You are a technical writer. The user will give you a topic and findings.
Reply with a single short paragraph (≤ 60 words) describing the brief you would write,
including how many sections and rough citation count. Do not call tools.`,
		critic: `You are an editorial critic. The user will give you a brief. Reply with at
most three terse bullet notes, one per line, each beginning with "- ". Do not call tools.`
	};

	function makeSubagent(name: keyof typeof SUBAGENT_PROMPTS): SubAgentSpec {
		return {
			name,
			description: `Run the ${name} subagent for a focused task.`,
			prompt: SUBAGENT_PROMPTS[name],
			run: async (input) => {
				const model = await getModel({ temperature: 0.3, maxTokens: 220 });
				const response = await model.invoke([
					new SystemMessage(SUBAGENT_PROMPTS[name]),
					new HumanMessage(input.description)
				]);
				const text =
					typeof response.content === 'string'
						? response.content
						: JSON.stringify(response.content);
				return { summary: text.trim() };
			}
		};
	}

	const INSTRUCTIONS = `You are a research lead. You have three subagents: researcher, writer, critic.
To brief the user, you must call task three times in this exact order:
1. task({ subagent: 'researcher', description: 'Find 3 reputable sources on stateful agent runtimes and extract claims.' })
2. task({ subagent: 'writer', description: 'Draft a 1-page brief on stateful agent runtimes citing the researcher findings.' })
3. task({ subagent: 'critic', description: 'Critique the brief for clarity, accuracy, and citation discipline.' })

You may NOT do the research yourself. You may NOT write the brief yourself. Delegate.
After the third task returns, reply with one short summary sentence mentioning the three handoffs.`;

	async function run() {
		busy = true;
		events = [];
		reports = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-subagents-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const subagents = [
						makeSubagent('researcher'),
						makeSubagent('writer'),
						makeSubagent('critic')
					];
					const model = await getModel({ temperature: 0, maxTokens: 600 });
					const agent = createDeepAgent({
						model,
						backend: new StateBackend(),
						subagents,
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 14
					});
					agent.subscribe((s) => (reports = [...s.subagentReports]));

					const out = await agent.invoke({
						input: 'Brief me on stateful agent runtimes.',
						thread: `sub-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					return {
						events: localEvents,
						reports: out.subagentReports,
						finalText: text
					};
				}
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
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-subagents-run' });
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
	eyebrow="Phase 3 · Lesson 06"
	motivation="When a task needs its own working memory, you don't expand the parent's context — you spawn a subagent. The task tool is delegation made first-class."
	hero={{
		id: 'l3-subagents',
		alt: 'A central scholar gestures to three smaller assistants at flanking desks'
	}}
>
	{#snippet intro()}
		<p>
			A <Term t="Subagent" /> is an ephemeral child agent with its own context window, its own
			tools, and its own goal. The parent calls <code>task(name, description)</code> and gets
			back one concise summary — never the subagent's internal messages.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Context quarantine, not context inflation" variant="dropcap">
			<p>
				The naïve way to do "research, then write, then critique" is to keep every fetched
				URL, every revision, every margin note in a single conversation. That conversation
				crosses the token horizon before it produces anything useful, and the model spends
				half its budget remembering why it was looking at <code>example.com</code> in the
				first place.
			</p>
			<p>
				A subagent is the inverse: a child with its own context, its own tools, its own
				50-message argument about which URL to fetch — and a single-line report back to the
				parent. The parent never sees the debate; it sees the conclusion. The same loop a
				senior engineer would use to delegate, expressed as a tool call.
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
				enters the parent's view. This is the single biggest reason long-horizon tasks
				remain coherent in practice — and why the harness treats subagents as a first-class
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
