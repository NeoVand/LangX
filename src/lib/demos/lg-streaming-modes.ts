/**
 * "Watch the AI paint" — one graph run, observed through every streaming lens at
 * once, with an OPTIONAL refine loop where the model sees its own drawing.
 *
 *   loop off:  START → narrate → paint → END
 *   loop on:   START → narrate → paint → (good enough?) ─┬─ no → critique → paint
 *                                                        └─ yes ──────────────▶ END
 *
 * • `narrate` calls the model for a caption; its tokens stream on **'messages'**.
 * • `paint` asks the model to DRAW the topic as a pixel grid (that call is tagged
 *   `nostream`, so it stays off the messages lens), then streams the grid
 *   cell-by-cell with `config.writer(...)` → **'custom'** (this paints the canvas).
 * • `critique` (loop only) shows the model its OWN drawing — as an image for vision
 *   models, or as the grid text otherwise — and asks for fixes; `paint` redraws.
 * • The same run also yields **'values'** and **'updates'**. We ask for them all at
 *   once with an ARRAY streamMode; each chunk arrives as a `[mode, data]` tuple.
 *
 * This is the exact source the demo runs.
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import type { LangGraphRunnableConfig } from '@langchain/langgraph/web';
import { HumanMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';

/** The canvas is GRID×GRID. */
export const GRID = 13;
const C = (GRID - 1) / 2;

/** Single-char colour codes the model draws with → hex (or null for transparent). */
const PALETTE: Record<string, string | null> = {
	'.': null,
	K: '#1c1f26', W: '#f2f4f7', R: '#e8536b', O: '#f2994a', Y: '#f2c14e',
	G: '#4caf6e', B: '#4a7bd4', C: '#5ec8d8', P: '#e87fb0', N: '#8a5a3a', S: '#8b929c'
};
const CODES = Object.keys(PALETTE).join('');

/** A worked example given to the model so it matches the format + a quality bar. */
const EXAMPLE = [
	'.............',
	'..RRR...RRR..',
	'.RRRRR.RRRRR.',
	'.RRRRRRRRRRR.',
	'.RRRRRRRRRRR.',
	'..RRRRRRRRR..',
	'...RRRRRRR...',
	'....RRRRR....',
	'.....RRR.....',
	'......R......',
	'.............',
	'.............',
	'.............'
];
const FALLBACK = [
	'.............', '...YYYYYYY...', '..YYYYYYYYY..', '.YYYYYYYYYYY.',
	'.YYKYYYYYKYY.', '.YYYYYYYYYYY.', '.YYYYYYYYYYY.', '.YYKYYYYYKYY.',
	'.YYYKKKKKYYY.', '.YYYYYYYYYYY.', '..YYYYYYYYY..', '...YYYYYYY...', '.............'
];

export interface Pixel {
	x: number;
	y: number;
	color: string;
	i: number;
	total: number;
}
export type CustomEvent = ({ type: 'pixel' } & Pixel) | { type: 'clear'; pass: number };

function parseGrid(text: string): string[] {
	const re = new RegExp(`^[${CODES.replace('.', '\\.')}]+$`, 'i');
	const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 6 && re.test(l));
	const rows = lines.slice(0, GRID).map((l) => l.toUpperCase().slice(0, GRID).padEnd(GRID, '.'));
	while (rows.length < GRID) rows.push('.'.repeat(GRID));
	const filled = rows.join('').replace(/\./g, '').length;
	return filled >= 8 ? rows : FALLBACK;
}
function gridToPixels(rows: string[]): Pixel[] {
	const out: Omit<Pixel, 'i' | 'total'>[] = [];
	rows.forEach((row, y) => [...row].forEach((ch, x) => {
		const color = PALETTE[ch.toUpperCase()];
		if (color) out.push({ x, y, color });
	}));
	return out.map((p, i) => ({ ...p, i, total: out.length }));
}
/** Extract only the visible text (skip extended-thinking blocks). */
function textOnly(r: { content?: unknown }): string {
	const c = r?.content;
	if (typeof c === 'string') return c;
	if (Array.isArray(c)) return c.filter((p) => (p as { type?: string })?.type === 'text').map((p) => (p as { text?: string }).text ?? '').join('');
	return '';
}
/** Render a grid to a scaled-up PNG data URL (browser only; null in Node). */
async function gridToDataUrl(rows: string[]): Promise<string | null> {
	if (typeof OffscreenCanvas === 'undefined') return null;
	const scale = 16;
	const cv = new OffscreenCanvas(GRID * scale, GRID * scale);
	const ctx = cv.getContext('2d');
	if (!ctx) return null;
	ctx.fillStyle = '#0f1217';
	ctx.fillRect(0, 0, cv.width, cv.height);
	rows.forEach((row, y) => [...row].forEach((ch, x) => {
		const color = PALETTE[ch.toUpperCase()];
		if (color) { ctx.fillStyle = color; ctx.fillRect(x * scale, y * scale, scale, scale); }
	}));
	const blob = await cv.convertToBlob({ type: 'image/png' });
	return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
}

function drawPrompt(topic: string, feedback: string): string {
	return (
		`You are drawing ${GRID}×${GRID} pixel art. Columns x=0..${GRID - 1} left→right, rows y=0..${GRID - 1} top→bottom; centre is (${C},${C}).\n` +
		`One character per cell. Colour codes: . transparent · K black · W white · R red · O orange · Y yellow · G green · B blue · C cyan · P pink · N brown · S gray.\n` +
		`Guidelines: picture the silhouette first; keep shapes BOLD and CENTRED; use symmetry where natural; leave background as '.'.\n` +
		`Example (a heart):\n${EXAMPLE.join('\n')}\n\n` +
		`Now draw: "${topic}".` +
		(feedback ? ` Improve your previous attempt using this feedback: ${feedback}\n` : '\n') +
		`Output EXACTLY ${GRID} lines of EXACTLY ${GRID} characters — no spaces, no labels, no code fences.`
	);
}

