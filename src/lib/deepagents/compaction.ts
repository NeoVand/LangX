import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { messageTokens, totalMessageTokens } from './tokens';
import type { BackendProtocol } from './backends';
import type { SummarizationEvent } from './state';

export interface CompactionConfig {
	maxTokens: number;
	evictThresholdPct: number;
	summarizeThresholdPct: number;
	largeToolResultMin: number;
	historyKeep: number;
}

export const defaultCompaction: CompactionConfig = {
	maxTokens: 8000,
	evictThresholdPct: 50,
	summarizeThresholdPct: 85,
	largeToolResultMin: 1000,
	historyKeep: 4
};

/**
 * Tier 1: walk the message list and replace any oversized ToolMessage content
 * with a path + short preview, writing the original content into the virtual FS.
 *
 * `protectTail` leaves the most recent N messages untouched — the official
 * "preserve recent context" principle. Without it, a tool result is evicted on
 * the very next round, before the model can extract its fact, and the model
 * re-reads the pointer in an endless thrash.
 */
export async function evictLargeToolResults(
	messages: BaseMessage[],
	backend: BackendProtocol,
	cfg: CompactionConfig,
	protectTail = 0,
	emit?: (path: string, originalLen: number) => void
): Promise<{ messages: BaseMessage[]; evicted: number }> {
	let evicted = 0;
	const cutoff = messages.length - protectTail; // indices >= cutoff are protected
	const out: BaseMessage[] = [];
	for (let idx = 0; idx < messages.length; idx++) {
		const m = messages[idx];
		if (
			idx < cutoff &&
			m instanceof ToolMessage &&
			typeof m.content === 'string' &&
			m.content.length >= cfg.largeToolResultMin
		) {
			const path = `/large_tool_results/${m.tool_call_id}-${Date.now()}.txt`;
			await backend.write(path, m.content);
			evicted += 1;
			emit?.(path, m.content.length);
			const preview = m.content.slice(0, 200).replace(/\s+/g, ' ');
			const summary = `[Tool result evicted to ${path}] ${preview}…\n\n(the full ${m.content.length}-byte output is on disk; read_file ${path} only if you still need a detail not already in your notes)`;
			out.push(
				new ToolMessage({
					content: summary,
					tool_call_id: m.tool_call_id
				})
			);
		} else {
			out.push(m);
		}
	}
	return { messages: out, evicted };
}

/**
 * Tier 2: truncate redundant identical tool *arguments* in older AIMessages.
 * This is the "argument truncation" tier — the same field repeated across
 * messages gets replaced with `<as before>` after its first appearance.
 * Pass `stats` to learn whether anything was actually replaced this pass.
 */
export function truncateRepeatedArguments(
	messages: BaseMessage[],
	stats?: { replaced: number }
): BaseMessage[] {
	const seen = new Map<string, string>();
	return messages.map((m) => {
		if (!(m instanceof AIMessage) || !m.tool_calls?.length) return m;
		const newCalls = m.tool_calls.map((tc) => {
			const newArgs: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(tc.args)) {
				const key = `${tc.name}::${k}`;
				const stringified = JSON.stringify(v);
				if (seen.get(key) === stringified && stringified.length > 80) {
					newArgs[k] = '<as before>';
					if (stats) stats.replaced += 1;
				} else {
					newArgs[k] = v;
					seen.set(key, stringified);
				}
			}
			return { ...tc, args: newArgs };
		});
		return new AIMessage({
			content: m.content,
			tool_calls: newCalls
		});
	});
}

/**
 * Tier 3: summarize older messages with the model. Keep the system message,
 * the most recent N exchanges, and replace the middle with a single summary
 * AIMessage. The original block is appended to /conversation_history/.
 */
export async function summarizeOlder(
	messages: BaseMessage[],
	model: BaseChatModel,
	backend: BackendProtocol,
	cfg: CompactionConfig
): Promise<{ messages: BaseMessage[]; event: SummarizationEvent | null }> {
	if (messages.length <= cfg.historyKeep + 2) return { messages, event: null };

	const sys = messages[0] instanceof SystemMessage ? messages.slice(0, 1) : [];
	// Pick a tail-start index that never splits a tool_calls/tool pair. Splitting
	// would leave an orphan ToolMessage in the tail (or orphan tool_calls in the
	// summarized middle), which Anthropic rejects with a 400 invalid_request.
	const tailStart = safeBoundary(messages, messages.length - cfg.historyKeep, sys.length);
	const tail = messages.slice(tailStart);
	const middle = messages.slice(sys.length, tailStart);
	if (!middle.length) return { messages, event: null };

	const middleText = middle
		.map((m, i) => `[${m.constructor.name}#${i}] ${stringifyContent(m)}`)
		.join('\n\n');

	const summaryPrompt = [
		new SystemMessage(
			'You are a meticulous note-taker. Summarize the following conversation segment in ≤8 sentences. Keep facts, decisions, and any open questions. Do not invent.'
		),
		new HumanMessage(middleText)
	];

	const aiSummary = await model.invoke(summaryPrompt);
	const summaryText =
		typeof aiSummary.content === 'string' ? aiSummary.content : JSON.stringify(aiSummary.content);

	const path = `/conversation_history/segment-${Date.now()}.md`;
	await backend.write(path, middleText);

	const summaryMessage = new AIMessage({
		content: `[Summary of ${middle.length} messages, original at ${path}]\n\n${summaryText}`
	});

	return {
		messages: [...sys, summaryMessage, ...tail],
		event: {
			at: Date.now(),
			evictedMessages: middle.length,
			summary: summaryText,
			historyPath: path
		}
	};
}

