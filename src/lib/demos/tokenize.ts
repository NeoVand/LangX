/**
 * Tiny client-only GPT-2 tokenizer helper for the Model lesson's tokenization
 * demo. Uses the SAME tokenizer the Transformer Workshop runs (Xenova/gpt2), so
 * the tokens shown here match what the transformer windows show. Loaded on first
 * use via dynamic import (transformers.js is browser-only and ~2 MB), then cached.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizerP: Promise<any> | null = null;

export function loadTokenizer() {
	if (!tokenizerP) {
		tokenizerP = import('@huggingface/transformers').then((m) =>
			m.AutoTokenizer.from_pretrained('Xenova/gpt2')
		);
	}
	return tokenizerP;
}

export interface Tok {
	id: number;
	/** The decoded token text (a leading space is part of the token in GPT-2). */
	text: string;
}

export async function tokenize(text: string): Promise<Tok[]> {
	const tok = await loadTokenizer();
	const ids: number[] = tok.encode(text);
	return ids.map((id: number) => ({ id, text: tok.decode([id]) as string }));
}