const PaintState = Annotation.Root({
	topic: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	caption: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	grid: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	feedback: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	pass: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
	painted: Annotation<boolean>({ reducer: (_, b) => b, default: () => false })
});

export interface PaintOptions {
	/** Add the see-its-own-work refine loop. */
	loop?: boolean;
	/** Total paint passes when looping (default 2 = initial + 1 refine). */
	passes?: number;
	/** Let the model use extended thinking before drawing/critiquing. */
	thinking?: boolean;
	/** Critique using the rendered image (vision models) vs the grid text. */
	vision?: boolean;
}

/** Build the paint graph. Its shape depends on whether the refine loop is on. */
export async function buildPaintGraph(opts: PaintOptions = {}) {
	const passes = Math.max(1, opts.passes ?? 2);
	// Thinking turns the dial up: reasoning models (GPT-5.x) get high effort; Anthropic/Gemini
	// get extended thinking. Off → low effort so it starts fast. ('low' is the safe floor — some
	// models, e.g. GPT-5.5, reject 'minimal'/'none', so we keep the caption at 'low' too.)
	const effort = opts.thinking ? 'high' : 'low';
	const writer = await getModel({ maxTokens: 40, reasoningEffort: 'low' });
	const artist = await getModel({ maxTokens: 600, thinking: opts.thinking, reasoningEffort: effort });
	const critic = await getModel({ maxTokens: 200, thinking: opts.thinking, reasoningEffort: effort });

	const g = new StateGraph(PaintState)
		// MODEL node — caption. Its tokens stream as 'messages'.
		.addNode('narrate', async (s) => {
			const text = textOnly(await writer.invoke(`In ONE short, playful sentence, announce that you're painting "${s.topic}". Reply with only the sentence.`));
			return { caption: text.trim() || `Painting ${s.topic}…` };
		})
		// MODEL + CODE node — the model draws; we stream the drawing as 'custom'.
		.addNode('paint', async (s, config: LangGraphRunnableConfig) => {
			const rows = parseGrid(textOnly(await artist.invoke(drawPrompt(s.topic, s.feedback), { tags: ['nostream'] })));
			config.writer?.({ type: 'clear', pass: s.pass }); // refine passes repaint a fresh canvas
			for (const p of gridToPixels(rows)) {
				config.writer?.({ type: 'pixel', ...p });
				await new Promise((r) => setTimeout(r, 13));
			}
			return { grid: rows.join('\n'), painted: true, pass: s.pass + 1, feedback: '' };
		});

	if (!opts.loop) {
		return g.addEdge(START, 'narrate').addEdge('narrate', 'paint').addEdge('paint', END).compile();
	}

	// CODE/MODEL node — show the model its OWN drawing and ask for fixes.
	return g
		.addNode('critique', async (s) => {
			const ask =
				`This is your pixel-art drawing of "${s.topic}". In 1–2 short, concrete instructions, ` +
				`say how to make it more recognisable (proportions, missing features, symmetry, colour). Be specific and brief.`;
			const url = opts.vision ? await gridToDataUrl(s.grid.split('\n')) : null;
			const msg = url
				? new HumanMessage({ content: [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url } }] })
				: new HumanMessage(`Here is your ${GRID}×${GRID} grid for "${s.topic}":\n${s.grid}\n\n${ask}`);
			const feedback = textOnly(await critic.invoke([msg], { tags: ['nostream'] }));
			return { feedback };
		})
		.addEdge(START, 'narrate')
		.addEdge('narrate', 'paint')
		// loop until we've used all passes; the conditional edge IS the refine loop.
		.addConditionalEdges('paint', (s) => (s.pass < passes ? 'critique' : END), ['critique', END])
		.addEdge('critique', 'paint')
		.compile();
}

export type PaintGraph = Awaited<ReturnType<typeof buildPaintGraph>>;

export interface PaintSnapshot {
	topic: string;
	caption: string;
	grid: string;
	feedback: string;
	pass: number;
	painted: boolean;
}
export interface StreamHandlers {
	onValues?: (state: PaintSnapshot) => void;
	onUpdates?: (node: string, delta: Record<string, unknown>) => void;
	onMessages?: (token: string, node: string) => void;
	onCustom?: (event: CustomEvent) => void;
	onNode?: (node: string) => void | Promise<void>;
}

/** Stream ONE run through every lens at once (array streamMode → [mode, data] tuples). */
export async function runPaintStream(
	graph: PaintGraph,
	topic: string,
	handlers: StreamHandlers
): Promise<PaintSnapshot> {
	let last: PaintSnapshot = { topic, caption: '', grid: '', feedback: '', pass: 0, painted: false };
	const stream = await graph.stream({ topic }, { streamMode: ['values', 'updates', 'messages', 'custom'] });
	for await (const [mode, data] of stream as AsyncIterable<[string, unknown]>) {
		if (mode === 'values') {
			last = data as PaintSnapshot;
			handlers.onValues?.(last);
		} else if (mode === 'updates') {
			for (const [node, delta] of Object.entries(data as Record<string, Record<string, unknown>>)) {
				handlers.onUpdates?.(node, delta);
				await handlers.onNode?.(node);
			}
		} else if (mode === 'messages') {
			const [chunk, meta] = data as [{ content?: unknown }, { langgraph_node?: string }];
			const token = textOnly(chunk);
			if (token) handlers.onMessages?.(token, meta?.langgraph_node ?? '?');
		} else if (mode === 'custom') {
			handlers.onCustom?.(data as CustomEvent);
		}
	}
	return last;
}
