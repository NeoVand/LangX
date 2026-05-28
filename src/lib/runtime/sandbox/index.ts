import { browser } from '$app/environment';

export interface SandboxResult {
	ok: boolean;
	value?: unknown;
	error?: string;
	elapsedMs?: number;
}

export class JsSandbox {
	private worker: Worker | null = null;

	private ensure() {
		if (!browser) throw new Error('JsSandbox is browser-only.');
		if (this.worker) return;
		this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	}

	async run(
		code: string,
		context: Record<string, unknown> = {},
		timeoutMs = 5000
	): Promise<SandboxResult> {
		this.ensure();
		const id = Math.random().toString(36).slice(2, 10);
		return new Promise((resolve) => {
			const onMsg = (ev: MessageEvent) => {
				const data = ev.data as { type: string; id?: string; result?: unknown; message?: string; elapsedMs?: number };
				if (data.id !== id) return;
				if (data.type === 'done') {
					this.worker!.removeEventListener('message', onMsg);
					resolve({ ok: true, value: data.result, elapsedMs: data.elapsedMs });
				} else if (data.type === 'error') {
					this.worker!.removeEventListener('message', onMsg);
					resolve({ ok: false, error: data.message });
				}
			};
			this.worker!.addEventListener('message', onMsg);
			this.worker!.postMessage({ type: 'run', id, code, context, timeoutMs });
		});
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
	}
}
