/// <reference lib="webworker" />
// The Mill, embodied as a Web Worker: a sandbox with no DOM and no network. It
// statically imports the dataframe toolkit so Arquero + simple-statistics live
// inside the isolate, then runs whatever analysis snippet the agent sends. This
// is our browser stand-in for the official code-interpreter middleware.

import { runUserCode, type Row } from './mill';

interface RunMsg {
	type: 'run';
	id: string;
	code: string;
	data: Row[];
}

self.addEventListener('message', async (ev: MessageEvent<RunMsg>) => {
	const msg = ev.data;
	if (msg.type !== 'run') return;
	const res = await runUserCode(msg.code, msg.data);
	try {
		postMessage({ type: 'result', id: msg.id, ...res });
	} catch {
		// A non-structured-cloneable return value (e.g. a function) — fall back to a
		// stringified form so the run never hangs waiting for a reply.
		postMessage({
			type: 'result',
			id: msg.id,
			ok: res.ok,
			error: res.error,
			value: safeString(res.value),
			elapsedMs: res.elapsedMs
		});
	}
});

function safeString(v: unknown): string {
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

postMessage({ type: 'boot' });
