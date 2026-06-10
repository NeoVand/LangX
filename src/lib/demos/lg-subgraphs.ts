/**
 * "The Bureau" — a live research bureau, and the Level-2 capstone. Everything the
 * level taught, in one product: subgraphs (the star), Send fan-out/fan-in,
 * conditional edges, an interrupt gate, namespaced streaming, and time travel.
 *
 *   START → intake → ⏸ gate (approve the plan) ──Send×N──▶ investigate → collate
 *             ▲                                               (subgraph ×N)    │
 *             └──────────── fork a checkpoint, approve a different plan        │
 *                     ┌─── thin coverage? one follow-up wave ──────────────────┤
 *                     ▼                                                        ▼
 *                investigate ──▶ collate                                  synthesize → publish → END
 *                                                                         (subgraph)
 *
 * • `investigate` wraps a compiled INVESTIGATOR SUBGRAPH with its own private
 *   schema (frame → search → read → assess ⟲ → distill) — the TRANSFORM pattern:
 *   the node maps the Send payload into subgraph state and maps `notes` back out.
 *   It searches LIVE Wikipedia (CORS-clean, keyless) and loops while evidence is thin.
 * • `synthesize` is a compiled subgraph added DIRECTLY as a node — the SHARED-KEYS
 *   pattern: it reads/writes the parent's channels (notes → sections/headline).
 * • Stream the parent with `subgraphs: true` and every chunk arrives namespaced:
 *   `[path, mode, data]` — `path` tells you WHICH subgraph (and which parallel
 *   branch) is speaking. That's how the UI lights inner nodes live.
 * • The parent is checkpointed (MemorySaver): the gate interrupt pauses it, and
 *   any past checkpoint can be resumed with a DIFFERENT decision — a fork.
 *
 * This is the exact source the demo runs.
 */
import {
	Annotation,
	StateGraph,
	Send,
	Command,
	MemorySaver,
	START,
	END,
	interrupt
} from '@langchain/langgraph/web';
import type { LangGraphRunnableConfig } from '@langchain/langgraph/web';
import { getModel } from '$lib/runtime/llm';

// ── Live Wikipedia (the bureau's archive) ────────────────────────────────────
// Both endpoints are CORS-clean with `origin=*` — no key, no proxy.

export interface WikiPage {
	title: string;
	url: string;
	text: string;
	/** Lead image thumbnail (upload.wikimedia.org), when the article has one. */
	image?: string;
}

async function wikiSearch(query: string, limit = 5): Promise<string[]> {
	// `list=search` is FULL-TEXT search (opensearch only prefix-matches titles,
	// which returns nothing for descriptive research queries).
	const u = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
	try {
		const r = await fetch(u);
		const j = (await r.json()) as { query?: { search?: { title: string }[] } };
		return (j.query?.search ?? []).map((s) => s.title);
	} catch {
		return [];
	}
}

// NB: the TextExtracts API caps `exchars` at 1200. `pageimages` rides along in
// the same request and returns each article's lead-image thumbnail.
async function wikiRead(title: string, chars = 1200): Promise<WikiPage | null> {
	const u =
		`https://en.wikipedia.org/w/api.php?action=query&prop=extracts%7Cpageimages&explaintext=1&format=json&origin=*` +
		`&exchars=${chars}&pithumbsize=640&redirects=1&titles=${encodeURIComponent(title)}`;
	try {
		const r = await fetch(u);
		const j = (await r.json()) as {
			query?: { pages?: Record<string, { title: string; extract?: string; thumbnail?: { source: string } }> };
		};
		const page = Object.values(j.query?.pages ?? {})[0];
		if (!page?.extract) return null;
		return {
			title: page.title,
			url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
			text: page.extract,
			image: page.thumbnail?.source
		};
	} catch {
		return null;
	}
}

// ── Shared shapes ─────────────────────────────────────────────────────────────

export interface Angle {
	idx: number;
	title: string;
	focus: string;
}
export interface FieldNote {
	idx: number;
	angle: string;
	findings: string;
	sources: WikiPage[];
	thin: boolean;
	gap: string;
}
export interface Section {
	heading: string;
	body: string;
	cites: number[];
}

