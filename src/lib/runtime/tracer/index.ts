import { makeEvent, type TraceEvent, type TraceEventKind } from './types';

export type TraceListener = (ev: TraceEvent) => void;

export class Tracer {
	private listeners: Set<TraceListener> = new Set();
	private depth = 0;

	subscribe(fn: TraceListener) {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	emit(kind: TraceEventKind, label: string, data?: Record<string, unknown>) {
		const ev = makeEvent(kind, label, data, this.depth);
		for (const l of this.listeners) l(ev);
		return ev;
	}

	push() {
		this.depth += 1;
	}

	pop() {
		this.depth = Math.max(0, this.depth - 1);
	}

	async wrap<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
		this.emit('node_start', label);
		this.push();
		try {
			const out = await fn();
			this.pop();
			this.emit('node_end', label);
			return out;
		} catch (err) {
			this.pop();
			this.emit('error', label, { message: (err as Error).message });
			throw err;
		}
	}
}

export function createTracer() {
	return new Tracer();
}

export type { TraceEvent };
