/**
 * Rewindable chat — a worked example of what a checkpointer buys you. The graph
 * is the smallest possible thing: one `chat` node. The interesting part is the
 * ONE extra line at compile time:
 *
 *   START → chat → END        .compile({ checkpointer: new MemorySaver() })
 *
 * That single line makes every super-step write a CHECKPOINT, which unlocks all
 * three of this lesson's superpowers from the same primitive:
 *
 * • PERSISTENCE / MEMORY — invoke with a `thread_id` and only the NEW message;
 *   the checkpointer reloads the thread's history, so the model remembers earlier
 *   turns without you resending them.
 * • HISTORY — `getStateHistory(thread)` walks every saved checkpoint.
 * • TIME TRAVEL / FORK — resume from a past `checkpoint_id` with a different
 *   message and the conversation branches; the original branch stays intact.
 *
 * This is the exact source the demo runs.
 */
import { StateGraph, MessagesAnnotation, MemorySaver, START, END } from '@langchain/langgraph/web';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';

export interface ChatSnapshot {
	messages: BaseMessage[];
}

/** The result of one turn: the full message list plus the checkpoint it landed on. */
export interface TurnResult {
	messages: BaseMessage[];
	checkpointId: string;
}

/** One saved checkpoint, flattened for the timeline UI (`getStateHistory` row). */
export interface CheckpointInfo {
	checkpointId: string;
	parentId: string | null;
	step: number;
	messageCount: number;
	/** The most recent human / AI message text at this checkpoint. */
	user: string;
	assistant: string;
	/** Nodes the graph would run next ([] means the turn is complete). */
	next: string[];
}

type ThreadConfig = { configurable: { thread_id: string; checkpoint_id?: string } };

function textOf(m: BaseMessage | undefined): string {
	if (!m) return '';
	return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
}

/**
 * The chat graph: one model node over MessagesAnnotation, compiled WITH a
 * checkpointer. Nothing about the graph knows about memory — persistence is a
 * property the checkpointer adds at compile time.
 */
export function buildChatGraph(checkpointer: MemorySaver, model: Awaited<ReturnType<typeof getModel>>) {
	const prompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You are a warm, concise assistant. Keep replies under 40 words. Always use what the user told you earlier in this conversation.'
		],
		// Injects the full conversation the checkpointer reloaded into state.messages.
		new MessagesPlaceholder('messages')
	]);

	return new StateGraph(MessagesAnnotation)
		.addNode('chat', async (s) => {
			const ai = await prompt.pipe(model).invoke({ messages: s.messages });
			return { messages: [ai] };
		})
		.addEdge(START, 'chat')
		.addEdge('chat', END)
		.compile({ checkpointer });
}

export type ChatGraph = ReturnType<typeof buildChatGraph>;

/**
 * Run one turn. Pass ONLY the new message — the checkpointer supplies the
 * history for `thread_id`. Pass `fromCheckpointId` to resume from a PAST
 * checkpoint instead of the latest: that is exactly how you time-travel / fork
 * (the new turn branches off that checkpoint; the original branch is untouched).
 */
export async function sendTurn(
	graph: ChatGraph,
	text: string,
	threadId: string,
	fromCheckpointId?: string
): Promise<TurnResult> {
	const config: ThreadConfig = {
		configurable: { thread_id: threadId, ...(fromCheckpointId ? { checkpoint_id: fromCheckpointId } : {}) }
	};
	const out = (await graph.invoke({ messages: [new HumanMessage(text)] }, config)) as ChatSnapshot;
	// The checkpoint we just landed on becomes this branch's new tip.
	const head = await graph.getState({ configurable: { thread_id: threadId } });
	return {
		messages: out.messages,
		checkpointId: head.config.configurable?.checkpoint_id as string
	};
}

/**
 * Like `sendTurn`, but streams the reply token-by-token for a live typing feel.
 * Uses `streamMode: 'messages'` so the chat node's tokens surface as they arrive;
 * falls back to the final checkpoint state if the model didn't stream. Returns the
 * full reply text plus the checkpoint this turn landed on.
 */
export async function runChatTurn(
	graph: ChatGraph,
	text: string,
	threadId: string,
	fromCheckpointId: string | undefined,
	onToken?: (full: string) => void
): Promise<TurnResult & { text: string }> {
	const config: ThreadConfig = {
		configurable: { thread_id: threadId, ...(fromCheckpointId ? { checkpoint_id: fromCheckpointId } : {}) }
	};
	let full = '';
	const stream = await graph.stream(
		{ messages: [new HumanMessage(text)] },
		{ ...config, streamMode: 'messages' }
	);
	for await (const part of stream as AsyncIterable<unknown>) {
		// streamMode 'messages' yields [messageChunk, metadata]
		const chunk = Array.isArray(part) ? part[0] : part;
		const content = (chunk as { content?: unknown })?.content;
		const delta = typeof content === 'string' ? content : '';
		if (delta) {
			full += delta;
			onToken?.(full);
		}
	}
	const head = await graph.getState({ configurable: { thread_id: threadId } });
	const headMsgs = ((head.values as ChatSnapshot)?.messages ?? []) as BaseMessage[];
	if (!full) {
		// Model didn't stream tokens — read the final reply from the checkpoint.
		const lastAi = [...headMsgs].reverse().find((m) => m instanceof AIMessage);
		full = textOf(lastAi);
		onToken?.(full);
	}
	return {
		text: full,
		messages: headMsgs,
		checkpointId: head.config.configurable?.checkpoint_id as string
	};
}

/** Walk every checkpoint saved for a thread (newest first) — the raw history. */
export async function historyOf(graph: ChatGraph, threadId: string): Promise<CheckpointInfo[]> {
	const rows: CheckpointInfo[] = [];
	for await (const snap of graph.getStateHistory({ configurable: { thread_id: threadId } })) {
		const msgs = ((snap.values as ChatSnapshot)?.messages ?? []) as BaseMessage[];
		const lastUser = [...msgs].reverse().find((m) => m instanceof HumanMessage);
		const lastAi = [...msgs].reverse().find((m) => m instanceof AIMessage);
		rows.push({
			checkpointId: snap.config.configurable?.checkpoint_id as string,
			parentId: (snap.parentConfig?.configurable?.checkpoint_id as string) ?? null,
			step: (snap.metadata?.step as number) ?? -1,
			messageCount: msgs.length,
			user: textOf(lastUser),
			assistant: textOf(lastAi),
			next: [...snap.next]
		});
	}
	return rows;
}
