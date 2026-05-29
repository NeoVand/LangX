import {
	createDeepAgent,
	StateBackend,
	type FilesystemPermission,
	type VirtualFile
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

/** Most specific first; first match wins. The exact rules the demo enforces. */
export const permissions: FilesystemPermission[] = [
	{ operations: ['write'], paths: ['**/.env', 'secrets/**'], mode: 'deny' },
	{ operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
	{ operations: ['read', 'write'], paths: ['**'], mode: 'deny' }
];

const INSTRUCTIONS = `You are auditing the harness's permission system. Your task is to attempt
five file writes in this exact order, all via write_file, then call ls() once. You MUST attempt
all five even if some are denied — the point is to see which are denied. Do not skip any.

After ls(), reply with one sentence summarising which writes succeeded and which were denied.

The five writes to attempt (in order):
1. write_file('src/util.ts',     '// utility')
2. write_file('docs/intro.md',   '# Intro')
3. write_file('secrets/keys.txt','should be denied')
4. write_file('.env',            'API_KEY=foo')
5. write_file('random.md',       'catch-all denied')`;

export interface PermissionsRunResult {
	files: VirtualFile[];
	events: TraceEvent[];
	finalText: string;
}

export interface PermissionsCallbacks {
	/** Live trace events (the whole list, growing) as the run progresses. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
}

/**
 * Drives a first-match-wins permission audit: the agent attempts five writes,
 * two of which land (src/, docs/) and three of which are denied (secrets/, .env,
 * catch-all). Trace + filesystem updates stream out through the callbacks.
 * This is the exact source the demo runs.
 */
export async function runPermissionsDemo(
	cb: PermissionsCallbacks = {}
): Promise<PermissionsRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Harness: permission rules evaluated before each filesystem op ─────────
	const model = await getModel({ temperature: 0, maxTokens: 800 });
	const backend = new StateBackend();
	const agent = createDeepAgent({
		model,
		backend,
		permissions,
		instructions: INSTRUCTIONS,
		tracer,
		maxIterations: 16
	});
	agent.subscribe((s) => cb.onFiles?.([...s.files]));

	const out = await agent.invoke({
		input: 'Run the five-write audit described in your instructions and report what was blocked.',
		thread: `perms-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	return { files: await backend.list(), events: localEvents, finalText: text };
}
