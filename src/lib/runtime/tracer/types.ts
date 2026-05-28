export type TraceEventKind =
	| 'run_start'
	| 'run_end'
	| 'node_start'
	| 'node_end'
	| 'edge'
	| 'message'
	| 'token'
	| 'tool_call'
	| 'tool_result'
	| 'state_update'
	| 'subagent_spawn'
	| 'subagent_return'
	| 'todo_update'
	| 'fs_op'
	| 'eviction'
	| 'summarization'
	| 'interrupt'
	| 'resume'
	| 'note'
	| 'error';

export interface TraceEvent {
	id: string;
	t: number;
	kind: TraceEventKind;
	label: string;
	data?: Record<string, unknown>;
	depth?: number;
}

let _id = 0;
export function makeEvent(
	kind: TraceEventKind,
	label: string,
	data?: Record<string, unknown>,
	depth = 0
): TraceEvent {
	return {
		id: `e_${++_id}`,
		t: Date.now(),
		kind,
		label,
		data,
		depth
	};
}
