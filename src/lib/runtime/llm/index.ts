import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { app, type ModelProvider, TJS_MODELS } from '$lib/state/app.svelte';
import { MockChatModel, type MockChatModelOptions } from './mock';
import { TransformersJsChatModel, type TjsProgress } from './transformers-js';

export type ProviderHint = ModelProvider | 'auto';

export interface GetModelOptions {
	provider?: ProviderHint;
	temperature?: number;
	maxTokens?: number;
	mock?: MockChatModelOptions;
	/** Called for Transformers.js download progress events. */
	onProgress?: (p: TjsProgress) => void;
}

export function resolveProvider(hint: ProviderHint = 'auto'): ModelProvider {
	if (hint !== 'auto') return hint;
	const pref = app.preferredProvider;
	if (pref === 'openai' && !app.keys.openai) return 'mock';
	if (pref === 'anthropic' && !app.keys.anthropic) return 'mock';
	if (pref === 'groq' && !app.keys.groq) return 'mock';
	return pref;
}

export async function getModel(opts: GetModelOptions = {}): Promise<BaseChatModel> {
	const provider = resolveProvider(opts.provider);

	if (provider === 'mock') {
		return new MockChatModel(opts.mock ?? {});
	}

	if (provider === 'transformers-js') {
		const tjs = TJS_MODELS.find((m) => m.id === app.tjsModel) ?? TJS_MODELS[0];
		return new TransformersJsChatModel({
			model: tjs.id,
			dtype: tjs.dtype,
			device: app.webgpuOk === false ? 'wasm' : 'webgpu',
			temperature: opts.temperature ?? 0.7,
			maxNewTokens: opts.maxTokens ?? 512,
			onProgress: opts.onProgress
		});
	}

	if (provider === 'openai') {
		const { ChatOpenAI } = await import('@langchain/openai');
		return new ChatOpenAI({
			apiKey: app.keys.openai,
			model: 'gpt-4o-mini',
			temperature: opts.temperature ?? 0,
			maxTokens: opts.maxTokens,
			configuration: {
				dangerouslyAllowBrowser: true
			} as never
		});
	}

	if (provider === 'anthropic') {
		const { ChatAnthropic } = await import('@langchain/anthropic');
		return new ChatAnthropic({
			apiKey: app.keys.anthropic,
			model: 'claude-3-5-haiku-latest',
			temperature: opts.temperature ?? 0,
			maxTokens: opts.maxTokens ?? 1024,
			clientOptions: {
				dangerouslyAllowBrowser: true
			}
		});
	}

	if (provider === 'groq') {
		const { ChatGroq } = await import('@langchain/groq');
		return new ChatGroq({
			apiKey: app.keys.groq,
			model: 'llama-3.3-70b-versatile',
			temperature: opts.temperature ?? 0
		});
	}

	throw new Error(`Unknown provider: ${provider}`);
}

export { MockChatModel } from './mock';
export { TransformersJsChatModel } from './transformers-js';
