import type { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';

export interface VectorEntry {
	id: string;
	doc: Document;
	embedding: number[];
}

export class InMemoryVectorStore {
	entries: VectorEntry[] = [];

	constructor(public embeddings: Embeddings) {}

	async addDocuments(docs: Document[]) {
		const vectors = await this.embeddings.embedDocuments(docs.map((d) => d.pageContent));
		for (let i = 0; i < docs.length; i++) {
			this.entries.push({
				id: `${this.entries.length}-${Date.now()}`,
				doc: docs[i],
				embedding: vectors[i]
			});
		}
	}

	async similaritySearch(query: string, k = 4): Promise<{ doc: Document; score: number }[]> {
		const qvec = await this.embeddings.embedQuery(query);
		const scored = this.entries.map((e) => ({
			doc: e.doc,
			score: cosine(qvec, e.embedding)
		}));
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, k);
	}

	clear() {
		this.entries = [];
	}
}

export function cosine(a: number[], b: number[]) {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom === 0 ? 0 : dot / denom;
}