/** Everything the UI can hear from a run (the `custom` stream, namespaced). */
export type BureauEvent =
	| { type: 'angles'; angles: Angle[] }
	| { type: 'inv'; idx: number; node: 'frame' | 'search' | 'read' | 'assess' | 'distill'; info: string }
	| { type: 'collate'; thin: number; wave: number }
	| { type: 'synth'; node: 'outline' | 'write'; info: string }
	| { type: 'published' };

/**
 * The fan-in reducer for field notes — IDEMPOTENT on purpose. Parallel branches
 * append; but a shared-keys subgraph node (synthesize) echoes the channels it
 * read back to the parent, so a naive concat would duplicate every note. A
 * reducer that drops exact repeats makes both writes safe.
 */
const mergeNotes = (a: FieldNote[], b: FieldNote[]): FieldNote[] => {
	const out = [...a];
	for (const n of b)
		if (!out.some((x) => x.idx === n.idx && x.findings === n.findings)) out.push(n);
	return out;
};

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
const jsonIn = <T>(raw: string, open: string, close: string): T =>
	JSON.parse(raw.slice(raw.indexOf(open), raw.lastIndexOf(close) + 1)) as T;

// ── The investigator — a SUBGRAPH with its own private schema ────────────────
// The parent never sees `query`, `searchResults`, `pages`, `rounds` — they exist
// only inside this graph. Its single shared output is `notes`.

