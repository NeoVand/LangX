import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph/web';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

export const FanoutState = Annotation.Root({
	topic: Annotation<string>(),
	subQuestions: Annotation<string[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => []
	}),
	answers: Annotation<{ q: string; a: string }[]>({
		reducer: (a, b) => [...a, ...b],
		default: () => []
	}),
	report: Annotation<string>()
});

export interface FanoutPayload {
	topic: string;
	subQuestions: string[];
	answers: { q: string; a: string }[];
	report: string;
	stages: string[];
}

/**
 * Map-reduce inside a graph. The `plan` node asks the model for sub-questions,
 * then a conditional edge returns one `Send('research', ...)` per question —
 * spawning N parallel research branches, each with its own state slice. Their
 * `answers` writes merge back via the reducer, and `synthesize` reads the merged
 * list. This is the exact source the demo runs.
 */
export async function runSendFanoutDemo(
	topic: string,
	onStage?: (stages: string[]) => void
): Promise<FanoutPayload> {
	const planModel = await getModel({ temperature: 0.3, maxTokens: 280 });
	const researchModel = await getModel({ temperature: 0.4, maxTokens: 220 });
	const synthModel = await getModel({ temperature: 0.3, maxTokens: 380 });
	const parser = new StringOutputParser();

	let stages: string[] = [];
	const pushStage = (stage: string) => {
		stages = [...stages, stage];
		onStage?.(stages);
	};

	const planPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You decompose a topic into exactly 5 distinct sub-questions a researcher can answer independently. Return ONLY 5 lines, each one a single question, no numbering.'
		],
		['human', 'Topic: {topic}']
	]);
	const researchPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You are a careful researcher. Answer the question in 1–2 short sentences (≤ 45 words). No preamble.'
		],
		['human', '{question}']
	]);
	const synthPrompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You synthesize a brief from research notes. Return Markdown with a "# Topic" heading, then bold each question as a sub-section followed by the answer. Be concise.'
		],
		['human', 'Topic: {topic}\n\nNotes:\n{notes}']
	]);

	// ── Graph build: plan → Send fan-out → synthesize ───────────────────────
	const graph = new StateGraph(FanoutState)
		.addNode('plan', async (s) => {
			pushStage('plan');
			const text = await planPrompt.pipe(planModel).pipe(parser).invoke({ topic: s.topic });
			const subQuestions = text
				.split('\n')
				.map((line) => line.replace(/^[-•\d.\s]+/, '').trim())
				.filter((line) => line.length > 0)
				.slice(0, 5);
			return { subQuestions };
		})
		// Each Send spawns an independent research branch with { question } input.
		.addNode('research', async (s: { question: string }) => {
			pushStage(`research:${s.question.slice(0, 24)}…`);
			const a = await researchPrompt
				.pipe(researchModel)
				.pipe(parser)
				.invoke({ question: s.question });
			return { answers: [{ q: s.question, a: a.trim() }] };
		})
		.addNode('synthesize', async (s) => {
			pushStage('synthesize');
			const notes = s.answers.map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n\n');
			const md = await synthPrompt
				.pipe(synthModel)
				.pipe(parser)
				.invoke({ topic: s.topic, notes });
			return { report: md };
		})
		.addEdge(START, 'plan')
		// Conditional edge returns Send[] — dynamic parallel map step.
		.addConditionalEdges(
			'plan',
			(s) => s.subQuestions.map((q) => new Send('research', { question: q })),
			['research']
		)
		.addEdge('research', 'synthesize')
		.addEdge('synthesize', END)
		.compile();

	const final = (await graph.invoke({
		topic,
		subQuestions: [],
		answers: [],
		report: ''
	})) as FanoutPayload;

	return { ...final, stages };
}
