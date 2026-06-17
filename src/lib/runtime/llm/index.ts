import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
	app,
	type ModelProvider,
	TJS_MODELS,
	FALLBACK_TJS_MODEL,
	selectedAzureChatModel
} from '$lib/state/app.svelte';
import { findHostedModel, thinkingMode, type ThinkingMode } from '$lib/models/catalog';
import { azureProxyBaseUrl, isReasoningDeployment } from '$lib/models/azure';
import { TransformersJsChatModel, type TjsProgress } from './transformers-js';

export type ProviderHint = ModelProvider | 'auto';

export interface GetModelOptions {
	provider?: ProviderHint;
	temperature?: number;
	maxTokens?: number;
	/** Enable extended thinking where the model supports it (Anthropic, Gemini). */
	thinking?: boolean;
	/** Reasoning effort for OpenAI reasoning models (GPT-5.x / o-series) — lower = faster start. */
	reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
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
	if (pref === 'google' && app.keys.google) return 'google';
	if (pref === 'azure' && selectedAzureChatModel()) return 'azure';
	if (pref === 'transformers-js') return 'transformers-js';
	if (app.keys.anthropic) return 'anthropic';
	if (app.keys.openai) return 'openai';
	if (app.keys.google) return 'google';
	if (selectedAzureChatModel()) return 'azure';
	return 'transformers-js';
}

export async function getModel(opts: GetModelOptions = {}): Promise<BaseChatModel> {
	const provider = resolveProvider(opts.provider);

	if (provider === 'transformers-js') {
		// Explicit local pick → the user's chosen model; auto-fallback (no key) → Qwen3-4B.
		const explicitLocal =
			app.preferredProvider === 'transformers-js' || opts.provider === 'transformers-js';
		const wantId = explicitLocal ? app.tjsModel : FALLBACK_TJS_MODEL;
		const tjs =
			TJS_MODELS.find((m) => m.id === wantId) ??
			TJS_MODELS.find((m) => m.id === FALLBACK_TJS_MODEL) ??
			TJS_MODELS[0];
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
		const id = app.models.openai;
		const configuration = { dangerouslyAllowBrowser: true } as never;
		// GPT-5.x / o-series are reasoning models: they reject a custom temperature
		// and meter output with max_completion_tokens. Send the minimal parameter
		// surface so we never pass something the API rejects; let the SDK default
		// the rest. Classic chat models (gpt-4o-mini) keep the deterministic path.
		if (findHostedModel(id)?.reasoning) {
			// IMPORTANT: `reasoningEffort` is a *call option*, not a constructor field —
			// ChatOpenAI's constructor only reads `reasoning`. Passing `reasoningEffort` here
			// is silently dropped, so the request goes out at the model's default effort
			// (slow first token regardless of our toggle). The constructor field that maps to
			// `reasoning_effort` on the wire is `reasoning: { effort }`.
			return new ChatOpenAI({
				apiKey: app.keys.openai,
				model: id,
				configuration,
				...(opts.reasoningEffort ? { reasoning: { effort: opts.reasoningEffort } } : {})
			});
		}
		return new ChatOpenAI({
			apiKey: app.keys.openai,
			model: id,
			temperature: opts.temperature ?? 0,
			maxTokens: opts.maxTokens,
			configuration
		});
	}

	if (provider === 'anthropic') {
		if (!app.keys.anthropic) throw new NoConfiguredProviderError('anthropic');
		const { ChatAnthropic } = await import('@langchain/anthropic');
		const id = app.models.anthropic;
		const hm = findHostedModel(id);
		// Some newer models (e.g. Opus 4.8) deprecate `temperature` and 400 if it's sent.
		const locksTemp = hm?.noTemperature ?? false;
		// …and replace `thinking.type:'enabled'` with adaptive thinking (effort, not a budget).
		const adaptive = hm?.adaptiveThinking ?? false;
		const base = {
			apiKey: app.keys.anthropic,
			model: id,
			clientOptions: { dangerouslyAllowBrowser: true }
		};
		if (opts.thinking) {
			if (adaptive) {
				// Adaptive thinking: depth is set by outputConfig.effort, not a token budget,
				// and temperature is omitted (these models lock it). max_tokens needs headroom
				// for the private reasoning plus the visible answer.
				const effort =
					opts.reasoningEffort && opts.reasoningEffort !== 'minimal' ? opts.reasoningEffort : 'medium';
				return new ChatAnthropic({
					...base,
					maxTokens: Math.max(opts.maxTokens ?? 1024, 3072),
					thinking: { type: 'adaptive' },
					outputConfig: { effort }
				});
			}
			// Extended thinking: max_tokens must exceed the thinking budget. Temperature,
			// where the model still accepts it, must be 1; locked models take none.
			const budget = 1600;
			return new ChatAnthropic({
				...base,
				maxTokens: Math.max(opts.maxTokens ?? 1024, budget + 1600),
				thinking: { type: 'enabled', budget_tokens: budget },
				...(locksTemp ? {} : { temperature: 1 })
			});
		}
		return new ChatAnthropic({
			...base,
			maxTokens: opts.maxTokens ?? 1024,
			...(locksTemp ? {} : { temperature: opts.temperature ?? 0 })
		});
	}

	if (provider === 'azure') {
		const model = selectedAzureChatModel();
		if (!model) throw new NoConfiguredProviderError('azure');
		const { ChatOpenAI } = await import('@langchain/openai');
		// Keyless: the local /api/azure proxy injects an Entra ID bearer token, so the
		// SDK key is a placeholder. The target deployment endpoint travels in a header.
		const configuration = {
			baseURL: azureProxyBaseUrl(),
			defaultHeaders: { 'x-azure-endpoint': model.endpoint },
			dangerouslyAllowBrowser: true
		} as never;
		if (isReasoningDeployment(model.deployment)) {
			// Reasoning deployments reject a custom temperature and meter output with
			// max_completion_tokens; send the minimal surface like the OpenAI branch.
			return new ChatOpenAI({ apiKey: 'keyless', model: model.deployment, configuration });
		}
		return new ChatOpenAI({
			apiKey: 'keyless',
			model: model.deployment,
			temperature: opts.temperature ?? 0,
			maxTokens: opts.maxTokens,
			configuration
		});
	}

	if (provider === 'google') {
		if (!app.keys.google) throw new NoConfiguredProviderError('google');
		const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
		return new ChatGoogleGenerativeAI({
			apiKey: app.keys.google,
			model: app.models.google,
			temperature: opts.temperature ?? 0,
			// Google's SDK names the output cap maxOutputTokens (not maxTokens).
			maxOutputTokens: opts.maxTokens,
			// Gemini 2.5+ thinking: -1 lets the model size its own budget; surface thoughts.
			...(opts.thinking
				? { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } }
				: {})
		});
	}

	throw new Error(`Unknown provider: ${provider}`);
}

