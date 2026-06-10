/**
 * "The deck factory" — orchestrator-worker with Send, building a real slide deck.
 *
 *   START → plan ──Send×N──▶ build (parallel) ──▶ review ──Send×M──▶ revise (parallel) → END
 *                                                    └───────── all good ─────────────▶ END
 *
 * • `plan` (model node) reads the topic + your N slide-agent prompts and returns one
 *   BRIEF per slide plus a shared design THEME, so the deck looks like one deck.
 * • A conditional edge returns `new Send('build', payload)` per brief — the graph
 *   fans out into N parallel `build` branches AT RUNTIME. Each branch sees ONLY its
 *   payload, not the whole state. Every slide is built on the same fixed SCAFFOLD
 *   (grid zones + typographic scale), so the model designs inside a frame.
 * • Every branch writes `drafts: [one slide]`; the channel's REDUCER concatenates
 *   the parallel writes (fan-in). Finish order is non-deterministic — it's a race.
 * • `review` fires once, after ALL branches land (the runtime's barrier): one model
 *   call critiques the WHOLE deck — hierarchy, crowding, repetition across slides —
 *   and writes concrete RECOMMENDATIONS for EVERY slide. Then it fans out AGAIN,
 *   one `Send('revise', …)` per slide, to apply the feedback in parallel.
 *   (Fanning out from a single fan-in node is safe — it fires once.)
 *
 * This is the exact source the demo runs.
 */
import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph/web';
import type { LangGraphRunnableConfig } from '@langchain/langgraph/web';
import { getModel } from '$lib/runtime/llm';

/** What `plan` produces for each slide agent. */
export interface SlideBrief {
	idx: number;
	title: string;
	directive: string;
}
/** The shared design system `plan` invents so N parallel slides match. */
export interface DeckTheme {
	bg: string;
	ink: string;
	accent: string;
	muted: string;
	mood: string;
}
export interface SlideDraft {
	idx: number;
	title: string;
	/** The model's markup (scaffold filled in) — what `revise` edits. */
	markup: string;
	/** markup wrapped with the scaffold stylesheet — what the iframe renders. */
	html: string;
}
/** The reviewer's instruction for one slide that needs another pass. */
export interface Recommendation {
	idx: number;
	recommendations: string;
}

const FALLBACK_THEME: DeckTheme = {
	bg: '#101418',
	ink: '#f2f4f7',
	accent: '#5ec8d8',
	muted: '#9aa3ad',
	mood: 'clean and confident'
};

