import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

/**
 * `chain.stream()` yields chunks of the final output as they are produced.
 * `onUpdate` fires after every chunk so a UI can render the text growing live.
 * This is the exact source the demo runs.
 */
export async function runTokenStream(
	topic: string,
	onUpdate?: (tokens: string[], text: string) => void
): Promise<{ final: string; tokens: string[] }> {
	// ── LCEL chain: prompt → model → parser ─────────────────────────────────
	const prompt = ChatPromptTemplate.fromMessages([
		['system', 'You are a concise tutor. Reply in 2 short sentences (≤ 60 words).'],
		['human', 'Explain {topic}.']
	]);
	const model = await getModel({ temperature: 0.2, maxTokens: 220 });
	const chain = prompt.pipe(model).pipe(new StringOutputParser());

	// stream() yields incremental parser output (string chunks), not raw AIMessages.
	const stream = await chain.stream({ topic });
	const tokens: string[] = [];
	let buf = '';
	for await (const chunk of stream) {
		tokens.push(chunk);
		buf += chunk;
		onUpdate?.(tokens.slice(), buf);
	}
	return { final: buf, tokens };
}

export interface StreamEvent {
	event: string;
	name: string;
	data?: string;
}

/**
 * `chain.streamEvents(..., { version: 'v2' })` emits one typed event per
 * Runnable boundary (chain/model/parser start, stream, end). `withConfig({ runName })`
 * gives each step a stable, human-readable name. This is the exact source the demo runs.
 */
export async function runEventStream(
	topic: string,
	onEvent?: (events: StreamEvent[]) => void
): Promise<{ events: StreamEvent[] }> {
	// ── Named Runnables for traceable streamEvents ──────────────────────────
	const prompt = ChatPromptTemplate.fromMessages([
		['human', 'In two short bullets, list two facts about {topic}.']
	]).withConfig({ runName: 'prompt' });
	const baseModel = await getModel({ temperature: 0, maxTokens: 180 });
	const model = baseModel.withConfig({ runName: 'model' });
	const parser = new StringOutputParser().withConfig({ runName: 'parser' });
	const chain = prompt.pipe(model).pipe(parser);

	// ── streamEvents v2: observability across the whole Runnable tree ───────
	const events: StreamEvent[] = [];
	for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
		// Filter to the lifecycle events the demo UI cares about.
		if (
			ev.event === 'on_chain_start' ||
			ev.event === 'on_chain_end' ||
			ev.event === 'on_chat_model_start' ||
			ev.event === 'on_chat_model_end' ||
			ev.event === 'on_chat_model_stream' ||
			ev.event === 'on_parser_end'
		) {
			const dataPreview =
				ev.event === 'on_chat_model_stream'
					? (ev.data?.chunk as { content?: unknown })?.content?.toString().slice(0, 30)
					: undefined;
			events.push({
				event: ev.event.replace('on_', ''),
				name: ev.name,
				data: dataPreview
			});
			onEvent?.(events.slice());
		}
	}
	return { events };
}
