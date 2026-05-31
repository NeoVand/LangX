<script lang="ts">
	import { findGlossaryEntry } from '$lib/glossary';
	import type { Snippet } from 'svelte';

	interface Props {
		t: string;
		children?: Snippet;
	}

	let { t, children }: Props = $props();
	const entry = $derived(findGlossaryEntry(t));

	let termEl = $state<HTMLElement>();
	let tipEl = $state<HTMLElement>();
	// Fixed-position coordinates, recomputed each time the tip is shown so it floats
	// above everything (book + demo) and is never clipped by a scrolling pane.
	let top = $state(0);
	let left = $state(0);

	function reposition() {
		if (!termEl || !tipEl) return;
		const r = termEl.getBoundingClientRect();
		const tw = tipEl.offsetWidth || 280;
		const th = tipEl.offsetHeight || 140;
		const m = 10;
		let l = r.left + r.width / 2 - tw / 2;
		l = Math.max(m, Math.min(l, window.innerWidth - tw - m));
		let tp = r.bottom + 8;
		// Flip above the term if it would spill past the bottom.
		if (tp + th > window.innerHeight - m) tp = Math.max(m, r.top - th - 8);
		left = l;
		top = tp;
	}
</script>

{#if entry}
	<span
		class="term"
		role="button"
		tabindex="0"
		aria-describedby="tip-{t}"
		bind:this={termEl}
		onpointerenter={reposition}
		onfocusin={reposition}
	>
		{#if children}
			{@render children()}
		{:else}
			{t}
		{/if}
		<span
			id="tip-{t}"
			role="tooltip"
			class="tip"
			bind:this={tipEl}
			style:top="{top}px"
			style:left="{left}px"
		>
			<strong>{entry.term}</strong>
			<span class="body">{entry.long}</span>
		</span>
	</span>
{:else if children}
	{@render children()}
{:else}
	{t}
{/if}

<style>
	.term {
		cursor: help;
		position: relative;
		font-style: normal;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.22em;
		text-decoration-skip-ink: auto;
		text-decoration-color: color-mix(in oklch, var(--accent) 32%, transparent);
		transition: text-decoration-color 0.15s ease;
	}

	.term:hover,
	.term:focus,
	.term:focus-within {
		text-decoration-color: var(--accent);
	}

	/* A <code> chip inside a term: inline-block keeps the term's underline off it. */
	.term :global(code) {
		display: inline-block;
	}

	.term:hover .tip,
	.term:focus .tip,
	.term:focus-within .tip {
		opacity: 1;
		pointer-events: auto;
	}

	.tip {
		position: fixed;
		z-index: 60;
		min-width: 13rem;
		width: max-content;
		/* Squarer than before so it doesn't run across the page. */
		max-width: min(20rem, calc(100vw - 1.5rem));
		max-height: min(22rem, 70vh);
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
		transition: opacity 0.15s ease;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		box-shadow: 0 12px 32px -10px color-mix(in oklch, black 55%, transparent);
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