const DeckState = Annotation.Root({
	topic: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	briefs: Annotation<SlideBrief[]>({ reducer: (_, b) => b, default: () => [] }),
	theme: Annotation<DeckTheme>({
		reducer: (_, b) => b,
		default: () => FALLBACK_THEME
	}),
	// PARALLEL writes land here — the reducer concatenates them (the fan-in).
	drafts: Annotation<SlideDraft[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
	recs: Annotation<Recommendation[]>({ reducer: (_, b) => b, default: () => [] }),
	// `review` writes the good slides; parallel `revise` branches add the rest.
	slides: Annotation<SlideDraft[]>({ reducer: (a, b) => [...a, ...b], default: () => [] })
});

/** The state slice a Send delivers to one `build` branch — its ENTIRE world. */
export interface BuildPayload {
	idx: number;
	total: number;
	brief: SlideBrief;
	theme: DeckTheme;
	agentPrompt: string;
}
/** The state slice a Send delivers to one `revise` branch. */
export interface RevisePayload {
	idx: number;
	total: number;
	draft: SlideDraft;
	recommendations: string;
	theme: DeckTheme;
}

export type DeckEvent =
	| { type: 'briefed'; briefs: SlideBrief[]; theme: DeckTheme }
	| { type: 'building'; idx: number; title: string }
	| { type: 'built'; idx: number; html: string }
	| { type: 'reviewed'; idx: number; recommendations: string }
	| { type: 'revising'; idx: number }
	| { type: 'revised'; idx: number; html: string };

// ── The enforced scaffold ─────────────────────────────────────────────────────
// Every slide is a 960×540 canvas with fixed zones (kicker / title / body / foot),
// a typographic scale, and the deck theme as CSS variables. The model fills the
// zones; it may only add styles for NEW classes inside .body. Structure is ours.

function scaffoldCss(t: DeckTheme): string {
	return `:root{--bg:${t.bg};--ink:${t.ink};--accent:${t.accent};--muted:${t.muted}}
*{box-sizing:border-box}
.slide{width:960px;height:540px;display:flex;flex-direction:column;background:linear-gradient(135deg,var(--bg),color-mix(in srgb,var(--bg) 78%,#000));color:var(--ink);font-family:'Avenir Next','Segoe UI',system-ui,-apple-system,sans-serif;padding:44px 60px 30px;position:relative;overflow:hidden}
.slide::before{content:'';position:absolute;left:0;top:0;bottom:0;width:7px;background:var(--accent)}
.kicker{font-size:14px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);font-weight:600;margin:0 0 10px;animation:rise .5s ease both}
h1{font-size:50px;line-height:1.06;font-weight:700;margin:0 0 6px;max-width:86%;animation:rise .5s .06s ease both}
.hook{font-size:21px;color:var(--muted);margin:0;animation:rise .5s .12s ease both}
.body{flex:1;display:flex;align-items:center;gap:44px;min-height:0;margin-top:26px;animation:rise .6s .18s ease both}
.cols{display:flex;gap:44px;flex:1;align-items:center}
.col{flex:1;min-width:0}
ul.points{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:17px}
ul.points li{font-size:20px;line-height:1.45;padding-left:28px;position:relative}
ul.points li::before{content:'';position:absolute;left:0;top:9px;width:11px;height:11px;border-radius:3px;background:var(--accent)}
ul.points li b{color:var(--accent)}
.viz{flex:1;display:flex;align-items:center;justify-content:center;min-width:0}
.viz svg{max-width:100%;max-height:300px}
.stat{font-size:84px;font-weight:700;color:var(--accent);line-height:1}
.statlabel{font-size:18px;color:var(--muted);margin-top:8px}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--muted);border-top:1px solid color-mix(in srgb,var(--ink) 16%,transparent);padding-top:12px;margin-top:18px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`;
}

const SCAFFOLD_RULES = `Fill this FIXED scaffold (the stylesheet already exists — do not recreate it):

<div class="slide">
  <p class="kicker">[3–5 word section label]</p>
  <h1>[short, punchy slide title]</h1>
  <p class="hook">[one-line subtitle — omit this <p> entirely if not needed]</p>
  <div class="body">
    [YOUR LAYOUT — compose from the building blocks below]
  </div>
  <div class="foot"><span>[deck topic]</span><span>[slide i / N]</span></div>
</div>

Building blocks for .body (combine freely; pick a layout that fits YOUR slide's job):
- <ul class="points"><li>…</li></ul> — max 3 bullets, ≤12 words each; <b> a key word per bullet
- <div class="viz"> inline <svg viewBox="0 0 560 300">…</svg> </div> — a real diagram/illustration; use var(--accent), var(--ink), var(--muted)
- <div class="stat">42%</div><div class="statlabel">what the number means</div> — one hero number
- <div class="cols"><div class="col">…</div><div class="col">…</div></div> — two columns (e.g. points + viz)

You MAY add one <style> tag defining NEW classes used only inside .body — never restyle .slide, .kicker, h1, .hook, .points, or .foot. NO external resources (no CDNs, fonts, or image URLs). Output ONLY the HTML, no commentary, no code fences.`;

/** Pull markup out of a model reply (fences and all) and ensure the scaffold root. */
function extractMarkup(text: string): string {
	const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
	let body = (fenced ? fenced[1] : text).trim();
	const start = body.search(/<(!doctype|html|style|div|section|main|body|p)\b/i);
	if (start > 0) body = body.slice(start);
	if (!/class="slide"/.test(body)) body = `<div class="slide"><div class="body">${body}</div></div>`;
	return body;
}
function wrap(markup: string, theme: DeckTheme): string {
	return `<style>${scaffoldCss(theme)}</style>\n${markup}`;
}

/** Static safety check: a slide must be self-contained — no network, no external code. */
export function checkSlide(html: string): string[] {
	const problems: string[] = [];
	if (!/<\w+[^>]*>/.test(html)) problems.push('no HTML markup found');
	if (/<script[^>]+src\s*=/i.test(html)) problems.push('external <script src> not allowed');
	if (/<link[^>]+href\s*=\s*["']?https?:/i.test(html)) problems.push('external stylesheet not allowed');
	if (/url\(\s*["']?https?:/i.test(html)) problems.push('remote url() in CSS not allowed');
	if (/<(img|iframe|video|audio|source)[^>]+src\s*=\s*["']?https?:/i.test(html))
		problems.push('remote media not allowed');
	return problems;
}

export interface DeckOptions {
	/** One editable prompt per slide agent — the fan-out is as wide as this list. */
	agentPrompts: string[];
}

/** Build the deck graph. N (the fan-out width) = agentPrompts.length, decided at runtime. */
export async function buildDeckGraph(opts: DeckOptions) {
	const prompts = opts.agentPrompts.filter((p) => p.trim().length > 0);
	const planner = await getModel({ maxTokens: 800, reasoningEffort: 'low' });
	const builder = await getModel({ maxTokens: 1800, reasoningEffort: 'low', temperature: 0.6 });
	const reviewer = await getModel({ maxTokens: 900, reasoningEffort: 'low' });

	const textOf = (r: { content?: unknown }) => {
		const c = r?.content;
		if (typeof c === 'string') return c;
		if (Array.isArray(c))
			return c
				.filter((p) => (p as { type?: string })?.type === 'text')
				.map((p) => (p as { text?: string }).text ?? '')
				.join('');
		return '';
	};

	const g = new StateGraph(DeckState)
		// MODEL node — the orchestrator. One call: briefs for every agent + a shared theme.
		.addNode('plan', async (s, config: LangGraphRunnableConfig) => {
			const ask =
				`You are planning a ${prompts.length}-slide deck about "${s.topic}".\n` +
				`The slide agents and their roles:\n` +
				prompts.map((p, i) => `${i + 1}. ${p.split('\n')[0]}`).join('\n') +
				`\n\nReturn STRICT JSON only:\n` +
				`{"theme":{"bg":"#hex deep dark","ink":"#hex near-white","accent":"#hex vivid","muted":"#hex soft gray-tinted","mood":"two words"},` +
				`"briefs":[{"title":"short slide title","directive":"2-3 concrete content points, specific to the topic"} x${prompts.length}]}`;
			let theme = FALLBACK_THEME;
			let briefs: SlideBrief[];
			try {
				const raw = textOf(await planner.invoke(ask, { tags: ['nostream'] }));
				const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
				if (parsed.theme?.bg) theme = { ...FALLBACK_THEME, ...parsed.theme };
				briefs = (parsed.briefs as { title: string; directive: string }[])
					.slice(0, prompts.length)
					.map((b, idx) => ({ idx, title: b.title, directive: b.directive }));
			} catch {
				briefs = prompts.map((p, idx) => ({ idx, title: s.topic, directive: p }));
			}
			while (briefs.length < prompts.length)
				briefs.push({ idx: briefs.length, title: s.topic, directive: prompts[briefs.length] });
			config.writer?.({ type: 'briefed', briefs, theme } satisfies DeckEvent);
			return { briefs, theme };
		})
		// WORKER node — runs N times IN PARALLEL, once per Send. `s` is the Send payload,
		// not the graph state: each branch sees only its own slice.
		.addNode('build', async (s: BuildPayload, config: LangGraphRunnableConfig) => {
			config.writer?.({ type: 'building', idx: s.idx, title: s.brief.title } satisfies DeckEvent);
			const topic = (config.configurable?.topic as string) ?? '';
			const ask =
				`${s.agentPrompt.trim()}\n\n` +
				`Deck topic: "${topic}". Your slide: "${s.brief.title}" (slide ${s.idx + 1} of ${s.total}).\n` +
				`Content direction: ${s.brief.directive}\n` +
				`Theme mood: "${s.theme.mood}".\n\n${SCAFFOLD_RULES}`;
			const markup = extractMarkup(textOf(await builder.invoke(ask, { tags: ['nostream'] })));
			const html = wrap(markup, s.theme);
			config.writer?.({ type: 'built', idx: s.idx, html } satisfies DeckEvent);
			// One element of the array — the reducer merges all branches' writes.
			return { drafts: [{ idx: s.idx, title: s.brief.title, markup, html }] };
		})
		// FAN-IN node — fires ONCE, after every parallel branch has landed (the runtime
		// holds it behind a barrier). One model call critiques the WHOLE deck — it can
		// see crowding, weak hierarchy, and repetition ACROSS slides — and writes
		// concrete recommendations for EVERY slide (even a decent one can be sharper).
		.addNode('review', async (s, config: LangGraphRunnableConfig) => {
			const ordered = [...s.drafts].sort((a, b) => a.idx - b.idx);
			const ask =
				`You are an exacting slide-design reviewer. Below are the ${ordered.length} slides of a deck about "${s.topic}", all built on the same fixed scaffold (kicker / h1 / hook / body / foot).\n\n` +
				ordered.map((d) => `--- SLIDE ${d.idx} · "${d.title}" ---\n${d.markup}`).join('\n\n') +
				`\n\nCritique EVERY slide: visual hierarchy, crowding vs. emptiness, whether .body has a strong layout (a real viz/diagram beats a wall of text), SVG quality, concrete content (numbers, names — not platitudes), and repetition ACROSS the deck (two slides must not lean on the same layout).\n` +
				`Return STRICT JSON only: [{"idx":0,"recommendations":"2-3 concrete, specific improvement instructions"}] — one entry per slide, NO slide skipped. Even the best slide gets instructions to make it sharper.`;
			let parsed: { idx: number; recommendations?: string }[] = [];
			try {
				const raw = textOf(await reviewer.invoke(ask, { tags: ['nostream'] }));
				parsed = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
			} catch {
				// fall through — every slide gets the generic instruction below
			}
			const recs: Recommendation[] = ordered.map((d) => {
				const broken = checkSlide(d.html);
				const fromModel = parsed.find((x) => x.idx === d.idx)?.recommendations;
				const recommendations = [
					...(broken.length ? [`Fix: ${broken.join('; ')}.`] : []),
					fromModel ??
						'Sharpen the visual hierarchy, make the content more concrete (numbers, names), and strengthen the .body layout.'
				].join(' ');
				config.writer?.({ type: 'reviewed', idx: d.idx, recommendations } satisfies DeckEvent);
				return { idx: d.idx, recommendations };
			});
			return { recs };
		})
		// SECOND-WAVE WORKER — one per recommendation, again in parallel.
		.addNode('revise', async (s: RevisePayload, config: LangGraphRunnableConfig) => {
			config.writer?.({ type: 'revising', idx: s.idx } satisfies DeckEvent);
			const ask =
				`You built the slide below. A design reviewer sent it back with instructions.\n\n` +
				`REVIEWER: ${s.recommendations}\n\n` +
				`Apply the instructions. ${SCAFFOLD_RULES}\n\nCURRENT SLIDE:\n${s.draft.markup}`;
			const markup = extractMarkup(textOf(await builder.invoke(ask, { tags: ['nostream'] })));
			const html = wrap(markup, s.theme);
			// keep the original if the revision broke the self-containment rules
			const ok = checkSlide(html).length === 0;
			config.writer?.({ type: 'revised', idx: s.idx, html: ok ? html : s.draft.html } satisfies DeckEvent);
			return { slides: [ok ? { ...s.draft, markup, html } : s.draft] };
		})
		.addEdge(START, 'plan')
		// THE LESSON — a conditional edge that returns Send objects: one per brief,
		// each carrying a custom payload. N is decided here, at runtime.
		.addConditionalEdges(
			'plan',
			(s) =>
				s.briefs.map(
					(brief) =>
						new Send('build', {
							idx: brief.idx,
							total: s.briefs.length,
							brief,
							theme: s.theme,
							agentPrompt: prompts[brief.idx] ?? prompts[0]
						} satisfies BuildPayload)
				),
			['build']
		)
		.addEdge('build', 'review')
		// Fan out AGAIN from the (single) fan-in node: one Send per recommendation.
		// Slides judged good already passed through; if none need work, go straight to END.
		.addConditionalEdges(
			'review',
			(s) =>
				s.recs.length
					? s.recs.map((r) => {
							const draft = s.drafts.find((d) => d.idx === r.idx)!;
							return new Send('revise', {
								idx: r.idx,
								total: s.briefs.length,
								draft,
								recommendations: r.recommendations,
								theme: s.theme
							} satisfies RevisePayload);
						})
					: END,
			['revise', END]
		)
		.addEdge('revise', END);

	return g.compile();
}

export type DeckGraph = Awaited<ReturnType<typeof buildDeckGraph>>;

export interface DeckSnapshot {
	topic: string;
	briefs: SlideBrief[];
	theme: DeckTheme;
	drafts: SlideDraft[];
	recs: Recommendation[];
	slides: SlideDraft[];
}
export interface DeckHandlers {
	onEvent?: (e: DeckEvent) => void;
	onUpdate?: (node: string, delta: Record<string, unknown>) => void | Promise<void>;
}

/** Run the deck build, streaming custom progress events + per-task updates. */
export async function runDeckStream(
	graph: DeckGraph,
	topic: string,
	handlers: DeckHandlers
): Promise<DeckSnapshot> {
	let last: DeckSnapshot | null = null;
	const stream = await graph.stream(
		{ topic },
		{ streamMode: ['values', 'updates', 'custom'], configurable: { topic } }
	);
	for await (const [mode, data] of stream as AsyncIterable<[string, unknown]>) {
		if (mode === 'values') last = data as DeckSnapshot;
		else if (mode === 'custom') handlers.onEvent?.(data as DeckEvent);
		else if (mode === 'updates')
			for (const [node, delta] of Object.entries(data as Record<string, Record<string, unknown>>))
				await handlers.onUpdate?.(node, delta);
	}
	return last!;
}
