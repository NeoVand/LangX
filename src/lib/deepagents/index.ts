import {
	StateGraph,
	START,
	END,
	MemorySaver,
	Command,
	interrupt
} from '@langchain/langgraph/web';
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
	StructuredToolInterface,
	StructuredTool,
	ToolInterface
} from '@langchain/core/tools';
import {
	DeepAgentState,
	type DeepAgentStateType,
	type Todo,
	type VirtualFile,
	type SubAgentReport,
	type AsyncTaskRecord
} from './state';
import {
	StateBackend,
	StoreBackend,
	CompositeBackend,
	type BackendProtocol
} from './backends';
import type { FilesystemPermission } from './permissions';
import { evaluate } from './permissions';
import { assembleSystemPrompt } from './prompt';
import { createWriteTodosTool } from './tools/todos';
import { buildFilesystemTools } from './tools/filesystem';
import {
	createTaskTool,
	withGeneralPurpose,
	type SubAgentSpec,
	type ChildEvent,
	type ChildTool
} from './tools/task';
import { createAsyncTaskEngine, type AsyncTaskEngine } from './async-tasks';
import { createLoadSkillTool, type Skill } from './skills';
import { compact, defaultCompaction, type CompactionConfig } from './compaction';
import type { Tracer } from '$lib/runtime/tracer';

export type AnyTool = StructuredToolInterface | StructuredTool | ToolInterface;

export interface DeepAgentOptions {
	model: BaseChatModel;
	tools?: AnyTool[];
	/** Your instructions — composed FIRST, ahead of the base prompt (official order). */
	systemPrompt?: string;
	/** @deprecated alias for `systemPrompt` (the official option name). */
	instructions?: string;
	backend?: BackendProtocol;
	permissions?: FilesystemPermission[];
	/** Sync subagents for the task tool. Pass [] to get just the auto general-purpose one. */
	subagents?: SubAgentSpec[];
	/** Background subagents — adds the five async-task tools (start/check/update/cancel/list). */
	asyncSubagents?: SubAgentSpec[];
	skills?: Skill[];
	memorySummary?: string;
	compaction?: Partial<CompactionConfig>;
	interruptOn?: string[];
	tracer?: Tracer;
	maxIterations?: number;
}

/** One human decision at an interrupt — the official four verbs. */
export type HitlDecision =
	| { type: 'approve' }
	| { type: 'edit'; args: Record<string, unknown> }
	| { type: 'reject'; message?: string }
	| { type: 'respond'; message: string };

/**
 * Accept the official resume shape — `{ decisions: [...] }` — as well as a bare
 * decision, plus the legacy `{ decision: 'approve' | … }` form older demos send.
 */
function normalizeResume(value: unknown): HitlDecision {
	const v = value as
		| { decisions?: HitlDecision[] }
		| HitlDecision
		| { decision?: 'approve' | 'reject' | 'edit'; args?: Record<string, unknown>; reason?: string };
	if (v && typeof v === 'object' && 'decisions' in v && Array.isArray(v.decisions) && v.decisions[0])
		return v.decisions[0];
	if (v && typeof v === 'object' && 'type' in v) return v as HitlDecision;
	const legacy = v as { decision?: 'approve' | 'reject' | 'edit'; args?: Record<string, unknown>; reason?: string };
	if (legacy?.decision === 'edit' && legacy.args) return { type: 'edit', args: legacy.args };
	if (legacy?.decision === 'reject') return { type: 'reject', message: legacy.reason };
	return { type: 'approve' };
}

export interface HarnessInterrupt {
	tool: string;
	args: Record<string, unknown>;
	id?: string;
	/** What summoned the human: an interruptOn tool name, or a permission rule. */
	reason?: 'tool' | 'permission';
}

export type InterruptibleResult =
	| { status: 'interrupted'; interrupt: HarnessInterrupt; state: DeepAgentStateType }
	| { status: 'done'; state: DeepAgentStateType };

