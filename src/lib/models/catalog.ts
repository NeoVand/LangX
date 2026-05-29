/**
 * Curated catalog of hosted (API) models the user can pick from, mirroring the
 * `TJS_MODELS` lineup that already exists for local Transformers.js models.
 *
 * Why curated rather than fetched live from each provider's `/v1/models`
 * endpoint: a teaching app benefits from rich, comparable metadata (context
 * window, relative cost, speed, agentic fitness) that the raw endpoints don't
 * return, and a hand-maintained list lets us recommend a sensible default and
 * keep the lineup tidy. The exact model IDs below are verified against the
 * official provider docs (Anthropic models overview; OpenAI models reference).
 *
 * When providers ship new models, update this file — it is the single source of
 * truth for which hosted models LangX offers.
 */

export type HostedProvider = 'anthropic' | 'openai' | 'google';

export interface HostedModel {
	/** Exact string passed as `model` to the SDK. */
	id: string;
	label: string;
	provider: HostedProvider;
	/** Coarse capability band, used for grouping + the "good / better / best" spread. */
	tier: 'fast' | 'balanced' | 'frontier';
	/**
	 * Reasoning models (OpenAI GPT-5.x, o-series) reject a custom `temperature`
	 * and meter output with `max_completion_tokens` (reasoning + visible tokens).
	 * `getModel` branches on this so it never sends a parameter the API rejects.
	 */
	reasoning: boolean;
	contextTokens: number;
	maxOutputTokens?: number;
	/** Relative price band across the hosted lineup — robust to exact-price drift. */
	costTier: 'low' | 'medium' | 'high';
	/** Exact USD per million tokens, where we can cite it. Omitted when unverified. */
	price?: { inMtok: number; outMtok: number };
	speed: 'fastest' | 'fast' | 'moderate';
	agenticGrade: 'good' | 'excellent';
	/** The sensible default for its provider (fast + cheap for repeated demo runs). */
	recommended?: boolean;
	blurb: string;
}

/** Anthropic — current Claude 4.x lineup (good / better / best). */
export const CLAUDE_MODELS: HostedModel[] = [
	{
		id: 'claude-haiku-4-5',
		label: 'Claude Haiku 4.5',
		provider: 'anthropic',
		tier: 'fast',
		reasoning: false,
		contextTokens: 200_000,
		maxOutputTokens: 64_000,
		costTier: 'low',
		price: { inMtok: 1, outMtok: 5 },
		speed: 'fastest',
		agenticGrade: 'excellent',
		recommended: true,
		blurb: 'Fastest Claude with near-frontier intelligence — the snappy, low-cost default for demos.'
	},
	{
		id: 'claude-sonnet-4-6',
		label: 'Claude Sonnet 4.6',
		provider: 'anthropic',
		tier: 'balanced',
		reasoning: false,
		contextTokens: 1_000_000,
		maxOutputTokens: 64_000,
		costTier: 'medium',
		price: { inMtok: 3, outMtok: 15 },
		speed: 'fast',
		agenticGrade: 'excellent',
		blurb: 'Best balance of speed and intelligence, with a 1M-token context. Ideal for serious agentic work.'
	},
	{
		id: 'claude-opus-4-8',
		label: 'Claude Opus 4.8',
		provider: 'anthropic',
		tier: 'frontier',
		reasoning: false,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		costTier: 'high',
		price: { inMtok: 5, outMtok: 25 },
		speed: 'moderate',
		agenticGrade: 'excellent',
		blurb: "Anthropic's most capable model for complex reasoning and long-horizon agentic coding."
	}
];

/**
 * OpenAI — `gpt-4o-mini` (classic chat) plus the GPT-5.x reasoning family.
 * The GPT-5.x models are reasoning models: no custom temperature, and output is
 * metered with `max_completion_tokens`.
 */
