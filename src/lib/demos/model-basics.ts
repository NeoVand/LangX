import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel, activeModelInfo } from '$lib/runtime/llm';

/** Flatten an AIMessage's content (string, or provider content-blocks) to text. */
function contentToText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) =>
				typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''
			)
			.join('');
	}
	return String(content ?? '');
}

export interface RawResult {
	/** The exact list of messages handed to the model. */
	input: { role: string; content: string }[];
	/** The assistant's reply text (AIMessage.content). */
	content: string;
	/** Token accounting the provider returned, if any. */
	usage?: { input?: number; output?: number; total?: number };
	/** Which model actually answered. */
	model: string;
	provider: string;
	finishReason?: string;
}

/**
 * The rawest call there is: hand the model a list of messages, get back one
 * assistant message. No chain, no parser — just `model.invoke(messages)`. The
 * return value is an AIMessage object; we surface its parts so you can see what
 * a chat model actually maps: messages in → one message (plus metadata) out.
 */
export async function rawCall(userText: string): Promise<RawResult> {
	const model = await getModel({ temperature: 0.7, maxTokens: 200 });
	const info = activeModelInfo();

	const input = [
		{ role: 'system', content: 'You are a concise, friendly assistant. Answer in one sentence.' },
		{ role: 'user', content: userText }
	];

	const res = await model.invoke(input);

	const usage = res.usage_metadata;
	const meta = (res.response_metadata ?? {}) as Record<string, unknown>;
	return {
		input,
		content: contentToText(res.content),
		usage: usage
			? { input: usage.input_tokens, output: usage.output_tokens, total: usage.total_tokens }
			: undefined,
		model: info.id,
		provider: info.provider,
		finishReason: (meta.finish_reason ?? meta.finishReason ?? meta.stop_reason) as string | undefined
	};
}

export interface ChainResult {
	output: string;
}

/**
 * The same model, now used the LangChain way: as one Runnable in a small chain,
 * `prompt | model | parser`. The prompt template fills in {topic}, the model
 * answers, and StringOutputParser pulls the plain string out of the AIMessage.
 * Streamed so you can watch the Runnable produce tokens — the bridge to the rest
 * of Level 1.
 */
export async function chainCall(
	topic: string,
	onToken?: (buf: string) => void
): Promise<ChainResult> {
	const model = await getModel({ temperature: 0.6, maxTokens: 160 });

	const prompt = ChatPromptTemplate.fromMessages([
		[
			'system',
			'You are a museum docent with a gift for vivid, plain explanations. Explain the idea in two short sentences a curious beginner would enjoy.'
		],
		['human', 'Explain: {topic}']
	]);

	const chain = prompt.pipe(model).pipe(new StringOutputParser());

	let buf = '';
	for await (const chunk of await chain.stream({ topic })) {
		buf += chunk;
		onToken?.(buf);
	}
	return { output: buf };
}
