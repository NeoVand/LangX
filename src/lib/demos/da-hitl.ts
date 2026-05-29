import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type HarnessInterrupt,
	type VirtualFile
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

const INSTRUCTIONS = `You are about to write two files. Call write_file twice in order:
1. write_file('/draft.md',     '# First draft')
2. write_file('/published.md', '# Published\\n\\nReady for the team.')

Then reply with one short summary sentence. Do not chat between tool calls.`;

const INPUT = 'Write the draft and the published file.';

export interface HitlCallbacks {
	/** Each new trace event as the run progresses. */
	onTrace?: (event: TraceEvent) => void;
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
}

export interface HitlAgentHandle {
	agent: CompiledDeepAgent;
	thread: string;
	/** Hardcoded first prompt that kicks off the two gated write_file calls. */
	input: string;
}

/**
 * Builds a deep-agent harness with write_file gated behind a human-in-the-loop
 * interrupt. The agent is returned un-driven so the host can run start/resume
 * and surface each pause to a human (approve / reject / edit). Trace +
 * filesystem updates stream out through the callbacks.
 */
export async function createHitlAgent(cb: HitlCallbacks = {}): Promise<HitlAgentHandle> {
	const tracer = createTracer();
	tracer.subscribe((ev) => cb.onTrace?.(ev));
	const model = await getModel({ temperature: 0, maxTokens: 400 });
	const backend = new StateBackend();
	const thread = `hitl-${Math.random().toString(36).slice(2, 6)}`;
	// interruptOn: named tools pause the run until a human approves via resume().
	const agent = createDeepAgent({
		model,
		backend,
		interruptOn: ['write_file'],
		instructions: INSTRUCTIONS,
		tracer,
		maxIterations: 8
	});
	agent.subscribe((s) => cb.onFiles?.([...s.files]));
	return { agent, thread, input: INPUT };
}

export type HitlDecision = {
	decision: 'approve' | 'reject' | 'edit';
	reason?: string;
	args?: Record<string, unknown>;
};

export type ApproveFn = (interrupt: HarnessInterrupt) => Promise<HitlDecision> | HitlDecision;

/**
 * Drives the gated agent start → resume loop, asking `approve` for a decision at
 * every pause, and returns the final response text. This is the exact source the
 * demo runs (the in-browser page drives the same start/resume loop interactively).
 */
export async function runHitlDemo(approve: ApproveFn, cb: HitlCallbacks = {}): Promise<string> {
	const { agent, thread, input } = await createHitlAgent(cb);
	// ── HITL loop: start until interrupted, resume with human decision ────────
	let res = await agent.start({ input, thread });
	while (res.status === 'interrupted') {
		const decision = await approve(res.interrupt);
		res = await agent.resume(decision, thread);
	}
	const msgs = (res.state.messages ?? []) as { content?: unknown }[];
	return displayContent(msgs[msgs.length - 1]?.content as never);
}
