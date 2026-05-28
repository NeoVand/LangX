import type { TraceEvent } from '$lib/runtime/tracer/types';

export interface LessonRuntime {
	events: TraceEvent[];
	running: boolean;
	error: string | null;
}

export function createLessonRuntime(): LessonRuntime {
	return $state({
		events: [],
		running: false,
		error: null
	});
}

export function pushEvent(rt: LessonRuntime, ev: TraceEvent) {
	rt.events.push(ev);
}

export function resetRuntime(rt: LessonRuntime) {
	rt.events.length = 0;
	rt.running = false;
	rt.error = null;
}
