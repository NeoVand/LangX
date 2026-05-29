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

<figure class="code code-surface" class:dense>
	<div class="hl">
		{#if html}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		{:else}
			<pre class="shiki"><code>{@html escape(code)}</code></pre>
		{/if}
	</div>
	<figcaption class="code-surface-footer">
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
		margin: 1.5rem 0;
		min-width: 0;
		max-width: 100%;
	}

	.code.dense {
		margin: 0.5rem 0;
	}

	.hl {
		position: relative;
		z-index: 1;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.hl :global(pre.shiki) {
		margin: 0;
		padding: 1.15rem 1.3rem;
		background: transparent !important;
		border-radius: 0;
		overflow-x: hidden;
		max-width: 100%;
	}

	.code.dense .hl :global(pre.shiki) {
		padding: 0.95rem 1.15rem;
	}

	figcaption {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.55rem 1.3rem 0.65rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		letter-spacing: 0.04em;
	}

	.code.dense figcaption {
		padding: 0.45rem 1.15rem 0.55rem;
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
		padding: 0.12rem 0.4rem;
		border-radius: 0.25rem;
		background: transparent;
		color: var(--color-fg-faint);
		border: none;
		font-family: var(--font-mono);
		cursor: pointer;
		transition: color 0.18s ease;
	}

	.copy:hover,
	.copy:focus-visible {
		color: var(--accent-ink);
		background: transparent;
	}
</style>
