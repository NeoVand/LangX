import type { BaseMessage } from '@langchain/core/messages';

/**
 * Rough character-based token estimator. Good enough for visualization in
 * lesson context; production code should use the model's real tokenizer.
 */
export function approxTokens(text: string | undefined | null): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

export function messageTokens(m: BaseMessage): number {
	const c = m.content;
	let t = 4;
	if (typeof c === 'string') t += approxTokens(c);
	else t += approxTokens(JSON.stringify(c));
	return t;
}

export function totalMessageTokens(ms: BaseMessage[]): number {
	let t = 0;
	for (const m of ms) t += messageTokens(m);
	return t;
}
