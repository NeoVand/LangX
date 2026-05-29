import {
	createDeepAgent,
	StateBackend,
	StoreBackend,
	CompositeBackend,
	type VirtualFile
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

/** Store scope shared with the page's IndexedDB survivor read-back. */
export const BACKENDS_SCOPE = 'lesson-backends';

export interface BackendsRunResult {
	files: VirtualFile[];
	events: TraceEvent[];
	finalText: string;
}

export interface BackendsDemoCallbacks {
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
	/** Live trace events (the whole list, growing). */
	onTrace?: (events: TraceEvent[]) => void;
}

const INSTRUCTIONS = `You are a memory steward. Use the virtual filesystem with this routing rule:
- /scratch/ — ephemeral notes for this run only.
- /memories/ — durable notes the user will want available next session.

For the user's request, you must:
1. Write a SHORT scratch note at /scratch/draft.md describing the rough idea.
2. Write a focused memory at /memories/preferences.md capturing the user's stated preferences
   as a small bulleted markdown document.

Use only write_file. End with one summary sentence. Do not chat between tool calls.`;

/**
 * Drives a memory-steward agent against a CompositeBackend that routes
 * /memories/ to a durable StoreBackend (IndexedDB) and everything else to an
 * ephemeral StateBackend. Live filesystem + trace stream out through callbacks;
 * the final composite listing is returned.
 * This is the exact source the demo runs.
 */
export async function runBackendsDemo(cb: BackendsDemoCallbacks = {}): Promise<BackendsRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── CompositeBackend: prefix routing to durable vs ephemeral storage ─────
	const composite = new CompositeBackend(
		[{ prefix: '/memories/', backend: new StoreBackend(BACKENDS_SCOPE) }],
		new StateBackend()
	);
	const model = await getModel({ temperature: 0, maxTokens: 600 });
	const agent = createDeepAgent({
		model,
		backend: composite,
		instructions: INSTRUCTIONS,
		tracer,
		maxIterations: 10
	});
	agent.subscribe((s) => cb.onFiles?.([...s.files]));

	const out = await agent.invoke({
		input: `I prefer short, terse bullets. I dislike emoji. I want responses to be
direct. Save a scratch note about today's planning and capture my preferences in /memories/.`,
		thread: `backends-${Math.random().toString(36).slice(2, 6)}`
	});

	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	const finalFiles = await composite.list();
	return { files: finalFiles, events: localEvents, finalText: text };
}
