/**
 * Shared types + helpers for `streamEvents` demos, so the Runnables and Streaming
 * lessons render the same EventTimeline from the same shape.
 */

/** One line in a streamEvents timeline. */
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
 * A model-stream chunk's `content` is either a plain string or an array of
 * content blocks (`{ type, text }`). Flatten either form to the text.
 */
export function chunkText(content: unknown): string | undefined {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((p) => (typeof p === 'string' ? p : ((p as { text?: string })?.text ?? '')))
			.join('');
	}
	return undefined;
}
