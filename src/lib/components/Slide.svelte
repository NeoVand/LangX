<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		title?: string;
	}

	let { children, title }: Props = $props();
</script>

<section data-slide class="slide">
	{#if title}
		<h2 class="slide-title">{title}</h2>
	{/if}
	{@render children?.()}
</section>

<style>
	.slide {
		margin: 2.25rem 0;
	}

	.slide-title {
		font-family: var(--font-serif);
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
		margin: 0 0 1rem;
		color: var(--color-fg);
	}

	.slide :global(p),
	.slide :global(li) {
		font-family: var(--font-serif);
		font-size: 1.0625rem;
		line-height: 1.65;
		color: var(--color-fg-muted);
	}

	.slide :global(p + p) {
		margin-top: 0.85em;
	}

	.slide :global(strong) {
		color: var(--color-fg);
		font-weight: 600;
	}

	.slide :global(ul),
	.slide :global(ol) {
		margin: 0.6em 0 0.6em 1.25em;
	}

	.slide :global(li) {
		margin: 0.25em 0;
	}

	.slide :global(code) {
		background: var(--color-bg-elev);
		padding: 0.1em 0.35em;
		border-radius: 0.3em;
		font-size: 0.92em;
		color: var(--color-fg);
		border: 1px solid var(--color-border);
	}

	.slide :global(a) {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
