import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { app, type ModelProvider, TJS_MODELS } from '$lib/state/app.svelte';
import { TransformersJsChatModel, type TjsProgress } from './transformers-js';

export type ProviderHint = ModelProvider | 'auto';

export interface GetModelOptions {
	provider?: ProviderHint;
	temperature?: number;
	maxTokens?: number;
	/** Called for Transformers.js download progress events. */
	onProgress?: (p: TjsProgress) => void;
}

export class NoConfiguredProviderError extends Error {
	constructor(public provider: ModelProvider) {
		super(
			`No API key set for ${provider}. Visit /setup to configure a key, or pick a Transformers.js model.`
		);
		this.name = 'NoConfiguredProviderError';
	}
}

export function resolveProvider(hint: ProviderHint = 'auto'): ModelProvider {
	if (hint !== 'auto') return hint;
	const pref = app.preferredProvider;
	if (pref === 'openai' && app.keys.openai) return 'openai';
	if (pref === 'anthropic' && app.keys.anthropic) return 'anthropic';
	if (pref === 'groq' && app.keys.groq) return 'groq';
	if (pref === 'transformers-js') return 'transformers-js';
	if (app.keys.anthropic) return 'anthropic';
	if (app.keys.openai) return 'openai';
	if (app.keys.groq) return 'groq';
	return 'transformers-js';
}

export async function getModel(opts: GetModelOptions = {}): Promise<BaseChatModel> {
	const provider = resolveProvider(opts.provider);

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
		if (!app.keys.openai) throw new NoConfiguredProviderError('openai');
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
		if (!app.keys.anthropic) throw new NoConfiguredProviderError('anthropic');
		const { ChatAnthropic } = await import('@langchain/anthropic');
		return new ChatAnthropic({
			apiKey: app.keys.anthropic,
			model: 'claude-haiku-4-5',
			temperature: opts.temperature ?? 0,
			maxTokens: opts.maxTokens ?? 1024,
			clientOptions: {
				dangerouslyAllowBrowser: true
			}
		});
	}

	if (provider === 'groq') {
		if (!app.keys.groq) throw new NoConfiguredProviderError('groq');
		const { ChatGroq } = await import('@langchain/groq');
		return new ChatGroq({
			apiKey: app.keys.groq,
			model: 'llama-3.3-70b-versatile',
			temperature: opts.temperature ?? 0
		});
	}

	throw new Error(`Unknown provider: ${provider}`);
}

export { TransformersJsChatModel } from './transformers-js';
