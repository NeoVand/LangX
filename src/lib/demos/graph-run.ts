/**
 * runGraphTurn — a tiny, reusable driver for streaming a LangGraph run into the
 * <LiveGraph> component. Every LangGraph demo in the book uses it.
 *
 * What it gives every demo for free:
 *   • a synthetic `__start__` frame before the stream and `__end__` after it, so
 *     the START / END pills light up and the timeline stays in sync (the
 *     `updates` stream never yields those boundary nodes);
 *   • `seed` — carry the pre-pause snapshot across an interrupt()/resume so the
 *     post-resume frames keep earlier state instead of resetting to empty;
 *   • paced playback — `onUpdate` is AWAITED, so the caller can hold each frame
 *     on screen for a beat (instant code nodes would otherwise flash past);
 *   • the raw interrupt value, so a demo can pull out whatever payload it paused
 *     with (edits to review, a draft to approve, …).
 *
 * The graph's STATE shape is the demo's own: pass `empty()` to make a blank
 * snapshot and `merge(snap, update)` to fold each node's streamed update into it
 * (this is where the demo encodes its reducers — e.g. a concat for a list field).
 */

/** The minimum we need from a compiled LangGraph. */
export interface StreamableGraph {
	stream(
		input: unknown,
		options: { configurable: { thread_id: string }; streamMode: 'updates' }
	): Promise<AsyncIterable<Record<string, unknown>>>;
}

export interface RunGraphOptions<S> {
	/** A blank snapshot for a fresh turn. */
	empty: () => S;
	/** Fold one node's streamed update into the running snapshot (apply reducers). */
	merge: (snap: S, update: Record<string, unknown>) => void;
	/** Fired once per node (plus synthetic __start__/__end__) — may await to pace. */
	onUpdate?: (node: string, snapshot: S) => void | Promise<void>;
	/** Prior snapshot to continue from (resume after interrupt). */
	seed?: S;
	/** Copy a snapshot so each emitted frame is independent (default: shallow). */
	clone?: (s: S) => S;
	/** The stream key that signals a pause (default '__interrupt__'). */
	interruptKey?: string;
}

export interface RunGraphResult<S> {
	lastNode: string | null;
	interrupted: boolean;
	/** The raw value the graph paused with (demo decides how to read it). */
	interruptValue: unknown;
	snapshot: S;
}

export async function runGraphTurn<S>(
	graph: StreamableGraph,
	input: unknown,
	config: { configurable: { thread_id: string } },
	opts: RunGraphOptions<S>
): Promise<RunGraphResult<S>> {
	const clone = opts.clone ?? ((s: S) => ({ ...s }) as S);
	const interruptKey = opts.interruptKey ?? '__interrupt__';
	const snap: S = opts.seed ? clone(opts.seed) : opts.empty();

	let lastNode: string | null = null;
	let interrupted = false;
	let interruptValue: unknown = undefined;

	const emit = (node: string) => opts.onUpdate?.(node, clone(snap));

	// The `updates` stream never yields START — synthesise it on a fresh turn
	// (not on a resume) so the boundary nodes stay in sync with the run.
	if (!opts.seed) await emit('__start__');

	const stream = await graph.stream(input, { ...config, streamMode: 'updates' });
	for await (const chunk of stream) {
		for (const [key, value] of Object.entries(chunk)) {
			if (key === interruptKey) {
				interrupted = true;
				interruptValue = value;
				continue;
			}
			lastNode = key;
			merge(snap, value as Record<string, unknown>);
			await emit(key);
		}
	}

	// …and it never yields the terminal node either — synthesise END when the
	// graph actually finished (not when it paused at an interrupt).
	if (!interrupted) {
		lastNode = '__end__';
		await emit('__end__');
	}

	return { lastNode, interrupted, interruptValue, snapshot: snap };

	function merge(s: S, update: Record<string, unknown>) {
		opts.merge(s, update);
	}
}