export interface CompiledDeepAgent {
	invoke(input: { input: string; thread?: string }): Promise<DeepAgentStateType>;
	/** Runs until completion OR the first pending interrupt (for HITL UIs). */
	start(input: { input: string; thread?: string }): Promise<InterruptibleResult>;
	/** Resume a paused run with a decision value, returning the next pause or completion. */
	resume(value: unknown, thread?: string): Promise<InterruptibleResult>;
	state: DeepAgentStateType;
	subscribe(fn: (state: DeepAgentStateType) => void): () => void;
}

interface RunSnapshot {
	messages: BaseMessage[];
	todos: Todo[];
	files: VirtualFile[];
	subagentReports: DeepAgentStateType['subagentReports'];
	summarizationEvents: DeepAgentStateType['summarizationEvents'];
	asyncTasks: AsyncTaskRecord[];
}

export function createDeepAgent(opts: DeepAgentOptions): CompiledDeepAgent {
	const compaction: CompactionConfig = { ...defaultCompaction, ...(opts.compaction ?? {}) };
	const backend = opts.backend ?? new StateBackend();
	const permissions = opts.permissions ?? [];
	const tracer = opts.tracer;

	const snapshot: RunSnapshot = {
		messages: [],
		todos: [],
		files: [],
		subagentReports: [],
		summarizationEvents: [],
		asyncTasks: []
	};
	const subscribers = new Set<(state: DeepAgentStateType) => void>();

	const writeTodos = createWriteTodosTool({
		getTodos: () => snapshot.todos,
		setTodos: (todos) => {
			snapshot.todos = todos;
			tracer?.emit('todo_update', `wrote ${todos.length} todos`, {
				completed: todos.filter((t) => t.status === 'completed').length
			});
		}
	});

	const fsTools = buildFilesystemTools({
		backend,
		permissions,
		onChange: async (files) => {
			snapshot.files = files;
		},
		onOp: ({ tool, path, result }) => {
			tracer?.emit('fs_op', `${tool} ${path ?? ''}`.trim(), result ? { result } : undefined);
		}
	});

	// Live child activity — streamed through the tracer so cockpit UIs can show
	// each subagent working, even though the parent's transcript never will.
	const onChildEvent = (ev: ChildEvent) => {
		if (ev.type === 'spawn') {
			tracer?.emit('subagent_spawn', ev.agent, { name: ev.agent, ...ev.data });
		} else if (ev.type === 'tool') {
			tracer?.emit('tool_call', `${ev.agent} → ${ev.detail}`, { agent: ev.agent, ...ev.data });
			// A child may have just written a file — refresh the shared workspace view.
			void backend.list().then((files) => {
				snapshot.files = files;
				notify();
			});
		} else if (ev.type === 'done') {
			if (ev.data?.async) {
				tracer?.emit('subagent_return', ev.agent, { name: ev.agent, ...ev.data, summary: ev.detail });
			}
			void backend.list().then((files) => {
				snapshot.files = files;
				notify();
			});
		} else if (ev.type === 'error') {
			tracer?.emit('error', `${ev.agent}: ${ev.detail}`, { agent: ev.agent, ...ev.data });
		}
	};

	const parentCustomTools = (opts.tools ?? []) as unknown as ChildTool[];
	const taskTool =
		opts.subagents != null
			? createTaskTool({
					subagents: opts.subagents,
					model: opts.model,
					backend,
					parentTools: parentCustomTools,
					permissions,
					onSpawn: (name, description) =>
						tracer?.emit('subagent_spawn', name, { name, description }),
					onChildEvent,
					onReturn: (report) => {
						snapshot.subagentReports = [...snapshot.subagentReports, report];
						tracer?.emit('subagent_return', report.name, {
							name: report.name,
							summary: report.summary,
							durationMs: report.durationMs,
							steps: report.steps,
							toolCalls: report.toolCalls
						});
					}
				})
			: null;

	const asyncEngine: AsyncTaskEngine | null = (opts.asyncSubagents?.length ?? 0) > 0
		? createAsyncTaskEngine({
				subagents: opts.asyncSubagents!,
				model: opts.model,
				backend,
				parentTools: parentCustomTools,
				permissions,
				onChildEvent,
				onChange: (tasks) => {
					snapshot.asyncTasks = tasks;
					notify();
				}
			})
		: null;

	const loadSkillTool = (opts.skills?.length ?? 0) > 0
		? createLoadSkillTool({
				skills: opts.skills!,
				onLoad: (name) => tracer?.emit('note', `load_skill ${name}`)
			})
		: null;

	const builtin: AnyTool[] = [
		writeTodos as unknown as AnyTool,
		...(fsTools as unknown as AnyTool[]),
		...(taskTool ? [taskTool as unknown as AnyTool] : []),
		...((asyncEngine?.createTools() ?? []) as unknown as AnyTool[]),
		...(loadSkillTool ? [loadSkillTool as unknown as AnyTool] : [])
	];
	const tools: AnyTool[] = [...builtin, ...(opts.tools ?? [])];

	// What the system prompt advertises: the sync roster (with the auto-added
	// general-purpose subagent) plus background agents, marked as such.
	const promptRoster: { name: string; description: string }[] = [
		...(opts.subagents != null ? withGeneralPurpose(opts.subagents) : []),
		...(opts.asyncSubagents ?? []).map((s) => ({
			name: s.name,
			description: `(background — launch with start_async_task) ${s.description}`
		}))
	];
	const toolByName = new Map(tools.map((t) => [(t as { name: string }).name, t]));

	const interruptOn = new Set(opts.interruptOn ?? []);
	// Rounds since the agent last touched the plan — drives the stale-board reminder.
	let roundsSinceTodos = 0;

	const checkpointer = new MemorySaver();

	const graph = new StateGraph(DeepAgentState)
		.addNode('agent', async (state) => {
			tracer?.emit('node_start', 'agent');
			snapshot.messages = state.messages as BaseMessage[];
			snapshot.todos = state.todos;
			snapshot.files = state.files.length ? state.files : await backend.list();
			snapshot.subagentReports = state.subagentReports;
			snapshot.summarizationEvents = state.summarizationEvents;
			// The engine is the live truth for background tasks; graph state only
			// catches up when a tool turn persists a fresh snapshot of it.
			snapshot.asyncTasks = asyncEngine ? asyncEngine.snapshot() : state.asyncTasks;
			notify();

			const compactionResult = await compact(
				state.messages as BaseMessage[],
				compaction,
				backend,
				opts.model
			);
			let messages = compactionResult.messages;
			const newSummEvents = [...state.summarizationEvents];
			if (compactionResult.event) {
				newSummEvents.push(compactionResult.event);
				tracer?.emit('summarization', `summarized ${compactionResult.event.evictedMessages} msgs`, {
					path: compactionResult.event.historyPath
				});
			}
			if (compactionResult.evictedFiles) {
				tracer?.emit('eviction', `evicted ${compactionResult.evictedFiles} large tool results`);
			}

			messages = withSystem(
				messages,
				opts.systemPrompt ?? opts.instructions ?? '',
				snapshot.todos,
				snapshot.files,
				opts.skills,
				promptRoster,
				opts.memorySummary
			);

			const modelWithTools = (
				opts.model as unknown as { bindTools: (t: AnyTool[]) => BaseChatModel }
			).bindTools(tools);

			const ai = (await modelWithTools.invoke(messages)) as AIMessage;
			tracer?.emit('node_end', 'agent', { tool_calls: ai.tool_calls?.length ?? 0 });

			return {
				messages: [ai],
				summarizationEvents: compactionResult.event ? [compactionResult.event] : []
			};
		})
		.addNode('tools', async (state) => {
			tracer?.emit('node_start', 'tools');
			const last = state.messages[state.messages.length - 1] as AIMessage;
			const calls = last.tool_calls ?? [];

			// Baseline so we can return ONLY the subagent reports produced during this
			// tool turn — `subagentReports` uses an appending reducer, so returning the
			// whole accumulated list would duplicate every prior report.
			const reportsBaseline = snapshot.subagentReports.length;
			roundsSinceTodos = calls.some((tc) => tc.name === 'write_todos') ? 0 : roundsSinceTodos + 1;

			// INVARIANT: every tool_call_id gets exactly one ToolMessage — including
			// gated calls that the human rejects. Leaving a call unanswered makes the
			// next model request a 400 (the official harness ships
			// PatchToolCallsMiddleware for the same reason).
			//
			// PASS 1 — all interrupt() calls, SYNCHRONOUSLY, before any await: the
			// browser async-context shim only carries the graph context up to the
			// first await, so gating must happen before any tool executes. Two
			// things can summon the human here: an interruptOn tool name, or a
			// filesystem permission rule in 'interrupt' mode.
			const synthesized = new Map<number, ToolMessage>();
			for (let i = 0; i < calls.length; i++) {
				const tc = calls[i];
				let gate: HarnessInterrupt | null = null;
				if (interruptOn.has(tc.name)) {
					gate = { tool: tc.name, args: tc.args, id: tc.id, reason: 'tool' };
				} else if (tc.name === 'write_file' || tc.name === 'edit_file') {
					const path = (tc.args as { path?: string }).path ?? '';
					if (evaluate(permissions, 'write', path).decision === 'interrupt') {
						gate = { tool: tc.name, args: tc.args, id: tc.id, reason: 'permission' };
					}
				}
				if (!gate) continue;
				tracer?.emit('interrupt', `pause for ${tc.name}`, {
					name: tc.name,
					args: tc.args,
					reason: gate.reason
				});
				const decision = normalizeResume(interrupt(gate));
				if (decision.type === 'reject') {
					tracer?.emit('resume', `rejected ${tc.name}`);
					synthesized.set(
						i,
						new ToolMessage({
							content:
								`The human reviewer REJECTED ${tc.name}${decision.message ? ` with this feedback: "${decision.message}"` : '.'} ` +
								`Treat this as a change request: address the feedback (update your plan, make the changes, re-verify), ` +
								`then call ${tc.name} again when ready. Do not stop here.`,
							tool_call_id: tc.id ?? '',
							name: tc.name
						})
					);
				} else if (decision.type === 'respond') {
					// The official fourth verb: don't run the tool — answer the agent instead.
					tracer?.emit('resume', `responded to ${tc.name}`);
					synthesized.set(
						i,
						new ToolMessage({
							content:
								`${tc.name} was NOT run. The human reviewer replied instead: "${decision.message}" ` +
								`Act on their reply, then call ${tc.name} again when appropriate.`,
							tool_call_id: tc.id ?? '',
							name: tc.name
						})
					);
				} else if (decision.type === 'edit' && decision.args) {
					// Apply the human's edits in place so the edited call runs below.
					tc.args = decision.args;
					tracer?.emit('resume', `edited ${tc.name}`, decision.args);
				} else {
					tracer?.emit('resume', `approved ${tc.name}`);
				}
			}

			// PASS 2 — execute everything that wasn't answered by the human.
			const runCall = async (tc: (typeof calls)[number]): Promise<ToolMessage> => {
				if (tc.name === 'write_file' || tc.name === 'edit_file') {
					const path = (tc.args as { path?: string }).path;
					if (path && evaluate(permissions, 'write', path).decision === 'deny') {
						tracer?.emit('error', 'permission denied', { path, op: 'write' });
					}
				}
				const t = toolByName.get(tc.name);
				if (!t) {
					return new ToolMessage({ content: `Unknown tool: ${tc.name}`, tool_call_id: tc.id ?? '', name: tc.name });
				}
				try {
					const result = await (t as { invoke: (a: unknown) => Promise<unknown> }).invoke(tc.args);
					const content = typeof result === 'string' ? result : JSON.stringify(result);
					return new ToolMessage({ content, tool_call_id: tc.id ?? '', name: tc.name });
				} catch (e) {
					return new ToolMessage({
						content: `Tool ${tc.name} failed: ${e instanceof Error ? e.message : String(e)}`,
						tool_call_id: tc.id ?? '',
						name: tc.name
					});
				}
			};

			// Sibling `task` calls start before anything is awaited, so the children
			// genuinely OVERLAP — the official "parallel but blocking" shape: the
			// supervisor waits, the subagents run concurrently. Everything else
			// executes in declaration order, and ToolMessage order is preserved.
			const startedTasks = new Map<number, Promise<ToolMessage>>();
			for (let i = 0; i < calls.length; i++) {
				if (!synthesized.has(i) && calls[i].name === 'task') {
					startedTasks.set(i, runCall(calls[i]));
				}
			}
			const out: ToolMessage[] = [];
			for (let i = 0; i < calls.length; i++) {
				const answered = synthesized.get(i);
				if (answered) {
					out.push(answered);
					continue;
				}
				out.push(await (startedTasks.get(i) ?? runCall(calls[i])));
			}

			// Stale plan board? Nudge through the channel models actually read —
			// appended to a tool result, the way real harnesses inject reminders.
			if (roundsSinceTodos >= 2 && out.length && snapshot.todos.some((t) => t.status !== 'completed')) {
				const lastOut = out[out.length - 1];
				lastOut.content =
					`${lastOut.content}\n\n[system-reminder] The plan board is stale — call write_todos with the ` +
					`FULL updated list (finished steps marked completed, the current one in_progress) before continuing.`;
			}

			for (const m of out) {
				tracer?.emit('tool_result', `${m.name ?? m.tool_call_id}`, {
					bytes: typeof m.content === 'string' ? m.content.length : 0
				});
			}
			snapshot.files = await backend.list();
			tracer?.emit('node_end', 'tools');

			// Persist the side effects of write_todos / task into the graph state, not
			// just the local snapshot — otherwise the agent node's `state.todos` /
			// `state.subagentReports` stay empty and the live plan never updates.
			const newReports = snapshot.subagentReports.slice(reportsBaseline);
			notify();
			return {
				messages: out,
				files: snapshot.files,
				todos: snapshot.todos,
				subagentReports: newReports,
				// Persist the ledger into graph state — officially asyncTasks is its own
				// channel precisely so compaction can never orphan a running task.
				asyncTasks: asyncEngine ? asyncEngine.snapshot() : []
			};
		})
		.addEdge(START, 'agent')
		.addConditionalEdges('agent', (s) => {
			const last = s.messages[s.messages.length - 1] as AIMessage;
			return last.tool_calls?.length ? 'tools' : END;
		})
		.addEdge('tools', 'agent')
		.compile({ checkpointer });

	function notify() {
		const snap: DeepAgentStateType = {
			messages: snapshot.messages,
			todos: snapshot.todos,
			files: snapshot.files,
			subagentReports: snapshot.subagentReports,
			summarizationEvents: snapshot.summarizationEvents,
			asyncTasks: snapshot.asyncTasks
		};
		for (const fn of subscribers) fn(snap);
	}

	function syncSnapshot(result: DeepAgentStateType) {
		snapshot.messages = result.messages as BaseMessage[];
		snapshot.todos = result.todos;
		snapshot.files = result.files;
		snapshot.subagentReports = result.subagentReports;
		snapshot.summarizationEvents = result.summarizationEvents;
		snapshot.asyncTasks = asyncEngine ? asyncEngine.snapshot() : result.asyncTasks;
		notify();
	}

	function readInterrupt(result: Record<string, unknown>): HarnessInterrupt | null {
		const ints = result['__interrupt__'] as Array<{ value?: HarnessInterrupt }> | undefined;
		const v = ints?.[0]?.value;
		return v ? { tool: v.tool, args: v.args ?? {}, id: v.id } : null;
	}

	return {
		async invoke({ input, thread = 'default' }) {
			tracer?.emit('run_start', 'deep-agent', { input });
			const config = {
				configurable: { thread_id: thread },
				recursionLimit: opts.maxIterations ?? 50
			};
			const result = (await graph.invoke(
				{ messages: [new HumanMessage(input)] } as never,
				config
			)) as DeepAgentStateType;
			syncSnapshot(result);
			tracer?.emit('run_end', 'deep-agent');
			return result;
		},

		async start({ input, thread = 'default' }) {
			tracer?.emit('run_start', 'deep-agent', { input });
			const config = {
				configurable: { thread_id: thread },
				recursionLimit: opts.maxIterations ?? 50
			};
			const result = (await graph.invoke(
				{ messages: [new HumanMessage(input)] } as never,
				config
			)) as DeepAgentStateType & Record<string, unknown>;
			syncSnapshot(result);
			const pending = readInterrupt(result);
			if (pending) return { status: 'interrupted', interrupt: pending, state: result };
			tracer?.emit('run_end', 'deep-agent');
			return { status: 'done', state: result };
		},

		async resume(value, thread = 'default') {
			const config = {
				configurable: { thread_id: thread },
				recursionLimit: opts.maxIterations ?? 50
			};
			tracer?.emit('resume', 'host decision', value as Record<string, unknown>);
			const result = (await graph.invoke(
				new Command({ resume: value }) as never,
				config
			)) as DeepAgentStateType & Record<string, unknown>;
			syncSnapshot(result);
			const pending = readInterrupt(result);
			if (pending) return { status: 'interrupted', interrupt: pending, state: result };
			tracer?.emit('run_end', 'deep-agent');
			return { status: 'done', state: result };
		},
		get state() {
			return {
				messages: snapshot.messages,
				todos: snapshot.todos,
				files: snapshot.files,
				subagentReports: snapshot.subagentReports,
				summarizationEvents: snapshot.summarizationEvents,
				asyncTasks: asyncEngine ? asyncEngine.snapshot() : snapshot.asyncTasks
			};
		},
		subscribe(fn) {
			subscribers.add(fn);
			return () => subscribers.delete(fn);
		}
	};
}

