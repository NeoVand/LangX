/**
 * Shared contract between extracted demo modules (`src/lib/demos/<lesson>.ts`)
 * and the `DemoFrame` UI. A demo's run function receives an `onStep` callback and
 * emits one step per meaningful turn (model call, tool result, state mutation),
 * which the page collects into an array bound to `DemoFrame`'s Steps tab.
 */
export type DemoStepKind = 'model' | 'tool' | 'state' | 'note';

export interface DemoStep {
	label: string;
	kind: DemoStepKind;
	/** Full payload, shown when the step is expanded. */
	payload?: unknown;
	/** Optional one-line summary shown inline. */
	detail?: string;
}

export type OnStep = (step: DemoStep) => void;
