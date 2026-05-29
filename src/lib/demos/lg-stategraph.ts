import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { calculatorTool, weatherTool } from '$lib/runtime/tools';
import { getModel } from '$lib/runtime/llm';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';

export type StateGraphMode = 'simple' | 'multi';

export interface StateGraphCallbacks {
	/** Called with the growing superstep order, e.g. ['agent', 'tools', ...]. */
	onPath?: (path: string[]) => void;
	/** Called with the node currently running (or '__end__' when finished). */
	onActive?: (node: string | undefined) => void;
	/** Called with the full message list after each superstep. */
	onMessages?: (messages: BaseMessage[]) => void;
}

/**
 * The classic ReAct loop, hand-built from StateGraph primitives: an `agent`
 * node calls the model, a conditional edge routes to a `tools` node whenever the
 * model emits tool calls, and the loop continues until the model just answers.
 * Streaming `streamMode: 'values'` yields the full state after every superstep.
 * This is the exact source the demo runs.
 */
export async function runStateGraphDemo(
	userInput: string,
	mode: StateGraphMode,
	cb: StateGraphCallbacks = {}
): Promise<{ messages: BaseMessage[]; path: string[] }> {
	// ── Tools + bound model ─────────────────────────────────────────────────
	const tools = mode === 'simple' ? [weatherTool] : [weatherTool, calculatorTool];
	const model = await getModel({ temperature: 0, maxTokens: 320 });
	const bound = model.bindTools!(tools);
	// ToolNode is a prebuilt node that executes every tool_call in the last AIMessage.
	const toolNode = new ToolNode(tools);

	let path: string[] = [];
	const pushPath = (node: string) => {
		path = [...path, node];
		cb.onPath?.(path);
	};

	// ── Graph build: agent ↔ tools ReAct loop ───────────────────────────────
	// MessagesAnnotation: state is { messages } with an append reducer on messages.
	const graph = new StateGraph(MessagesAnnotation)
		.addNode('agent', async (state) => {
			pushPath('agent');
			cb.onActive?.('agent');
			const ai = await bound.invoke(state.messages);
			// Partial update — reducer appends this AIMessage to state.messages.
			return { messages: [ai] };
		})
		.addNode('tools', async (state) => {
			pushPath('tools');
			cb.onActive?.('tools');
			return await toolNode.invoke(state);
		})
		.addEdge(START, 'agent')
		// Conditional edge: route to tools when the last message has tool_calls.
		.addConditionalEdges('agent', (state) => {
			const last = state.messages[state.messages.length - 1] as AIMessage;
			if (last.tool_calls?.length) return 'tools';
			return END;
		})
		.addEdge('tools', 'agent')
		.compile();

	// ── Run: stream full state after each superstep ─────────────────────────
	const seedMessages: BaseMessage[] = [new HumanMessage(userInput)];
	let collected: BaseMessage[] = seedMessages;
	for await (const update of await graph.stream(
		{ messages: seedMessages },
		{ streamMode: 'values' }
	)) {
		collected = update.messages as BaseMessage[];
		cb.onMessages?.(collected);
	}
	cb.onActive?.('__end__');
	pushPath('__end__');

	return { messages: collected, path };
}
