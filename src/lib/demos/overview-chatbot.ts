/**
 * The "whole picture" demo: a chatbot wired by hand from raw LangChain parts —
 * conversation memory, document retrieval (RAG), and a multimodal (image) turn —
 * with no createAgent hiding the moving pieces. Each function below is one part,
 * and the *Verbose helpers expose exactly what gets sent to the model so the
 * lesson's inspector can show everything under the hood.
 */
import {
	HumanMessage,
	AIMessage,
	AIMessageChunk,
	SystemMessage,
	type BaseMessage
} from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { chunkDocuments, buildStore, type Chunk } from './rag-pipeline';
import { makeEmbeddings } from '$lib/runtime/rag/registry';
import type { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';

export interface RetrievedBit {
	source: string;
	text: string;
	/** Raw cosine similarity in [-1, 1]. */
	score: number;
}

export const SYSTEM_PROMPT =
	'You are a friendly, concise assistant. Use the conversation so far, any document excerpts provided, and any attached image to answer. If something is not in the documents or image, you may answer from general knowledge but say so briefly.';

/** Part 1 · Index uploaded documents into an in-browser vector store (local MiniLM). */
export async function indexDocuments(
	docs: { source: string; text: string }[]
): Promise<{ store: InMemoryVectorStore; chunkCount: number; chunks: Chunk[] }> {
	const chunks = await chunkDocuments(docs);
	const store = await buildStore(chunks, 'local');
	return { store, chunkCount: chunks.length, chunks };
}

/** Part 2 · Retrieval — embed the question, return the nearest chunks. */
export async function retrieve(
	store: InMemoryVectorStore,
	question: string,
	k = 3
): Promise<RetrievedBit[]> {
	const rows = await store.similaritySearch(question, k);
	return rows.map((r) => ({
		source: String(r.doc.metadata?.source ?? 'document'),
		text: r.doc.pageContent,
		score: r.score
	}));
}

/** Embed arbitrary text with the same local model, for the embedding visualization. */
let _localEmbeddings: Awaited<ReturnType<typeof makeEmbeddings>> | null = null;
export async function embedQueryLocal(text: string): Promise<number[]> {
	if (!_localEmbeddings) _localEmbeddings = await makeEmbeddings('local');
	return _localEmbeddings.embedQuery(text);
}

/**
 * Part 3 · Build one human turn — stitch the retrieved context, the question, and
 * (optionally) an image into a single message. The image makes the turn multimodal.
 */
export function buildHumanMessage(
	question: string,
	retrieved: RetrievedBit[] = [],
	imageDataUrl?: string | null
): HumanMessage {
	const context = retrieved.length
		? 'Document excerpts that may help:\n' +
			retrieved.map((h, i) => `[${i + 1}] (${h.source}) ${h.text}`).join('\n\n') +
			'\n\n'
		: '';
	const text = `${context}${question}`;
	if (imageDataUrl) {
		return new HumanMessage({
			content: [
				{ type: 'text', text },
				{ type: 'image_url', image_url: { url: imageDataUrl } }
			]
		});
	}
	return new HumanMessage(text);
}

// ── Serialization so the inspector can show the exact payload ───────────────
export interface PayloadMessage {
	role: string; // 'system' | 'human' | 'ai' | 'tool'
	text: string;
	hasImage?: boolean;
	imageUrl?: string;
}

function messageToPayload(m: BaseMessage): PayloadMessage {
	const role = m.getType();
	const c = m.content;
	if (typeof c === 'string') return { role, text: c };
	let text = '';
	let hasImage = false;
	let imageUrl: string | undefined;
	for (const part of c as Array<Record<string, unknown>>) {
		if (part.type === 'text') text += String(part.text ?? '');
		else if (part.type === 'image_url' || part.type === 'image') {
			hasImage = true;
			const u = part.image_url as { url?: string } | string | undefined;
			imageUrl = typeof u === 'string' ? u : u?.url;
		}
	}
	return { role, text, hasImage, imageUrl };
}

/** The running conversation, serialized for display. */
export function serializeMessages(msgs: BaseMessage[]): PayloadMessage[] {
	return msgs.map(messageToPayload);
}

/** Exactly what one turn sends: system prompt + all memory + this turn. */
export function toPayload(memory: BaseMessage[], human: HumanMessage): PayloadMessage[] {
	return [{ role: 'system', text: SYSTEM_PROMPT }, ...serializeMessages([...memory, human])];
}

export interface TurnUsage {
	input?: number;
	output?: number;
	total?: number;
}

export interface VerboseResult {
	answer: string;
	/** The exact message array sent to the model. */
	payload: PayloadMessage[];
	usage?: TurnUsage;
	/** Reasoning / thinking text, when the model exposes it. */
	reasoning?: string;
}

/** Pull reasoning/thinking out of a reply, if the provider returned any. */
function extractReasoning(ai: AIMessage): string | undefined {
	const c = ai.content;
	if (Array.isArray(c)) {
		const parts = (c as Array<Record<string, unknown>>)
			.filter((p) => p.type === 'thinking' || p.type === 'reasoning' || p.type === 'reasoning_content')
			.map((p) => String(p.thinking ?? p.reasoning ?? p.text ?? ''));
		if (parts.join('').trim()) return parts.join('\n');
	}
	const ak = ai.additional_kwargs as Record<string, unknown> | undefined;
	const rc = ak?.reasoning_content ?? ak?.reasoning;
	if (rc) return String(rc);
	return undefined;
}

/**
 * Part 4 · The turn — system prompt + the whole memory + this turn, sent to the
 * model. Returns the answer plus everything the inspector wants to show.
 */
export async function respondVerbose(
	memory: BaseMessage[],
	human: HumanMessage
): Promise<VerboseResult> {
	const payload = toPayload(memory, human);
	const model = await getModel({ temperature: 0.3, maxTokens: 600 });
	const messages: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT), ...memory, human];
	const ai = (await model.invoke(messages)) as AIMessage;
	const answer = displayContent(ai.content);
	const u = ai.usage_metadata;
	const usage: TurnUsage | undefined = u
		? { input: u.input_tokens, output: u.output_tokens, total: u.total_tokens }
		: undefined;
	return { answer, payload, usage, reasoning: extractReasoning(ai) };
}

