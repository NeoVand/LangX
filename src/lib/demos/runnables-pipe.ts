import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableLambda } from '@langchain/core/runnables';
import { getModel } from '$lib/runtime/llm';

/** One stop in the pipe — label plus the value's shape at that step. */
export interface PipeStep {
	step: string;
	data: unknown;
	/** Wall-clock time this step took, in ms. */
	ms?: number;
}

/**
 * The smallest LCEL chain: prompt → model → parser.
 *
 * We invoke each Runnable by hand (instead of `prompt.pipe(model).pipe(parser)`)
 * so the demo can show the value's shape changing at every stop.
 * This is the exact source the demo runs.
 */
export async function runPipeDemo(
	topic: string,
	onStep?: (s: PipeStep) => void
): Promise<{
	finalText: string;
	steps: PipeStep[];
	usage?: { input?: number; output?: number; total?: number };
	totalMs: number;
}> {
	// ── Runnable 1: prompt template ───────────────────────────────────────
	// Accepts `{ topic }`, returns a ChatPromptValue (messages ready for the model).
	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a concise tutor. Answer in 1 short paragraph (≤ 60 words).'],
		['human', "Explain {topic} like the reader is a senior engineer who hasn't met it."]
	]);

	// ── Runnable 2: chat model ────────────────────────────────────────────
	const model = await getModel({ temperature: 0.2, maxTokens: 220 });

	// ── Runnable 3: output parser ─────────────────────────────────────────
	// Strips the AIMessage wrapper and returns a plain string.
	const parser = new StringOutputParser();

	const steps: PipeStep[] = [];
	const t0 = performance.now();
	let last = t0;
	const record = (step: string, data: unknown) => {
		const now = performance.now();
		const s: PipeStep = { step, data, ms: Math.round(now - last) };
		last = now;
		steps.push(s);
		onStep?.(s);
	};

	// invoke #1: `{ topic }` → ChatPromptValue (composition is ~free)
	const promptValue = await prompt.invoke({ topic });
	record(
		'prompt → ChatPromptValue',
		promptValue.toChatMessages().map((m) => ({ role: m._getType(), content: m.content }))
	);

	// invoke #2: ChatPromptValue → AIMessage (this is where the time goes)
	const response = await model.invoke(promptValue);
	record('model → AIMessage', { content: response.content });

	// invoke #3: AIMessage → string
	const finalText = await parser.invoke(response);
	record('parser → string', finalText);

	const u = response.usage_metadata;
	const usage = u
		? { input: u.input_tokens, output: u.output_tokens, total: u.total_tokens }
		: undefined;
	const totalMs = Math.round(performance.now() - t0);
	// Summary row so the inspector shows cost + where the time actually went.
	steps.push({ step: 'summary', data: { totalMs, tokens: usage } });

	return { finalText, steps, usage, totalMs };
}

/**
 * `.batch()` runs the SAME chain over many inputs concurrently — no loop. Because
 * the composed chain is itself a Runnable, batching comes for free.
 */
export interface BatchRow {
	topic: string;
	text: string;
	/** Wall-clock from the shared start until this item finished. */
	ms: number;
}

export async function runBatchDemo(
	topics: string[]
): Promise<{ rows: BatchRow[]; totalMs: number }> {
	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a concise tutor. Answer in ONE sentence.'],
		['human', 'Explain {topic} in one sentence.']
	]);
	const model = await getModel({ temperature: 0.2, maxTokens: 90 });
	const parser = new StringOutputParser();

	// LCEL composition: one chain, `{ topic }` → string.
	const chain = prompt.pipe(model).pipe(parser);

	// Wrap the chain so each item also reports when it finished, measured from
	// the shared start — `.batch()` runs them concurrently, so totals ≈ slowest.
	const t0 = performance.now();
	const item = RunnableLambda.from(async ({ topic }: { topic: string }) => {
		const text = await chain.invoke({ topic });
		return { topic, text, ms: Math.round(performance.now() - t0) };
	});

	// Same `.batch()` call — many inputs, run in parallel.
	const rows = await item.batch(topics.map((topic) => ({ topic })));
	const totalMs = Math.round(performance.now() - t0);
	return { rows, totalMs };
}

/** One line in the streamEvents timeline. */
export interface ChainEvent {
	/** e.g. on_chain_start, on_chat_model_stream, on_parser_end */
	event: string;
	/** Which Runnable fired it (RunnableSequence, ChatAnthropic, …). */
	name: string;
	/** For *_stream events, the token text that arrived. */
	chunk?: string;
	/** Wall-clock from the start of the run, in ms. */
	ms: number;
}

/**
 * `.streamEvents()` exposes the chain's whole lifecycle as a flat event stream —
 * every Runnable announces start, each token, and end. This is the same chain as
 * Demo 1; here we surface the events instead of the final string so you can watch
 * prompt → model (token by token) → parser unfold.
 */
export async function runEventsDemo(
	topic: string,
	onEvent?: (e: ChainEvent) => void
): Promise<ChainEvent[]> {
	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a concise tutor. Answer in 1 short paragraph (≤ 40 words).'],
		['human', 'Explain {topic} simply.']
	]);
	const model = await getModel({ temperature: 0.2, maxTokens: 160 });
	const parser = new StringOutputParser();
	const chain = prompt.pipe(model).pipe(parser);

	const events: ChainEvent[] = [];
	const t0 = performance.now();
	// `version: 'v2'` is the current event schema in LangChain v1.
	for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
		// Pull the token text out of model-stream events; ignore the rest.
		let chunk: string | undefined;
		if (ev.event === 'on_chat_model_stream') {
			const c = ev.data?.chunk?.content;
			chunk = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('') : undefined;
		}
		const e: ChainEvent = {
			event: ev.event,
			name: ev.name,
			chunk,
			ms: Math.round(performance.now() - t0)
		};
		events.push(e);
		onEvent?.(e);
	}
	return events;
}
