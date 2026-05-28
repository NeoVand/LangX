import {
	StateGraph,
	START,
	END,
	MemorySaver,
	interrupt
} from '@langchain/langgraph/web';
import { ToolNode } from '@langchain/langgraph/prebuilt';
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
	type SubAgentReport
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
import { createTaskTool, type SubAgentSpec } from './tools/task';
import { createLoadSkillTool, type Skill } from './skills';
import { compact, defaultCompaction, type CompactionConfig } from './compaction';
import type { Tracer } from '$lib/runtime/tracer';

export type AnyTool = StructuredToolInterface | StructuredTool | ToolInterface;

export interface DeepAgentOptions {
	model: BaseChatModel;
	tools?: AnyTool[];
	instructions?: string;
	backend?: BackendProtocol;
	permissions?: FilesystemPermission[];
	subagents?: SubAgentSpec[];
	skills?: Skill[];
	memorySummary?: string;
	compaction?: Partial<CompactionConfig>;
	interruptOn?: string[];
	tracer?: Tracer;
	maxIterations?: number;
}

export interface CompiledDeepAgent {
	invoke(input: { input: string; thread?: string }): Promise<DeepAgentStateType>;
	state: DeepAgentStateType;
	subscribe(fn: (state: DeepAgentStateType) => void): () => void;
}

interface RunSnapshot {
	messages: BaseMessage[];
	todos: Todo[];
	files: VirtualFile[];
	subagentReports: DeepAgentStateType['subagentReports'];
	summarizationEvents: DeepAgentStateType['summarizationEvents'];
}

export function createDeepAgent(opts: DeepAgentOptions): CompiledDeepAgent {
	const compaction: CompactionConfig = { ...defaultCompaction, ...(opts.compaction ?? {}) };
	const backend = opts.backend ?? new StateBackend();
	const permissions = opts.permissions ?? [];
	const tracer = opts.tracer;

	let snapshot: RunSnapshot = {
		messages: [],
		todos: [],
		files: [],
		subagentReports: [],
		summarizationEvents: []
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

	const taskTool = (opts.subagents?.length ?? 0) > 0
		? createTaskTool({
				subagents: opts.subagents!,
				onSpawn: (name) => tracer?.emit('subagent_spawn', name, { name }),
				onReturn: (report) => {
					snapshot.subagentReports = [...snapshot.subagentReports, report];
					tracer?.emit('subagent_return', report.name, {
						name: report.name,
						summary: report.summary,
						durationMs: report.durationMs
					});
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
		...(loadSkillTool ? [loadSkillTool as unknown as AnyTool] : [])
	];
	const tools: AnyTool[] = [...builtin, ...(opts.tools ?? [])];
	const toolNode = new ToolNode(tools as never);

	const interruptOn = new Set(opts.interruptOn ?? []);

	const checkpointer = new MemorySaver();

	const graph = new StateGraph(DeepAgentState)
		.addNode('agent', async (state) => {
			tracer?.emit('node_start', 'agent');
			snapshot.messages = state.messages as BaseMessage[];
			snapshot.todos = state.todos;
			snapshot.files = state.files.length ? state.files : await backend.list();
			snapshot.subagentReports = state.subagentReports;
			snapshot.summarizationEvents = state.summarizationEvents;
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
				opts.instructions ?? '',
				snapshot.todos,
				snapshot.files,
				opts.skills,
				opts.subagents,
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

			for (const tc of last.tool_calls ?? []) {
				if (interruptOn.has(tc.name)) {
					tracer?.emit('interrupt', `pause for ${tc.name}`, { name: tc.name, args: tc.args });
					const decision = interrupt({
						tool: tc.name,
						args: tc.args,
						id: tc.id
					}) as { decision: 'approve' | 'reject'; reason?: string };
					if (decision.decision === 'reject') {
						return {
							messages: [
								new ToolMessage({
									content: `Tool ${tc.name} was rejected by the human reviewer${decision.reason ? `: ${decision.reason}` : '.'}`,
									tool_call_id: tc.id ?? ''
								})
							]
						};
					}
					tracer?.emit('resume', `approved ${tc.name}`);
				}
				if (tc.name === 'write_file' || tc.name === 'edit_file') {
					const path = (tc.args as { path?: string }).path;
					if (path) {
						const decision = evaluate(permissions, 'write', path);
						if (!decision.allowed) {
							tracer?.emit('error', 'permission denied', { path, op: 'write' });
						}
					}
				}
			}

			const result = (await toolNode.invoke(state)) as { messages: BaseMessage[] };
			for (const m of result.messages ?? []) {
				if (m instanceof ToolMessage) {
					tracer?.emit('tool_result', `${m.tool_call_id}`, {
						bytes: typeof m.content === 'string' ? m.content.length : 0
					});
				}
			}
			snapshot.files = await backend.list();
			tracer?.emit('node_end', 'tools');
			return { ...result, files: snapshot.files };
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
			summarizationEvents: snapshot.summarizationEvents
		};
		for (const fn of subscribers) fn(snap);
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
			snapshot.messages = result.messages as BaseMessage[];
			snapshot.todos = result.todos;
			snapshot.files = result.files;
			snapshot.subagentReports = result.subagentReports;
			snapshot.summarizationEvents = result.summarizationEvents;
			notify();
			tracer?.emit('run_end', 'deep-agent');
			return result;
		},
		get state() {
			return {
				messages: snapshot.messages,
				todos: snapshot.todos,
				files: snapshot.files,
				subagentReports: snapshot.subagentReports,
				summarizationEvents: snapshot.summarizationEvents
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
	subagents: SubAgentSpec[] | undefined,
	memorySummary: string | undefined
): BaseMessage[] {
	const system = assembleSystemPrompt({
		user: instructions,
		todos,
		files,
		skills: skills?.map((s) => ({ name: s.name, description: s.description })),
		subagents: subagents?.map((s) => ({ name: s.name, description: s.description })),
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
export type { Todo, VirtualFile, SubAgentReport, DeepAgentStateType };
export type { BackendProtocol, FilesystemPermission, Skill, SubAgentSpec, CompactionConfig };
