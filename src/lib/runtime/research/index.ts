/**
 * Research runtime — the real, keyless, CORS-clean reach behind the deep-research
 * capstone. Three source families, all fetchable directly from the browser:
 *
 *   1. Official docs  — langchain-ai/docs (the source of docs.langchain.com),
 *                       searched over a curated index, fetched live from
 *                       raw.githubusercontent.com.
 *   2. Source & examples — any raw.githubusercontent.com file in the langchain-ai
 *                       repos (deepagentsjs / langgraphjs / langchainjs).
 *   3. External concepts — Wikipedia (origin=*), for ideas the docs only cite,
 *                       e.g. Pregel or the bulk-synchronous-parallel model.
 *
 * Everything here is provider-agnostic and side-effect-free except the network
 * calls, so it is easy to swap (e.g. for Tavily) when reusing the demo.
 */
import { DOC_INDEX, docUrl, docRawUrl, type DocEntry } from './doc-index';

export { DOC_INDEX, docUrl, docRawUrl, type DocEntry };

// ── A hit, normalized across every source family ─────────────────────────────
export interface SearchHit {
	/** Stable key the agent passes to fetch (a doc id, or a full URL). */
	ref: string;
	title: string;
	source: 'docs' | 'wikipedia';
	product?: string;
	/** Public, citable URL. */
	url: string;
	snippet?: string;
}

// ── 1 · Official documentation ───────────────────────────────────────────────

/** Keyword-rank the doc index. Grounded + instant — no network for the search. */
export function searchDocs(query: string, limit = 6): SearchHit[] {
	const terms = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 1);
	if (!terms.length) return [];
	const scored = DOC_INDEX.map((e) => {
		const hay = `${e.id} ${e.title} ${e.tags.join(' ')} ${e.productName}`.toLowerCase();
		let score = 0;
		for (const t of terms) {
			if (e.tags.includes(t)) score += 3;
			else if (hay.includes(t)) score += 1;
			// a whole-title match is worth the most
			if (e.title.toLowerCase() === t) score += 4;
		}
		// Prefer the canonical top-level page over a deeper subdir variant on ties
		// (e.g. deepagents/subagents over deepagents/code-subagents).
		if (score > 0) score -= e.path.split('/').length * 0.1;
		return { e, score };
	})
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
	return scored.map(({ e }) => ({
		ref: e.id,
		title: `${e.title} · ${e.productName}`,
		source: 'docs' as const,
		product: e.product,
		url: docUrl(e)
	}));
}

export function docById(id: string): DocEntry | undefined {
	return DOC_INDEX.find((e) => e.id === id);
}

/** Strip MDX frontmatter, imports, and the heaviest JSX so the model reads prose. */
export function cleanMdx(raw: string): string {
	let s = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // frontmatter
	s = s.replace(/^import\s.+$/gm, ''); // import lines
	s = s.replace(/<(CardGroup|Card|Columns|Tabs|Tab|Accordion|AccordionGroup|Note|Tip|Warning|Info|Frame|Steps|Step)[^>]*>/gi, '');
	s = s.replace(/<\/(CardGroup|Card|Columns|Tabs|Tab|Accordion|AccordionGroup|Note|Tip|Warning|Info|Frame|Steps|Step)>/gi, '');
	s = s.replace(/\n{3,}/g, '\n\n');
	return s.trim();
}

// ── network helpers ──────────────────────────────────────────────────────────

const MAX_CHARS = 6500; // keep a single fetch from flooding the context window
const FETCH_TIMEOUT_MS = 12000; // never let one hung request freeze a whole run

/** fetch() with a hard timeout — a stuck request becomes an honest error. */
async function timedFetch(url: string): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, { signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

function clip(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_CHARS) return { text, truncated: false };
	return { text: text.slice(0, MAX_CHARS), truncated: true };
}

export interface FetchResult {
	url: string;
	title?: string;
	text: string;
	truncated: boolean;
	ok: boolean;
	error?: string;
}

