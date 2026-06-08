/**
 * The classic ReAct loop, hand-built from StateGraph primitives — the bare
 * machine that Level 1's `createAgent` compiles to:
 *
 *   START → agent → (tool_calls?) → tools → agent → … → END
 *
 * • `agent` is a MODEL node: it hands the whole message list to the model and
 *   appends the reply.
 * • `tools` is a CODE node: a prebuilt ToolNode that runs whatever tool calls the
 *   model asked for and appends the results.
 * • A CONDITIONAL EDGE after `agent` reads the last message and loops back to
 *   `tools` while there are tool calls, or routes to END once the model answers.
 *
 * The state is just `{ messages }` (MessagesAnnotation) with an append reducer —
 * so every node returns a *partial* update (the new message(s)) and the runtime
 * merges it. The lesson streams this through <LiveGraph> via `runGraphTurn`.
 */
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { calculatorTool, weatherTool } from '$lib/runtime/tools';
import { getModel } from '$lib/runtime/llm';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { runGraphTurn, type StreamableGraph } from './graph-run';

export type StateGraphMode = 'simple' | 'multi';

/** The graph's state, snapshotted per step for the live graph. */
export interface SGSnapshot {
	messages: BaseMessage[];
}

/**
 * Build (and compile) the agent ↔ tools graph for the given scenario. The
 * `simple` scenario has one tool (weather); `multi` adds a calculator so the
 * model loops twice. Returns a compiled, streamable graph.
 */
export async function buildStateGraph(mode: StateGraphMode) {
	const tools = mode === 'simple' ? [weatherTool] : [weatherTool, calculatorTool];
	const model = await getModel({ temperature: 0, maxTokens: 320 });
	const bound = model.bindTools!(tools);
	const toolNode = new ToolNode(tools);

	return new StateGraph(MessagesAnnotation)
		.addNode('agent', async (state) => {
			// MODEL node — append the model's reply (a partial update; the reducer merges it).
			const ai = await bound.invoke(state.messages);
			return { messages: [ai] };
		})
		.addNode('tools', toolNode)
		.addEdge(START, 'agent')
		// CONDITIONAL EDGE — loop to tools while the model asks for them, else finish.
		.addConditionalEdges('agent', (state) => {
			const last = state.messages[state.messages.length - 1] as AIMessage;
			return last.tool_calls?.length ? 'tools' : END;
		})
		.addEdge('tools', 'agent')
		.compile();
}

/**
 * Stream one run into <LiveGraph>. Only the user's question goes in; the state is
 * seeded with it so the START frame already shows the message, and each node's
 * streamed update (its new message) is appended by `merge`.
 */
export async function runStateGraphTurn(
	graph: Awaited<ReturnType<typeof buildStateGraph>>,
	userInput: string,
	config: { configurable: { thread_id: string } },
	onUpdate?: (node: string, snapshot: SGSnapshot) => void | Promise<void>
) {
	return runGraphTurn<SGSnapshot>(graph as unknown as StreamableGraph, { messages: [new HumanMessage(userInput)] }, config, {
		empty: () => ({ messages: [new HumanMessage(userInput)] }),
		merge: (s, u) => {
			const msgs = (u as { messages?: BaseMessage[] }).messages;
			if (Array.isArray(msgs)) s.messages = [...s.messages, ...msgs];
		},
		onUpdate
	});
}
