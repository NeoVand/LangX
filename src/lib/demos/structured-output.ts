import { z } from 'zod';
import type { AIMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';

export interface Usage {
	input?: number;
	output?: number;
	total?: number;
}

// ── Demo 1 schema: turn a casual message into a typed calendar event ─────────
// Field .describe() text becomes part of the tool the model is asked to fill.
export const eventSchema = z.object({
	title: z.string().describe('Short title for the event.'),
	date: z.string().describe('ISO date, YYYY-MM-DD.'),
	startTime: z.string().describe('24-hour start time, e.g. 14:30.'),
	durationMinutes: z.number().describe('Length in minutes.'),
	location: z.string().describe('Where it happens.'),
	attendees: z.array(z.string()).describe('Names of the people involved.')
});
export type EventInfo = z.infer<typeof eventSchema>;

/** A plain description of the schema for the SchemaForm inspector (mirrors the Zod above). */
export const eventFields = [
	{ key: 'title', type: 'string' },
	{ key: 'date', type: 'string', note: 'ISO date' },
	{ key: 'startTime', type: 'string', note: '24-hour' },
	{ key: 'durationMinutes', type: 'number', note: 'minutes' },
	{ key: 'location', type: 'string' },
	{ key: 'attendees', type: 'string[]', note: 'names' }
];

// ── Demo 2 schema: classify a short product review ───────────────────────────
export const reviewSchema = z.object({
	sentiment: z.enum(['positive', 'neutral', 'negative']),
	recommend: z.boolean().describe('Would the writer recommend it?'),
	reason: z.string().describe('One short sentence explaining the call.')
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewFields = [
	{ key: 'sentiment', type: 'enum', note: 'positive · neutral · negative' },
	{ key: 'recommend', type: 'boolean' },
	{ key: 'reason', type: 'string' }
];

/**
 * `withStructuredOutput(schema, { includeRaw: true })` registers the Zod schema as
 * a tool, forces the model to fill it, and returns BOTH the parsed typed object and
 * the raw AIMessage — so we can show the tool call + token usage behind the result.
 * This is the exact source the demo runs.
 */
export async function extractEvent(
	text: string
): Promise<{ value: EventInfo; usage?: Usage; tool?: { name: string; args: unknown } }> {
	const model = await getModel({ temperature: 0, maxTokens: 400 });
	const extractor = model.withStructuredOutput(eventSchema, {
		name: 'save_event',
		includeRaw: true
	});
	const res = (await extractor.invoke([
		{
			role: 'system',
			content:
				'Extract the event from the message. Use an ISO date (YYYY-MM-DD) and a 24-hour startTime. If a detail is missing, infer a sensible value.'
		},
		{ role: 'user', content: text }
	])) as { raw: AIMessage; parsed: EventInfo };

	const raw = res.raw;
	const u = raw?.usage_metadata;
	const tc = raw?.tool_calls?.[0];
	return {
		value: res.parsed,
		usage: u ? { input: u.input_tokens, output: u.output_tokens, total: u.total_tokens } : undefined,
		tool: tc ? { name: tc.name, args: tc.args } : undefined
	};
}

/**
 * The contrast that motivates structured output. We classify the SAME review two ways:
 *  1. The naive way — ask for JSON in the prompt. You get back a *string* you must
 *     strip of code fences, JSON.parse, and pray the fields/types are right.
 *  2. withStructuredOutput — you get a validated, typed object. No parsing, no praying.
 * This is the exact source the demo runs.
 */
export async function compareExtraction(text: string): Promise<{
	plain: { raw: string; parsed: Review | null; error?: string };
	structured: Review;
}> {
	const model = await getModel({ temperature: 0, maxTokens: 250 });

	// 1) Just ask for JSON (what most people try first).
	const plainMsg = await model.invoke([
		{
			role: 'system',
			content:
				'Reply with a JSON object describing the review: its sentiment, whether the writer recommends the product, and a one-line reason.'
		},
		{ role: 'user', content: text }
	]);
	const rawText =
		typeof plainMsg.content === 'string' ? plainMsg.content : JSON.stringify(plainMsg.content);

	let parsed: Review | null = null;
	let error: string | undefined;
	try {
		// The defensive cleanup you inevitably end up writing by hand.
		const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
		parsed = JSON.parse(cleaned) as Review;
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}

	// 2) Force the schema — get a validated, typed object.
	const classifier = model.withStructuredOutput(reviewSchema, { name: 'classify_review' });
	const structured = (await classifier.invoke([
		{ role: 'system', content: 'Classify the product review.' },
		{ role: 'user', content: text }
	])) as Review;

	return { plain: { raw: rawText, parsed, error }, structured };
}
