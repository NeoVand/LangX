import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

export type Category = 'billing' | 'tech' | 'general';

export interface RoutePayload {
	query: string;
	category: Category;
	answer: string;
}

export interface MergePayload {
	notes: string[];
	score: number;
	lastWriter: string;
}

function isCategory(s: string): s is Category {
	return s === 'billing' || s === 'tech' || s === 'general';
}

/**
 * A support-ticket triage graph: a `classify` node asks a real LLM for a label,
 * then a conditional edge routes to the matching reply node. The router returns
 * a key into the mapping table, so `addConditionalEdges` decides the next node
 * from state. This is the exact source the demo runs.
 */
export async function runRouterDemo(
	query: string,
	onPath?: (path: string[]) => void
): Promise<RoutePayload> {
	const model = await getModel({ temperature: 0, maxTokens: 60 });
	const replyModel = await getModel({ temperature: 0.2, maxTokens: 220 });

	let path: string[] = [];
	const pushPath = (node: string) => {
		path = [...path, node];
		onPath?.(path);
	};

	// ── State schema: typed channels the graph reads and writes ─────────────
	const State = Annotation.Root({
		query: Annotation<string>(),
		category: Annotation<Category>(),
		answer: Annotation<string>()
	});

	const classifyPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'Classify a customer message into exactly one of: billing, tech, general. Respond with only the lowercase label.'
		],
		['human', '{query}']
	]);
	const replyPromptFor = (kind: Category) =>
		ChatPromptTemplate.fromMessages([
			[
				'system',
				`You are a ${kind} support agent. Reply concisely (≤ 50 words). Be helpful and warm; no greetings.`
			],
			['human', '{query}']
		]);
	const parser = new StringOutputParser();

	// ── Graph build: classify → conditional branch → specialist reply ───────
	const graph = new StateGraph(State)
		.addNode('classify', async (s) => {
			pushPath('classify');
			const raw = await classifyPrompt.pipe(model).pipe(parser).invoke({ query: s.query });
			const guess = raw.trim().toLowerCase().split(/\s+/)[0];
			const category = isCategory(guess) ? guess : 'general';
			return { category };
		})
		.addNode('billing', async (s) => {
			pushPath('billing');
			const a = await replyPromptFor('billing').pipe(replyModel).pipe(parser).invoke({ query: s.query });
			return { answer: `[Billing] ${a}` };
		})
		.addNode('tech', async (s) => {
			pushPath('tech');
			const a = await replyPromptFor('tech').pipe(replyModel).pipe(parser).invoke({ query: s.query });
			return { answer: `[Tech] ${a}` };
		})
		.addNode('general', async (s) => {
			pushPath('general');
			const a = await replyPromptFor('general').pipe(replyModel).pipe(parser).invoke({ query: s.query });
			return { answer: `[General] ${a}` };
		})
		.addEdge(START, 'classify')
		// Router returns s.category; mapping table picks the destination node.
		.addConditionalEdges('classify', (s) => s.category, {
			billing: 'billing',
			tech: 'tech',
			general: 'general'
		})
		.addEdge('billing', END)
		.addEdge('tech', END)
		.addEdge('general', END)
		.compile();

	const final = (await graph.invoke({
		query,
		category: 'general',
		answer: ''
	})) as RoutePayload;
	pushPath('__end__');
	return final;
}

/**
 * Three reducer styles in one schema: `notes` concatenates, `score` sums, and
 * `lastWriter` keeps the last write. `research` and `draft` fan out from START
 * and both write the same fields in one superstep, so the reducers decide how
 * the parallel writes merge. This is the exact source the demo runs.
 */
export async function runMergeDemo(): Promise<MergePayload> {
	// ── Reducers: how concurrent writes to the same channel combine ─────────
	const State = Annotation.Root({
		notes: Annotation<string[]>({
			reducer: (a, b) => [...a, ...b],
			default: () => []
		}),
		score: Annotation<number>({
			reducer: (a, b) => a + b,
			default: () => 0
		}),
		// research and draft both write this in the same superstep, so it
		// needs a reducer; "last writer wins" keeps the parallel fan-in legal.
		lastWriter: Annotation<string>({
			reducer: (a, b) => b ?? a,
			default: () => ''
		})
	});

	const research = () => ({
		notes: ['research: found 3 sources'],
		score: 1,
		lastWriter: 'research'
	});
	const draft = () => ({
		notes: ['draft: 250 words'],
		score: 2,
		lastWriter: 'draft'
	});
	const review = () => ({
		notes: ['review: 4 nits found'],
		score: -1,
		lastWriter: 'review'
	});

	// ── Graph build: parallel fan-out from START, fan-in at review ──────────
	const graph = new StateGraph(State)
		.addNode('research', research)
		.addNode('draft', draft)
		.addNode('review', review)
		.addEdge(START, 'research')
		.addEdge(START, 'draft')
		.addEdge('research', 'review')
		.addEdge('draft', 'review')
		.addEdge('review', END)
		.compile();
	return (await graph.invoke({})) as MergePayload;
}
