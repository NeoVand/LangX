<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'default' | 'dropcap' | 'pull-quote' | 'figure' | 'ornament' | 'code-first';

	interface Props {
		children?: Snippet;
		title?: string;
		eyebrow?: string;
		variant?: Variant;
		ornament?: boolean;
	}

	let {
		children,
		title,
		eyebrow,
		variant = 'default',
		ornament = false
	}: Props = $props();
</script>

<section data-slide data-variant={variant} class="slide variant-{variant}">
	{#if eyebrow}
		<div class="slide-eyebrow font-display">{eyebrow}</div>
	{/if}
	{#if title}
		<h2 class="slide-title font-display">{title}</h2>
	{/if}
	<div class="slide-body">
		{@render children?.()}
	</div>
	{#if ornament}
		<hr class="ornament" aria-hidden="true" />
	{/if}
</section>

<style>
	.slide {
		margin: 2.75rem 0;
	}

	.slide-eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.72rem;
		color: var(--accent-ink);
		font-weight: 500;
		margin-bottom: 0.6rem;
	}

	.slide-title {
		font-size: 1.65rem;
		font-weight: 500;
		line-height: 1.15;
		letter-spacing: -0.012em;
		margin: 0 0 1rem;
		color: var(--color-ink-100);
	}

	.slide-body :global(p),
	.slide-body :global(li) {
		font-family: var(--font-prose);
		font-size: 1.06rem;
		line-height: 1.65;
		color: var(--color-ink-200);
	}

	.slide-body :global(p + p) {
		margin-top: 0.85em;
	}

	.slide-body :global(strong) {
		color: var(--color-ink-100);
		font-weight: 600;
	}

	.slide-body :global(em) {
		font-style: italic;
		color: var(--color-ink-100);
	}

	.slide-body :global(ul),
	.slide-body :global(ol) {
		margin: 0.6em 0 0.6em 1.25em;
	}

	.slide-body :global(li) {
		margin: 0.3em 0;
	}

	/* Inline code only — never style Shiki blocks inside CodeBlock figures */
	.slide-body :global(pre code) {
		background: transparent;
		padding: 0;
		border-radius: 0;
		font-size: inherit;
		color: inherit;
	}

	.slide-body :global(p code),
	.slide-body :global(li code),
	.slide-body :global(td code),
	.slide-body :global(th code) {
		background: color-mix(in oklch, var(--color-paper) 85%, transparent);
		padding: 0.1em 0.4em;
		border-radius: 0.3em;
		font-size: 0.9em;
		color: var(--color-ink-100);
		font-family: var(--font-mono);
	}

	.slide-body :global(a) {
		color: var(--accent-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
	}

	/* dropcap */
	.variant-dropcap .slide-body :global(p:first-child::first-letter) {
		font-family: var(--font-display);
		font-size: 3em;
		float: left;
		line-height: 0.85;
		padding: 0.06em 0.1em 0 0;
		color: var(--accent-ink);
		font-weight: 500;
	}

	/* pull-quote */
	.variant-pull-quote {
		padding: 1.5rem 1.75rem;
		border-left: 3px solid var(--accent-ink);
		background: color-mix(in oklch, var(--accent-soft) 35%, transparent);
		border-radius: 0 0.4rem 0.4rem 0;
	}
	.variant-pull-quote .slide-body :global(p) {
		font-family: var(--font-display);
		font-size: 1.45rem;
		line-height: 1.4;
		color: var(--color-ink-100);
		font-style: italic;
		margin: 0;
	}
	.variant-pull-quote .slide-body :global(p + p) {
		margin-top: 0.6em;
	}

	/* figure variant: tighter caption-style */
	.variant-figure {
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		padding: 1.25rem;
		background: var(--color-paper);
	}

	.variant-figure .slide-body :global(p) {
		font-family: var(--font-prose);
		font-size: 0.95rem;
		color: var(--color-ink-200);
	}

	/* ornament: just a hairline rule */
	.variant-ornament {
		text-align: center;
		margin: 1.5rem 0;
	}
	.variant-ornament .slide-body :global(p) {
		font-family: var(--font-display);
		font-size: 0.78rem;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		color: var(--color-ink-300);
	}

	/* code-first: title is small, body is dominated by a code block */
	.variant-code-first .slide-title {
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--color-ink-200);
		margin-bottom: 0.5rem;
	}
</style>
