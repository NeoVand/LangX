import { createDeepAgent, StateBackend, type VirtualFile } from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

export interface HarnessDemoOptions {
	/** Free-form user instructions folded into the assembled system prompt. */
	instructions: string;
	/** Wire the summarization/eviction compaction middleware between rounds. */
	useCompaction: boolean;
	/** Gate write_file behind a human-in-the-loop interrupt (auto-approved here). */
	useHitl: boolean;
	/** Live trace events (the whole list, growing) as the run progresses. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
}

/**
 * Builds a deep-agent harness from the learner's toggles, then drives a single
 * run end to end. Any HITL pause is auto-approved so the lesson stays focused on
 * assembly (the HITL lesson covers approval UX in depth). Trace + filesystem
 * updates stream out through the callbacks.
 * This is the exact source the demo runs.
 */
export async function runHarnessDemo(opts: HarnessDemoOptions): Promise<{ finalText: string }> {
	// ── Observability: tracer streams middleware + tool events ────────────
	const events: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		events.push(ev);
		opts.onTrace?.([...events]);
	});

	// ── Harness assembly: model + backend + optional middleware ───────────
	const model = await getModel({ temperature: 0, maxTokens: 400 });
	const backend = new StateBackend();
	const thread = `harness-${Math.random().toString(36).slice(2, 6)}`;
	const agent = createDeepAgent({
		model,
		backend,
		instructions: opts.instructions,
		tracer,
		maxIterations: 16,
		...(opts.useCompaction
			? { compaction: { maxTokens: 4000, evictThresholdPct: 45, summarizeThresholdPct: 80 } }
			: {}),
		...(opts.useHitl ? { interruptOn: ['write_file'] } : {})
	});
	agent.subscribe((s) => opts.onFiles?.([...s.files]));

	// ── Agent loop: start → resume until complete ───────────────────────────
	// Drive the run; auto-approve any HITL pause so this lesson stays focused
	// on assembly (the HITL lesson covers approval UX in depth).
	let res = await agent.start({
		input: 'Plan two steps, write a one-line note to /scratch/plan.md, then summarize what you did.',
		thread
	});
	while (res.status === 'interrupted') {
		res = await agent.resume({ decision: 'approve' }, thread);
	}
	const finalText = displayContent(
		(res.state.messages[res.state.messages.length - 1] as { content?: unknown })?.content as never
	);
	return { finalText };
}
