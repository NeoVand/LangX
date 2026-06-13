import { describe, it, expect } from 'vitest';
import {
	DOC_INDEX,
	searchDocs,
	searchCode,
	createSourceRegistry,
	cleanMdx,
	docUrl,
	docRawUrl,
	CODE_SEEDS
} from '$lib/runtime/research';

describe('doc index', () => {
	it('covers all three products and points at the real docs repo', () => {
		const products = new Set(DOC_INDEX.map((e) => e.product));
		expect(products).toEqual(new Set(['deepagents', 'langgraph', 'langchain']));
		expect(DOC_INDEX.length).toBeGreaterThan(100);
		const pregel = DOC_INDEX.find((e) => e.id === 'langgraph/pregel')!;
		expect(pregel).toBeTruthy();
		expect(docRawUrl(pregel)).toBe(
			'https://raw.githubusercontent.com/langchain-ai/docs/main/src/oss/langgraph/pregel.mdx'
		);
		expect(docUrl(pregel)).toBe('https://docs.langchain.com/oss/javascript/langgraph/pregel');
	});
});

describe('searchDocs', () => {
	it('ranks the most specific page first and tags beat substrings', () => {
		const hits = searchDocs('subagents');
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].ref).toBe('deepagents/subagents');
		expect(hits[0].source).toBe('docs');
	});

	it('finds the human-in-the-loop and pregel pages by keyword', () => {
		expect(searchDocs('human in the loop approval').map((h) => h.ref)).toContain('deepagents/human-in-the-loop');
		expect(searchDocs('pregel bulk synchronous parallel').map((h) => h.ref)).toContain('langgraph/pregel');
	});

	it('returns nothing for an empty or noise query', () => {
		expect(searchDocs('')).toEqual([]);
		expect(searchDocs('zzzz qqqq')).toEqual([]);
	});
});

describe('searchCode', () => {
	it('routes "subagents source" to the middleware seed and returns a raw URL', () => {
		const hits = searchCode('subagents middleware source');
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0].url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/langchain-ai\//);
		expect(hits.some((h) => /subagents/.test(h.url))).toBe(true);
	});

	it('every seed is a real raw GitHub URL', () => {
		for (const s of CODE_SEEDS) {
			expect(s.ref).toMatch(/^https:\/\/raw\.githubusercontent\.com\/langchain-ai\/\w+\/main\//);
		}
	});
});

describe('source registry — shared numbered citations', () => {
	it('numbers each distinct URL once, in first-seen order, and dedupes repeats', () => {
		const reg = createSourceRegistry();
		expect(reg.cite('https://a', 'A', 'docs')).toBe(1);
		expect(reg.cite('https://b', 'B', 'wikipedia')).toBe(2);
		expect(reg.cite('https://a', 'A again')).toBe(1); // same URL → same number
		expect(reg.cite('https://c', 'C')).toBe(3);
		const list = reg.list();
		expect(list.map((s) => s.n)).toEqual([1, 2, 3]);
		expect(list.map((s) => s.url)).toEqual(['https://a', 'https://b', 'https://c']);
		expect(list[1].source).toBe('wikipedia');
	});
});

describe('cleanMdx', () => {
	it('strips frontmatter, imports, and component tags but keeps prose & code', () => {
		const raw = `---
title: Subagents
sidebarTitle: Subagents
---
import { CodeGroup } from "/components";

# Subagents

A deep agent can create subagents.

<Note>
Inheritance matters.
</Note>

\`\`\`ts
createDeepAgent({ subagents })
\`\`\`
`;
		const out = cleanMdx(raw);
		expect(out).not.toContain('title: Subagents');
		expect(out).not.toContain('import {');
		expect(out).not.toContain('<Note>');
		expect(out).toContain('# Subagents');
		expect(out).toContain('A deep agent can create subagents.');
		expect(out).toContain('createDeepAgent({ subagents })');
	});
});
