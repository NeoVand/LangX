<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import TodoListView from '$lib/components/TodoListView.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { createDeepAgent, StateBackend, type Todo } from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	type Scenario = 'research' | 'refactor';

	interface RunPayload {
		scenario: Scenario;
		todos: Todo[];
		events: TraceEvent[];
		finalText: string;
	}

	let scenario = $state<Scenario>('research');
	let busy = $state(false);
	let todos = $state<Todo[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');

	const PROMPT: Record<Scenario, { input: string; instructions: string }> = {
		research: {
			instructions: `You are a planning agent. Before doing anything else, call write_todos to
record a 3-step plan. As you progress, call write_todos again to mark each step's status. The
list must use only the statuses "pending", "in_progress", "completed". Do not invent file or
tool calls beyond write_todos for this exercise. Finish by replying with one short summary line.`,
			input: `I want a short research brief on stateful agent runtimes. Plan it.

Use roughly these three steps:
1. Identify 3 reputable sources
2. Read each and extract claims
3. Synthesise into a 1-page brief

Walk through each step in order. Mark in_progress before "doing" it (you do not actually
need to do the research — just simulate progressing through the plan) and completed once
the step is "done". End with one short summary sentence.`
		},
		refactor: {
			instructions: `You are a planning agent. Use write_todos to maintain a 4-step refactor plan
and update it as each step progresses. Do not call any other tools — this exercise is about
the plan, not the edits. Statuses must be "pending", "in_progress", or "completed". End with
one short summary line.`,
			input: `Plan a small refactor of util.ts. Use exactly these four steps:
1. Audit util.ts for string concat usages
2. Replace with template literals
3. Add JSDoc
4. Add a smoke test

Move through them in order, marking each in_progress then completed, and finish with one
short summary sentence.`
		}
	};

	async function run() {
		busy = true;
		todos = [];
		events = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: `l3-todos-${scenario}` },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const model = await getModel({ temperature: 0, maxTokens: 600 });
					const agent = createDeepAgent({
						model,
						backend: new StateBackend(),
						instructions: PROMPT[scenario].instructions,
						tracer,
						maxIterations: 16
					});
					agent.subscribe((s) => {
						todos = [...s.todos];
					});

					const out = await agent.invoke({
						input: PROMPT[scenario].input,
						thread: `todo-${scenario}-${Math.random().toString(36).slice(2, 6)}`
					});

					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');

					return {
						scenario,
						todos: out.todos,
						events: localEvents,
						finalText: text
					};
				}
			);
			todos = result.todos;
			events = result.events;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		const which = scenario;
		(async () => {
			const cached = await loadCachedRun<RunPayload>({
				demoId: `l3-todos-${which}`
			});
			if (cached && cached.payload.scenario === which) {
				todos = cached.payload.todos;
				events = cached.payload.events;
				finalText = cached.payload.finalText;
			} else {
				todos = [];
				events = [];
				finalText = '';
			}
		})();
	});

	const protocolCode = `// The agent calls write_todos repeatedly:
//
// 1. Lay out the plan: all pending, the first one in_progress.
// 2. After finishing each step: mark completed, mark next in_progress.
// 3. Final call: everything completed.
//
// The harness keeps the latest list in graph state and re-renders it into
// the system prompt every turn so the model never forgets where it is.`;
</script>

<Lesson
	title="Planning with write_todos"
	eyebrow="Phase 3 · Lesson 03"
	motivation="Plans live longer than turns. write_todos externalises the plan into a structured artifact the model — and you — can audit, reorder, and resume."
	hero={{
		id: 'l3-todos',
		alt: 'A clipboard checklist of pictographs with one item checked, two pending'
	}}
>
	{#snippet intro()}
		<p>
			<Term t="write_todos" /> is the smallest cognitive prosthesis the harness ships. The
			agent breaks the goal into discrete steps, marks one in-progress, and updates the list
			as it goes. The plan lives in graph state, not in the prompt — so the model's working
			memory stays clean.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Plans deserve to be objects" variant="dropcap">
			<p>
				Free-form chain-of-thought rots quickly under pressure. A re-rolled response forgets
				earlier intent, summarisation erases the milestones, and long tasks drift toward
				whatever the model last typed. A persistent to-do list is checkpointable,
				inspectable, and survives compaction — plans become objects, not vibes.
			</p>
			<p>
				The cost of write_todos is one tool call per state change. The payoff is an agent
				that can be paused, audited, and resumed without re-deriving its own intent. It is
				the cheapest mechanism that makes long-horizon work behave like project work.
			</p>
		</Slide>

		<Slide title="The protocol" variant="code-first">
			<CodeBlock code={protocolCode} lang="ts" />
			<p>
				The harness's middleware re-renders the live list into the system prompt every turn,
				so the agent always sees its own plan when it decides what to do next.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A plan in the prompt is a story you tell yourself. A plan in state is a contract you
				can be audited against.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1: a 3-step research brief. Demo 2: a 4-step refactor. Watch the right pane —
				every <code>write_todos</code> call replaces the list, and the trace shows status
				transitions in real time. The agent is a live model; the plan is its own.
			</p>
		</Slide>

		<Slide ornament>
			<p>· plan · execute · revise ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Pick a scenario">
			<div class="modes">
				<label class:selected={scenario === 'research'}>
					<input type="radio" bind:group={scenario} value="research" />
					<span>Research brief</span>
					<small>3 steps, sequential.</small>
				</label>
				<label class:selected={scenario === 'refactor'}>
					<input type="radio" bind:group={scenario} value="refactor" />
					<span>Refactor</span>
					<small>4 overlapping concerns.</small>
				</label>
			</div>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Live plan" subtitle="updated by every write_todos call">
			<TodoListView {todos} />
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
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
		margin-bottom: 0.85rem;
	}
	.modes label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background: var(--color-bg);
		cursor: pointer;
	}
	.modes label.selected {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 0.92rem;
		color: var(--color-ink-100);
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-prose);
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