/** Simple form for callers that don't need the trace. */
export async function respond(memory: BaseMessage[], human: HumanMessage): Promise<string> {
	return (await respondVerbose(memory, human)).answer;
}

function contentToText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return (content as Array<Record<string, unknown>>)
			.map((p) => (p.type === 'text' ? String(p.text ?? '') : ''))
			.join('');
	}
	return '';
}

function chunkReasoning(chunk: AIMessageChunk): string {
	const c = chunk.content;
	if (Array.isArray(c)) {
		return (c as Array<Record<string, unknown>>)
			.filter((p) => p.type === 'thinking' || p.type === 'reasoning' || p.type === 'reasoning_content')
			.map((p) => String(p.thinking ?? p.reasoning ?? p.text ?? ''))
			.join('');
	}
	const ak = chunk.additional_kwargs as Record<string, unknown> | undefined;
	const rc = ak?.reasoning_content ?? ak?.reasoning;
	return rc ? String(rc) : '';
}

export interface StreamHandlers {
	/** Fired for each text delta; `full` is the answer so far. */
	onToken?: (delta: string, full: string) => void;
	/** Fired for reasoning/thinking deltas when the model exposes them. */
	onReasoning?: (delta: string, full: string) => void;
}

/**
 * Part 4 (streaming) · Same turn, but token-by-token via model.stream(). Calls the
 * handlers as deltas arrive and returns the final answer + the inspector trace.
 */
export async function respondStream(
	memory: BaseMessage[],
	human: HumanMessage,
	handlers: StreamHandlers = {},
	thinking = false
): Promise<VerboseResult> {
	const payload = toPayload(memory, human);
	const model = await getModel({ temperature: 0.3, maxTokens: 600, thinking });
	const messages: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT), ...memory, human];

	const stream = await model.stream(messages);
	let full = '';
	let reasoning = '';
	let finalChunk: AIMessageChunk | undefined;
	for await (const chunk of stream) {
		finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk;
		const delta = contentToText(chunk.content);
		if (delta) {
			full += delta;
			handlers.onToken?.(delta, full);
		}
		const rDelta = chunkReasoning(chunk);
		if (rDelta) {
			reasoning += rDelta;
			handlers.onReasoning?.(rDelta, reasoning);
		}
	}

	const u = finalChunk?.usage_metadata;
	const usage: TurnUsage | undefined = u
		? { input: u.input_tokens, output: u.output_tokens, total: u.total_tokens }
		: undefined;
	const answer = full || (finalChunk ? displayContent(finalChunk.content) : '');
	return {
		answer,
		payload,
		usage,
		reasoning: reasoning || (finalChunk ? extractReasoning(finalChunk as AIMessage) : undefined)
	};
}

/** Convenience for callers that keep their own memory array. */
export function appendTurn(memory: BaseMessage[], human: HumanMessage, answer: string): void {
	memory.push(human, new AIMessage(answer));
}
