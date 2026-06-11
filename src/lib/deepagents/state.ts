import { Annotation, MessagesAnnotation } from '@langchain/langgraph/web';

export interface Todo {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
}

export interface VirtualFile {
	path: string;
	content: string;
	backend?: string;
}

export interface SummarizationEvent {
	at: number;
	evictedMessages: number;
	summary: string;
	historyPath: string;
}

export interface SubAgentReport {
	name: string;
	summary: string;
	durationMs: number;
	/** Model rounds the child took — collapsed into the one report above. */
	steps?: number;
	/** Tool calls the child made — the parent never saw any of them. */
	toolCalls?: number;
}

/**
 * One background subagent run, tracked in its own state channel. Officially
 * this lives in `asyncTasks` precisely so compaction can't evict it: if task
 * IDs lived only in tool messages, summarization would orphan running work.
 */
export interface AsyncTaskRecord {
	id: string;
	agent: string;
	description: string;
	status: 'running' | 'done' | 'cancelled' | 'error';
	result?: string;
	steps: number;
	toolCalls: number;
	/** Steering messages applied mid-flight via update_async_task. */
	updates: string[];
	startedAt: number;
	finishedAt?: number;
}

/**
 * Deep Agents state extends the standard messages state with:
 *  - todos: the externalized plan, written by the agent via write_todos
 *  - files: virtual filesystem entries written by the agent
 *  - summarizationEvents: log of compaction events (non-mutating audit trail)
 *  - subagentReports: completed subagent runs surfaced to the parent
 */
export const DeepAgentState = Annotation.Root({
	...MessagesAnnotation.spec,
	todos: Annotation<Todo[]>({
		reducer: (_a, b) => b,
		default: () => []
	}),
	files: Annotation<VirtualFile[]>({
		reducer: (a, b) => mergeFiles(a, b),
		default: () => []
	}),
	summarizationEvents: Annotation<SummarizationEvent[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => []
	}),
	subagentReports: Annotation<SubAgentReport[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => []
	}),
	asyncTasks: Annotation<AsyncTaskRecord[]>({
		reducer: (a, b) => mergeById(a, b),
		default: () => []
	})
});

export type DeepAgentStateType = typeof DeepAgentState.State;

function mergeFiles(a: VirtualFile[], b: VirtualFile[]): VirtualFile[] {
	const map = new Map<string, VirtualFile>();
	for (const f of a) map.set(f.path, f);
	for (const f of b) map.set(f.path, f);
	return [...map.values()];
}

function mergeById(a: AsyncTaskRecord[], b: AsyncTaskRecord[]): AsyncTaskRecord[] {
	const map = new Map<string, AsyncTaskRecord>();
	for (const t of a) map.set(t.id, t);
	for (const t of b) map.set(t.id, t);
	return [...map.values()];
}
