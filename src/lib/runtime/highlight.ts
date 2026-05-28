import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

export type SupportedLang =
	| 'ts'
	| 'tsx'
	| 'js'
	| 'jsx'
	| 'json'
	| 'md'
	| 'bash'
	| 'python'
	| 'svelte'
	| 'css'
	| 'html'
	| 'yaml'
	| 'plain';

let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * LangX cream-on-ink theme. Hand-tuned to match the editorial palette
 * (deep ink background, warm cream foreground, ochre + teal + violet
 * accents that line up with the chapter colors).
 */
const langxTheme = {
	name: 'langx-ink',
	type: 'dark' as const,
	colors: {
		'editor.background': '#1a1c22',
		'editor.foreground': '#f4ece0'
	},
	tokenColors: [
		{ scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#7a7268', fontStyle: 'italic' } },
		{ scope: ['string', 'string.quoted'], settings: { foreground: '#e8c66f' } },
		{ scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#e8a45e' } },
		{ scope: ['constant.character.escape'], settings: { foreground: '#d8a876' } },
		{ scope: ['keyword', 'keyword.control', 'storage.type', 'storage.modifier'], settings: { foreground: '#cda7e6' } },
		{ scope: ['variable', 'meta.definition.variable'], settings: { foreground: '#f4ece0' } },
		{ scope: ['variable.parameter'], settings: { foreground: '#e6d8c2' } },
		{ scope: ['support.function', 'entity.name.function'], settings: { foreground: '#9bcbe6' } },
		{ scope: ['entity.name.type', 'entity.name.class', 'support.class', 'support.type'], settings: { foreground: '#88e0c1' } },
		{ scope: ['entity.name.tag'], settings: { foreground: '#9bcbe6' } },
		{ scope: ['entity.other.attribute-name'], settings: { foreground: '#e8c66f' } },
		{ scope: ['punctuation', 'meta.brace'], settings: { foreground: '#a89e8e' } },
		{ scope: ['markup.heading'], settings: { foreground: '#cda7e6', fontStyle: 'bold' } },
		{ scope: ['markup.bold'], settings: { foreground: '#f4ece0', fontStyle: 'bold' } },
		{ scope: ['markup.italic'], settings: { foreground: '#e6d8c2', fontStyle: 'italic' } },
		{ scope: ['markup.inline.raw', 'markup.fenced_code'], settings: { foreground: '#9bcbe6' } },
		{ scope: ['markup.list'], settings: { foreground: '#e8c66f' } }
	]
};

async function getHighlighter(): Promise<HighlighterCore> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [langxTheme],
			langs: [
				import('shiki/langs/typescript.mjs'),
				import('shiki/langs/tsx.mjs'),
				import('shiki/langs/javascript.mjs'),
				import('shiki/langs/jsx.mjs'),
				import('shiki/langs/json.mjs'),
				import('shiki/langs/markdown.mjs'),
				import('shiki/langs/bash.mjs'),
				import('shiki/langs/python.mjs'),
				import('shiki/langs/svelte.mjs'),
				import('shiki/langs/css.mjs'),
				import('shiki/langs/html.mjs'),
				import('shiki/langs/yaml.mjs')
			],
			engine: createOnigurumaEngine(import('shiki/wasm'))
		});
	}
	return highlighterPromise;
}

const langAliases: Record<string, SupportedLang> = {
	typescript: 'ts',
	javascript: 'js',
	markdown: 'md',
	shell: 'bash',
	sh: 'bash',
	py: 'python',
	yml: 'yaml',
	text: 'plain',
	txt: 'plain'
};

export async function highlight(code: string, lang: string): Promise<string> {
	const normalized = (langAliases[lang] ?? lang) as SupportedLang;
	if (normalized === 'plain') {
		return `<pre class="shiki"><code>${escape(code)}</code></pre>`;
	}
	try {
		const hl = await getHighlighter();
		return hl.codeToHtml(code, { lang: normalized, theme: 'langx-ink' });
	} catch {
		return `<pre class="shiki"><code>${escape(code)}</code></pre>`;
	}
}

function escape(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
