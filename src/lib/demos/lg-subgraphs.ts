import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

export const RagState = Annotation.Root({
	question: Annotation<string>(),
	hits: Annotation<string[]>(),
	answer: Annotation<string>()
});

export const ChatState = Annotation.Root({
	question: Annotation<string>(),
	category: Annotation<'rag' | 'chitchat'>(),
	answer: Annotation<string>()
});

export type Category = 'rag' | 'chitchat';

export interface OuterPayload {
	question: string;
	category: Category;
	answer: string;
	path: string[];
}

const KB: { id: string; text: string }[] = [
	{
		id: 'lcel',
		text: 'LCEL (LangChain Expression Language) composes Runnables with the pipe operator. Every Runnable speaks invoke / batch / stream / streamEvents.'
	},
	{
		id: 'stategraph',
		text: 'A LangGraph StateGraph is a state machine: nodes return partial state updates, edges (fixed or conditional) decide what runs next, and a checkpointer can persist every superstep.'
	},
	{
		id: 'reducers',
		text: 'Reducers in LangGraph define how concurrent writes to the same state field combine: append for messages, sum for counters, dedupe for sets.'
	},
	{
		id: 'checkpointer',
		text: 'A LangGraph checkpointer (e.g. MemorySaver, Postgres) snapshots state after every node so you can resume, branch, or time-travel a thread.'
	},
	{
		id: 'subagent',
		text: 'A subagent in Deep Agents is a self-contained agent with its own instructions and context, spawned via the task tool.'
	}
];

function tinyRetrieve(question: string): string[] {
	const q = question.toLowerCase();
	const scored = KB.map((doc) => ({
		doc,
		score: doc.text
			.toLowerCase()
			.split(/\W+/)
			.filter((w) => q.includes(w)).length
	}));
	scored.sort((a, b) => b.score - a.score);
	return scored
		.filter((s) => s.score > 0)
		.slice(0, 2)
		.map((s) => `${s.doc.id}: ${s.doc.text}`);
}

/**
 * A compiled graph is a Runnable, so it can be a node inside another graph.
 * Here a RAG mini-graph (retrieve → generate) is compiled and invoked from the
 * outer graph's `rag` node; the outer graph classifies the question and routes
 * to either the RAG subgraph or a chit-chat node. This is the exact source the
 * demo runs.
 */
export async function runSubgraphsDemo(
	question: string,
	onPath?: (path: string[]) => void
): Promise<OuterPayload> {
	const classifier = await getModel({ temperature: 0, maxTokens: 30 });
	const ragModel = await getModel({ temperature: 0.2, maxTokens: 220 });
	const chatModel = await getModel({ temperature: 0.6, maxTokens: 140 });
	const parser = new StringOutputParser();

	let path: string[] = [];
	const pushPath = (node: string) => {
		path = [...path, node];
		onPath?.(path);
	};

	const classifyPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'Classify the user question. Reply with EXACTLY one of: rag, chitchat. Use rag when the question is asking for a factual/technical answer that benefits from documents. Use chitchat for greetings, opinions, or small talk.'
		],
		['human', '{question}']
	]);
	const ragPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'Answer the question grounded in the provided snippets. Cite the snippet ids in [] brackets. Be concise (≤ 60 words).'
		],
		['human', 'Question: {question}\n\nSnippets:\n{hits}']
	]);
	const chatPrompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a friendly assistant. Reply briefly (≤ 30 words). No greetings.'],
		['human', '{question}']
	]);

	// ── Inner subgraph: retrieve → generate (compiled Runnable) ───────────
	const ragSubgraph = new StateGraph(RagState)
		.addNode('retrieve', async (s) => {
			return { hits: tinyRetrieve(s.question) };
		})
		.addNode('generate', async (s) => {
			const answer = await ragPrompt
				.pipe(ragModel)
				.pipe(parser)
				.invoke({
					question: s.question,
					hits: s.hits.length ? s.hits.join('\n') : '(no matches)'
				});
			return { answer };
		})
		.addEdge(START, 'retrieve')
		.addEdge('retrieve', 'generate')
		.addEdge('generate', END)
		.compile();

	// ── Outer graph: classify → rag subgraph OR chitchat ──────────────────────
	const graph = new StateGraph(ChatState)
		.addNode('classify', async (s) => {
			pushPath('classify');
			const raw = await classifyPrompt.pipe(classifier).pipe(parser).invoke({ question: s.question });
			const guess = raw.trim().toLowerCase().split(/\s+/)[0];
			const category: Category = guess === 'chitchat' ? 'chitchat' : 'rag';
			return { category };
		})
		.addNode('rag', async (s) => {
			pushPath('rag');
			// Compiled subgraphs are Runnables — invoke like any other node body.
			const sub = await ragSubgraph.invoke({
				question: s.question,
				hits: [],
				answer: ''
			});
			return { answer: sub.answer };
		})
		.addNode('chitchat', async (s) => {
			pushPath('chitchat');
			const a = await chatPrompt.pipe(chatModel).pipe(parser).invoke({ question: s.question });
			return { answer: a };
		})
		.addEdge(START, 'classify')
		.addConditionalEdges('classify', (s) => s.category, {
			rag: 'rag',
			chitchat: 'chitchat'
		})
		.addEdge('rag', END)
		.addEdge('chitchat', END)
		.compile();

	const final = (await graph.invoke({
		question,
		category: 'rag',
		answer: ''
	})) as { question: string; category: Category; answer: string };
	pushPath('__end__');
	return { ...final, path };
}