function withSystem(
	messages: BaseMessage[],
	instructions: string,
	todos: Todo[],
	files: VirtualFile[],
	skills: Skill[] | undefined,
	subagents: { name: string; description: string }[] | undefined,
	memorySummary: string | undefined
): BaseMessage[] {
	const system = assembleSystemPrompt({
		user: instructions,
		todos,
		files,
		skills: skills?.map((s) => ({ name: s.name, description: s.description })),
		subagents: subagents?.length ? subagents : undefined,
		memorySummary
	});
	const sysMsg = new SystemMessage(system);
	if (messages[0] instanceof SystemMessage) {
		return [sysMsg, ...messages.slice(1)];
	}
	return [sysMsg, ...messages];
}

export { StateBackend, StoreBackend, CompositeBackend };
export { assembleSystemPrompt, BASE_AGENT_PROMPT } from './prompt';
export { evaluate, matchPath } from './permissions';
export type { PermissionMode, PermissionResult } from './permissions';
export { withGeneralPurpose, runChildAgent, createTaskTool } from './tools/task';
export type { ChildEvent, ChildTool, ChildRunOptions, ChildRunResult } from './tools/task';
export { createAsyncTaskEngine } from './async-tasks';
export type { AsyncTaskEngine, AsyncEngineHooks } from './async-tasks';
export type { Todo, VirtualFile, SubAgentReport, AsyncTaskRecord, DeepAgentStateType };
export type { BackendProtocol, FilesystemPermission, Skill, SubAgentSpec, CompactionConfig };
