import {
	BaseChatModel,
	type BaseChatModelParams,
	type BaseChatModelCallOptions,
	type BindToolsInput
} from '@langchain/core/language_models/chat_models';
import {
	AIMessage,
	AIMessageChunk,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { browser } from '$app/environment';
import { reportTjsProgress, finishTjsDownload } from '$lib/state/tjs.svelte';
import { markModelDownloaded } from '$lib/state/app.svelte';

/** Call options carry the tools bound via `.bindTools([...])`. */
export interface TransformersJsCallOptions extends BaseChatModelCallOptions {
	tools?: unknown[];
}

export interface TjsProgress {
	status?: string;
	progress?: number;
	file?: string;
}

export interface TransformersJsModelOptions extends BaseChatModelParams {
	model: string;
	dtype?: string;
	device?: 'webgpu' | 'wasm' | 'auto';
	maxNewTokens?: number;
	temperature?: number;
	onProgress?: (p: TjsProgress) => void;
}

interface PendingJob {
	resolve: (value: string) => void;
	reject: (err: Error) => void;
	tokens: string[];
	onToken?: (t: string) => void;
}

class WorkerHost {
	worker: Worker | null = null;
	ready = false;
	private waitReady: Promise<void> | null = null;
	private jobs = new Map<string, PendingJob>();
	private onProgress?: (p: TjsProgress) => void;
	private modelId: string | null = null;

	constructor(public modelOpts: TransformersJsModelOptions) {
		this.onProgress = modelOpts.onProgress;
	}

	private id() {
		return Math.random().toString(36).slice(2, 10);
	}

	private ensureWorker() {
		if (!browser) throw new Error('Transformers.js can only run in the browser.');
		if (this.worker) return;
		this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		this.worker.addEventListener('message', (ev: MessageEvent) => this.handle(ev.data));
	}

	private handle(msg: { type: string; id?: string; text?: string; message?: string; payload?: TjsProgress }) {
		if (msg.type === 'progress' && msg.payload) {
			this.onProgress?.(msg.payload);
			reportTjsProgress(this.modelOpts.model, msg.payload);
			return;
		}
		if (!msg.id) return;
		const job = this.jobs.get(msg.id);
		if (!job && msg.type !== 'ready') return;
		if (msg.type === 'token' && msg.text != null) {
			job!.tokens.push(msg.text);
			job!.onToken?.(msg.text);
		} else if (msg.type === 'done') {
			job!.resolve(msg.text ?? job!.tokens.join(''));
			this.jobs.delete(msg.id);
		} else if (msg.type === 'error') {
			job!.reject(new Error(msg.message || 'Worker error'));
			this.jobs.delete(msg.id);
		} else if (msg.type === 'ready') {
			this.modelId = this.modelOpts.model;
			this.ready = true;
		}
	}

	async ensureReady() {
		this.ensureWorker();
		if (this.ready && this.modelId === this.modelOpts.model) return;
		if (this.waitReady) return this.waitReady;
		this.waitReady = new Promise<void>((resolve, reject) => {
			const id = this.id();
			const onReady = (ev: MessageEvent) => {
				const msg = ev.data as { type: string; id?: string; message?: string };
				if (msg.id !== id) return;
				if (msg.type === 'ready') {
					this.worker!.removeEventListener('message', onReady);
					this.ready = true;
					this.modelId = this.modelOpts.model;
					// Fully loaded → mark cached (Setup "Downloaded" + configured) and clear banner.
					markModelDownloaded(this.modelOpts.model);
					finishTjsDownload();
					resolve();
				} else if (msg.type === 'error') {
					this.worker!.removeEventListener('message', onReady);
					reject(new Error(msg.message || 'init error'));
				}
			};
			this.worker!.addEventListener('message', onReady);
			this.worker!.postMessage({
				type: 'init',
				id,
				model: this.modelOpts.model,
				dtype: this.modelOpts.dtype,
				device: this.modelOpts.device ?? 'webgpu'
			});
		});
		try {
			await this.waitReady;
		} finally {
			this.waitReady = null;
		}
	}

	/** Tear down the worker (and free the model it holds in memory). */
	dispose() {
		this.worker?.terminate();
		this.worker = null;
		this.ready = false;
		this.modelId = null;
		this.waitReady = null;
		this.jobs.clear();
	}

	async generate(
		messages: BaseMessage[],
		onToken?: (t: string) => void,
		stream = true,
		tools?: unknown[]
	) {
		await this.ensureReady();
		return new Promise<string>((resolve, reject) => {
			const id = this.id();
			this.jobs.set(id, { resolve, reject, tokens: [], onToken });
			this.worker!.postMessage({
				type: 'generate',
				id,
				messages: messagesToChatTemplate(messages),
				max_new_tokens: this.modelOpts.maxNewTokens ?? 512,
				temperature: this.modelOpts.temperature ?? 0.7,
				stream,
				tools
			});
		});
	}
}

// Keep the worker on globalThis so it's a single shared instance for the whole app and
// survives dev HMR module re-execution — the model loads into memory once and persists
// across lesson navigation. Switching models terminates the old worker first, so we never
// hold two model copies in memory at the same time.
const _g = globalThis as unknown as { __langxTjs?: { host: WorkerHost | null; key: string } };
_g.__langxTjs ??= { host: null, key: '' };

function getHost(opts: TransformersJsModelOptions) {
	const key = `${opts.model}|${opts.dtype}|${opts.device ?? 'webgpu'}`;
	const slot = _g.__langxTjs!;
	if (slot.host && slot.key === key) {
		slot.host.modelOpts = opts;
		return slot.host;
	}
	slot.host?.dispose();
	slot.host = new WorkerHost(opts);
	slot.key = key;
	return slot.host;
}

export class TransformersJsChatModel extends BaseChatModel<TransformersJsCallOptions> {
	private host: WorkerHost;

	constructor(public opts: TransformersJsModelOptions) {
		super(opts);
		this.host = getHost(opts);
	}

	_llmType() {
		return 'transformers-js';
	}

	/**
	 * Bind tools the same way every other chat model does — convert to the OpenAI
	 * tool schema and carry them as a call option. The worker advertises them via the
	 * model's chat template, and `_generate` parses any tool calls back out. This makes
	 * `model.bindTools([...]).invoke(...)` work for createAgent / the Deep Agents runtime.
	 */
	override bindTools(tools: BindToolsInput[], kwargs?: Partial<TransformersJsCallOptions>) {
		return this.withConfig({
			tools: tools.map((t) => convertToOpenAITool(t)),
			...kwargs
		} as Partial<TransformersJsCallOptions>);
	}

	async warm(onProgress?: (p: TjsProgress) => void) {
		if (onProgress) (this.host.modelOpts as TransformersJsModelOptions).onProgress = onProgress;
		await this.host.ensureReady();
	}

	async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		const tools = options.tools;
		// When tools are bound, generate without token streaming — tool calls are only
		// meaningful once the full block is emitted — then parse them out of the text.
		const raw = await this.host.generate(
			messages,
			tools?.length ? undefined : (t) => runManager?.handleLLMNewToken(t),
			!tools?.length,
			tools
		);
		const { content, toolCalls } = parseToolCalls(raw);
		const message = new AIMessage({ content, tool_calls: toolCalls });
		return { generations: [{ text: content, message }] };
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	) {
		// Tool calls can't be streamed token-by-token; generate fully, parse, and emit
		// a single final chunk that carries the tool-call chunks.
		if (options.tools?.length) {
			const raw = await this.host.generate(messages, undefined, false, options.tools);
			const { content, toolCalls } = parseToolCalls(raw);
			if (content) await runManager?.handleLLMNewToken(content);
			yield new ChatGenerationChunk({
				text: content,
				message: new AIMessageChunk({
					content,
					tool_call_chunks: toolCalls.map((tc, i) => ({
						name: tc.name,
						args: JSON.stringify(tc.args),
						id: tc.id,
						index: i,
						type: 'tool_call_chunk' as const
					}))
				})
			});
			return;
		}

		const queue: { text: string }[] = [];
		let done = false;
		let err: Error | null = null;
		let resume: (() => void) | null = null;

		const promise = this.host
			.generate(messages, (t) => {
				queue.push({ text: t });
				resume?.();
			})
			.catch((e: Error) => {
				err = e;
			})
			.finally(() => {
				done = true;
				resume?.();
			});

		while (!done || queue.length) {
			if (queue.length === 0) {
				await new Promise<void>((res) => (resume = res));
				resume = null;
				continue;
			}
			const item = queue.shift()!;
			await runManager?.handleLLMNewToken(item.text);
			yield new ChatGenerationChunk({
				text: item.text,
				message: new AIMessageChunk({ content: item.text })
			});
		}
		await promise;
		if (err) throw err;
	}
}

