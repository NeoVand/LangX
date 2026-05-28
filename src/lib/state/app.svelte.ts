import { browser } from '$app/environment';

const STORAGE_KEY = 'langx.app.v1';

export type ModelProvider = 'transformers-js' | 'openai' | 'anthropic' | 'groq' | 'mock';

export interface ApiKeys {
	openai: string;
	anthropic: string;
	groq: string;
}

export interface TransformersJsModel {
	id: string;
	label: string;
	sizeMb: number;
	dtype: string;
	supportsTools: 'no' | 'weak' | 'good';
	notes: string;
}

export const TJS_MODELS: TransformersJsModel[] = [
	{
		id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
		label: 'SmolLM2 360M Instruct',
		sizeMb: 230,
		dtype: 'q4',
		supportsTools: 'no',
		notes: 'Small and fast. Great for chat and basic LCEL.'
	},
	{
		id: 'onnx-community/Qwen2.5-0.5B-Instruct',
		label: 'Qwen2.5 0.5B Instruct',
		sizeMb: 380,
		dtype: 'q4',
		supportsTools: 'weak',
		notes: 'Good balance for most early lessons.'
	},
	{
		id: 'onnx-community/Qwen3-0.6B-ONNX',
		label: 'Qwen3 0.6B (reasoning)',
		sizeMb: 470,
		dtype: 'q4f16',
		supportsTools: 'good',
		notes: 'Best small model for tool calling. Slower start.'
	},
	{
		id: 'onnx-community/Llama-3.2-1B-Instruct',
		label: 'Llama 3.2 1B Instruct',
		sizeMb: 800,
		dtype: 'q4',
		supportsTools: 'weak',
		notes: 'Bigger context. Heavier download.'
	}
];

export interface AppState {
	tjsModel: string;
	keys: ApiKeys;
	preferredProvider: ModelProvider;
	presentationMode: boolean;
	theme: 'dark' | 'light';
	visited: Record<string, boolean>;
	webgpuOk: boolean | null;
}

const defaultState = (): AppState => ({
	tjsModel: TJS_MODELS[1].id,
	keys: { openai: '', anthropic: '', groq: '' },
	preferredProvider: 'mock',
	presentationMode: false,
	theme: 'dark',
	visited: {},
	webgpuOk: null
});

function loadInitial(): AppState {
	if (!browser) return defaultState();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultState();
		return { ...defaultState(), ...(JSON.parse(raw) as Partial<AppState>) };
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

export function markVisited(path: string) {
	if (!app.visited[path]) {
		app.visited[path] = true;
		persist();
	}
}

export function bestAvailableProvider(): ModelProvider {
	if (app.keys.anthropic) return 'anthropic';
	if (app.keys.openai) return 'openai';
	if (app.keys.groq) return 'groq';
	return 'transformers-js';
}
