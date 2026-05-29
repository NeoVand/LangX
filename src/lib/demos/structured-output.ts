import { z } from 'zod';
import { getModel } from '$lib/runtime/llm';

// ── Zod schemas: shape + field descriptions become tool parameters ──────────
export const bugReportSchema = z.object({
	title: z.string().describe('Short, action-oriented summary.'),
	severity: z.enum(['low', 'medium', 'high', 'critical']),
	component: z.string().describe('Page, module, or component that misbehaves.'),
	stepsToReproduce: z.array(z.string()).max(5).describe('Up to five short reproduction steps.'),
	expected: z.string(),
	actual: z.string()
});
export type BugReport = z.infer<typeof bugReportSchema>;

export const sentimentSchema = z.object({
	sentiment: z.enum(['positive', 'neutral', 'negative']),
	confidence: z.number().min(0).max(1).describe('Confidence in the chosen label.'),
	summary: z.string().describe('One short sentence justifying the label.')
});
export type Sentiment = z.infer<typeof sentimentSchema>;

/**
 * `withStructuredOutput` registers a Zod schema as a tool and forces the model
 * to fill it, returning a typed value instead of an AIMessage. This is the
 * exact source the demo runs.
 */
export async function extractBugReport(rawText: string): Promise<BugReport> {
	const model = await getModel({ temperature: 0, maxTokens: 400 });
	// The model must call the named tool; invoke returns a parsed object, not text.
	const extractor = model.withStructuredOutput(bugReportSchema, { name: 'extract' });
	return (await extractor.invoke([
		{
			role: 'system',
			content:
				'Extract a bug report from the user message. Be concise. Fill every field. Use at most five reproduction steps.'
		},
		{ role: 'user', content: rawText }
	])) as BugReport;
}

export async function classifySentiment(comment: string): Promise<Sentiment> {
	const model = await getModel({ temperature: 0, maxTokens: 200 });
	const classifier = model.withStructuredOutput(sentimentSchema, { name: 'classify' });
	return (await classifier.invoke([
		{
			role: 'system',
			content:
				'Classify the sentiment of the user comment. Confidence is a number between 0 and 1. Summary is one short sentence.'
		},
		{ role: 'user', content: comment }
	])) as Sentiment;
}
