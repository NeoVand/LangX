/// <reference lib="webworker" />

interface RunMsg {
	type: 'run';
	id: string;
	code: string;
	context?: Record<string, unknown>;
	timeoutMs?: number;
}

self.addEventListener('message', (ev: MessageEvent<RunMsg>) => {
	const msg = ev.data;
	if (msg.type !== 'run') return;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let aborted = false;
	try {
		const ctxKeys = Object.keys(msg.context ?? {});
		const ctxValues = ctxKeys.map((k) => (msg.context ?? {})[k]);
		const fn = new Function(...ctxKeys, msg.code);
		const start = Date.now();
		timer = setTimeout(() => {
			aborted = true;
			postMessage({ type: 'error', id: msg.id, message: 'Timeout' });
		}, msg.timeoutMs ?? 5000);
		const out = fn(...ctxValues);
		const respond = (value: unknown) => {
			if (aborted) return;
			if (timer) clearTimeout(timer);
			postMessage({
				type: 'done',
				id: msg.id,
				result: value,
				elapsedMs: Date.now() - start
			});
		};
		if (out instanceof Promise) {
			out
				.then(respond)
				.catch((err) =>
					postMessage({ type: 'error', id: msg.id, message: (err as Error).message })
				);
		} else {
			respond(out);
		}
	} catch (err) {
		if (timer) clearTimeout(timer);
		postMessage({ type: 'error', id: msg.id, message: (err as Error).message });
	}
});

postMessage({ type: 'boot' });
