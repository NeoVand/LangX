import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import {
	AIMessage,
	AIMessageChunk,
	HumanMessage,
	SystemMessage,
	ToolMessage,
	type BaseMessage
} from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { browser } from '$app/environment';

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

	async generate(messages: BaseMessage[], onToken?: (t: string) => void, stream = true) {
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
				stream
			});
		});
	}
}

let _host: WorkerHost | null = null;
let _hostKey = '';

function getHost(opts: TransformersJsModelOptions) {
	const key = `${opts.model}|${opts.dtype}|${opts.device ?? 'webgpu'}`;
	if (_host && _hostKey === key) {
		_host.modelOpts = opts;
		return _host;
	}
	_host = new WorkerHost(opts);
	_hostKey = key;
	return _host;
}

export class TransformersJsChatModel extends BaseChatModel {
	private host: WorkerHost;

	constructor(public opts: TransformersJsModelOptions) {
		super(opts);
		this.host = getHost(opts);
	}

	_llmType() {
		return 'transformers-js';
	}

	async warm(onProgress?: (p: TjsProgress) => void) {
		if (onProgress) (this.host.modelOpts as TransformersJsModelOptions).onProgress = onProgress;
		await this.host.ensureReady();
	}

	async _generate(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		const text = await this.host.generate(messages, (t) => runManager?.handleLLMNewToken(t));
		const message = new AIMessage({ content: text });
		return { generations: [{ text, message }] };
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	) {
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
