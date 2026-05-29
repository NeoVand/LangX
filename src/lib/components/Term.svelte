<script lang="ts">
	import { findGlossaryEntry } from '$lib/glossary';
	import type { Snippet } from 'svelte';

	interface Props {
		t: string;
		children?: Snippet;
	}

	let { t, children }: Props = $props();
	const entry = $derived(findGlossaryEntry(t));
</script>

{#if entry}
	<span class="term" role="button" tabindex="0" aria-describedby="tip-{t}">
		{#if children}
			{@render children()}
		{:else}
			{t}
		{/if}
		<span id="tip-{t}" role="tooltip" class="tip">
			<strong>{entry.term}</strong>
			<span class="body">{entry.long}</span>
		</span>
	</span>
{:else}
	{#if children}
		{@render children()}
	{:else}
		{t}
	{/if}
{/if}

<style>
	.term {
		border-bottom: 1px dashed var(--accent);
		cursor: help;
		position: relative;
		font-style: normal;
	}

	.term:hover .tip,
	.term:focus .tip,
	.term:focus-within .tip {
		opacity: 1;
		transform: translate(-50%, 0);
		pointer-events: auto;
	}

	.tip {
		position: absolute;
		left: 50%;
		top: calc(100% + 0.5rem);
		transform: translate(-50%, -4px);
		min-width: 16rem;
		max-width: 26rem;
		max-height: min(16rem, 50vh);
		overflow-y: auto;
		padding: 0.65rem 0.8rem;
		background: var(--color-bg-elev-2);
		border: 1px solid var(--color-border-strong);
		border-radius: 0.5rem;
		font-family: var(--font-sans);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
		z-index: 30;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		box-shadow: 0 8px 24px -8px color-mix(in oklch, black 45%, transparent);
	}

	.tip .body {
		color: var(--color-fg-muted);
	}

	.tip strong {
		color: var(--color-fg);
		font-weight: 600;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
</style>
