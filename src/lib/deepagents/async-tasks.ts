import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AsyncTaskRecord } from './state';
import type { BackendProtocol } from './backends';
import type { FilesystemPermission } from './permissions';
import {
	runChildAgent,
	type ChildEvent,
	type ChildRunResult,
	type SubAgentSpec,
	type ChildTool
} from './tools/task';

/**
 * Local stand-in for the Agent Protocol server: officially, async subagents run
 * on a deployment and the supervisor controls them over HTTP through five tools.
 * Here the "server" is a background promise in the same tab — same lifecycle,
 * same five tools, same asyncTasks channel.
 */

interface LiveTask {
	record: AsyncTaskRecord;
	spec: SubAgentSpec;
	/** Child transcript so far — steering restarts replay it with new orders. */
	messages: BaseMessage[];
	aborted: boolean;
	/** Bumped by update/cancel so a superseded run knows to stand down. */
	generation: number;
	/** The in-flight child run — update() awaits it to harvest the transcript. */
	current?: Promise<ChildRunResult>;
}

export interface AsyncEngineHooks {
	subagents: SubAgentSpec[];
	model: BaseChatModel;
	backend: BackendProtocol;
	parentTools: ChildTool[];
	permissions: FilesystemPermission[];
	/** Fires on every status/counter change — wire this to the live UI. */
	onChange?(tasks: AsyncTaskRecord[]): void;
	onChildEvent?(ev: ChildEvent): void;
	/** Injectable child runner (tests). Defaults to the real child agent loop. */
	runChild?: typeof runChildAgent;
}

export interface AsyncTaskEngine {
	start(agent: string, description: string): string;
	check(id: string): string;
	update(id: string, message: string): string;
	cancel(id: string): string;
	list(): string;
	snapshot(): AsyncTaskRecord[];
	createTools(): ChildTool[];
}

let taskCounter = 0;

