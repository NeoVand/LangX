import { createDeepAgent, StateBackend, type VirtualFile } from '$lib/deepagents';
import { totalMessageTokens } from '$lib/deepagents/tokens';
import { getModel } from '$lib/runtime/llm';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

/** Token budget visible to the model; deliberately tiny so the tiers fire. */
export const MAX_TOKENS = 600;
/** Tier-1 eviction threshold (percent of MAX_TOKENS). */
export const EVICT_THRESHOLD_PCT = 35;
/** Tier-3 summarization threshold (percent of MAX_TOKENS). */
export const SUMMARIZE_THRESHOLD_PCT = 80;

const INSTRUCTIONS = `You are testing the harness's compaction pipeline. You have a custom tool
called \`fetch_chunk\` that returns a large block of text. To produce visible compaction
events, follow this exact recipe in order:

1. write_file('/needle.md', 'Secret access code: PURPLE-99')
2. fetch_chunk({ label: 'PAGE 1' })  — large output
3. fetch_chunk({ label: 'PAGE 2' })  — large output
4. fetch_chunk({ label: 'PAGE 3' })  — large output
5. read_file({ path: '/needle.md' })
6. Reply with one short sentence confirming the needle is still readable after compaction.

Do not chat between tool calls. Do not skip steps.`;

export interface CompactionRunResult {
	events: TraceEvent[];
	files: VirtualFile[];
	liveTokens: number;
	finalText: string;
}

export interface CompactionCallbacks {
	/** Live trace events (the whole list, growing) as the run progresses. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live virtual-filesystem + token snapshot whenever the agent state changes. */
	onProgress?: (snapshot: { files: VirtualFile[]; liveTokens: number }) => void;
}

/**
 * Drives the four-tier compaction pipeline at deliberately low thresholds so the
 * tiers visibly fire: the agent saves a needle, fetches three large chunks (each
 * big enough to be evicted to /large_tool_results/), then reads the needle back.
 * Trace + filesystem + token updates stream out through the callbacks.
 * This is the exact source the demo runs.
 */
export async function runCompactionDemo(
	cb: CompactionCallbacks = {}
): Promise<CompactionRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	// ── Custom tool: synthetic large outputs to trigger eviction tiers ────────
	const fetchChunk = tool(
		async ({ label }) => {
			const lorem =
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
			return `[${label}]\n` + lorem.repeat(15);
		},
		{
			name: 'fetch_chunk',
			description:
				'Return a synthetic large text block tagged with the given label. Use only as instructed.',
			schema: z.object({ label: z.string() })
		}
	);

	// ── Harness: compaction middleware with low thresholds ────────────────────
	const model = await getModel({ temperature: 0, maxTokens: 600 });
	const backend = new StateBackend();
	const agent = createDeepAgent({
		model,
		backend,
		tools: [fetchChunk],
		instructions: INSTRUCTIONS,
		tracer,
		compaction: {
			maxTokens: MAX_TOKENS,
			evictThresholdPct: EVICT_THRESHOLD_PCT,
			summarizeThresholdPct: SUMMARIZE_THRESHOLD_PCT,
			largeToolResultMin: 200,
			// keep enough recent turns that the pair-aware boundary always has
			// a complete tool_calls/tool group to preserve
			historyKeep: 4
		},
		maxIterations: 16
	});
	agent.subscribe((s) => {
		cb.onProgress?.({ files: [...s.files], liveTokens: totalMessageTokens(s.messages) });
	});

	const out = await agent.invoke({
		input:
			'Save the secret, then fetch three large chunks, then verify the secret is still readable.',
		thread: `compact-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const text =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	return {
		events: localEvents,
		files: await backend.list(),
		liveTokens: totalMessageTokens(out.messages),
		finalText: text
	};
}
