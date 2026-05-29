import { Document } from '@langchain/core/documents';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';
import { makeEmbeddings, type EmbeddingsProviderId } from '$lib/runtime/rag/registry';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

export interface Chunk {
	source: string;
	text: string;
	index: number;
}

export interface RetrievedChunk extends Chunk {
	/** Raw cosine similarity in [-1, 1]. */
	score: number;
}

/**
 * Splits raw source documents into overlapping chunks — the unit RAG actually
 * indexes. Chunking is where most retrieval quality is won or lost.
 */
export async function chunkDocuments(
	docs: { source: string; text: string }[],
	chunkSize = 280,
	chunkOverlap = 40
): Promise<Chunk[]> {
	// RecursiveCharacterTextSplitter tries paragraph → sentence → word boundaries.
	const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
	const chunks: Chunk[] = [];
	for (const d of docs) {
		const parts = await splitter.splitText(d.text);
		parts.forEach((text, i) => chunks.push({ source: d.source, text, index: i }));
	}
	return chunks;
}

export async function buildStore(
	chunks: Chunk[],
	provider: EmbeddingsProviderId
): Promise<InMemoryVectorStore> {
	// ── Indexing: embed chunks and store as Documents ───────────────────────
	const embeddings = await makeEmbeddings(provider);
	const store = new InMemoryVectorStore(embeddings);
	await store.addDocuments(
		chunks.map(
			(c) => new Document({ pageContent: c.text, metadata: { source: c.source, index: c.index } })
		)
	);
	return store;
}

/**
 * The full RAG read path: embed the query, retrieve the nearest chunks, then
 * ask the model to answer using ONLY those chunks (with citations). Emits a step
 * per stage so the Steps tab tells the whole story.
 */
export async function answerWithRag(
	store: InMemoryVectorStore,
	question: string,
	k: number,
	onStep: OnStep
): Promise<{ hits: RetrievedChunk[]; answer: string }> {
	// ── Retrieval: similarity search over embedded chunks ───────────────────
	onStep({ label: 'Embed query', kind: 'state', detail: question });

	const rows = await store.similaritySearch(question, k);
	const hits: RetrievedChunk[] = rows.map((r) => ({
		source: String(r.doc.metadata?.source ?? ''),
		text: r.doc.pageContent,
		index: Number(r.doc.metadata?.index ?? 0),
		score: r.score
	}));
	onStep({
		label: `Retrieved top ${hits.length} chunks`,
		kind: 'tool',
		detail: hits.map((h) => `${h.source} (${(h.score * 100).toFixed(0)}%)`).join(', '),
		payload: hits
	});

	// Pack retrieved passages into a numbered context block for grounded generation.
	const context = hits
		.map((h, i) => `[${i + 1}] (${h.source}) ${h.text}`)
		.join('\n\n');

	// ── Generation: answer constrained to retrieved context ─────────────────
	const model = await getModel({ temperature: 0, maxTokens: 320 });
	const ai = await model.invoke([
		new SystemMessage(
			'Answer the question using ONLY the numbered context passages. Cite the passages you use like [1], [2]. If the context does not contain the answer, say so plainly.'
		),
		new HumanMessage(`Context:\n${context}\n\nQuestion: ${question}`)
	]);
	const answer = displayContent(ai.content);
	onStep({ label: 'Model · grounded answer', kind: 'model', detail: answer.slice(0, 80), payload: answer });

	return { hits, answer };
}