export function createAsyncTaskEngine(hooks: AsyncEngineHooks): AsyncTaskEngine {
	const tasks = new Map<string, LiveTask>();
	const runChild = hooks.runChild ?? runChildAgent;

	function snapshot(): AsyncTaskRecord[] {
		return [...tasks.values()].map((t) => ({ ...t.record, updates: [...t.record.updates] }));
	}

	function notify() {
		hooks.onChange?.(snapshot());
	}

	function describe(r: AsyncTaskRecord): string {
		const age = Math.round(((r.finishedAt ?? Date.now()) - r.startedAt) / 1000);
		const head =
			`${r.id} · agent=${r.agent} · status=${r.status} · ${r.steps} model rounds, ` +
			`${r.toolCalls} tool calls, ${age}s` +
			(r.updates.length ? ` · steered ${r.updates.length}×` : '');
		if (r.status === 'done') return `${head}\nFinal report: ${r.result}`;
		if (r.status === 'error') return `${head}\nError: ${r.result}`;
		if (r.status === 'cancelled') return `${head}`;
		return `${head}\nStill working — statuses quoted in earlier messages are stale; this one is live.`;
	}

	function launch(live: LiveTask, description: string, prior?: BaseMessage[]) {
		const gen = ++live.generation;
		const run = runChild({
			spec: live.spec,
			description,
			model: hooks.model,
			backend: hooks.backend,
			parentTools: hooks.parentTools,
			parentPermissions: hooks.permissions,
			priorMessages: prior,
			shouldAbort: () => live.aborted || live.generation !== gen,
			onEvent: (ev) => {
				if (live.generation !== gen) return;
				if (ev.type === 'tool') {
					live.record.toolCalls++;
					live.record.steps = Math.max(live.record.steps, 1);
				}
				hooks.onChildEvent?.({ ...ev, data: { ...ev.data, taskId: live.record.id, async: true } });
				notify();
			}
		});
		live.current = run;
		run
			.then((out: ChildRunResult) => {
				if (live.generation !== gen) return; // superseded by an update — its restart owns the record
				live.messages = out.messages;
				live.record.steps = out.steps;
				live.record.toolCalls = out.toolCalls;
				if (live.aborted || out.aborted) {
					live.record.status = 'cancelled';
				} else {
					live.record.status = 'done';
					live.record.result = out.summary;
				}
				live.record.finishedAt = Date.now();
				notify();
			})
			.catch((e: unknown) => {
				if (live.generation !== gen) return;
				live.record.status = 'error';
				live.record.result = e instanceof Error ? e.message : String(e);
				live.record.finishedAt = Date.now();
				notify();
			});
	}

	const engine: AsyncTaskEngine = {
		start(agent, description) {
			const spec = hooks.subagents.find((s) => s.name === agent);
			if (!spec) {
				return `No async subagent named "${agent}". Available: ${hooks.subagents
					.map((s) => s.name)
					.join(', ')}`;
			}
			const id = `task_${(++taskCounter).toString(36).padStart(2, '0')}${Math.random()
				.toString(36)
				.slice(2, 8)}`;
			const live: LiveTask = {
				spec,
				messages: [],
				aborted: false,
				generation: 0,
				record: {
					id,
					agent,
					description,
					status: 'running',
					steps: 0,
					toolCalls: 0,
					updates: [],
					startedAt: Date.now()
				}
			};
			tasks.set(id, live);
			launch(live, description);
			notify();
			return (
				`Started background task ${id} (agent=${agent}). It is running now and you keep ` +
				`the floor. Do NOT poll it immediately — report to the user and check when asked. ` +
				`Always reference the FULL task id, never truncate it.`
			);
		},

		check(id) {
			const live = tasks.get(id);
			if (!live) return unknownTask(id);
			return describe(live.record);
		},

		update(id, message) {
			const live = tasks.get(id);
			if (!live) return unknownTask(id);
			if (live.record.status !== 'running') {
				return `${id} is already ${live.record.status} — too late to steer it. Start a new task instead.`;
			}
			// Official semantics: a new run on the SAME thread with an interrupt
			// strategy — the current run halts at its next checkpoint, then the
			// child restarts with its full history plus the new instructions,
			// keeping its task id throughout.
			live.record.updates.push(message);
			live.generation++; // halt the in-flight run; its launch().then stands down
			const prev = live.current;
			const instruction = `New instructions from the supervisor (carry on from your work above): ${message}`;
			const relaunch = (history?: BaseMessage[]) =>
				launch(live, instruction, history?.length ? [...history] : undefined);
			if (prev) {
				void prev.then((out) => relaunch(out.messages)).catch(() => relaunch(live.messages));
			} else {
				relaunch(live.messages);
			}
			notify();
			return `Sent new instructions to ${id}. The current run was interrupted; the agent restarts with its full history plus your update.`;
		},

		cancel(id) {
			const live = tasks.get(id);
			if (!live) return unknownTask(id);
			if (live.record.status !== 'running') return `${id} is already ${live.record.status}.`;
			live.aborted = true;
			live.generation++; // orphan the in-flight run immediately
			live.record.status = 'cancelled';
			live.record.finishedAt = Date.now();
			notify();
			return `Cancelled ${id}.`;
		},

		list() {
			if (!tasks.size) return '(no background tasks)';
			return snapshot().map(describe).join('\n---\n');
		},

		snapshot,

		createTools() {
			const names = hooks.subagents.map((s) => s.name) as [string, ...string[]];
			const made = [
				tool(async ({ agent, description }) => engine.start(agent, description), {
					name: 'start_async_task',
					description:
						'Launch a background subagent and get a task id back IMMEDIATELY — it keeps ' +
						'working while you continue. Do not poll right after starting: tell the user ' +
						'it is underway and check later. ' +
						`Available background agents: ${hooks.subagents
							.map((s) => `${s.name} (${s.description})`)
							.join('; ')}.`,
					schema: z.object({
						agent: z.enum(names).describe('Which async subagent to launch.'),
						description: z.string().describe('A complete, self-contained brief.')
					})
				}),
				tool(async ({ task_id }) => engine.check(task_id), {
					name: 'check_async_task',
					description:
						'Fetch the LIVE status of a background task (statuses quoted in older messages ' +
						'are always stale). Returns the final report once the task is done.',
					schema: z.object({ task_id: z.string().describe('The full task id.') })
				}),
				tool(async ({ task_id, message }) => engine.update(task_id, message), {
					name: 'update_async_task',
					description:
						'Steer a RUNNING background task: interrupts its current run and restarts it ' +
						'with its full history plus your new instructions. Same task id throughout.',
					schema: z.object({
						task_id: z.string().describe('The full task id.'),
						message: z.string().describe('The new instructions.')
					})
				}),
				tool(async ({ task_id }) => engine.cancel(task_id), {
					name: 'cancel_async_task',
					description: 'Stop a running background task. Its status becomes "cancelled".',
					schema: z.object({ task_id: z.string().describe('The full task id.') })
				}),
				tool(async () => engine.list(), {
					name: 'list_async_tasks',
					description: 'List every background task with its live status.',
					schema: z.object({})
				})
			];
			return made as unknown as ChildTool[];
		}
	};

	function unknownTask(id: string): string {
		const known = [...tasks.keys()];
		return (
			`No task with id "${id}".` +
			(known.length
				? ` Known ids: ${known.join(', ')}. Task ids must be used in FULL — never truncate them.`
				: ' No background tasks have been started yet.')
		);
	}

	return engine;
}
