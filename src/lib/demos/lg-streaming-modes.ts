import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { weatherTool } from '$lib/runtime/tools';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { displayContent } from '$lib/runtime/messages';
import { getModel } from '$lib/runtime/llm';

export type ValuesEvent = { messageCount: number; last: string };
export type UpdatesEvent = Record<string, { added: number; last: string }>;
export type MessagesEvent = { chunk: string; from: string };

export interface StreamingPayload {
	values: ValuesEvent[];
	updates: UpdatesEvent[];
	messages: MessagesEvent[];
}

export interface StreamingCallbacks {
	onValues?: (events: ValuesEvent[]) => void;
	onUpdates?: (events: UpdatesEvent[]) => void;
	onMessages?: (events: MessagesEvent[]) => void;
}

/** The chat–tool loop from Lesson 1, used as the subject of all three streams. */
async function buildGraph() {
	const model = await getModel({ temperature: 0, maxTokens: 200 });
	const bound = model.bindTools!([weatherTool]);
	const tools = new ToolNode([weatherTool]);

	return new StateGraph(MessagesAnnotation)
		.addNode('agent', async (s) => ({ messages: [await bound.invoke(s.messages)] }))
		.addNode('tools', tools)
		.addEdge(START, 'agent')
		.addConditionalEdges('agent', (s) => {
			const last = s.messages[s.messages.length - 1] as AIMessage;
			return last.tool_calls?.length ? 'tools' : END;
		})
		.addEdge('tools', 'agent')
		.compile();
}

/**
 * Three streaming projections of one run. `values` emits the full state after
 * each superstep, `updates` emits each node's delta, and `messages` emits
 * `[chunk, metadata]` token tuples (with `metadata.langgraph_node` naming the
 * source node). This is the exact source the demo runs.
 */
export async function runStreamingModesDemo(
	cb: StreamingCallbacks = {}
): Promise<StreamingPayload> {
	const promptText = "What's the weather in Tokyo? Reply in one short sentence.";
	const input = { messages: [new HumanMessage(promptText)] };

	const v: ValuesEvent[] = [];
	const u: UpdatesEvent[] = [];
	const m: MessagesEvent[] = [];

	// ── streamMode: 'values' — full state after each superstep ──────────────
	const g1 = await buildGraph();
	for await (const evt of await g1.stream(input, { streamMode: 'values' })) {
		const msgs = (evt as { messages: BaseMessage[] }).messages;
		v.push({
			messageCount: msgs.length,
			last: msgs[msgs.length - 1]?.constructor?.name ?? '?'
		});
	}
	cb.onValues?.(v);

	// ── streamMode: 'updates' — per-node partial writes only ────────────────
	const g2 = await buildGraph();
	for await (const evt of await g2.stream(input, { streamMode: 'updates' })) {
		const entry: UpdatesEvent = {};
		for (const [node, payload] of Object.entries(evt)) {
			const msgs = (payload as { messages: BaseMessage[] }).messages;
			entry[node] = {
				added: msgs.length,
				last: msgs[msgs.length - 1]?.constructor?.name ?? '?'
			};
		}
		u.push(entry);
	}
	cb.onUpdates?.(u);

	// ── streamMode: 'messages' — token chunks + langgraph_node metadata ─────
	const g3 = await buildGraph();
	for await (const [chunk, meta] of await g3.stream(input, {
		streamMode: 'messages'
	})) {
		const c = chunk as { content?: unknown };
		const md = meta as { langgraph_node?: string };
		// Anthropic streams content as block arrays, not strings — extract
		// the text so the messages panel isn't silently empty.
		const text = displayContent(c.content as never);
		if (text) m.push({ chunk: text, from: md.langgraph_node ?? '?' });
	}
	cb.onMessages?.(m);

	return { values: v, updates: u, messages: m };
}
