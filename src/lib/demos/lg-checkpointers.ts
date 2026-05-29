import {
	Annotation,
	StateGraph,
	MemorySaver,
	MessagesAnnotation,
	START,
	END
} from '@langchain/langgraph/web';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getModel } from '$lib/runtime/llm';

/** Counter state: `count` sums, `log` concatenates a human-readable trace. */
export const CounterState = Annotation.Root({
	count: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
	log: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] })
});

/**
 * The synthetic counter graph used for time travel. Compiling with a
 * `checkpointer` makes the runtime snapshot state after every node, which is
 * what powers `getStateHistory`, `updateState`, and forking from a past
 * checkpoint. This is the exact source the demo runs.
 */
export function buildCounterGraph(checkpointer: MemorySaver) {
	// ── Linear graph: add → double ──────────────────────────────────────────
	return new StateGraph(CounterState)
		.addNode('add', async (s) => ({
			count: 1,
			log: [`add → count is now ${s.count + 1}`]
		}))
		.addNode('double', async (s) => ({
			count: s.count,
			log: [`double → count is now ${s.count * 2}`]
		}))
		.addEdge(START, 'add')
		.addEdge('add', 'double')
		.addEdge('double', END)
		// checkpointer snapshots state after every node for time-travel demos.
		.compile({ checkpointer });
}

/**
 * A real-LLM chat graph. The same checkpointer that powers time travel turns a
 * one-shot graph into a multi-turn chat: LangGraph reloads the latest snapshot
 * for a `thread_id` before each `invoke`, so the assistant remembers earlier
 * turns. This is the exact source the demo runs.
 */
export function buildChatGraph(
	model: Awaited<ReturnType<typeof getModel>>,
	checkpointer: MemorySaver
) {
	const prompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You are a helpful, concise travel assistant. Keep replies short (≤ 35 words). Always use what the user has previously told you.'
		],
		// MessagesPlaceholder injects the full conversation from state.messages.
		new MessagesPlaceholder('messages')
	]);

	// ── Single-node chat graph with persistent thread state ─────────────────
	return new StateGraph(MessagesAnnotation)
		.addNode('chat', async (s) => {
			const ai = await prompt.pipe(model).invoke({ messages: s.messages });
			return { messages: [ai] };
		})
		.addEdge(START, 'chat')
		.addEdge('chat', END)
		.compile({ checkpointer });
}
