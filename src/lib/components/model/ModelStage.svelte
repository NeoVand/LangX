<script lang="ts">
	// The dark "engraving plate" frame each workshop stage sits on. The app is a
	// warm light theme; the transformer's internals (gold flows, attention grids)
	// read best on a near-black stage, exactly like the standalone Explorer — so
	// every dissected stage is framed like a glowing brass exhibit on the page.
	import type { Snippet } from 'svelte';

	interface Props {
		n?: number | string;
		title: string;
		sub?: string;
		controls?: Snippet;
		children: Snippet;
	}
	let { n, title, sub, controls, children }: Props = $props();
</script>

<section class="stage">
	<header class="stage-head">
		<div class="stage-title">
			{#if n != null}<span class="stage-n">{n}</span>{/if}
			<div class="stage-heading">
				<h3>{title}</h3>
				{#if sub}<p class="stage-sub">{sub}</p>{/if}
			</div>
		</div>
		{#if controls}<div class="stage-controls">{@render controls()}</div>{/if}
	</header>
	<div class="stage-body">{@render children()}</div>
</section>

<style>
	.stage {
		--ink: #ece5d7;
		--ink-soft: #b6ad99;
		--ink-faint: #837c6c;
		--brass: #d9a441;
		--rule: rgba(217, 164, 65, 0.16);
		border-radius: 0.85rem;
		padding: 1rem 1.1rem 1.15rem;
		color: var(--ink);
		background:
			radial-gradient(135% 120% at 50% 0%, #1a140c 0%, #0c0905 58%, #070504 100%);
		border: 1px solid rgba(217, 164, 65, 0.14);
		box-shadow:
			0 18px 40px -28px rgba(0, 0, 0, 0.9),
			inset 0 1px 0 rgba(255, 255, 255, 0.03);
	}

	.stage-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.9rem;
		margin-bottom: 0.9rem;
	}
	.stage-title {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
		min-width: 0;
	}
	.stage-n {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--brass);
		border: 1px solid var(--rule);
		border-radius: 0.4rem;
		padding: 0.06rem 0.4rem;
		flex-shrink: 0;
	}
	.stage-heading {
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.12rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: #fbf6ec;
	}
	.stage-sub {
		margin: 0.15rem 0 0;
		font-size: 0.82rem;
		line-height: 1.4;
		color: var(--ink-soft);
	}
	.stage-controls {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* ── Shared control styles for the widgets (applied to snippet content) ── */
	.stage-body :global(.seg) {
		display: inline-flex;
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.25);
	}
	.stage-body :global(.seg button) {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.stage-body :global(.seg button + button) {
		border-left: 1px solid var(--rule);
	}
	.stage-body :global(.seg button:hover) {
		color: var(--ink);
	}
	.stage-body :global(.seg button.on) {
		background: rgba(217, 164, 65, 0.16);
		color: #fbf6ec;
	}
	.stage-body :global(.mbtn) {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: #1a140c;
		background: linear-gradient(180deg, #e7b450, #cf982f);
		border: 0;
		border-radius: 0.5rem;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		font-weight: 600;
		transition: filter 0.15s ease;
	}
	.stage-body :global(.mbtn:hover) {
		filter: brightness(1.08);
	}
	.stage-body :global(.mbtn.ghost) {
		color: var(--ink);
		background: transparent;
		border: 1px solid var(--rule);
		font-weight: 400;
	}
	.stage-body :global(.mbtn.ghost:hover) {
		background: rgba(217, 164, 65, 0.1);
		filter: none;
	}
	.stage-body :global(.cap) {
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--ink-soft);
	}
	.stage-body :global(.cap b),
	.stage-body :global(.cap strong) {
		color: #f4ead4;
		font-weight: 600;
	}
	.stage-body :global(.formula) {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--brass);
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--rule);
		border-radius: 0.4rem;
		padding: 0.3rem 0.55rem;
		display: inline-block;
	}
	.stage-body :global(.tok) {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: #f4ead4;
		background: rgba(217, 164, 65, 0.1);
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
		padding: 0.12rem 0.4rem;
		white-space: nowrap;
	}
	/* range input, themed to brass */
	.stage-body :global(input[type='range'].mrange) {
		appearance: none;
		height: 4px;
		border-radius: 2px;
		background: rgba(217, 164, 65, 0.22);
		cursor: pointer;
	}
	.stage-body :global(input[type='range'].mrange::-webkit-slider-thumb) {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--brass);
		border: 2px solid #1a140c;
	}
	.stage-body :global(input[type='range'].mrange::-moz-range-thumb) {
		width: 14px;
		height: 14px;
		border: 2px solid #1a140c;
		border-radius: 50%;
		background: var(--brass);
	}
</style>
