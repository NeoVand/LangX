/**
 * The AI Crest Designer — a human-in-the-loop showcase. The agent designs a
 * heraldic crest ONE TRAIT AT A TIME (palette → pattern → charge → motto), and
 * pauses at every step so a human can approve, shuffle, or edit the proposal:
 *
 *   START → propose → gate (⏸ interrupt) → (more traits?) ─┬─ yes → propose …
 *                                                          └─ no  → assemble → END
 *
 * • `gate` calls `interrupt(proposal)`, which pauses the run and surfaces the
 *   proposed trait. The run only continues when you resume with
 *   `Command({ resume: decision })` — the value `interrupt()` then returns.
 * • Resuming with `approve`/`edit` records the trait and advances; `shuffle`
 *   loops back to `propose` for a fresh suggestion (excluding the rejected one).
 * • A CHECKPOINTER is what makes the pause survivable; a CONDITIONAL EDGE loops
 *   until every trait is decided. (interrupt() must be called synchronously at
 *   the top of the node — see src/lib/runtime/async-context.ts for the browser.)
 *
 * This is the exact source the demo runs.
 */
import { Annotation, StateGraph, MemorySaver, START, END, interrupt } from '@langchain/langgraph/web';
import { getModel } from '$lib/runtime/llm';
import { runGraphTurn, type StreamableGraph } from './graph-run';

export type Trait = 'palette' | 'pattern' | 'charge' | 'motto';
export const TRAITS: Trait[] = ['palette', 'pattern', 'charge', 'motto'];
export const TRAIT_LABEL: Record<Trait, string> = {
	palette: 'colour palette',
	pattern: 'shield division (pattern)',
	charge: 'central emblem (charge)',
	motto: 'motto'
};

/** Heraldic tinctures → CSS colours (deterministic rendering, no AI-art guesswork). */
export const PALETTES: Record<string, { primary: string; secondary: string }> = {
	'midnight & gold': { primary: '#1f2d5a', secondary: '#d9b44a' },
	'crimson & silver': { primary: '#8a1b2e', secondary: '#cdd2d8' },
	'forest & gold': { primary: '#1c4a2e', secondary: '#d9b44a' },
	'royal purple & silver': { primary: '#46235e', secondary: '#cdd2d8' },
	'slate & copper': { primary: '#2b2f36', secondary: '#c47b3c' },
	'teal & cream': { primary: '#155e63', secondary: '#e9e2c9' },
	'cobalt & steel': { primary: '#1b3a8a', secondary: '#aab4c2' }
};
/** Shield divisions, rendered in Crest.svelte. */
export const PATTERNS: string[] = ['solid', 'per pale', 'per fess', 'chevron', 'bordure', 'quarterly'];
/** Charges (central emblem) → emoji. */
export const CHARGES: Record<string, string> = {
	owl: '🦉', lion: '🦁', eagle: '🦅', dragon: '🐉', wolf: '🐺', fox: '🦊',
	stag: '🦌', raven: '🐦‍⬛', key: '🔑', anchor: '⚓', star: '⭐', crown: '👑',
	book: '📖', sword: '🗡️', tower: '🏰', gear: '⚙️', bolt: '⚡', flame: '🔥'
};
export const OPTIONS: Record<Exclude<Trait, 'motto'>, string[]> = {
	palette: Object.keys(PALETTES),
	pattern: PATTERNS,
	charge: Object.keys(CHARGES)
};

export interface Proposal {
	trait: Trait;
	value: string;
	/** Pickable alternatives for "edit" (empty for the free-text motto). */
	options: string[];
}
export interface CrestSnapshot {
	theme: string;
	step: number;
	palette: string;
	pattern: string;
	charge: string;
	motto: string;
	proposal: Proposal | null;
	blazon: string;
}
export interface CrestDecision {
	action: 'approve' | 'shuffle' | 'edit';
	value?: string;
}

const CrestState = Annotation.Root({
	theme: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	step: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
	palette: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	pattern: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	charge: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	motto: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	proposal: Annotation<Proposal | null>({ reducer: (_, b) => b, default: () => null }),
	rejected: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	blazon: Annotation<string>({ reducer: (_, b) => b, default: () => '' })
});

