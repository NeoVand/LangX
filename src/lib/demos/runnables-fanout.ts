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
	/** Per-branch wall-clock (ms from the single invoke), to show concurrency. */
	bars: { label: string; ms: number }[];
	/** Total wall-clock of the one parallel invoke. */
	totalMs: number;
}

/**
 * `RunnableParallel` fans one input out to several Runnables and gathers their
 * outputs into a single object. `RunnablePassthrough` keeps the original input
 * alongside the derived values.
 *
 * This is the exact source the demo runs — each branch is tailed with a tiny
 * timing lambda so the inspector can show every branch finishing concurrently
 * (total ≈ the slowest branch, not the sum).
 */
export async function runFanoutDemo(topic: string): Promise<FanoutResult> {
	const model = await getModel({ temperature: 0.2, maxTokens: 220 });

	const t0ref = { t: 0 };
	const branchMs: Record<string, number> = {};
	// Records when a branch finishes, measured from the shared start.
	const mark = (label: string) =>
		new RunnableLambda({
			func: (out: unknown) => {
				branchMs[label] = Math.round(performance.now() - t0ref.t);
				return out;
			}
		});

	// Branch A — one-sentence summary (prompt → model → parser)
	const shortChain = ChatPromptTemplate.fromMessages([
		['human', 'In one sentence (≤ 25 words), what is {topic}?']
	])
		.pipe(model)
		.pipe(new StringOutputParser())
		.pipe(mark('short'));

	// Branch B — three bullet facts (same pipe shape, different prompt)
	const bulletChain = ChatPromptTemplate.fromMessages([
		[
			'human',
			'List exactly three short bullet facts about {topic}. Use a leading "• " and one line per bullet. No prose.'
		]
	])
		.pipe(model)
		.pipe(new StringOutputParser())
		.pipe(mark('bullets'));

	// Branch C — echo the input unchanged via RunnablePassthrough + a tiny lambda
	const fanout = RunnableParallel.from({
		short: shortChain,
		bullets: bulletChain,
		passthrough: RunnablePassthrough.assign({})
			.pipe(
				new RunnableLambda({
					func: (x: { topic: string }) => `(input echoed: ${x.topic})`
				})
			)
			.pipe(mark('passthrough'))
	});

	// One invoke → `{ short, bullets, passthrough }`
	t0ref.t = performance.now();
	const result = (await fanout.invoke({ topic })) as Omit<FanoutResult, 'bars' | 'totalMs'>;
	const totalMs = Math.round(performance.now() - t0ref.t);
	const bars = ['short', 'bullets', 'passthrough']
		.filter((l) => l in branchMs)
		.map((label) => ({ label, ms: branchMs[label] }));

	return { ...result, bars, totalMs };
}