/** Fetch a documentation page by its index id (real content, live from GitHub). */
export async function fetchDoc(id: string): Promise<FetchResult> {
	const entry = docById(id);
	if (!entry) return { url: id, text: '', truncated: false, ok: false, error: `Unknown doc id "${id}". Use search_docs first.` };
	const raw = docRawUrl(entry);
	try {
		const res = await timedFetch(raw);
		if (!res.ok) return { url: docUrl(entry), text: '', truncated: false, ok: false, error: `HTTP ${res.status}` };
		const body = cleanMdx(await res.text());
		const { text, truncated } = clip(body);
		return { url: docUrl(entry), title: `${entry.title} · ${entry.productName}`, text, truncated, ok: true };
	} catch (e) {
		return { url: docUrl(entry), text: '', truncated: false, ok: false, error: networkError(e) };
	}
}

// ── 2 · Source & examples — curated, real entry points into the repos ────────
// High-value files the code-researcher starts from (all verified to exist on
// `main`). fetch_url follows raw.githubusercontent.com from here.

export interface CodeSeed {
	ref: string; // raw URL
	title: string;
	repo: string;
	tags: string[];
}

const RAW = (repo: string, path: string) => `https://raw.githubusercontent.com/langchain-ai/${repo}/main/${path}`;

export const CODE_SEEDS: CodeSeed[] = [
	{ ref: RAW('deepagentsjs', 'libs/deepagents/README.md'), title: 'deepagents — package README', repo: 'deepagentsjs', tags: ['overview', 'readme', 'createdeepagent', 'quickstart'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/index.ts'), title: 'deepagents — public API surface', repo: 'deepagentsjs', tags: ['api', 'exports', 'types'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/agent.ts'), title: 'createDeepAgent — assembly', repo: 'deepagentsjs', tags: ['createdeepagent', 'middleware', 'harness'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/middleware/subagents.ts'), title: 'SubAgentMiddleware (task tool) — source', repo: 'deepagentsjs', tags: ['subagents', 'task', 'middleware'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/middleware/summarization.ts'), title: 'SummarizationMiddleware — source', repo: 'deepagentsjs', tags: ['compaction', 'summarization', 'context'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/middleware/skills.ts'), title: 'SkillsMiddleware — source', repo: 'deepagentsjs', tags: ['skills', 'progressive', 'disclosure'] },
	{ ref: RAW('deepagentsjs', 'libs/deepagents/src/middleware/fs.ts'), title: 'Filesystem middleware — source', repo: 'deepagentsjs', tags: ['filesystem', 'backend', 'tools'] },
	{ ref: RAW('deepagentsjs', 'examples/async-subagents/parallel-research/supervisor.ts'), title: 'Parallel-research supervisor — example', repo: 'deepagentsjs', tags: ['research', 'async', 'subagents', 'parallel'] },
	{ ref: RAW('deepagentsjs', 'examples/async-subagents/parallel-research/researcher.ts'), title: 'Parallel-research researcher — example', repo: 'deepagentsjs', tags: ['research', 'subagent', 'parallel'] },
	{ ref: RAW('deepagentsjs', 'examples/hierarchical/hierarchical-agent.ts'), title: 'Hierarchical (nested subagents) — example', repo: 'deepagentsjs', tags: ['subagents', 'hierarchical', 'nested'] },
	{ ref: RAW('deepagentsjs', 'examples/backends/composite-backend.ts'), title: 'CompositeBackend — example', repo: 'deepagentsjs', tags: ['backend', 'composite', 'routing'] },
	{ ref: RAW('deepagentsjs', 'examples/memory/memory-agent.ts'), title: 'Long-term memory (AGENTS.md) — example', repo: 'deepagentsjs', tags: ['memory', 'agents.md', 'store'] }
];

/** Keyword-rank the code seeds (a network-free index, like searchDocs). */
export function searchCode(query: string, limit = 5): SearchHit[] {
	const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
	if (!terms.length) return [];
	return CODE_SEEDS.map((c) => {
		const hay = `${c.title} ${c.tags.join(' ')} ${c.repo}`.toLowerCase();
		let score = 0;
		for (const t of terms) score += c.tags.includes(t) ? 3 : hay.includes(t) ? 1 : 0;
		return { c, score };
	})
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ c }) => ({ ref: c.ref, title: c.title, source: 'docs' as const, product: c.repo, url: c.ref }));
}

