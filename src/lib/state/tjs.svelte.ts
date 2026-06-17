/**
 * Shared, reactive progress for the in-browser (Transformers.js) model download.
 *
 * The model worker streams `progress` events (per-file download %, then a final
 * "ready"). `WorkerHost` (runtime/llm/transformers-js.ts) funnels them here from
 * the main thread, and a single global <ModelDownloadBanner> reads this state — so
 * a no-key user who runs a demo sees a download bar instead of a silent hang,
 * without wiring progress into every demo.
 */

export interface TjsDownloadState {
	/** A download/load is currently in flight. */
	active: boolean;
	/** Model id being fetched (e.g. onnx-community/Qwen3-4B-ONNX). */
	modelId: string | null;
	/** Most recent file being fetched. */
	file: string | null;
	/** 0–100, best-effort across files. */
	percent: number;
	/** Raw status from transformers.js: initiate · download · progress · done · ready. */
	status: string | null;
}

export const tjsDownload = $state<TjsDownloadState>({
	active: false,
	modelId: null,
	file: null,
	percent: 0,
	status: null
});

/** Called by WorkerHost for each transformers.js progress event. */
export function reportTjsProgress(
	modelId: string,
	p: { status?: string; progress?: number; file?: string }
) {
	tjsDownload.modelId = modelId;
	if (p.status) tjsDownload.status = p.status;
	if (p.file) tjsDownload.file = p.file;
	if (typeof p.progress === 'number') tjsDownload.percent = Math.round(p.progress);
	// transformers.js fires "done"/"ready" per-file and at the end; treat anything
	// that isn't an explicit finish as an in-flight download.
	tjsDownload.active = p.status !== 'ready';
}

/** Called when the model is fully loaded (worker reported ready). */
export function finishTjsDownload() {
	tjsDownload.active = false;
	tjsDownload.percent = 100;
}
