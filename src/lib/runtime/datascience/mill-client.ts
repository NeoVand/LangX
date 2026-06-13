import { browser } from '$app/environment';
import type { Row, MillResult } from './mill';

/**
 * The Mill's main-thread handle. Spawns the compute worker on first use and
 * relays one analysis snippet at a time. A client-side timeout guards against a
 * runaway snippet pegging the worker — the worker is isolated, so the main
 * thread (and the UI) stay responsive regardless.
 */
export class Mill {
	private worker: Worker | null = null;

	private ensure() {
		if (!browser) throw new Error('The Mill is browser-only.');
		if (this.worker) return;
		this.worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
	}

	run(code: string, data: Row[], timeoutMs = 8000): Promise<MillResult> {
		this.ensure();
		const id = Math.random().toString(36).slice(2, 10);
		return new Promise((resolve) => {
			const cleanup = () => {
				clearTimeout(timer);
				this.worker?.removeEventListener('message', onMsg);
			};
			const timer = setTimeout(() => {
				cleanup();
				resolve({
					ok: false,
					error: `The Mill timed out after ${timeoutMs / 1000}s — simplify the computation.`
				});
			}, timeoutMs);
			const onMsg = (ev: MessageEvent) => {
				const d = ev.data as { type?: string; id?: string } & MillResult;
				if (d?.type !== 'result' || d.id !== id) return;
				cleanup();
				resolve({ ok: d.ok, value: d.value, error: d.error, elapsedMs: d.elapsedMs });
			};
			this.worker!.addEventListener('message', onMsg);
			this.worker!.postMessage({ type: 'run', id, code, data });
		});
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
	}
}
