<script lang="ts">
	import { highlight } from '$lib/runtime/highlight';

	interface Props {
		code: string;
		lang?: string;
		caption?: string;
		dense?: boolean;
	}

	let { code, lang = 'ts', caption, dense = false }: Props = $props();

	let html = $state<string>('');
	let copied = $state(false);

	$effect(() => {
		const c = code;
		const l = lang;
		highlight(c, l).then((h) => {
			html = h;
		});
	});

	function copy() {
		navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}

	function escape(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
</script>

<figure class="code" class:dense>
	<div class="lang-tag">{lang}</div>
	<button class="copy" onclick={copy} aria-label="Copy code">
		{copied ? 'copied' : 'copy'}
	</button>
	<div class="hl">
		{#if html}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		{:else}
			<pre class="shiki"><code>{@html escape(code)}</code></pre>
		{/if}
	</div>
	{#if caption}
		<figcaption>{caption}</figcaption>
	{/if}
</figure>

<style>
	.code {
		position: relative;
		margin: 1.25rem 0;
	}

	.code.dense {
		margin: 0.5rem 0;
	}

	.hl :global(pre.shiki) {
		margin: 0;
	}

	.lang-tag {
		position: absolute;
		top: 0.55rem;
		left: 0.85rem;
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
		pointer-events: none;
		z-index: 1;
		background: color-mix(in oklch, var(--color-paper) 85%, transparent);
		padding: 0.05rem 0.4rem;
		border-radius: 0.25rem;
	}

	.copy {
		position: absolute;
		top: 0.5rem;
		right: 0.6rem;
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.3rem;
		background: var(--color-bg-elev-2);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		font-family: var(--font-mono);
		opacity: 0;
		transition: opacity 0.18s ease;
		z-index: 2;
	}

	.code:hover .copy,
	.copy:focus-visible {
		opacity: 1;
	}

	figcaption {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin-top: 0.45rem;
		text-align: right;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}
</style>
