import { createDeepAgent, StateBackend, type Todo } from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

export type TodoScenario = 'research' | 'refactor';

export interface TodosRunResult {
	scenario: TodoScenario;
	todos: Todo[];
	events: TraceEvent[];
	finalText: string;
}

export interface TodosDemoCallbacks {
	/** Live plan, replaced by every write_todos call. */
	onTodos?: (todos: Todo[]) => void;
	/** Live trace events (the whole list, growing). */
	onTrace?: (events: TraceEvent[]) => void;
}

export const TODO_PROMPTS: Record<TodoScenario, { input: string; instructions: string }> = {
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

/**
 * Drives a planning agent that maintains its plan exclusively through
 * write_todos. The live plan and trace stream out through callbacks; the final
 * todo list, full event log, and summary line are returned.
 * This is the exact source the demo runs.
 */
export async function runTodosDemo(
	scenario: TodoScenario,
	cb: TodosDemoCallbacks = {}
): Promise<TodosRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Harness: TodoList middleware via write_todos tool ───────────────────
	const model = await getModel({ temperature: 0, maxTokens: 600 });
	const agent = createDeepAgent({
		model,
		backend: new StateBackend(),
		instructions: TODO_PROMPTS[scenario].instructions,
		tracer,
		maxIterations: 16
	});
	// Subscribe to state.todos — updated on every write_todos call.
	agent.subscribe((s) => {
		cb.onTodos?.([...s.todos]);
	});

	const out = await agent.invoke({
		input: TODO_PROMPTS[scenario].input,
		thread: `todo-${scenario}-${Math.random().toString(36).slice(2, 6)}`
	});

	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');

	return {
		scenario,
		todos: out.todos,
		events: localEvents,
		finalText: text
	};
}