/**
 * If the active runtime is a *downloaded* local model, load it into memory now so the
 * first demo run is instant. No-op when a hosted provider is configured or the local
 * model isn't cached yet (so we never trigger a multi-GB download on page load). Safe to
 * call repeatedly — the worker is a singleton and `warm()` returns early once ready.
 */
export async function warmActiveLocalModel(onProgress?: (p: TjsProgress) => void): Promise<void> {
	if (resolveProvider('auto') !== 'transformers-js') return;
	const id = app.preferredProvider === 'transformers-js' ? app.tjsModel : FALLBACK_TJS_MODEL;
	if (!app.downloadedModels.includes(id)) return;
	const model = await getModel({ provider: 'transformers-js', onProgress });
	if (model instanceof TransformersJsChatModel) await model.warm(onProgress);
}

export interface ActiveModelInfo {
	provider: ModelProvider;
	id: string;
	/** OpenAI/Azure reasoning model — reasons by default (slower first token). */
	reasoning: boolean;
	/** Can accept image inputs. All hosted models can; local Transformers.js cannot. */
	vision: boolean;
	/** 'optional' = user-toggleable thinking · 'hidden' = always on · 'none'. */
	thinking: ThinkingMode;
}

/** What the currently-selected chat model can do — for UIs that adapt to it. */
export function activeModelInfo(): ActiveModelInfo {
	const provider = resolveProvider('auto');
	if (provider === 'transformers-js') {
		return { provider, id: app.tjsModel, reasoning: false, vision: false, thinking: 'none' };
	}
	if (provider === 'azure') {
		const m = selectedAzureChatModel();
		const reasoning = !!(m && isReasoningDeployment(m.deployment));
		return { provider, id: m?.deployment ?? '', reasoning, vision: true, thinking: reasoning ? 'hidden' : 'none' };
	}
	const id =
		provider === 'openai' ? app.models.openai : provider === 'anthropic' ? app.models.anthropic : app.models.google;
	const hm = findHostedModel(id);
	return { provider, id, reasoning: hm?.reasoning ?? false, vision: true, thinking: thinkingMode(hm) };
}

export { TransformersJsChatModel } from './transformers-js';