function roleFor(m: BaseMessage): string {
	if (m instanceof SystemMessage) return 'system';
	if (m instanceof HumanMessage) return 'user';
	if (m instanceof ToolMessage) return 'tool';
	if (m instanceof AIMessage) return 'assistant';
	return 'user';
}

function messagesToChatTemplate(messages: BaseMessage[]) {
	return messages.map((m) => ({
		role: roleFor(m),
		content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
	}));
}

function toolCallId() {
	return 'call_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Pull tool calls out of a local model's raw output. Targets the Hermes-style format
 * Qwen3 and SmolLM3 emit — `<tool_call>{"name":...,"arguments":{...}}</tool_call>`,
 * possibly several — and falls back to a lone top-level JSON object. Any `<think>`
 * reasoning is stripped, and the leftover prose becomes the message content.
 */
export function parseToolCalls(raw: string): { content: string; toolCalls: ToolCall[] } {
	const text = (raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
	const toolCalls: ToolCall[] = [];

	const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const tc = coerceToolCall(m[1]);
		if (tc) toolCalls.push(tc);
	}

	if (toolCalls.length > 0) {
		const content = text.replace(re, '').trim();
		return { content, toolCalls };
	}

	// No tags — some templates emit a bare JSON object for a single call.
	const bare = text.match(/\{[\s\S]*"(?:name)"[\s\S]*\}/);
	if (bare) {
		const tc = coerceToolCall(bare[0]);
		if (tc) return { content: '', toolCalls: [tc] };
	}

	return { content: text, toolCalls: [] };
}

function coerceToolCall(json: string): ToolCall | null {
	try {
		const obj = JSON.parse(json.trim()) as {
			name?: string;
			arguments?: unknown;
			args?: unknown;
			parameters?: unknown;
		};
		if (!obj.name) return null;
		let args = obj.arguments ?? obj.args ?? obj.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {
				args = { input: args };
			}
		}
		return {
			name: obj.name,
			args: (args ?? {}) as Record<string, unknown>,
			id: toolCallId(),
			type: 'tool_call'
		};
	} catch {
		return null;
	}
}
