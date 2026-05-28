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
	})
});

export type DeepAgentStateType = typeof DeepAgentState.State;

function mergeFiles(a: VirtualFile[], b: VirtualFile[]): VirtualFile[] {
	const map = new Map<string, VirtualFile>();
	for (const f of a) map.set(f.path, f);
	for (const f of b) map.set(f.path, f);
	return [...map.values()];
}
