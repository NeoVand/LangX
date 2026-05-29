import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
	RunnableLambda,
	RunnableParallel,
	RunnablePassthrough
} from '@langchain/core/runnables';
import { getModel } from '$lib/runtime/llm';

export interface FanoutResult {
	short: string;
	bullets: string;
	passthrough: string;
}

/**
 * `RunnableParallel` fans one input out to several Runnables and gathers their
 * outputs into a single object. `RunnablePassthrough` keeps the original input
 * alongside the derived values.
 *
 * This is the exact source the demo runs.
 */
export async function runFanoutDemo(topic: string): Promise<FanoutResult> {
	const model = await getModel({ temperature: 0.2, maxTokens: 220 });

	// Branch A — one-sentence summary (prompt → model → parser)
	const shortChain = ChatPromptTemplate.fromMessages([
		['human', 'In one sentence (≤ 25 words), what is {topic}?']
	])
		.pipe(model)
		.pipe(new StringOutputParser());

	// Branch B — three bullet facts (same pipe shape, different prompt)
	const bulletChain = ChatPromptTemplate.fromMessages([
		[
			'human',
			'List exactly three short bullet facts about {topic}. Use a leading "• " and one line per bullet. No prose.'
		]
	])
		.pipe(model)
		.pipe(new StringOutputParser());

	// Branch C — echo the input unchanged via RunnablePassthrough + a tiny lambda
	const fanout = RunnableParallel.from({
		short: shortChain,
		bullets: bulletChain,
		passthrough: RunnablePassthrough.assign({}).pipe(
			new RunnableLambda({
				func: (x: { topic: string }) => `(input echoed: ${x.topic})`
			})
		)
	});

	// One invoke → `{ short, bullets, passthrough }`
	return (await fanout.invoke({ topic })) as FanoutResult;
}