function textOf(r: { content?: unknown }): string {
	const c = r?.content;
	return typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? '').join('') : '';
}
function clean(s: string): string {
	return s.trim().replace(/^["'“”]+|["'“”.]+$/g, '').replace(/\s+/g, ' ');
}

/** Ask the model to propose a themed value for one trait (validated against the options). */
async function suggest(
	trait: Trait,
	theme: string,
	exclude: string,
	model: Awaited<ReturnType<typeof getModel>>
): Promise<string> {
	if (trait === 'motto') {
		const p = `Theme: "${theme}". Invent a short, punchy guild or house motto (2 to 5 words; mock-Latin is welcome).${exclude ? ` Make it clearly different from: "${exclude}".` : ''} Reply with ONLY the motto — no quotes, no explanation.`;
		const out = clean(textOf(await model.invoke(p))).slice(0, 42);
		return out || 'Ever Onward';
	}
	const opts = OPTIONS[trait].filter((o) => o !== exclude);
	const p = `Theme: "${theme}". From this list, choose the ${TRAIT_LABEL[trait]} that best fits the theme: ${opts.join(', ')}. Reply with ONLY the exact chosen name from the list.`;
	const said = clean(textOf(await model.invoke(p))).toLowerCase();
	return opts.find((o) => said.includes(o.toLowerCase())) ?? opts[0];
}

/** Build (and compile) the crest-designer graph. */
export async function buildCrestGraph(checkpointer: MemorySaver) {
	const model = await getModel({ temperature: 0.7, maxTokens: 24 });

	return new StateGraph(CrestState)
		// MODEL node — propose the next trait's value.
		.addNode('propose', async (s) => {
			const trait = TRAITS[s.step];
			const value = await suggest(trait, s.theme, s.rejected, model);
			return { proposal: { trait, value, options: trait === 'motto' ? [] : OPTIONS[trait] } };
		})
		// INTERRUPT node — pause for the human, then apply their decision.
		.addNode('gate', (s) => {
			const d = interrupt(s.proposal) as CrestDecision; // pauses; resume value returns here
			const trait = s.proposal!.trait;
			if (d.action === 'shuffle') {
				return { proposal: null, rejected: s.proposal!.value }; // re-propose, avoid this one
			}
			const chosen = d.action === 'edit' && d.value ? d.value : s.proposal!.value;
			return { [trait]: chosen, step: s.step + 1, proposal: null, rejected: '' };
		})
		// CODE node — compose the final blazon once every trait is decided.
		.addNode('assemble', (s) => ({
			blazon: `${s.palette}; ${s.pattern}; a ${s.charge} — “${s.motto}”`
		}))
		.addEdge(START, 'propose')
		.addEdge('propose', 'gate')
		// loop until all traits are decided (also re-loops on "shuffle", which doesn't advance step).
		.addConditionalEdges('gate', (s) => (s.step >= TRAITS.length ? 'assemble' : 'propose'), ['propose', 'assemble'])
		.addEdge('assemble', END)
		.compile({ checkpointer });
}

export type CrestGraph = Awaited<ReturnType<typeof buildCrestGraph>>;

export interface CrestTurnResult {
	interrupted: boolean;
	proposal: Proposal | null;
	snapshot: CrestSnapshot;
	lastNode: string | null;
}

function emptyCrest(): CrestSnapshot {
	return { theme: '', step: 0, palette: '', pattern: '', charge: '', motto: '', proposal: null, blazon: '' };
}
function cloneCrest(s: CrestSnapshot): CrestSnapshot {
	return { ...s, proposal: s.proposal ? { ...s.proposal } : null };
}
function mergeCrest(s: CrestSnapshot, u: Record<string, unknown>) {
	const up = u as Partial<CrestSnapshot>;
	for (const k of ['theme', 'palette', 'charge', 'motto', 'blazon'] as const) {
		if (typeof up[k] === 'string') s[k] = up[k] as string;
	}
	if (typeof up.pattern === 'string') s.pattern = up.pattern;
	if (typeof up.step === 'number') s.step = up.step;
	if ('proposal' in up) s.proposal = (up.proposal as Proposal | null) ?? null;
}

/**
 * Run one turn into the live graph. `input` is `{ theme }` on the first call, or a
 * `Command({ resume: decision })` to continue past the gate. Pass `seed` (the
 * pre-pause snapshot) on resumes so accumulated traits carry across the pause.
 * Returns whether it paused at an interrupt and the proposal awaiting review.
 */
export async function runCrestTurn(
	graph: CrestGraph,
	input: unknown,
	config: { configurable: { thread_id: string } },
	onUpdate?: (node: string, snapshot: CrestSnapshot) => void | Promise<void>,
	seed?: CrestSnapshot
): Promise<CrestTurnResult> {
	const r = await runGraphTurn<CrestSnapshot>(graph as unknown as StreamableGraph, input, config, {
		empty: emptyCrest,
		merge: mergeCrest,
		clone: cloneCrest,
		onUpdate,
		seed
	});
	const proposal = (r.interruptValue as { value?: Proposal }[] | undefined)?.[0]?.value ?? null;
	return { interrupted: r.interrupted, proposal, snapshot: r.snapshot, lastNode: r.lastNode };
}