const InvestigatorState = Annotation.Root({
	idx: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
	question: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	angle: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	focus: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	query: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	searchResults: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
	pages: Annotation<WikiPage[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
	rounds: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
	enough: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
	gap: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	notes: Annotation<FieldNote[]>({ reducer: (a, b) => [...a, ...b], default: () => [] })
});

async function buildInvestigator() {
	const fast = await getModel({ maxTokens: 80, reasoningEffort: 'low' });
	const judge = await getModel({ maxTokens: 260, reasoningEffort: 'low' });
	const writer = await getModel({ maxTokens: 800, reasoningEffort: 'low' });

	return (
		new StateGraph(InvestigatorState)
			// MODEL — turn the angle (or the gap from last round) into ONE search query.
			.addNode('frame', async (s, config: LangGraphRunnableConfig) => {
				const ask =
					`Research question: "${s.question}". Your angle: "${s.angle}" (${s.focus}).\n` +
					(s.gap ? `Your previous search missed: ${s.gap}\n` : '') +
					(s.pages.length ? `Already read: ${s.pages.map((p) => p.title).join(', ')}.\n` : '') +
					`Write ONE short Wikipedia search query (2-5 words) to fill the gap. Reply with only the query.`;
				const query = textOf(await fast.invoke(ask, { tags: ['nostream'] })).trim().replace(/^"|"$/g, '');
				config.writer?.({ type: 'inv', idx: s.idx, node: 'frame', info: query } satisfies BureauEvent);
				return { query };
			})
			// CODE — live Wikipedia full-text search.
			.addNode('search', async (s, config: LangGraphRunnableConfig) => {
				const titles = await wikiSearch(s.query, 7);
				const fresh = titles.filter((t) => !s.pages.some((p) => p.title === t)).slice(0, 3);
				config.writer?.({ type: 'inv', idx: s.idx, node: 'search', info: fresh.join(' · ') || 'nothing new' } satisfies BureauEvent);
				return { searchResults: fresh };
			})
			// CODE — fetch the article extracts (in parallel) and file them.
			.addNode('read', async (s, config: LangGraphRunnableConfig) => {
				const got = (await Promise.all(s.searchResults.map((t) => wikiRead(t)))).filter(
					(p): p is WikiPage => p !== null
				);
				config.writer?.({ type: 'inv', idx: s.idx, node: 'read', info: `${got.length} article${got.length === 1 ? '' : 's'} read` } satisfies BureauEvent);
				return { pages: got };
			})
			// MODEL — is the evidence enough for THIS angle? The conditional edge below
			// loops back to `frame` while it's thin (max 2 rounds).
			.addNode('assess', async (s, config: LangGraphRunnableConfig) => {
				const digest = s.pages.map((p) => `- ${p.title}: ${p.text.slice(0, 300)}`).join('\n');
				let enough = s.pages.length > 0;
				let gap = '';
				try {
					const raw = textOf(
						await judge.invoke(
							`Angle: "${s.angle}" (${s.focus}) for the question "${s.question}".\nEvidence so far:\n${digest || '(none)'}\n\n` +
								`Return STRICT JSON: {"enough": true|false, "gap": "if not enough — what to search next, in a few words"}`,
							{ tags: ['nostream'] }
						)
					);
					const v = jsonIn<{ enough: boolean; gap?: string }>(raw, '{', '}');
					enough = v.enough || s.pages.length >= 4;
					gap = v.gap ?? '';
				} catch {
					/* keep defaults — any pages count as enough */
				}
				config.writer?.({ type: 'inv', idx: s.idx, node: 'assess', info: enough ? 'evidence is enough' : `thin — ${gap}` } satisfies BureauEvent);
				return { enough, gap, rounds: s.rounds + 1 };
			})
			// MODEL — distill the findings, grounded in the pages just read.
			.addNode('distill', async (s, config: LangGraphRunnableConfig) => {
				const digest = s.pages.map((p) => `[${p.title}]\n${p.text}`).join('\n\n');
				const findings = textOf(
					await writer.invoke(
						`Angle: "${s.angle}" (${s.focus}) for the question "${s.question}".\n\nSources:\n${digest}\n\n` +
							`Write 5-6 substantive findings for this angle, grounded ONLY in the sources above — ` +
							`prefer specifics: numbers, names, dates, mechanisms. Name the source article in ` +
							`parentheses after each finding. No preamble.`,
						{ tags: ['nostream'] }
					)
				).trim();
				config.writer?.({ type: 'inv', idx: s.idx, node: 'distill', info: 'notes filed' } satisfies BureauEvent);
				return {
					notes: [{ idx: s.idx, angle: s.angle, findings, sources: s.pages, thin: !s.enough, gap: s.gap }]
				};
			})
			.addEdge(START, 'frame')
			.addEdge('frame', 'search')
			.addEdge('search', 'read')
			.addEdge('read', 'assess')
			// the investigator's own little loop — a conditional edge INSIDE the subgraph
			.addConditionalEdges('assess', (s) => (!s.enough && s.rounds < 2 ? 'frame' : 'distill'), ['frame', 'distill'])
			.addEdge('distill', END)
			.compile()
	);
}

// ── The synthesist — a subgraph added DIRECTLY as a node (shared keys) ────────
// Its channels are a subset of the parent's, so the compiled graph slots in as a
// node with no wrapper: it reads `question`/`notes`, writes `headline`/`sections`/`sources`.

const SynthState = Annotation.Root({
	question: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	notes: Annotation<FieldNote[]>({ reducer: mergeNotes, default: () => [] }),
	outline: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
	headline: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	lede: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	sections: Annotation<Section[]>({ reducer: (_, b) => b, default: () => [] }),
	sources: Annotation<WikiPage[]>({ reducer: (_, b) => b, default: () => [] })
});

async function buildSynthesist() {
	const model = await getModel({ maxTokens: 1100, reasoningEffort: 'low' });

	return new StateGraph(SynthState)
		// NB: named `plan`, not `outline` — a node may not share a channel's name.
		.addNode('plan', async (s, config: LangGraphRunnableConfig) => {
			// the master source list — citations index into it from here on
			const sources: WikiPage[] = [];
			for (const n of s.notes)
				for (const p of n.sources) if (!sources.some((x) => x.url === p.url)) sources.push(p);
			const raw = textOf(
				await model.invoke(
					`Question: "${s.question}". Field notes from ${s.notes.length} investigator${s.notes.length === 1 ? '' : 's'}:\n` +
						s.notes.map((n) => `[Angle: ${n.angle}]\n${n.findings}`).join('\n\n') +
						`\n\nReturn STRICT JSON: {"headline":"a sharp dossier headline (≤10 words)",` +
						`"lede":"two vivid sentences that frame the question and tease the answer",` +
						`"outline":["4 section headings that tell a story in order — the last one draws the threads together"]}`,
					{ tags: ['nostream'] }
				)
			);
			let headline = s.question;
			let lede = '';
			let outline: string[] = [];
			try {
				const v = jsonIn<{ headline: string; lede?: string; outline: string[] }>(raw, '{', '}');
				headline = v.headline || headline;
				lede = v.lede ?? '';
				outline = (v.outline ?? []).slice(0, 4);
			} catch {
				outline = s.notes.map((n) => n.angle).slice(0, 3);
			}
			config.writer?.({ type: 'synth', node: 'outline', info: headline } satisfies BureauEvent);
			return { headline, lede, outline, sources };
		})
		// One model call PER SECTION, in parallel — depth without extra wall-clock.
		.addNode('write', async (s, config: LangGraphRunnableConfig) => {
			const notesDigest = s.notes.map((n) => `[${n.angle}]\n${n.findings}`).join('\n\n');
			const srcList = s.sources.map((p, i) => `[${i + 1}] ${p.title}: ${p.text.slice(0, 220)}`).join('\n');
			const sections = await Promise.all(
				s.outline.map(async (heading, i) => {
					const body = textOf(
						await model.invoke(
							`You are writing section ${i + 1} of ${s.outline.length} of the dossier "${s.headline}", ` +
								`which answers "${s.question}".\nTHIS section's heading: "${heading}".\n` +
								`Other sections (do not repeat their ground): ${s.outline.filter((_, j) => j !== i).join(' · ')}\n\n` +
								`Field notes:\n${notesDigest}\n\nSources:\n${srcList}\n\n` +
								`Write 2-3 substantial paragraphs (170-230 words total) for THIS section only. ` +
								`Be specific — numbers, names, mechanisms — and strictly grounded in the notes and sources. ` +
								`Cite inline as [1] [2] wherever a claim traces to a source. ` +
								`Separate paragraphs with a blank line. No heading, no preamble — just the paragraphs.`,
							{ tags: ['nostream'] }
						)
					).trim();
					const cites = [...new Set([...body.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
					return { heading, body, cites } satisfies Section;
				})
			);
			config.writer?.({ type: 'synth', node: 'write', info: `${sections.length} sections, written in parallel` } satisfies BureauEvent);
			return { sections };
		})
		.addEdge(START, 'plan')
		.addEdge('plan', 'write')
		.addEdge('write', END)
		.compile();
}

// ── The dossier page (deterministic render — no model in the layout) ─────────
// Article lead images come back with the extracts (prop=pageimages); the layout
// places a hero under the headline and floats one figure per section, sides
// alternating, each credited to its article.

function dossierHtml(
	q: string,
	headline: string,
	lede: string,
	sections: Section[],
	sources: WikiPage[],
	forked: boolean
): string {
	const esc = (t: string) =>
		t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const cite = (t: string) => esc(t).replace(/\[(\d+)\]/g, '<sup>[$1]</sup>');
	const paras = (t: string) =>
		t.split(/\n{2,}/).map((p) => `<p>${cite(p.trim())}</p>`).join('');

	// assign images: hero first, then one per section (its cited articles first),
	// never repeating an image on the page
	const used = new Set<string>();
	const take = (pool: WikiPage[]): WikiPage | null => {
		const hit = pool.find((p) => p.image && !used.has(p.image));
		if (hit?.image) used.add(hit.image);
		return hit ?? null;
	};
	const hero = take(sources);
	const figure = (s: Section, i: number) => {
		const pool = [...s.cites.map((n) => sources[n - 1]).filter(Boolean), ...sources];
		const pic = take(pool);
		return pic
			? `<figure class="${i % 2 ? 'left' : 'right'}"><img src="${pic.image}" alt="${esc(pic.title)}"><figcaption>${esc(pic.title)} — Wikipedia</figcaption></figure>`
			: '';
	};

	return `<style>
*{box-sizing:border-box;margin:0}
body{background:#f4efe4;color:#23201a;font-family:Georgia,'Times New Roman',serif;padding:46px 54px}
.kicker{font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#8a6d3b;border-top:3px double #23201a;border-bottom:1px solid #23201a;padding:8px 0;display:flex;justify-content:space-between}
h1{font-size:42px;line-height:1.05;margin:22px 0 10px;font-weight:700}
.lede{font-style:italic;color:#4a4439;font-size:17px;line-height:1.55;margin-bottom:8px}
.inquiry{font-size:12.5px;letter-spacing:.06em;color:#8a6d3b;margin-bottom:22px}
.hero{margin:0 0 26px}
.hero img{width:100%;max-height:320px;object-fit:cover;border:1px solid #c9bfa8}
figcaption{font-size:11.5px;color:#8a7a5c;font-style:italic;padding-top:4px}
section{clear:both}
h2{font-size:20px;margin:26px 0 10px;border-bottom:1px solid #c9bfa8;padding-bottom:4px;clear:both}
p{font-size:15px;line-height:1.7;margin-bottom:11px;text-align:justify}
sup{color:#8a6d3b;font-weight:700;font-size:11px}
figure.left{float:left;width:265px;margin:4px 18px 8px 0}
figure.right{float:right;width:265px;margin:4px 0 8px 18px}
figure.left img,figure.right img{width:100%;border:1px solid #c9bfa8}
.sources{margin-top:34px;border-top:3px double #23201a;padding-top:12px;clear:both}
.sources h3{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#8a6d3b;margin-bottom:8px}
.sources ol{padding-left:20px}.sources li{font-size:13px;line-height:1.6}
.sources a{color:#23201a}
</style>
<div class="kicker"><span>The Bureau · Research Dossier${forked ? ' · alternate edition' : ''}</span><span>compiled from ${sources.length} live source${sources.length === 1 ? '' : 's'}</span></div>
<h1>${esc(headline)}</h1>
${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
<p class="inquiry">In answer to the inquiry: “${esc(q)}”</p>
${hero ? `<figure class="hero"><img src="${hero.image}" alt="${esc(hero.title)}"><figcaption>${esc(hero.title)} — Wikipedia</figcaption></figure>` : ''}
${sections.map((s, i) => `<section><h2>${esc(s.heading)}</h2>${figure(s, i)}${paras(s.body)}</section>`).join('\n')}
<div class="sources"><h3>Sources — Wikipedia, retrieved live</h3><ol>${sources
		.map((p) => `<li><a href="${p.url}">${esc(p.title)}</a></li>`)
		.join('')}</ol></div>`;
}

// ── The parent graph — the bureau itself ─────────────────────────────────────

const BureauState = Annotation.Root({
	question: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	angles: Annotation<Angle[]>({ reducer: (_, b) => b, default: () => [] }),
	// every investigator (and every follow-up wave) appends here — the fan-in.
	// The reducer is idempotent (see mergeNotes) so the synthesize subgraph's
	// echo of the channel doesn't double anything.
	notes: Annotation<FieldNote[]>({ reducer: mergeNotes, default: () => [] }),
	wave: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
	outline: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
	headline: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	lede: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	sections: Annotation<Section[]>({ reducer: (_, b) => b, default: () => [] }),
	sources: Annotation<WikiPage[]>({ reducer: (_, b) => b, default: () => [] }),
	dossier: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
	forked: Annotation<boolean>({ reducer: (_, b) => b, default: () => false })
});

export interface BureauSnapshot {
	question: string;
	angles: Angle[];
	notes: FieldNote[];
	wave: number;
	headline: string;
	lede: string;
	sections: Section[];
	sources: WikiPage[];
	dossier: string;
	forked: boolean;
}

/** What the gate interrupt hands the human, and what resume hands back. */
export interface PlanReview {
	type: 'approve_plan';
	question: string;
	angles: Angle[];
}
export interface PlanDecision {
	angles: Angle[];
	forked?: boolean;
}

export async function buildBureauGraph(checkpointer: MemorySaver) {
	const planner = await getModel({ maxTokens: 500, reasoningEffort: 'low' });
	const investigator = await buildInvestigator();
	const synthesist = await buildSynthesist();

	const g = new StateGraph(BureauState)
		// MODEL — the chief drafts the research plan.
		.addNode('intake', async (s, config: LangGraphRunnableConfig) => {
			let angles: Angle[];
			try {
				const raw = textOf(
					await planner.invoke(
						`Research question: "${s.question}". Split it into exactly 3 distinct research angles a junior ` +
							`investigator could pursue independently on Wikipedia.\n` +
							`Return STRICT JSON: {"angles":[{"title":"2-4 words","focus":"one sentence of direction"}]}`,
						{ tags: ['nostream'] }
					)
				);
				angles = jsonIn<{ angles: { title: string; focus: string }[] }>(raw, '{', '}')
					.angles.slice(0, 4)
					.map((a, idx) => ({ idx, title: a.title, focus: a.focus }));
			} catch {
				angles = [{ idx: 0, title: s.question.slice(0, 40), focus: 'general background' }];
			}
			config.writer?.({ type: 'angles', angles } satisfies BureauEvent);
			return { angles };
		})
		// HUMAN — the run PAUSES here. interrupt() surfaces the plan; the resume
		// value (possibly edited angles — or a fork from the past) returns from it.
		.addNode('gate', (s) => {
			const d = interrupt({ type: 'approve_plan', question: s.question, angles: s.angles } satisfies PlanReview) as PlanDecision;
			const angles = (d.angles ?? s.angles).map((a, idx) => ({ ...a, idx }));
			return { angles, forked: d.forked ?? false };
		})
		// SUBGRAPH ×N — the TRANSFORM pattern: this node receives a Send payload,
		// maps it into the investigator's private schema, and maps `notes` back out.
		// Passing `config` through is what inherits the checkpointer + namespaces the stream.
		.addNode('investigate', async (p: { idx: number; question: string; angle: string; focus: string }, config: LangGraphRunnableConfig) => {
			const out = await investigator.invoke(
				{ idx: p.idx, question: p.question, angle: p.angle, focus: p.focus },
				config
			);
			return { notes: out.notes };
		})
		// CODE fan-in — fires once per wave, after every branch lands (the barrier).
		.addNode('collate', async (s, config: LangGraphRunnableConfig) => {
			const latest = new Map<number, FieldNote>();
			for (const n of s.notes) latest.set(n.idx, n);
			const thin = [...latest.values()].filter((n) => n.thin).length;
			config.writer?.({ type: 'collate', thin, wave: s.wave + 1 } satisfies BureauEvent);
			return { wave: s.wave + 1 };
		})
		// SUBGRAPH as a node, DIRECTLY — the SHARED-KEYS pattern. No wrapper: its
		// channels are a subset of the parent's, so it slots straight in. (A compiled
		// graph IS a valid node at runtime; the cast papers over addNode's typings.)
		.addNode(
			'synthesize',
			synthesist as unknown as (s: BureauSnapshot, config: LangGraphRunnableConfig) => Promise<Partial<BureauSnapshot>>
		)
		// CODE — typeset the dossier (deterministic; the model never touches layout).
		.addNode('publish', (s, config: LangGraphRunnableConfig) => {
			config.writer?.({ type: 'published' } satisfies BureauEvent);
			return { dossier: dossierHtml(s.question, s.headline, s.lede, s.sections, s.sources, s.forked) };
		})
		.addEdge(START, 'intake')
		.addEdge('intake', 'gate')
		// fan-out: one Send per APPROVED angle — N is whatever the human left in.
		.addConditionalEdges(
			'gate',
			(s) => s.angles.map((a) => new Send('investigate', { idx: a.idx, question: s.question, angle: a.title, focus: a.focus })),
			['investigate']
		)
		.addEdge('investigate', 'collate')
		// coverage gate: thin angles get ONE follow-up wave (refocused on their gap),
		// then we synthesize regardless. A conditional edge from a single fan-in node.
		.addConditionalEdges(
			'collate',
			(s) => {
				const latest = new Map<number, FieldNote>();
				for (const n of s.notes) latest.set(n.idx, n);
				const thin = [...latest.values()].filter((n) => n.thin);
				if (s.wave < 2 && thin.length > 0)
					return thin.map(
						(n) => new Send('investigate', { idx: n.idx, question: s.question, angle: n.angle, focus: `follow up on: ${n.gap || 'missing specifics'}` })
					);
				return 'synthesize';
			},
			['investigate', 'synthesize']
		)
		.addEdge('synthesize', 'publish')
		.addEdge('publish', END);

	return g.compile({ checkpointer });
}

export type BureauGraph = Awaited<ReturnType<typeof buildBureauGraph>>;
export type ThreadConfig = { configurable: { thread_id: string; checkpoint_id?: string } };

// ── Streaming runner — every lens, namespaced ─────────────────────────────────
// With `subgraphs: true`, chunks are THREE-tuples: [namespacePath, mode, data].
// An empty path = the parent; ['investigate:<task>'] = inside one investigator.

export interface BureauHandlers {
	/** A custom event, with the namespace path it came from. */
	onEvent?: (e: BureauEvent, ns: string[]) => void;
	/** A node finished somewhere — `ns` says in WHICH graph. */
	onUpdate?: (node: string, ns: string[], delta: Record<string, unknown>) => void | Promise<void>;
	onValues?: (s: BureauSnapshot) => void;
}
export interface BureauTurnResult {
	interrupted: boolean;
	review: PlanReview | null;
	snapshot: BureauSnapshot | null;
}

export async function runBureauTurn(
	graph: BureauGraph,
	/** `{ question }` to start · a resume `Command` at the gate · `null` to continue a fork. */
	input: { question: string } | Command | null,
	config: ThreadConfig,
	handlers: BureauHandlers = {}
): Promise<BureauTurnResult> {
	let interrupted = false;
	let review: PlanReview | null = null;
	let snapshot: BureauSnapshot | null = null;
	// (cast: stream() types its input per-graph; a resume Command is also valid)
	const stream = await graph.stream(input as { question: string }, {
		...config,
		streamMode: ['values', 'updates', 'custom'],
		subgraphs: true
	});
	for await (const [ns, mode, data] of stream as AsyncIterable<[string[], string, unknown]>) {
		if (mode === 'custom') {
			handlers.onEvent?.(data as BureauEvent, ns);
		} else if (mode === 'values') {
			if (ns.length === 0) {
				snapshot = data as BureauSnapshot;
				handlers.onValues?.(snapshot);
			}
		} else if (mode === 'updates') {
			for (const [node, delta] of Object.entries(data as Record<string, Record<string, unknown>>)) {
				if (node === '__interrupt__') {
					interrupted = true;
					review = ((delta as unknown as { value?: PlanReview }[])?.[0]?.value ?? delta) as PlanReview;
				} else {
					await handlers.onUpdate?.(node, ns, delta);
				}
			}
		}
	}
	// Fork-continuation streams may not emit a final top-level `values` chunk —
	// the thread's tip in the checkpointer is always authoritative.
	if (!snapshot && !interrupted) {
		const tip = await graph.getState({ configurable: { thread_id: config.configurable.thread_id } });
		snapshot = (tip.values ?? null) as BureauSnapshot | null;
	}
	return { interrupted, review, snapshot };
}

// ── Time travel — the bureau's records room ──────────────────────────────────

export interface BureauCheckpoint {
	checkpointId: string;
	parentId: string | null;
	nextNode: string;
	step: number;
	headline: string;
	noteCount: number;
}

/** Every saved checkpoint on the thread, newest first (`getStateHistory`). */
export async function listBureauHistory(graph: BureauGraph, threadId: string): Promise<BureauCheckpoint[]> {
	const out: BureauCheckpoint[] = [];
	for await (const snap of graph.getStateHistory({ configurable: { thread_id: threadId } })) {
		const v = snap.values as Partial<BureauSnapshot>;
		out.push({
			checkpointId: snap.config.configurable?.checkpoint_id as string,
			parentId: (snap.parentConfig?.configurable?.checkpoint_id as string) ?? null,
			nextNode: (snap.next?.[0] as string) ?? 'END',
			step: (snap.metadata?.step as number) ?? 0,
			headline: v.headline || '',
			noteCount: v.notes?.length ?? 0
		});
	}
	return out;
}

/**
 * FORK: rewrite history at a PAST checkpoint and run forward from there.
 * `updateState(…, 'gate')` writes the new angles AS IF the gate produced them —
 * creating a NEW branch checkpoint — and `stream(null, branchConfig)` continues
 * from it (the gate's conditional edge fans out the new plan). The original
 * timeline stays intact in history; the thread now has two futures.
 *
 * (Subtlety: re-resuming the old checkpoint with a new `Command({ resume })`
 * would replay the FIRST resume value recorded there — forks edit state instead.)
 */
export async function forkBureauAtGate(
	graph: BureauGraph,
	threadId: string,
	checkpointId: string,
	angles: Angle[],
	handlers: BureauHandlers = {}
): Promise<BureauTurnResult> {
	const at: ThreadConfig = { configurable: { thread_id: threadId, checkpoint_id: checkpointId } };
	const branch = (await graph.updateState(
		at,
		{ angles: angles.map((a, idx) => ({ ...a, idx })), forked: true },
		'gate' // attribute the write to the gate node, so its outgoing edges fire next
	)) as ThreadConfig;
	return runBureauTurn(graph, null, branch, handlers);
}

export { Command, MemorySaver };