export const OPENAI_MODELS: HostedModel[] = [
	{
		id: 'gpt-4o-mini',
		label: 'GPT-4o mini',
		provider: 'openai',
		tier: 'fast',
		reasoning: false,
		contextTokens: 128_000,
		maxOutputTokens: 16_384,
		costTier: 'low',
		price: { inMtok: 0.15, outMtok: 0.6 },
		speed: 'fastest',
		agenticGrade: 'good',
		recommended: true,
		blurb: 'Economical, fast chat model. Lowest-cost path for OpenAI demos, and deterministic at temperature 0.'
	},
	{
		id: 'gpt-5.4-mini',
		label: 'GPT-5.4 mini',
		provider: 'openai',
		tier: 'balanced',
		reasoning: true,
		contextTokens: 400_000,
		maxOutputTokens: 128_000,
		costTier: 'medium',
		speed: 'fast',
		agenticGrade: 'excellent',
		blurb: 'Compact GPT-5.x reasoning model tuned for coding, computer use, and subagents.'
	},
	{
		id: 'gpt-5.4',
		label: 'GPT-5.4',
		provider: 'openai',
		tier: 'balanced',
		reasoning: true,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		costTier: 'medium',
		speed: 'moderate',
		agenticGrade: 'excellent',
		blurb: 'Affordable frontier reasoning for coding and professional work.'
	},
	{
		id: 'gpt-5.5',
		label: 'GPT-5.5',
		provider: 'openai',
		tier: 'frontier',
		reasoning: true,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		costTier: 'high',
		speed: 'moderate',
		agenticGrade: 'excellent',
		blurb: "OpenAI's most capable model for coding and professional work."
	}
];

/**
 * Google — current Gemini lineup. Gemini 2.5+ are "thinking" models but, unlike
 * the OpenAI reasoning models, they accept a normal `temperature`, so `reasoning`
 * stays false (it only gates OpenAI's parameter quirks). Verify IDs at
 * https://ai.google.dev/gemini-api/docs/models when updating.
 */
export const GOOGLE_MODELS: HostedModel[] = [
	{
		id: 'gemini-2.5-flash',
		label: 'Gemini 2.5 Flash',
		provider: 'google',
		tier: 'fast',
		reasoning: false,
		contextTokens: 1_000_000,
		maxOutputTokens: 65_536,
		costTier: 'low',
		speed: 'fastest',
		agenticGrade: 'excellent',
		recommended: true,
		blurb: 'Low-latency Gemini with reasoning and a 1M-token context. A great, cheap default.'
	},
	{
		id: 'gemini-2.5-pro',
		label: 'Gemini 2.5 Pro',
		provider: 'google',
		tier: 'balanced',
		reasoning: false,
		contextTokens: 1_000_000,
		maxOutputTokens: 65_536,
		costTier: 'high',
		speed: 'moderate',
		agenticGrade: 'excellent',
		blurb: 'Deep reasoning and coding over very long contexts.'
	},
	{
		id: 'gemini-3.5-flash',
		label: 'Gemini 3.5 Flash',
		provider: 'google',
		tier: 'frontier',
		reasoning: false,
		contextTokens: 1_000_000,
		maxOutputTokens: 65_536,
		costTier: 'medium',
		speed: 'fast',
		agenticGrade: 'excellent',
		blurb: "Google's latest — frontier performance on sustained agentic and coding tasks."
	}
];

export const HOSTED_MODELS: HostedModel[] = [...CLAUDE_MODELS, ...OPENAI_MODELS, ...GOOGLE_MODELS];

const BY_PROVIDER: Record<HostedProvider, HostedModel[]> = {
	anthropic: CLAUDE_MODELS,
	openai: OPENAI_MODELS,
	google: GOOGLE_MODELS
};

export function modelsForProvider(provider: HostedProvider): HostedModel[] {
	return BY_PROVIDER[provider];
}

export function findHostedModel(id: string): HostedModel | undefined {
	return HOSTED_MODELS.find((m) => m.id === id);
}

/** The recommended (or first) model ID for a provider — the persisted default. */
export function defaultModelFor(provider: HostedProvider): string {
	const list = BY_PROVIDER[provider];
	return (list.find((m) => m.recommended) ?? list[0]).id;
}

