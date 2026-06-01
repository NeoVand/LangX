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
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { chunkDocuments, buildStore } from './rag-pipeline';
import type { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';
import type { OnStep } from './types';

// ── The corpus: documents the user uploaded, chunked + embedded in the browser ─
let store: InMemoryVectorStore | null = null;
let corpus: { source: string; chunks: number }[] = [];

export interface CorpusDoc {
	source: string;
	text: string;
}

/** Chunk, embed, and index uploaded documents. Resets the citation registry. */
export async function setCorpus(docs: CorpusDoc[]): Promise<{ documents: number; chunks: number }> {
	const chunks = await chunkDocuments(docs);
	store = await buildStore(chunks, 'local');
	corpus = docs.map((d) => ({
		source: d.source,
		chunks: chunks.filter((c) => c.source === d.source).length
	}));
	resetCitations();
	return { documents: docs.length, chunks: chunks.length };
}

export function corpusSummary(): { source: string; chunks: number }[] {
	return corpus;
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

// ── Tools the agent can call ────────────────────────────────────────────────
export const searchDocuments = tool(
	async ({ query, k }) => {
		if (!store) {
			return JSON.stringify({ error: 'No documents are loaded yet. Ask the user to upload some.' });
		}
		const hits = await store.similaritySearch(query, k ?? 4);
		const results = hits.map((h) => {
			const source = String(h.doc.metadata?.source ?? 'document');
			const index = Number(h.doc.metadata?.index ?? 0);
			const id = cite(source, index, h.doc.pageContent, h.score);
			return { id, source, score: Number(h.score.toFixed(3)), snippet: h.doc.pageContent };
		});
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
2. If the top results are weak or off-topic, REWRITE the query and search again — try synonyms, simpler terms, or split a multi-part question into separate searches. Make a few attempts before giving up.
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
