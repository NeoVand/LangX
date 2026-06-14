/**
 * Static data + helpers for the Model lesson's interactive workshop.
 *
 * Everything here is driven by `ex0` — the cached GPT-2 forward pass that ships
 * with the embedded Transformer Explainer (prompt "Data visualization empowers
 * users to"). That means the lesson widgets show REAL model internals — the real
 * attention matrices, the real next-token logits — with no model download and no
 * inference. The big live workshop (the Explorer) is one click away for the full
 * thing; here we dissect the cached run stage by stage.
 *
 * Only the pure data `ex0` is imported (no onnxruntime / tokenizer), so this is
 * safe to render on the server. The sampling math is inlined below — it mirrors
 * the explorer's own getProbabilities exactly, so the numbers match the live tool.
 */
import { ex0 } from '$lib/transformer-explainer/constants/examples';

// ex0 is untyped legacy JS; pin the shape we use.
type Cell = number | null;
interface Ex0 {
	prompt: string;
	tokens: string[];
	tokenIds: number[];
	logits: number[];
	outputs: Record<string, { data: Cell[][] }>;
	probabilities: { tokenId: number; token: string; probability: number; rank: number }[];
}
const EX = ex0 as unknown as Ex0;

/** The running example shared by every widget. */
export const SAMPLE = {
	prompt: EX.prompt,
	tokens: EX.tokens, // ['Data', ' visualization', ' em', 'powers', ' users', ' to']
	tokenIds: EX.tokenIds
};

export const N_TOKENS = EX.tokens.length; // 6
export const N_HEADS = 12;
export const N_BLOCKS = 12;
export const D_MODEL = 768;
export const D_HEAD = D_MODEL / N_HEADS; // 64 → √dₖ = 8

/** Trim GPT-2's leading-space marker for clean display labels. */
export function cleanToken(t: string): string {
	const trimmed = t.replace(/^ /, '');
	return trimmed === '' ? '␣' : trimmed;
}

// ── Attention ─────────────────────────────────────────────────────────────
export type AttnStage = 'raw' | 'scaled' | 'masked' | 'softmax';

const STAGE_KEY: Record<AttnStage, string> = {
	raw: 'attn', // Q·Kᵀ dot products
	scaled: 'attn_scaled', // ÷ √dₖ
	masked: 'attn_masked', // causal: future positions blanked
	softmax: 'attn_softmax' // row-normalised weights (each row sums to 1)
};

/**
 * The 6×6 attention matrix for a given stage / head / block, straight from the
 * cached run. Masked cells are stored as `null`; we map them to −Infinity so the
 * Matrix renderer draws them as blanked-out (causally forbidden) cells.
 */
export function attnMatrix(stage: AttnStage, head: number, block = 0): number[][] {
	const key = `block_${block}_attn_head_${head}_${STAGE_KEY[stage]}`;
	const grid = EX.outputs[key]?.data ?? [];
	return grid.map((row) => row.map((v) => (v === null ? -Infinity : v)));
}

// ── Sampling ────────────────────────────────────────────────────────────────
export type Sampling = { type: 'top-k' | 'top-p'; value: number };
export interface TokenProb {
	tokenId: number;
	token: string;
	rank: number;
	probability: number;
	cumulativeProbability?: number;
	cutoffIndex?: number;
}

// The cached top-50 candidates by logit, with their decoded strings. (top-k and
// top-p both operate on exactly this set, so it's all we need.)
const idToToken = new Map<number, string>();
for (const p of EX.probabilities) idToToken.set(p.tokenId, p.token);

const TOP = 50;
const candidates = EX.logits
	.map((logit, tokenId) => ({ tokenId, logit }))
	.sort((a, b) => b.logit - a.logit)
	.slice(0, TOP);

function softmax(vals: number[]): number[] {
	const max = Math.max(...vals.filter((v) => Number.isFinite(v)));
	const exps = vals.map((v) => (Number.isFinite(v) ? Math.exp(v - max) : 0));
	const sum = exps.reduce((s, v) => s + v, 0) || 1;
	return exps.map((v) => v / sum);
}

/**
 * Recompute the next-token distribution over the cached logits for a given
 * temperature + sampling rule. Deterministic — the widget samples separately so
 * the bars stay stable between dice rolls.
 */
export function nextTokenDistribution(opts: {
	temperature: number;
	sampling: Sampling;
}): TokenProb[] {
	const scaled = candidates.map((c) => ({ ...c, scaled: c.logit / opts.temperature }));

	if (opts.sampling.type === 'top-k') {
		const k = opts.sampling.value;
		const probs = softmax(scaled.map((d, i) => (i < k ? d.scaled : -Infinity)));
		return scaled.map((d, i) => ({
			tokenId: d.tokenId,
			token: idToToken.get(d.tokenId) ?? '·',
			rank: i,
			probability: probs[i]
		}));
	}

	// top-p (nucleus): softmax over all, keep the smallest prefix covering p, renormalise.
	const probs = softmax(scaled.map((d) => d.scaled));
	const cum: number[] = [];
	probs.reduce((acc, pr, i) => (cum[i] = acc + pr), 0);
	let cutoff = cum.findIndex((c) => c >= opts.sampling.value);
	if (cutoff === -1) cutoff = cum.length - 1;
	const keptSum = probs.slice(0, cutoff + 1).reduce((s, v) => s + v, 0) || 1;
	return scaled.map((d, i) => ({
		tokenId: d.tokenId,
		token: idToToken.get(d.tokenId) ?? '·',
		rank: i,
		probability: i <= cutoff ? probs[i] / keptSum : 0,
		cumulativeProbability: cum[i],
		cutoffIndex: cutoff
	}));
}

/** Weighted random pick over a distribution (the "sample the next token" roll). */
export function sampleToken(dist: TokenProb[]): TokenProb {
	const total = dist.reduce((s, d) => s + d.probability, 0);
	let r = Math.random() * total;
	for (const d of dist) {
		r -= d.probability;
		if (r <= 0) return d;
	}
	return dist[0];
}

/** Argmax — the greedy / most-likely token. */
export function greedyToken(dist: TokenProb[]): TokenProb {
	return dist.reduce((best, d) => (d.probability > best.probability ? d : best), dist[0]);
}
