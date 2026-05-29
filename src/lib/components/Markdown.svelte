<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { highlight } from '$lib/runtime/highlight';

	interface Props {
		source: string;
	}

	let { source }: Props = $props();

	let html = $state('');

	// Render markdown → sanitized HTML, then upgrade fenced code blocks with Shiki.
	$effect(() => {
		const md = source ?? '';
		let cancelled = false;

		(async () => {
			const raw = await marked.parse(md, { async: true, gfm: true, breaks: false });
			let safe = DOMPurify.sanitize(raw, {
				ADD_ATTR: ['class', 'data-lang'],
				ADD_TAGS: ['pre', 'code', 'svg', 'g', 'path', 'rect', 'text', 'circle', 'line']
			});

			// Replace ```lang blocks with Shiki-highlighted markup.
			const codeBlocks = [...safe.matchAll(/<pre><code class="language-([\w-]+)">([\s\S]*?)<\/code><\/pre>/g)];
			for (const m of codeBlocks) {
				const lang = m[1];
				const decoded = decodeEntities(m[2]);
				const hl = await highlight(decoded, lang);
				safe = safe.replace(m[0], hl);
			}

			if (!cancelled) html = safe;
		})();

		return () => {
			cancelled = true;
		};
	});

	function decodeEntities(s: string): string {
		const el = document.createElement('textarea');
		el.innerHTML = s;
		return el.value;
	}
</script>

<div class="markdown">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via DOMPurify above -->
	{@html html}
</div>

<style>
	.markdown {
		font-family: var(--font-prose);
		font-size: 0.96rem;
		line-height: 1.65;
		color: var(--color-ink-100);
	}
	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3) {
		font-family: var(--font-display, var(--font-prose));
		font-weight: 600;
		line-height: 1.25;
		margin: 1.4em 0 0.5em;
		color: var(--color-ink-100);
	}
	.markdown :global(h1) {
		font-size: 1.5rem;
	}
	.markdown :global(h2) {
		font-size: 1.25rem;
	}
	.markdown :global(h3) {
		font-size: 1.08rem;
	}
	.markdown :global(p) {
		margin: 0.7em 0;
	}
	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0.6em 0;
		padding-left: 1.4em;
	}
	.markdown :global(li) {
		margin: 0.25em 0;
	}
	.markdown :global(a) {
		color: var(--accent-ink, var(--color-accent-langchain));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.markdown :global(blockquote) {
		margin: 0.8em 0;
		padding: 0.3em 0 0.3em 1em;
		border-left: 3px solid var(--color-rule);
		color: var(--color-ink-200);
		font-style: italic;
	}
	.markdown :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--color-bg-elev-2, rgba(127, 127, 127, 0.14));
		padding: 0.12em 0.36em;
		border-radius: 0.3rem;
	}
	.markdown :global(pre.shiki) {
		margin: 0.9em 0;
		padding: 0.85rem 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.markdown :global(pre.shiki code) {
		background: none;
		padding: 0;
		font-size: inherit;
	}
	.markdown :global(table) {
		border-collapse: collapse;
		margin: 0.9em 0;
		font-size: 0.88rem;
		width: 100%;
	}
	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid var(--color-rule);
		padding: 0.4rem 0.6rem;
		text-align: left;
	}
	.markdown :global(th) {
		background: var(--color-paper);
		font-weight: 600;
	}
	.markdown :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.4rem;
	}
	.markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--color-rule);
		margin: 1.4em 0;
	}
</style>
