/**
 * Agentic RAG — the Level 1 capstone, built from nothing but `createAgent`.
 *
 * Instead of a fixed "retrieve → stuff → answer" pipeline, the agent is given a
 * SEARCH TOOL and decides for itself when and how to use it: it searches, judges
 * the results, rewrites weak queries and searches again, asks the user to clarify
 * when a question is ambiguous, and cites every claim back to the passage it came
 * from. Memory (a checkpointer) lets follow-up questions build on the conversation.
 *
 * Everything here is plain LangChain v1: `createAgent` + `tool()` + a custom
 * `createMiddleware` + a checkpointer. No raw LangGraph, no Deep Agents.
 */
import { createAgent, createMiddleware } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Embeddings } from '@langchain/core/embeddings';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { chunkDocuments, buildStore } from './rag-pipeline';
import { cosine, type InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';
import { makeEmbeddings, type EmbeddingsProviderId } from '$lib/runtime/rag/registry';
import { fitPca2, project, type Pca2 } from '$lib/runtime/rag/pca';
import type { OnStep } from './types';

// ── The corpus: documents the user uploaded, chunked + embedded in the browser ─
let store: InMemoryVectorStore | null = null;
let corpus: { source: string; chunks: number }[] = [];

export interface CorpusDoc {
	source: string;
	text: string;
}

/**
 * Normalize text for display + grounding: fold ligatures/compatibility forms
 * (NFKC turns "ﬁ" → "fi", full-width → half-width), drop control/zero-width/BOM
 * characters that leak in from PDFs, and collapse runs of spaces. Keeps real
 * Unicode (accents, em-dashes, °, curly quotes) intact.
 */
function clean(text: string): string {
	return text
		.normalize('NFKC')
		// Strip control chars (keep tab/newline), DEL + C1 block, zero-width chars and BOM.
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

// 2-D map of every chunk embedding (PCA), so the demo can show retrieval as geometry.
export interface ChunkPoint {
	key: string; // `${source}#${index}`
	source: string;
	index: number;
	text: string;
	x: number;
	y: number;
}
let pca: Pca2 | null = null;
let chunkPoints: ChunkPoint[] = [];
let corpusProvider: EmbeddingsProviderId = 'local';

export function corpusEmbeddingProvider(): EmbeddingsProviderId {
	return corpusProvider;
}

/**
 * Chunk, embed, and index the uploaded documents with the chosen embedding
 * provider. Resets the citation registry + the embedding map.
 */
export async function setCorpus(
	docs: CorpusDoc[],
	provider: EmbeddingsProviderId = 'local'
): Promise<{ documents: number; chunks: number }> {
	corpusProvider = provider;
	const chunks = await chunkDocuments(docs);
	store = await buildStore(chunks, provider);
	// Count from the indexed entries (the same source the embedding map plots) so
	// the chip's chunk count always matches the dots on the map.
	corpus = docs.map((d) => ({
		source: d.source,
		chunks: store!.entries.filter((e) => e.doc.metadata?.source === d.source).length
	}));
	// Fit a 2-D projection of the chunk embeddings for the embedding map.
	if (store.entries.length) {
		pca = fitPca2(store.entries.map((e) => e.embedding));
		chunkPoints = store.entries.map((e) => {
			const source = String(e.doc.metadata?.source ?? 'document');
			const index = Number(e.doc.metadata?.index ?? 0);
			const [x, y] = project(e.embedding, pca!);
			return { key: `${source}#${index}`, source, index, text: clean(e.doc.pageContent), x, y };
		});
	} else {
		pca = null;
		chunkPoints = [];
	}
	resetCitations();
	return { documents: docs.length, chunks: chunks.length };
}

export function corpusSummary(): { source: string; chunks: number }[] {
	return corpus;
}

export function getChunkPoints(): ChunkPoint[] {
	return chunkPoints;
}

// ── Embedding utilities for the in-book explorer (real models, in-browser) ────
const embCache = new Map<EmbeddingsProviderId, Embeddings>();
export async function embedText(
	text: string,
	provider: EmbeddingsProviderId = 'local'
): Promise<number[]> {
	let emb = embCache.get(provider);
	if (!emb) {
		emb = await makeEmbeddings(provider);
		embCache.set(provider, emb);
	}
	return emb.embedQuery(text);
}
export function cosineSimilarity(a: number[], b: number[]): number {
	return cosine(a, b);
}

// ── Citations: stable [S#] ids the agent can reference and the UI can resolve ──
export interface Citation {
	id: string;
	source: string;
	index: number;
	snippet: string;
	score: number;
}
let citById = new Map<string, Citation>();
let idByKey = new Map<string, string>();
let citSeq = 0;

function resetCitations() {
	citById = new Map();
	idByKey = new Map();
	citSeq = 0;
}

/** Give a retrieved chunk a stable citation id (reused if seen again this chat). */
function cite(source: string, index: number, snippet: string, score: number): string {
	const key = `${source}#${index}`;
	const existing = idByKey.get(key);
	if (existing) {
		const c = citById.get(existing)!;
		if (score > c.score) c.score = score; // keep the best score seen
		return existing;
	}
	const id = `S${++citSeq}`;
	idByKey.set(key, id);
	citById.set(id, { id, source, index, snippet, score });
	return id;
}

export function getCitations(): Citation[] {
	return [...citById.values()];
}

// Each query the agent runs leaves a trace on the embedding map: where the query
// landed (in PCA space) and which chunks it pulled. Reset at the start of a turn.
export interface SearchHit {
	key: string;
	score: number;
}
export interface SearchEvent {
	query: string;
	x: number;
	y: number;
	hits: SearchHit[];
}
let searchEvents: SearchEvent[] = [];
export function getSearchEvents(): SearchEvent[] {
	return searchEvents;
}

// ── Tools the agent can call ────────────────────────────────────────────────
export const searchDocuments = tool(
	async ({ query, k }) => {
		if (!store) return 'No documents are loaded yet. Ask the user to upload some.';
		// Embed the query ONCE, then score every chunk by cosine — we reuse the
		// query vector both to rank and to plot the query on the embedding map.
		const qvec = await store.embeddings.embedQuery(query);
		const scored = store.entries
			.map((e) => ({ e, score: cosine(qvec, e.embedding) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, k ?? 4);
		const hits: SearchHit[] = [];
		const results = scored.map(({ e, score }) => {
			const source = String(e.doc.metadata?.source ?? 'document');
			const index = Number(e.doc.metadata?.index ?? 0);
			const snippet = clean(e.doc.pageContent);
			hits.push({ key: `${source}#${index}`, score });
			const id = cite(source, index, snippet, score);
			return { id, source, score: Number(score.toFixed(3)), snippet };
		});
		if (pca) {
			const [x, y] = project(qvec, pca);
			searchEvents.push({ query, x, y, hits });
		}
		return JSON.stringify({ query, results });
	},
	{
		name: 'search_documents',
		description:
			'Search the uploaded documents for passages relevant to a query. Returns ranked snippets, ' +
			'each with a citation id (e.g. "S1") and a similarity score in [0,1]. If the results look ' +
			'weak or off-topic, call this again with a reworded query.',
		schema: z.object({
			query: z.string().describe('A focused natural-language search query.'),
			k: z.number().optional().describe('How many passages to return (default 4).')
		})
	}
);

export const listDocuments = tool(
	async () => JSON.stringify({ documents: corpus }),
	{
		name: 'list_documents',
		description: 'List the documents currently available to search, with their chunk counts.',
		schema: z.object({})
	}
);

export const ragTools = [searchDocuments, listDocuments];

/** Tool catalog for the demo's toolbox. */
export const ragToolSpecs = [
	{
		name: 'search_documents',
		description: 'Semantic search over the uploaded documents. Returns ranked, cited passages.',
		params: ['query', 'k?'],
		exportName: 'searchDocuments'
	},
	{
		name: 'list_documents',
		description: 'List the documents available to search, with chunk counts.',
		params: [],
		exportName: 'listDocuments'
	}
];

// ── A small custom middleware (createMiddleware): trace each retrieval ─────────
// Plain wrapToolCall — no interrupt — so it runs fine in the browser. It just
// observes tool calls; this is the same seam built-in middleware uses.
let lastTurnSearches = 0;
export const retrievalTracer = createMiddleware({
	name: 'retrieval-tracer',
	wrapToolCall: (request, handler) => {
		if (request.toolCall?.name === 'search_documents') lastTurnSearches += 1;
		return handler(request);
	}
});

export const DEFAULT_SYSTEM_PROMPT = `You are a meticulous research assistant. Answer ONLY from the user's uploaded documents.

How to work:
1. Before answering, call search_documents with a focused query, then read the passages and their scores.
2. Search each distinct part of a question with its OWN query, and if the best result looks weak or off-topic, REWRITE the query (synonyms, simpler terms) and search again. Searching two or three times is normal and good.
3. If the question is ambiguous, or the documents truly don't cover it, do NOT guess — reply with one short clarifying question, or say plainly that the documents don't cover it.
4. Cite every claim inline using the passage ids, like [S1] or [S2][S3]. Only cite passages you actually used.
5. Be warm, clear, and concise. Never invent sources or facts that aren't in the passages.

Use list_documents if you need to see what's available.`;

// ── Chat session: one agent + thread, multi-turn via the checkpointer ─────────
type RagAgent = ReturnType<typeof createAgent>;
let session: { agent: RagAgent; threadId: string } | null = null;
let threadSeq = 0;

/** Begin a fresh conversation (new thread + cleared citations). */
export async function newChat(systemPrompt: string): Promise<void> {
	const model = await getModel({ temperature: 0, maxTokens: 1024 });
	const agent = createAgent({
		model,
		tools: ragTools,
		systemPrompt: systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
		middleware: [retrievalTracer],
		// A checkpointer turns the agent into a multi-turn chat: each turn continues
		// the same thread, so follow-ups and clarifications build on what came before.
		checkpointer: new MemorySaver()
	});
	session = { agent, threadId: `rag-thread-${++threadSeq}` };
	resetCitations();
}

export function chatReady(): boolean {
	return session !== null && store !== null;
}

/**
 * Run one turn. Streams the agent node-by-node (for the live graph) and returns
 * the NEW messages produced this turn (tool calls, tool results, final answer).
 */
export async function sendTurn(
	text: string,
	onMessages: (messages: BaseMessage[]) => void,
	onStep?: OnStep
): Promise<{ messages: BaseMessage[] }> {
	if (!session) throw new Error('Start a chat first — upload a document.');
	const { agent, threadId } = session;
	lastTurnSearches = 0;
	searchEvents = []; // fresh trace for this turn's embedding map

	const turn: BaseMessage[] = [];
	const stream = await agent.stream(
		{ messages: [new HumanMessage(text)] },
		{ configurable: { thread_id: threadId }, streamMode: 'updates' }
	);
	for await (const chunk of stream) {
		for (const [, update] of Object.entries(
			chunk as Record<string, { messages?: BaseMessage[] }>
		)) {
			for (const m of update?.messages ?? []) {
				turn.push(m);
				onMessages([...turn]);
				if (m instanceof ToolMessage) {
					onStep?.({
						label: `retrieve · ${m.name}`,
						kind: 'tool',
						detail: displayContent(m.content).slice(0, 80),
						payload: displayContent(m.content)
					});
				} else if (m instanceof AIMessage && m.tool_calls?.length) {
					onStep?.({
						label: 'model · plan search',
						kind: 'model',
						detail: m.tool_calls.map((t) => t.name).join(', '),
						payload: m.tool_calls
					});
				}
			}
		}
	}
	return { messages: turn };
}
