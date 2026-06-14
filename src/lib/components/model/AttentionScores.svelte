<script lang="ts">
	// The attention-score progression — Q·Kᵀ (dot product) → scale + causal mask →
	// softmax — built from the REAL Transformer Explainer pieces: the same
	// WeightPopoverCard window, the same Matrix renderer, the same KaTeX, and the
	// real cached attention tensors (ex0) from the store. Pick any of the 12 heads.
	import { modelData, attentionHeadIdx, blockIdx } from '$lib/transformer-explainer/store';
	import Matrix from '$lib/transformer-explainer/components/common/Matrix.svelte';
	import Katex from '$lib/transformer-explainer/utils/Katex.svelte';
	import WeightPopoverCard from '$lib/transformer-explainer/components/common/WeightPopoverCard.svelte';
	import * as d3 from 'd3';
	import { gsap } from '$lib/transformer-explainer/utils/gsap';
	import { onMount, onDestroy } from 'svelte';

	type Outputs = { outputs?: Record<string, { data: number[][] }> } | undefined;
	const head = $derived($attentionHeadIdx);
	const cell = (s: string): number[][] => {
		const md = $modelData as Outputs;
		return md?.outputs?.[`block_${$blockIdx}_attn_head_${head}_attn${s}`]?.data ?? [];
	};
	const qk = $derived(cell(''));
	const masked = $derived(cell('_masked'));
	const softmaxed = $derived(cell('_dropout'));

	const CELL = 17;
	const qkDomain = $derived(
		d3.extent(qk.flat().filter((v) => Number.isFinite(v))) as [number, number]
	);
	function qkColorScale(d: number) {
		return d3.scaleLinear<string>().domain(qkDomain).range(['#191510', '#e295b5'])(d);
	}
	function maskedColorScale(d: number) {
		return d3.scaleLinear<string>().domain([-3, 3]).range(['#191510', '#e295b5'])(d);
	}
	function softmaxColorScale(d: number) {
		return d3.interpolate('#191510', '#e295b5')(d);
	}
	function showTooltip(_e: Event, d: number) {
		return Number.isFinite(d) ? d.toFixed(2) : undefined;
	}
	const noop = () => {};

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

	const heads = Array.from({ length: 12 }, (_, i) => i);

	// KaTeX strings as variables (LaTeX braces can't sit in a plain attribute, and a
	// string-literal mustache trips no-useless-mustaches — a variable satisfies both).
	const MATH = {
		qk: 'Q \\cdot K^T',
		scale: '\\dfrac{Q K^T}{\\sqrt{d_k}} + M',
		softmax: '\\mathrm{softmax}',
		full: '\\mathrm{Attention} = \\mathrm{softmax}\\!\\left(\\dfrac{Q K^T}{\\sqrt{d_k}}\\right) V'
	};
</script>

<WeightPopoverCard
	id="attn-scores"
	title={`Attention Scores · Head ${head + 1}`}
	bind:isAnimationActive
	{timeline}
>
	<div class="asc weight-popover-content" bind:this={root}>
		<div class="heads" role="group" aria-label="Attention head">
			{#each heads as h (h)}
				<button class:on={head === h} onclick={() => attentionHeadIdx.set(h)}>{h + 1}</button>
			{/each}
		</div>
		{#key head}
			<div class="stages">
				<div class="stage">
					<Matrix
						data={qk}
						showSize={false}
						cellHeight={CELL}
						cellWidth={CELL}
						rowGap={3}
						colGap={3}
						shape="circle"
						colorScale={qkColorScale}
						{showTooltip}
						onMouseOverCell={noop}
						onMouseOutCell={noop}
						onMouseOutSvg={noop}
						highlightRow={undefined}
						highlightCol={undefined}
					/>
					<div class="lbl">Dot product</div>
					<Katex math={MATH.qk} style={undefined} />
					<div class="legend">
						<span>{qkDomain[0]?.toFixed(1)}</span><span class="bar"></span><span
							>{qkDomain[1]?.toFixed(1)}</span
						>
					</div>
				</div>
				<div class="op">→</div>
				<div class="stage">
					<Matrix
						data={masked}
						showSize={false}
						cellHeight={CELL}
						cellWidth={CELL}
						rowGap={3}
						colGap={3}
						shape="circle"
						colorScale={maskedColorScale}
						{showTooltip}
						onMouseOverCell={noop}
						onMouseOutCell={noop}
						onMouseOutSvg={noop}
						highlightRow={undefined}
						highlightCol={undefined}
					/>
					<div class="lbl">Scaling · Mask</div>
					<Katex math={MATH.scale} style={undefined} />
					<div class="legend"><span>-3.0</span><span class="bar"></span><span>3.0</span></div>
				</div>
				<div class="op">→</div>
				<div class="stage">
					<Matrix
						data={softmaxed}
						showSize={false}
						cellHeight={CELL}
						cellWidth={CELL}
						rowGap={3}
						colGap={3}
						shape="circle"
						colorScale={softmaxColorScale}
						{showTooltip}
						onMouseOverCell={noop}
						onMouseOutCell={noop}
						onMouseOutSvg={noop}
						highlightRow={undefined}
						highlightCol={undefined}
					/>
					<div class="lbl">Softmax</div>
					<Katex math={MATH.softmax} style={undefined} />
					<div class="legend"><span>0.0</span><span class="bar"></span><span>1.0</span></div>
				</div>
			</div>
		{/key}
		<div class="asc-formula">
			<Katex displayMode math={MATH.full} style={undefined} />
		</div>
	</div>
</WeightPopoverCard>

<style>
	.asc {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		padding: 2.5rem 2.5rem 1.25rem !important;
	}
	.heads {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		justify-content: center;
	}
	.heads button {
		appearance: none;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 0.35rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-fg-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.heads button:hover {
		color: var(--color-fg);
	}
	.heads button.on {
		color: #1a140c;
		background: #e295b5;
		border-color: #e295b5;
		font-weight: 600;
	}
	.stages {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.45rem;
	}
	.lbl {
		font-size: 0.82rem;
		color: var(--color-fg);
		white-space: nowrap;
		margin-top: 0.2rem;
	}
	.op {
		color: var(--color-fg-faint);
		font-size: 1.1rem;
		align-self: center;
		margin-bottom: 2rem;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-faint);
	}
	.legend .bar {
		width: 38px;
		height: 7px;
		border-radius: 2px;
		background: linear-gradient(90deg, #191510, #e295b5);
	}
	.asc-formula {
		margin-top: 0.4rem;
		opacity: 0.92;
	}
</style>
