<script lang="ts">
	// Embeddings window — token embedding + positional encoding = input embedding,
	// in the same window style as the explorer's weight popovers (real
	// WeightPopoverCard + Matrix + KaTeX). The matrices are illustrative textures
	// (as in the explorer's own QKV popover); the point is the shape of the step.
	import { tokens, modelMeta, rootRem } from '$lib/transformer-explainer/store';
	import Matrix from '$lib/transformer-explainer/components/common/Matrix.svelte';
	import Katex from '$lib/transformer-explainer/utils/Katex.svelte';
	import WeightPopoverCard from '$lib/transformer-explainer/components/common/WeightPopoverCard.svelte';
	import { theme } from '$lib/transformer-explainer/constants/theme';
	import * as d3 from 'd3';
	import { gsap } from '$lib/transformer-explainer/utils/gsap';
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';

	const DIM = 18;
	// tokens are static (the cached example) — read once for the illustrative data.
	const tokenLen = get(tokens).length;
	const tokenGap = 6;

	function rnd(rows: number, cols: number): number[][] {
		return Array(rows)
			.fill(0)
			.map(() =>
				Array(cols)
					.fill(0)
					.map(() => Math.random())
			);
	}
	// generated once on the client (this component only mounts client-side)
	const tokenEmb = rnd(tokenLen, DIM);
	const posEnc = rnd(tokenLen, DIM);
	const inputEmb = tokenEmb.map((row, i) => row.map((v, j) => (v + posEnc[i][j]) / 2));

	function goldScale(d: number) {
		return d3.interpolate('#191510', theme.colors.gold[200])(d);
	}
	function amberScale(d: number) {
		return d3.interpolate('#191510', theme.colors.amber[200])(d);
	}
	const noop = () => {};
	const noTip = (): string | undefined => undefined;

	const MATH = { full: 'Embedding_i = TokenEmbed(token_i) + Position(i)' };

	let isAnimationActive = $state(false);
	const timeline = gsap.timeline();
	let root = $state<HTMLElement>();
	function play() {
		if (!root) return;
		timeline.clear();
		timeline.fromTo(root, { opacity: 0.001 }, { opacity: 1, duration: 0.45, ease: 'power1.out' });
	}
	onMount(() => {
		timeline.eventCallback('onUpdate', () => {
			if (timeline.progress() === 1) isAnimationActive = false;
		});
		setTimeout(() => {
			isAnimationActive = true;
			play();
		}, 250);
	});
	onDestroy(() => timeline?.kill());
</script>

<WeightPopoverCard id="embeddings" title="Token Embeddings" bind:isAnimationActive {timeline}>
	<div class="emb weight-popover-content" bind:this={root}>
		<div class="matrix flex flex-col items-center">
			<div class="tokens" style={`gap:${tokenGap}px`}>
				{#each $tokens as token, i (i)}
					<div class="token-label"><span>{token}</span></div>
				{/each}
			</div>
		</div>
		<div class="matrix flex flex-col items-center">
			<div class="title">Token<br />Embedding</div>
			<Matrix
				data={tokenEmb}
				showSize={false}
				cellHeight={rootRem * 0.8}
				cellWidth={2}
				rowGap={tokenGap}
				colorScale={goldScale}
				onMouseOverCell={noop}
				onMouseOutCell={noop}
				onMouseOutSvg={noop}
				showTooltip={noTip}
				highlightRow={undefined}
				highlightCol={undefined}
			/>
			<div class="size">({tokenLen}, {$modelMeta.dimension})</div>
		</div>
		<div class="operator"><div class="symbol">+</div></div>
		<div class="matrix flex flex-col items-center">
			<div class="title">Positional<br />Encoding</div>
			<Matrix
				data={posEnc}
				showSize={false}
				cellHeight={rootRem * 0.8}
				cellWidth={2}
				rowGap={tokenGap}
				colorScale={amberScale}
				onMouseOverCell={noop}
				onMouseOutCell={noop}
				onMouseOutSvg={noop}
				showTooltip={noTip}
				highlightRow={undefined}
				highlightCol={undefined}
			/>
			<div class="size">({tokenLen}, {$modelMeta.dimension})</div>
		</div>
		<div class="operator"><div class="symbol">=</div></div>
		<div class="matrix flex flex-col items-center">
			<div class="title">Input<br />Embedding</div>
			<Matrix
				data={inputEmb}
				showSize={false}
				cellHeight={rootRem * 0.8}
				cellWidth={2}
				rowGap={tokenGap}
				colorScale={goldScale}
				onMouseOverCell={noop}
				onMouseOutCell={noop}
				onMouseOutSvg={noop}
				showTooltip={noTip}
				highlightRow={undefined}
				highlightCol={undefined}
			/>
			<div class="size">({tokenLen}, {$modelMeta.dimension})</div>
		</div>
	</div>
	<div class="emb-formula"><Katex displayMode math={MATH.full} style={undefined} /></div>
</WeightPopoverCard>

<style>
	.emb {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding: 3rem 2.5rem 1.5rem 1rem !important;
		gap: 0.5rem;
	}
	.emb-formula {
		text-align: center;
		padding: 0 1rem 0.5rem;
		opacity: 0.92;
	}
</style>