function stringifyContent(m: BaseMessage) {
	const c = m.content;
	return typeof c === 'string' ? c : JSON.stringify(c);
}

/**
 * Returns a split index >= floor such that messages[index] does not begin with
 * an orphan ToolMessage and messages[index-1] is not an AIMessage whose
 * tool_calls' results live in the tail. We only ever move the boundary EARLIER
 * (growing the tail) so a complete request/response pair is kept together.
 */
function safeBoundary(messages: BaseMessage[], desired: number, floor: number): number {
	let i = Math.max(floor, Math.min(desired, messages.length));
	while (i > floor) {
		const startsWithToolResult = messages[i] instanceof ToolMessage;
		const prev = messages[i - 1];
		const prevHasPendingToolCalls = prev instanceof AIMessage && (prev.tool_calls?.length ?? 0) > 0;
		if (!startsWithToolResult && !prevHasPendingToolCalls) break;
		i -= 1;
	}
	return i;
}

export interface CompactionResult {
	messages: BaseMessage[];
	evictedFiles: number;
	trimmed: boolean;
	summarized: boolean;
	event: SummarizationEvent | null;
}

/** One message as it sits in the live window — the unit the context tape draws. */
export interface ContextItem {
	role: 'system' | 'human' | 'ai' | 'tool';
	/** normal | pointer (evicted tool result) | summary (collapsed middle) | toolcall. */
	variant: 'normal' | 'pointer' | 'summary' | 'toolcall';
	tokens: number;
	label: string;
}

function shortLabel(content: unknown, fallback: string): string {
	const text = typeof content === 'string' ? content : '';
	const clean = text.replace(/\s+/g, ' ').trim();
	if (!clean) return fallback;
	return clean.length > 52 ? clean.slice(0, 51) + '…' : clean;
}

/**
 * Classify each message in the current window so the lesson can render it —
 * sizes by token count, and flags the two compaction artifacts (the evicted
 * tool-result pointer, and the summary card that replaced the middle).
 */
export function describeContext(messages: BaseMessage[]): ContextItem[] {
	return messages.map((m) => {
		const tokens = messageTokens(m);
		if (m instanceof SystemMessage) {
			return { role: 'system', variant: 'normal', tokens, label: 'system prompt' };
		}
		if (m instanceof HumanMessage) {
			return { role: 'human', variant: 'normal', tokens, label: shortLabel(m.content, 'user message') };
		}
		if (m instanceof ToolMessage) {
			const text = typeof m.content === 'string' ? m.content : '';
			if (text.startsWith('[Tool result evicted to')) {
				return { role: 'tool', variant: 'pointer', tokens, label: 'evicted → /large_tool_results/' };
			}
			return { role: 'tool', variant: 'normal', tokens, label: `${m.name ?? 'tool'} result` };
		}
		const ai = m as AIMessage;
		const text = typeof ai.content === 'string' ? ai.content : '';
		if (text.startsWith('[Summary of')) {
			const n = text.match(/\[Summary of (\d+)/)?.[1] ?? '?';
			return { role: 'ai', variant: 'summary', tokens, label: `summary of ${n} messages` };
		}
		if (ai.tool_calls?.length) {
			return { role: 'ai', variant: 'toolcall', tokens, label: ai.tool_calls.map((t) => t.name).join(', ') };
		}
		return { role: 'ai', variant: 'normal', tokens, label: shortLabel(ai.content, 'assistant reply') };
	});
}

/**
 * Run the full compaction pipeline against a message list. Caller passes in
 * the model + backend; the harness wires this up as a hook between tool
 * results and the next model call.
 */
export async function compact(
	messages: BaseMessage[],
	cfg: CompactionConfig,
	backend: BackendProtocol,
	model: BaseChatModel
): Promise<CompactionResult> {
	let total = totalMessageTokens(messages);
	let evictedFiles = 0;
	let trimmed = false;

	if (total >= (cfg.maxTokens * cfg.evictThresholdPct) / 100) {
		// Protect the recent tail so a just-read result survives long enough to be
		// used; only older bulk evicts to disk.
		const { messages: m1, evicted } = await evictLargeToolResults(
			messages,
			backend,
			cfg,
			cfg.historyKeep
		);
		messages = m1;
		evictedFiles = evicted;
	}

	if (total >= (cfg.maxTokens * cfg.evictThresholdPct) / 100) {
		const stats = { replaced: 0 };
		messages = truncateRepeatedArguments(messages, stats);
		trimmed = stats.replaced > 0;
	}

	total = totalMessageTokens(messages);
	let event: SummarizationEvent | null = null;
	let summarized = false;
	if (total >= (cfg.maxTokens * cfg.summarizeThresholdPct) / 100) {
		const out = await summarizeOlder(messages, model, backend, cfg);
		messages = out.messages;
		event = out.event;
		summarized = !!event;
	}

	return { messages, evictedFiles, trimmed, summarized, event };
}

export function bytesPerMsg(messages: BaseMessage[]) {
	return messages.map((m) => ({
		kind: m.constructor.name,
		tokens: messageTokens(m)
	}));
}