// ── arbitrary URL fetch ──────────────────────────────────────────────────────

const RAW_HOST = 'raw.githubusercontent.com';
const CORS_CLEAN = /(^|\.)raw\.githubusercontent\.com$|(^|\.)wikipedia\.org$|(^|\.)githubusercontent\.com$/;

/**
 * Fetch any URL the agent wants to crawl. CORS-clean hosts (raw GitHub, Wikipedia)
 * return real content; others fail honestly so the agent can route around them
 * rather than hallucinate. A github.com blob URL is auto-rewritten to its raw form.
 */
export async function fetchUrl(url: string): Promise<FetchResult> {
	let target = url.trim();
	// github.com/owner/repo/blob/ref/path → raw.githubusercontent.com/owner/repo/ref/path
	const blob = target.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
	if (blob) target = `https://${RAW_HOST}/${blob[1]}/${blob[2]}/${blob[3]}`;
	let host: string;
	try {
		host = new URL(target).host;
	} catch {
		return { url, text: '', truncated: false, ok: false, error: 'Not a valid URL.' };
	}
	if (!CORS_CLEAN.test(host)) {
		return {
			url: target,
			text: '',
			truncated: false,
			ok: false,
			error: `${host} blocks cross-origin reads from the browser. Try the source on raw.githubusercontent.com or the concept on Wikipedia instead.`
		};
	}
	try {
		const res = await timedFetch(target);
		if (!res.ok) return { url: target, text: '', truncated: false, ok: false, error: `HTTP ${res.status}` };
		const body = target.endsWith('.mdx') || target.endsWith('.md') ? cleanMdx(await res.text()) : await res.text();
		const { text, truncated } = clip(body);
		return { url: target, text, truncated, ok: true };
	} catch (e) {
		return { url: target, text: '', truncated: false, ok: false, error: networkError(e) };
	}
}

// ── 3 · Wikipedia (external concepts the docs only cite) ─────────────────────

export async function searchWikipedia(query: string, limit = 5): Promise<SearchHit[]> {
	const u = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
	try {
		const r = await timedFetch(u);
		const j = (await r.json()) as { query?: { search?: { title: string; snippet?: string }[] } };
		return (j.query?.search ?? []).map((s) => ({
			ref: s.title,
			title: s.title,
			source: 'wikipedia' as const,
			url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
			snippet: s.snippet?.replace(/<[^>]+>/g, '')
		}));
	} catch {
		return [];
	}
}

export async function fetchWikipedia(title: string): Promise<FetchResult> {
	const u = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*&redirects=1`;
	const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
	try {
		const r = await timedFetch(u);
		const j = (await r.json()) as { query?: { pages?: Record<string, { title?: string; extract?: string }> } };
		const page = Object.values(j.query?.pages ?? {})[0];
		if (!page?.extract) return { url, text: '', truncated: false, ok: false, error: `No Wikipedia article for "${title}".` };
		const { text, truncated } = clip(page.extract);
		return { url, title: page.title, text, truncated, ok: true };
	} catch (e) {
		return { url, text: '', truncated: false, ok: false, error: networkError(e) };
	}
}

function networkError(e: unknown): string {
	const msg = e instanceof Error ? e.message : String(e);
	return /fetch|network|load failed/i.test(msg) ? `Network/CORS error: ${msg}` : msg;
}

// ── Source registry — numbered citations shared across the whole run ─────────

export interface Source {
	n: number;
	title: string;
	url: string;
	source: 'docs' | 'wikipedia' | 'web';
}

/**
 * Assigns each distinct URL a stable citation number the first time it's seen,
 * so every subagent and the final report cite the same source by the same [n].
 */
export function createSourceRegistry() {
	const byUrl = new Map<string, Source>();
	return {
		cite(url: string, title: string, kind: Source['source'] = 'web'): number {
			const existing = byUrl.get(url);
			if (existing) return existing.n;
			const n = byUrl.size + 1;
			byUrl.set(url, { n, title, url, source: kind });
			return n;
		},
		list(): Source[] {
			return [...byUrl.values()].sort((a, b) => a.n - b.n);
		}
	};
}
export type SourceRegistry = ReturnType<typeof createSourceRegistry>;
