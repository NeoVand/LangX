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
	.code {
		margin: 1.25rem 0;
	}

	.code.dense {
		margin: 0.5rem 0;
	}

	.hl :global(pre.shiki) {
		margin: 0;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	figcaption {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--color-border);
		border-top: none;
		border-bottom-left-radius: 0.55rem;
		border-bottom-right-radius: 0.55rem;
		background: var(--color-bg-elev-2);
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
		padding: 0.15rem 0.5rem;
		border-radius: 0.3rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		font-family: var(--font-mono);
		cursor: pointer;
		transition: color 0.18s ease;
	}

	.copy:hover,
	.copy:focus-visible {
		color: var(--color-fg);
	}
</style>
