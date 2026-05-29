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
 */
export async function evictLargeToolResults(
	messages: BaseMessage[],
	backend: BackendProtocol,
	cfg: CompactionConfig,
	emit?: (path: string, originalLen: number) => void
): Promise<{ messages: BaseMessage[]; evicted: number }> {
	let evicted = 0;
	const out: BaseMessage[] = [];
	for (const m of messages) {
		if (m instanceof ToolMessage && typeof m.content === 'string' && m.content.length >= cfg.largeToolResultMin) {
			const path = `/large_tool_results/${m.tool_call_id}-${Date.now()}.txt`;
			await backend.write(path, m.content);
			evicted += 1;
			emit?.(path, m.content.length);
			const preview = m.content.slice(0, 200).replace(/\s+/g, ' ');
			const summary = `[Tool result evicted to ${path}] ${preview}…\n\n(use read_file ${path} to fetch full output, ${m.content.length} bytes)`;
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
 */
export function truncateRepeatedArguments(messages: BaseMessage[]): BaseMessage[] {
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
	summarized: boolean;
	event: SummarizationEvent | null;
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

	if (total >= (cfg.maxTokens * cfg.evictThresholdPct) / 100) {
		const { messages: m1, evicted } = await evictLargeToolResults(messages, backend, cfg);
		messages = m1;
		evictedFiles = evicted;
	}

	if (total >= (cfg.maxTokens * cfg.evictThresholdPct) / 100) {
		messages = truncateRepeatedArguments(messages);
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

	return { messages, evictedFiles, summarized, event };
}

export function bytesPerMsg(messages: BaseMessage[]) {
	return messages.map((m) => ({
		kind: m.constructor.name,
		tokens: messageTokens(m)
	}));
}
