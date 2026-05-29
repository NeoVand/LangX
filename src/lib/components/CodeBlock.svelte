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
	<div class="hl">
		{#if html}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		{:else}
			<pre class="shiki"><code>{@html escape(code)}</code></pre>
		{/if}
	</div>
	<figcaption>
		<span class="lang">{lang}</span>
		{#if caption}
			<span class="sep" aria-hidden="true">·</span>
			<span class="cap">{caption}</span>
		{/if}
		<button class="copy" onclick={copy} aria-label="Copy code">
			{copied ? 'copied' : 'copy'}
		</button>
	</figcaption>
</figure>

<style>
	/* One recessed unit: code surface + a borderless footer bar. No nested boxes. */
	.code {
		margin: 1.25rem 0;
		border-radius: 0.55rem;
		overflow: hidden;
		background: var(--color-paper);
	}

	.code.dense {
		margin: 0.5rem 0;
	}

	.hl :global(pre.shiki) {
		margin: 0;
		background: transparent !important;
		border-radius: 0;
	}

	figcaption {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		border-top: 1px solid color-mix(in oklch, var(--color-border) 60%, transparent);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		letter-spacing: 0.04em;
	}

	.lang {
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-fg-muted);
	}

	.sep {
		opacity: 0.5;
	}

	.cap {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.copy {
		margin-left: auto;
		font-size: 0.7rem;
		padding: 0.15rem 0.55rem;
		border-radius: 0.3rem;
		background: color-mix(in oklch, var(--color-fg-muted) 8%, transparent);
		color: var(--color-fg-muted);
		border: none;
		font-family: var(--font-mono);
		cursor: pointer;
		transition:
			color 0.18s ease,
			background 0.18s ease;
	}

	.copy:hover,
	.copy:focus-visible {
		color: var(--color-fg);
		background: color-mix(in oklch, var(--color-fg-muted) 16%, transparent);
	}
</style>
