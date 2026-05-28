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
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let scenario = $state<'research' | 'refactor'>('research');
	let busy = $state(false);
	let todos = $state<Todo[]>([]);
	let events = $state<TraceEvent[]>([]);

	function setT(content: string, status: Todo['status']): Todo {
		return { content, status };
	}

	function researchScript(): ScriptedResponse[] {
		const all = [
			'Identify 3 reputable sources',
			'Read each and extract claims',
			'Synthesise into a 1-page brief'
		];
		const todoState = (slot: 'in_progress' | 'completed', i: number): Todo[] =>
			all.map((c, idx) => ({
				content: c,
				status: idx < i ? 'completed' : idx === i ? slot : 'pending'
			}));
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: { todos: todoState('in_progress', 0) }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: { todos: todoState('in_progress', 1) }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: { todos: todoState('in_progress', 2) }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: {
							todos: all.map((c) => ({ content: c, status: 'completed' as const }))
						}
					}
				]
			},
			{
				content: 'Research plan completed.'
			}
		];
	}

	function refactorScript(): ScriptedResponse[] {
		const all = [
			'Audit util.ts for string concat usages',
			'Replace with template literals',
			'Add JSDoc',
			'Add a smoke test'
		];
		const at = (i: number, slot: 'in_progress' | 'completed'): Todo[] =>
			all.map((c, idx) => ({
				content: c,
				status: idx < i ? 'completed' : idx === i ? slot : 'pending'
			}));
		return [
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: at(0, 'in_progress') } }] },
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: at(1, 'in_progress') } }] },
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: at(2, 'in_progress') } }] },
			{ content: '', toolCalls: [{ name: 'write_todos', args: { todos: at(3, 'in_progress') } }] },
			{
				content: '',
				toolCalls: [
					{
						name: 'write_todos',
						args: { todos: all.map((c) => ({ content: c, status: 'completed' })) }
					}
				]
			},
			{ content: 'Refactor plan complete.' }
		];
	}

	async function run() {
		busy = true;
		todos = [];
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));

			const model = new MockChatModel({
				responses: scenario === 'research' ? researchScript() : refactorScript(),
				tokenDelayMs: 0
			});
			const agent = createDeepAgent({
				model,
				backend: new StateBackend(),
				instructions: 'Plan with write_todos and keep the plan up to date.',
				tracer
			});
			agent.subscribe((s) => {
				todos = [...s.todos];
			});

			const input =
				scenario === 'research'
					? 'Write a short research brief on stateful agent runtimes.'
					: 'Refactor util.ts to use template literals and add tests.';
			await agent.invoke({
				input,
				thread: 'todo-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}

	const code = `// The agent calls write_todos repeatedly:
//
// 1. Lay out the plan: all pending, the first one in_progress.
// 2. After finishing each step: mark completed, mark next in_progress.
// 3. Final call: everything completed.
//
// The harness keeps the latest list in graph state and re-renders it into
// the system prompt every turn so the model never forgets where it is.`;
</script>

<Lesson title="Planning with write_todos" eyebrow="Phase 3 · Lesson 03">
	{#snippet intro()}
		<p>
			<Term t="write_todos" /> is the smallest cognitive prosthesis the harness ships. The
			agent breaks the goal into discrete steps, marks one in-progress, and updates the list as
			it goes. The plan lives in graph state, not in the prompt — so the model's working memory
			stays clean.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Why externalize the plan">
			<p>
				Free-form chain-of-thought rots fast: rerolls forget earlier intent, summarization
				erases milestones, and long tasks drift. A persistent to-do list is checkpointable,
				inspectable, and survives compaction. Plans become objects, not vibes.
			</p>
		</Slide>

		<Slide title="The protocol">
			<CodeBlock code={code} lang="md" />
			<p>
				The harness's middleware re-renders the live list into the system prompt every turn,
				so the agent always sees its own plan when it decides what to do next.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1: research brief, 3 steps. Demo 2: refactor, 4 steps. Watch the right pane —
				every <code>write_todos</code> call replaces the list, and the inspector shows status
				transitions in real time.
			</p>
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
					<small>4 steps with overlapping concerns.</small>
				</label>
			</div>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Live plan">
			<TodoListView todos={todos} />
		</Panel>

		<Panel title="Trace">
			<TraceLog events={events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.modes label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		cursor: pointer;
	}
	.modes label.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-weight: 500;
		font-size: 0.88rem;
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
	}
</style>
