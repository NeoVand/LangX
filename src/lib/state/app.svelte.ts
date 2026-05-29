import { browser } from '$app/environment';
import { defaultModelFor, defaultEmbeddingModelFor, type HostedProvider } from '$lib/models/catalog';

const STORAGE_KEY = 'langx.app.v2';

export type ModelProvider = 'transformers-js' | 'openai' | 'anthropic' | 'google';

export interface ApiKeys {
	openai: string;
	anthropic: string;
	google: string;
	voyage: string;
}

export interface TransformersJsModel {
	id: string;
	label: string;
	family: 'qwen3' | 'gemma' | 'llama' | 'phi' | 'nemotron' | 'smol';
	sizeMb: number;
	dtype: 'q4' | 'q4f16' | 'q8' | 'fp16' | 'fp32';
	tier: 'XS' | 'S' | 'M' | 'L' | 'XL';
	requiresWebGpu: boolean;
	recommendedRamGb: number;
	bench: {
		ttftMs: number; // approximate first-token latency on a recent dGPU
		decodeTokPerSec: number; // approximate steady-state throughput
	};
	agenticGrade: 'no' | 'weak' | 'good' | 'excellent';
	notes: string;
}

/**
 * Curated lineup, May 2026.
 * Sourced from the onnx-community org on Hugging Face. Sizes are q4f16 unless
 * noted; numbers are model-card approximations.
 */
export const TJS_MODELS: TransformersJsModel[] = [
	// tier-XS — runs on CPU, useful for tiny demos
	{
		id: 'onnx-community/Qwen3-0.6B-ONNX',
		label: 'Qwen3 0.6B (reasoning)',
		family: 'qwen3',
		sizeMb: 470,
		dtype: 'q4f16',
		tier: 'XS',
		requiresWebGpu: false,
		recommendedRamGb: 4,
		bench: { ttftMs: 250, decodeTokPerSec: 28 },
		agenticGrade: 'good',
		notes: 'Best small model with native tool calling. Punches above its weight on reasoning.'
	},
	// tier-S — sweet spot for laptops
	{
		id: 'onnx-community/gemma-4-E2B-it-ONNX',
		label: 'Gemma 4 E2B Instruct',
		family: 'gemma',
		sizeMb: 1240,
		dtype: 'q4f16',
		tier: 'S',
		requiresWebGpu: true,
		recommendedRamGb: 6,
		bench: { ttftMs: 380, decodeTokPerSec: 22 },
		agenticGrade: 'good',
		notes:
			'Hugging Face\u2019s flagship for in-browser agentic work. Strong tool calling via Gemma chat templates.'
	},
	{
		id: 'onnx-community/Llama-3.2-3B-Instruct-ONNX',
		label: 'Llama 3.2 3B Instruct',
		family: 'llama',
		sizeMb: 1900,
		dtype: 'q4f16',
		tier: 'S',
		requiresWebGpu: true,
		recommendedRamGb: 8,
		bench: { ttftMs: 520, decodeTokPerSec: 18 },
		agenticGrade: 'good',
		notes: 'Solid baseline. Reliable tool use, good prose quality.'
	},
	// tier-M
	{
		id: 'onnx-community/Phi-4-mini-instruct-ONNX',
		label: 'Phi-4 mini Instruct',
		family: 'phi',
		sizeMb: 2300,
		dtype: 'q4f16',
		tier: 'M',
		requiresWebGpu: true,
		recommendedRamGb: 10,
		bench: { ttftMs: 620, decodeTokPerSec: 16 },
		agenticGrade: 'excellent',
		notes: 'Microsoft\u2019s small reasoning star. Great structured output and code.'
	},
	{
		id: 'onnx-community/Qwen3-4B-ONNX',
		label: 'Qwen3 4B (reasoning)',
		family: 'qwen3',
		sizeMb: 2400,
		dtype: 'q4f16',
		tier: 'M',
		requiresWebGpu: true,
		recommendedRamGb: 10,
		bench: { ttftMs: 700, decodeTokPerSec: 15 },
		agenticGrade: 'excellent',
		notes: 'Sweet spot for serious agentic work in the browser. Stable tool loops.'
	},
	// tier-L — needs a real GPU
	{
		id: 'onnx-community/Qwen3-8B-ONNX',
		label: 'Qwen3 8B (reasoning)',
		family: 'qwen3',
		sizeMb: 4500,
		dtype: 'q4f16',
		tier: 'L',
		requiresWebGpu: true,
		recommendedRamGb: 16,
		bench: { ttftMs: 1300, decodeTokPerSec: 9 },
		agenticGrade: 'excellent',
		notes:
			'Large enough that the harness can plan + delegate without help. Requires a dGPU class machine.'
	},
	{
		id: 'onnx-community/Nemotron-3-Nano-9B-ONNX',
		label: 'NVIDIA Nemotron-3 Nano 9B',
		family: 'nemotron',
		sizeMb: 4800,
		dtype: 'q4f16',
		tier: 'L',
		requiresWebGpu: true,
		recommendedRamGb: 16,
		bench: { ttftMs: 1500, decodeTokPerSec: 8 },
		agenticGrade: 'excellent',
		notes:
			'Hybrid Mamba\u2013Transformer mixture of experts, explicitly tuned for agentic reasoning.'
	}
];

export interface ViewMode {
	/** Demo / workshop pane visible. */
	workshop: boolean;
	/** Narrative / book pane visible. */
	book: boolean;
}

