<script lang="ts">
	// Mounts a REAL Transformer Explainer "weight-inspection" window inline in the
	// course text — the same component the live workshop opens, with its real KaTeX
	// equation and GSAP calculation animation. te-theme.css (scoped to `.te-shell`)
	// re-skins the card to the dark explorer look. We lazy-mount on scroll so each
	// window plays its animation as you arrive, and only ~one is live at a time
	// (the popovers' GSAP timelines use shared `.formula` selectors). Each window is
	// auto-scaled to fit the column width, so it never needs a horizontal scroll —
	// even with the demo pane open (a narrower column).
	import '$lib/transformer-explainer/styles/te-theme.css';
	import QkvWeightPopover from '$lib/transformer-explainer/components/popovers/QKVWeightPopover.svelte';
	import AttentionWeightPopover from '$lib/transformer-explainer/components/popovers/AttentionWeightPopover.svelte';
	import MLPWeightPopover from '$lib/transformer-explainer/components/popovers/MLPWeightPopover.svelte';
	import MLPDownWeightPopover from '$lib/transformer-explainer/components/popovers/MLPDownWeightPopover.svelte';
	import LogitWeightPopover from '$lib/transformer-explainer/components/popovers/LogitWeightPopover.svelte';
	import AttentionScores from './AttentionScores.svelte';
	import EmbeddingsWindow from './EmbeddingsWindow.svelte';
	import ProbabilitiesWindow from './ProbabilitiesWindow.svelte';

	interface Props {
		which:
			| 'embeddings'
			| 'qkv'
			| 'attnScores'
			| 'attention'
			| 'mlpUp'
			| 'mlpDown'
			| 'logits'
			| 'probabilities';
		caption?: string;
	}
	let { which, caption }: Props = $props();

	let host = $state<HTMLElement>();
	let fitbox = $state<HTMLElement>();
	let fitEl = $state<HTMLElement>();
	let show = $state(false);
	let scale = $state(1);
	let fitH = $state(0);

	// Lazy-mount when scrolled into view.
	$effect(() => {
		if (!host || show) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					show = true;
					io.disconnect();
				}
			},
			{ threshold: 0.08, rootMargin: '140px 0px' }
		);
		io.observe(host);
		return () => io.disconnect();
	});

	// Scale the window down to fit the column width (offsetWidth is the natural,
	// pre-transform size). Re-measures when the content settles or the column resizes.
	function measure() {
		if (!fitEl || !fitbox) return;
		const w = fitEl.offsetWidth;
		const h = fitEl.offsetHeight;
		const cw = fitbox.clientWidth;
		if (!w || !cw) return;
		// Fill the section width — scale up narrow windows too (capped so they never
		// blur badly), and centre so they're never tucked to a corner.
		scale = Math.min(1.5, cw / w);
		fitH = h * scale;
	}
	$effect(() => {
		if (!show || !fitbox || !fitEl) return;
		measure();
		const ro = new ResizeObserver(() => measure());
		ro.observe(fitbox);
		ro.observe(fitEl);
		const t = setTimeout(measure, 450); // catch KaTeX / GSAP settle
		return () => {
			ro.disconnect();
			clearTimeout(t);
		};
	});
</script>

<figure class="inspector" bind:this={host} data-which={which}>
	<div class="te-shell">
		<div class="te-portal-root"></div>
		<div class="fitbox" bind:this={fitbox} style:height={fitH ? `${fitH}px` : undefined}>
			<div class="fit" bind:this={fitEl} style:transform="scale({scale})">
				{#if show}
					{#if which === 'embeddings'}
						<EmbeddingsWindow />
					{:else if which === 'qkv'}
						<QkvWeightPopover />
					{:else if which === 'probabilities'}
						<ProbabilitiesWindow />
					{:else if which === 'attnScores'}
						<AttentionScores />
					{:else if which === 'attention'}
						<AttentionWeightPopover />
					{:else if which === 'mlpUp'}
						<MLPWeightPopover />
					{:else if which === 'mlpDown'}
						<MLPDownWeightPopover />
					{:else if which === 'logits'}
						<LogitWeightPopover />
					{/if}
				{/if}
			</div>
		</div>
	</div>
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
	.inspector {
		margin: 1.6rem 0;
	}
	/* `.te-shell` only scopes the explorer theme vars now — no visible frame. */
	.te-shell {
		position: relative;
	}
	.te-portal-root {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 990;
	}
	.fitbox {
		width: 100%;
		overflow: hidden;
		display: flex;
		justify-content: center;
		/* flex-start so the .fit item keeps its NATURAL height — otherwise it stretches
		   to the fitbox height and measure() feeds the scaled height back in (runaway). */
		align-items: flex-start;
	}
	.fit {
		/* no grow/shrink so offsetWidth stays the natural card width for measure(). */
		flex: 0 0 auto;
		width: max-content;
		transform-origin: top center;
		will-change: transform;
	}
	/* These are inline teaching windows, not dismissable popovers — keep the replay
	   button, drop the close (X). */
	.inspector :global(.weight-popover-title .close) {
		display: none;
	}
	figcaption {
		margin-top: 0.65rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-300);
		font-style: italic;
	}
</style>
