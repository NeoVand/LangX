/**
 * Client-only word-embedding helper for the Model lesson. Reuses the app's local
 * MiniLM embeddings (Xenova/all-MiniLM-L6-v2, 384-dim, bundled, no API key) to
 * embed single words, then measures how close two words' vectors are by cosine
 * similarity — the same idea the Agentic-RAG lesson uses for retrieval, scaled
 * down to one word at a time. Dynamic import keeps it out of the SSR bundle.
 */

export async function embedWords(words: string[]): Promise<number[][]> {
	const { makeEmbeddings } = await import('$lib/runtime/rag/registry');
	const emb = await makeEmbeddings('local');
	return emb.embedDocuments(words);
}

/** Cosine similarity. MiniLM vectors are L2-normalised, so this ≈ a dot product. */
export function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Full pairwise cosine matrix for a list of vectors. */
export function similarityMatrix(vecs: number[][]): number[][] {
	return vecs.map((a) => vecs.map((b) => cosine(a, b)));
}
