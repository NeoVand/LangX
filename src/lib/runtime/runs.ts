import { browser } from '$app/environment';
import { app } from '$lib/state/app.svelte';
import { resolveProvider } from './llm';
import { getRun, putRun, type RunRecord } from '$lib/storage/dexie';

export interface CacheKey {
	demoId: string;
}

/**
 * Returns the most recent successful run for a demo, or null if no run is cached.
 * Demos call this on mount to "rehydrate" their last visible state so a returning
 * learner sees the chapter exactly where they left it, without auto-burning credits.
 */
export async function loadCachedRun<T>(
	key: CacheKey
): Promise<{ payload: T; meta: Pick<RunRecord, 'provider' | 'model' | 'updated' | 'durationMs'> } | null> {
	if (!browser) return null;
	const row = await getRun(key.demoId);
	if (!row) return null;
	return {
		payload: row.payload as T,
		meta: {
			provider: row.provider,
			model: row.model,
			updated: row.updated,
			durationMs: row.durationMs
		}
	};
}

export async function saveRun<T>(key: CacheKey, payload: T, opts: { durationMs: number; modelLabel?: string }) {
	if (!browser) return;
	const provider = resolveProvider();
	const model = opts.modelLabel ?? modelForProvider(provider);
	await putRun({
		demoId: key.demoId,
		provider,
		model,
		durationMs: opts.durationMs,
		payload
	});
}

function modelForProvider(provider: string): string {
	if (provider === 'anthropic') return 'claude-haiku-4-5';
	if (provider === 'openai') return 'gpt-4o-mini';
	if (provider === 'groq') return 'llama-3.3-70b-versatile';
	if (provider === 'transformers-js') return app.tjsModel;
	return 'unknown';
}

/**
 * Wraps an async demo run: invokes runner, captures duration, persists payload.
 * Re-throws on error so the UI can surface it.
 */
export async function withRunCache<T>(
	key: CacheKey,
	runner: () => Promise<T>,
	opts: { modelLabel?: string } = {}
): Promise<T> {
	const t0 = performance.now();
	const payload = await runner();
	await saveRun(key, payload, { durationMs: performance.now() - t0, modelLabel: opts.modelLabel });
	return payload;
}