/** Human-friendly context-window label, e.g. 200_000 → "200K", 1_000_000 → "1M". */
export function formatContext(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M`;
	return `${Math.round(tokens / 1000)}K`;
}

// ── Embedding models (RAG) ──────────────────────────────────────────────────
// Embeddings are a separate axis from chat models: the RAG lesson lets the user
// pick local (bundled, in-browser) or a hosted provider, and — now — which model
// within that provider. Metadata here is dimensions + relative cost rather than
// context window.

export type EmbeddingProvider = 'local' | 'openai' | 'voyage';

export interface EmbeddingModel {
	id: string;
	label: string;
	provider: EmbeddingProvider;
	/** Output vector dimensionality. */
	dimensions: number;
	costTier: 'free' | 'low' | 'medium';
	/** USD per million input tokens, where verified (embeddings are input-only). */
	price?: { inMtok: number };
	recommended?: boolean;
	blurb: string;
}

/** OpenAI — current text-embedding-3 generation. */
export const OPENAI_EMBEDDINGS: EmbeddingModel[] = [
	{
		id: 'text-embedding-3-small',
		label: 'text-embedding-3-small',
		provider: 'openai',
		dimensions: 1536,
		costTier: 'low',
		price: { inMtok: 0.02 },
		recommended: true,
		blurb: 'Fast, cheap, 1536-dim. The right default for almost all RAG.'
	},
	{
		id: 'text-embedding-3-large',
		label: 'text-embedding-3-large',
		provider: 'openai',
		dimensions: 3072,
		costTier: 'medium',
		price: { inMtok: 0.13 },
		blurb: 'Higher-quality 3072-dim vectors for demanding retrieval.'
	}
];

/** Voyage AI — strong retrieval embeddings. Verify IDs at docs.voyageai.com. */
export const VOYAGE_EMBEDDINGS: EmbeddingModel[] = [
	{
		id: 'voyage-3.5',
		label: 'voyage-3.5',
		provider: 'voyage',
		dimensions: 1024,
		costTier: 'low',
		recommended: true,
		blurb: 'Strong general-purpose embeddings at 1024-dim.'
	},
	{
		id: 'voyage-3.5-lite',
		label: 'voyage-3.5-lite',
		provider: 'voyage',
		dimensions: 1024,
		costTier: 'low',
		blurb: 'Lighter, cheaper Voyage model for high-volume indexing.'
	},
	{
		id: 'voyage-3-large',
		label: 'voyage-3-large',
		provider: 'voyage',
		dimensions: 1024,
		costTier: 'medium',
		blurb: "Voyage's highest-quality embeddings (configurable up to 2048-dim)."
	}
];

/** Local — the bundled MiniLM weights under static/models (no key, no network). */
export const LOCAL_EMBEDDINGS: EmbeddingModel[] = [
	{
		id: 'Xenova/all-MiniLM-L6-v2',
		label: 'MiniLM (all-MiniLM-L6-v2)',
		provider: 'local',
		dimensions: 384,
		costTier: 'free',
		recommended: true,
		blurb: 'Bundled MiniLM — runs fully in-browser, no key, no network.'
	}
];

export const EMBEDDING_MODELS: EmbeddingModel[] = [
	...LOCAL_EMBEDDINGS,
	...OPENAI_EMBEDDINGS,
	...VOYAGE_EMBEDDINGS
];

const EMBEDDINGS_BY_PROVIDER: Record<EmbeddingProvider, EmbeddingModel[]> = {
	local: LOCAL_EMBEDDINGS,
	openai: OPENAI_EMBEDDINGS,
	voyage: VOYAGE_EMBEDDINGS
};

export function embeddingModelsForProvider(provider: EmbeddingProvider): EmbeddingModel[] {
	return EMBEDDINGS_BY_PROVIDER[provider];
}

export function findEmbeddingModel(id: string): EmbeddingModel | undefined {
	return EMBEDDING_MODELS.find((m) => m.id === id);
}

export function defaultEmbeddingModelFor(provider: EmbeddingProvider): string {
	const list = EMBEDDINGS_BY_PROVIDER[provider];
	return (list.find((m) => m.recommended) ?? list[0]).id;
}