export interface AppState {
	tjsModel: string;
	/** Selected hosted model ID per provider (see `$lib/models/catalog`). */
	models: Record<HostedProvider, string>;
	/** Selected embedding model ID per hosted embeddings provider (RAG). */
	embeddingModels: { openai: string; voyage: string };
	keys: ApiKeys;
	preferredProvider: ModelProvider;
	presentationMode: boolean;
	viewMode: ViewMode;
	theme: 'dark' | 'light';
	visited: Record<string, boolean>;
	webgpuOk: boolean | null;
}

const defaultState = (): AppState => ({
	tjsModel: TJS_MODELS[0].id,
	models: {
		anthropic: defaultModelFor('anthropic'),
		openai: defaultModelFor('openai'),
		google: defaultModelFor('google')
	},
	embeddingModels: {
		openai: defaultEmbeddingModelFor('openai'),
		voyage: defaultEmbeddingModelFor('voyage')
	},
	keys: { openai: '', anthropic: '', google: '', voyage: '' },
	preferredProvider: 'anthropic',
	presentationMode: false,
	viewMode: { workshop: true, book: true },
	theme: 'dark',
	visited: {},
	webgpuOk: null
});

/**
 * Merge persisted state over defaults, deep-merging the nested objects so a save
 * written before a field existed (e.g. `models`, or a newly added API-key slot)
 * still ends up with every key present rather than a partial object.
 */
function withDefaults(parsed: Partial<AppState>): AppState {
	const base = defaultState();
	const merged: AppState = {
		...base,
		...parsed,
		keys: { ...base.keys, ...(parsed.keys ?? {}) },
		models: { ...base.models, ...(parsed.models ?? {}) },
		embeddingModels: { ...base.embeddingModels, ...(parsed.embeddingModels ?? {}) },
		viewMode: { ...base.viewMode, ...(parsed.viewMode ?? {}) }
	};
	// Migrate retired providers (e.g. the removed 'groq') to the default.
	const valid: ModelProvider[] = ['transformers-js', 'openai', 'anthropic', 'google'];
	if (!valid.includes(merged.preferredProvider)) merged.preferredProvider = 'anthropic';
	return merged;
}

function loadInitial(): AppState {
	if (!browser) return defaultState();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			// Migration from v1 (which had 'mock' as a provider).
			const legacy = localStorage.getItem('langx.app.v1');
			if (legacy) {
				const parsed = JSON.parse(legacy) as Record<string, unknown>;
				if (parsed.preferredProvider === 'mock') parsed.preferredProvider = 'anthropic';
				return withDefaults(parsed as Partial<AppState>);
			}
			return defaultState();
		}
		return withDefaults(JSON.parse(raw) as Partial<AppState>);
	} catch {
		return defaultState();
	}
}

export const app = $state<AppState>(loadInitial());

export function persist() {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
	} catch {
		// localStorage full or denied; ignore.
	}
}

export function detectWebGpu() {
	if (!browser) return;
	const has = typeof navigator !== 'undefined' && 'gpu' in navigator;
	app.webgpuOk = !!has;
}

export function setTjsModel(id: string) {
	app.tjsModel = id;
	persist();
}

/** Choose which hosted model a given provider should use. */
export function setProviderModel(provider: HostedProvider, id: string) {
	app.models[provider] = id;
	persist();
}

/** Choose which embedding model a hosted embeddings provider should use (RAG). */
export function setEmbeddingModel(provider: 'openai' | 'voyage', id: string) {
	app.embeddingModels[provider] = id;
	persist();
}

export function setApiKey(provider: keyof ApiKeys, value: string) {
	app.keys[provider] = value.trim();
	persist();
}

export function setPreferredProvider(p: ModelProvider) {
	app.preferredProvider = p;
	persist();
}

export function togglePresentation() {
	app.presentationMode = !app.presentationMode;
}

/** Toggle the workshop (demo) pane, never allowing both panes to be hidden. */
export function toggleWorkshop() {
	if (app.viewMode.workshop && !app.viewMode.book) return; // would hide both
	app.viewMode.workshop = !app.viewMode.workshop;
	if (!app.viewMode.workshop && !app.viewMode.book) app.viewMode.book = true;
	persist();
}

/** Toggle the book (narrative) pane, never allowing both panes to be hidden. */
export function toggleBook() {
	if (app.viewMode.book && !app.viewMode.workshop) return; // would hide both
	app.viewMode.book = !app.viewMode.book;
	if (!app.viewMode.book && !app.viewMode.workshop) app.viewMode.workshop = true;
	persist();
}

export function markVisited(path: string) {
	if (!app.visited[path]) {
		app.visited[path] = true;
		persist();
	}
}

/**
 * Returns true when the user has at least one viable runtime configured:
 * either an API key for a hosted provider, or a downloaded TJS model + WebGPU.
 */
export function isConfigured(): boolean {
	if (!browser) return false;
	const p = app.preferredProvider;
	if (p === 'anthropic') return !!app.keys.anthropic;
	if (p === 'openai') return !!app.keys.openai;
	if (p === 'google') return !!app.keys.google;
	return false; // transformers-js needs cache check; treat as not-yet-configured.
}

export function bestAvailableProvider(): ModelProvider | null {
	if (app.keys.anthropic) return 'anthropic';
	if (app.keys.openai) return 'openai';
	if (app.keys.google) return 'google';
	return null;
}
