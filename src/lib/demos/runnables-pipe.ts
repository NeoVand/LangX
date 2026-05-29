import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

/** One stop in the pipe — label plus the value's shape at that step. */
export interface PipeStep {
	step: string;
	data: unknown;
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
): Promise<{ finalText: string; steps: PipeStep[] }> {
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
	const record = (s: PipeStep) => {
		steps.push(s);
		onStep?.(s);
	};

	// invoke #1: `{ topic }` → ChatPromptValue
	const promptValue = await prompt.invoke({ topic });
	record({
		step: 'prompt → ChatPromptValue',
		data: promptValue.toChatMessages().map((m) => ({ role: m._getType(), content: m.content }))
	});

	// invoke #2: ChatPromptValue → AIMessage
	const response = await model.invoke(promptValue);
	record({ step: 'model → AIMessage', data: { content: response.content } });

	// invoke #3: AIMessage → string
	const finalText = await parser.invoke(response);
	record({ step: 'parser → string', data: finalText });

	return { finalText, steps };
}
