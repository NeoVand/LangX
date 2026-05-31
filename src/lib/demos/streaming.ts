import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { getModel } from '$lib/runtime/llm';
import { type ChainEvent, chunkText } from './stream-events';

export type { ChainEvent };

/**
 * Demo 1's chain is a *controlled experiment*: a fixed, deterministic task at
 * temperature 0, so `invoke` and `stream` produce the EXACT same output (same
 * tokens). That makes their total times a fair, apples-to-apples comparison.
 */
async function buildCountingChain() {
	const prompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You output exactly what the user asks for — no preamble, no explanation, no extra punctuation.'
		],
		[
			'human',
			'Count from one to ten. Write the number words in lowercase, separated by ", ", and output nothing else.'
		]
	]);
	// temperature 0 → the same prompt yields the same text every run.
	const model = await getModel({ temperature: 0, maxTokens: 64 });
	return prompt.pipe(model).pipe(new StringOutputParser());
}

export interface RaceResult {
	/** The identical output both paths produce. */
	text: string;
	/** invoke(): wall-clock until the whole value is ready. */
	invokeMs: number;
	/** stream(): wall-clock until the FIRST token (time-to-first-text). */
	streamTtftMs: number;
	/** stream(): wall-clock until the last token. */
	streamTotalMs: number;
	/** number of streamed chunks. */
	chunks: number;
}

/**
 * Levels 1 & 2 raced head-to-head. The SAME deterministic chain is run both ways,
 * started on ONE shared clock and awaited together — so the two totals are a fair
 * comparison (same moment, same network), and the output is identical either way.
 *  • invoke() resolves only when the whole value is ready.
 *  • stream() paints its first token almost immediately, then fills in.
 * This is the exact source the demo runs.
 */
export async function runRace(
	onStream?: (text: string) => void,
	onInvoke?: (text: string) => void
): Promise<RaceResult> {
	const chain = await buildCountingChain();
	const t0 = performance.now();

	// Level 1 — invoke(): one value, only when complete.
	const invokeP = (async () => {
		const text = await chain.invoke({});
		onInvoke?.(text);
		return { text, ms: Math.round(performance.now() - t0) };
	})();

	// Level 2 — stream(): chunks as they arrive; record the first-token time.
	const streamP = (async () => {
		const stream = await chain.stream({});
		let buf = '';
		let ttft = 0;
		let n = 0;
		for await (const chunk of stream) {
			if (!n) ttft = Math.round(performance.now() - t0); // first paint
			n += 1;
			buf += chunk;
			onStream?.(buf);
		}
		return { text: buf, ttft, total: Math.round(performance.now() - t0), n };
	})();

	const [inv, str] = await Promise.all([invokeP, streamP]);
	return {
		text: str.text,
		invokeMs: inv.ms,
		streamTtftMs: str.ttft,
		streamTotalMs: str.total,
		chunks: str.n
	};
}

export interface RevealResult {
	/** The model's hidden first pass (the plan) — NOT part of stream() output. */
	plan: string;
	/** The final paragraph — this is all stream() would give you. */
	answer: string;
	/** How long the plan step took, in ms (from its start/end events). */
	planMs: number;
	/** How long the write step took, in ms. */
	writeMs: number;
	/** The full typed event log, for the optional raw timeline. */
	events: ChainEvent[];
}

/**
 * Level 3 — `streamEvents(..., { version: 'v2' })` shows you *inside* a chain.
 *
 * This chain has two model steps: it first PLANS (lists key facts), then WRITES a
 * paragraph from them. `chain.stream()` would yield only the final paragraph —
 * the plan is an intermediate value. `streamEvents` lets us watch BOTH steps live,
 * because every Runnable announces itself. We tell the two model calls apart by
 * their `runName` ('plan' vs 'write'). This is the exact source the demo runs.
 */
export async function runRevealDemo(
	topic: string,
	onUpdate?: (plan: string, answer: string) => void
): Promise<RevealResult> {
	const model = await getModel({ temperature: 0.3, maxTokens: 220 });

	// Step ① — plan: decide the angles worth covering (this is where planning earns
	// its keep). Named 'plan' so its streamed events are identifiable.
	const planChain = ChatPromptTemplate.fromMessages([
		[
			'human',
			'I need to explain "{topic}" in one balanced paragraph. List the 3 most important points to cover as a Markdown bullet list — each line starting with "- ", one short point per line, no bold, nothing else.'
		]
	])
		.pipe(model.withConfig({ runName: 'plan' }))
		// The parser turns the plan model's AIMessage into the text we feed step ②.
		.pipe(new StringOutputParser());

	// Step ② — write: turn those points into the final paragraph. Named 'write'.
	const writeChain = ChatPromptTemplate.fromMessages([
		[
			'system',
			'Write one plain-prose paragraph — no title, no heading, no markdown, no bullet list. Do not mention that you were given points.'
		],
		[
			'human',
			'Cover these points:\n{facts}\n\nWrite one clear, balanced paragraph (≤ 65 words) about {topic}.'
		]
	])
		.pipe(model.withConfig({ runName: 'write' }))
		.pipe(new StringOutputParser());

	// assign() runs the plan and keeps { topic, facts }; then write consumes both.
	const chain = RunnableSequence.from([
		RunnablePassthrough.assign({ facts: planChain }),
		writeChain
	]);

	const events: ChainEvent[] = [];
	let plan = '';
	let answer = '';
	const startAt: Record<string, number> = {};
	const stepMs: Record<string, number> = { plan: 0, write: 0 };
	const t0 = performance.now();
	for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
		const now = Math.round(performance.now() - t0);
		const chunk =
			ev.event === 'on_chat_model_stream' ? chunkText(ev.data?.chunk?.content) : undefined;
		// Route each streamed token to the step that produced it.
		if (chunk) {
			if (ev.name === 'plan') plan += chunk;
			else if (ev.name === 'write') answer += chunk;
			onUpdate?.(plan, answer);
		}
		// Time each step from its model start/end events — exactly what events give you.
		if (ev.event === 'on_chat_model_start' && ev.name in stepMs) startAt[ev.name] = now;
		if (ev.event === 'on_chat_model_end' && ev.name in stepMs)
			stepMs[ev.name] = now - (startAt[ev.name] ?? now);
		events.push({ event: ev.event, name: ev.name, chunk, ms: now });
	}
	return { plan, answer, planMs: stepMs.plan, writeMs: stepMs.write, events };
}
