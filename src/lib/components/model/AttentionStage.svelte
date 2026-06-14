<script lang="ts">
	// Stage C — scaled dot-product self-attention, on the REAL cached GPT-2 run.
	// Step through the four stages (dot product → scale → mask → softmax) and pick
	// any of the 12 heads. Every number here is from the actual model, not a mock.
	import * as d3 from 'd3';
	import ModelStage from './ModelStage.svelte';
	import Matrix from '$lib/transformer-explainer/components/common/Matrix.svelte';
	import { SAMPLE, cleanToken, attnMatrix, N_HEADS, type AttnStage } from './data';

	const labels = SAMPLE.tokens.map(cleanToken);

	const STAGES: { id: AttnStage; tab: string; formula: string; cap: string }[] = [
		{
			id: 'raw',
			tab: '1 · Q·Kᵀ',
			formula: 'scoreᵢⱼ = qᵢ · kⱼ',
			cap: 'Each query is dotted with every key — a raw relevance score for every pair of tokens.'
		},
		{
			id: 'scaled',
			tab: '2 · ÷√dₖ',
			formula: 'QKᵀ / √dₖ   (√64 = 8)',
			cap: 'Divide by √(head size) so the scores stay in a sane range and don’t saturate the softmax.'
		},
		{
			id: 'masked',
			tab: '3 · mask',
			formula: 'scores + causal mask',
			cap: 'Blank out the upper triangle: a token may attend to itself and earlier tokens, never the future.'
		},
		{
			id: 'softmax',
			tab: '4 · softmax',
			formula: 'softmax(each row)',
			cap: 'Each row becomes weights that sum to 1 — how much this token pulls from each earlier token.'
		}
	];

	let stageIdx = $state(0);
	let head = $state(0);

	const stage = $derived(STAGES[stageIdx]);
	const matrix = $derived(attnMatrix(stage.id, head));

	const CELL = 30;
	const GAP = 4;

	function makeColor(data: number[][], stageId: AttnStage): (v: number) => string {
		const finite = data.flat().filter((v) => Number.isFinite(v));
		let lo = Math.min(...finite);
		let hi = Math.max(...finite);
		if (lo === hi) {
			lo -= 1;
			hi += 1;
		}
		const interp =
			stageId === 'softmax'
				? d3.interpolateRgb('#2a1e0a', '#f0c558') // dark → bright gold
				: d3.interpolateRgb('#1b1308', '#b06a82'); // dark → plum
		return (v: number) => interp(Math.max(0, Math.min(1, (v - lo) / (hi - lo))));
	}
	const colorFn = $derived(makeColor(matrix, stage.id));

	function cellTip(_e: Event, cell: number): string {
		return Number.isFinite(cell) ? cell.toFixed(2) : 'masked';
	}
</script>

<ModelStage
	n="C"
	title="Attention"
	sub="Every token decides how much to draw from each earlier token."
>
	{#snippet controls()}
		<label class="head-ctl">
			<span>head</span>
			<input
				class="mrange"
				type="range"
				min="0"
				max={N_HEADS - 1}
				step="1"
				bind:value={head}
			/>
			<span class="head-num">{head + 1}/{N_HEADS}</span>
		</label>
	{/snippet}

	<div class="tabs" role="tablist">
		{#each STAGES as s, i (s.id)}
			<button class="tab" class:on={stageIdx === i} role="tab" onclick={() => (stageIdx = i)}
				>{s.tab}</button
			>
		{/each}
	</div>

	<div class="attn">
		<div class="row-labels" style:gap="{GAP}px">
			{#each labels as l, i (i)}
				<span style:height="{CELL}px" title={SAMPLE.tokens[i]}>{l}</span>
			{/each}
		</div>
		<div class="matrix-area">
			<div class="heads-stack">
				{#key `${stage.id}-${head}`}
					<Matrix
						data={matrix}
						shape="circle"
						cellHeight={CELL}
						cellWidth={CELL}
						rowGap={GAP}
						colGap={GAP}
						colorScale={colorFn}
						showSize={false}
						showTooltip={cellTip}
						onMouseOverCell={() => {}}
						onMouseOutCell={() => {}}
						onMouseOutSvg={() => {}}
						highlightRow={undefined}
						highlightCol={undefined}
					/>
				{/key}
			</div>
			<div class="col-labels" style:gap="{GAP}px">
				{#each labels as l, i (i)}
					<span style:width="{CELL}px" title={SAMPLE.tokens[i]}>{l}</span>
				{/each}
			</div>
		</div>
	</div>

	<div class="axis-note">
		<span>rows = query token <span class="dim">(who is looking)</span></span>
		<span>columns = key token <span class="dim">(being looked at)</span></span>
	</div>

	<div class="stage-info">
		<code class="formula">{stage.formula}</code>
		<p class="cap">{stage.cap}</p>
	</div>
</ModelStage>

<style>
	.head-ctl {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: #b6ad99;
	}
	.head-ctl .mrange {
		width: 84px;
	}
	.head-num {
		color: #d9a441;
		min-width: 2.6rem;
	}

	.tabs {
		display: flex;
		gap: 0.3rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.tab {
		appearance: none;
		border: 1px solid rgba(217, 164, 65, 0.16);
		background: rgba(0, 0, 0, 0.2);
		color: #b6ad99;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.3rem 0.55rem;
		border-radius: 0.4rem;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.tab:hover {
		color: #ece5d7;
	}
	.tab.on {
		color: #1a140c;
		background: linear-gradient(180deg, #e7b450, #cf982f);
		border-color: transparent;
		font-weight: 600;
	}

	.attn {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.row-labels {
		display: flex;
		flex-direction: column;
		padding-top: 0; /* aligns with circle rows (label height == cell height) */
	}
	.row-labels span {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: #c3b9a3;
		max-width: 6.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.matrix-area {
		min-width: 0;
	}
	.heads-stack {
		position: relative;
		width: fit-content;
	}
	/* faint stacked frames behind the matrix → a hint of the 12 parallel heads */
	.heads-stack::before,
	.heads-stack::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 0.4rem;
		border: 1px solid rgba(217, 164, 65, 0.1);
		z-index: -1;
	}
	.heads-stack::before {
		transform: translate(6px, -6px);
	}
	.heads-stack::after {
		transform: translate(12px, -12px);
		opacity: 0.6;
	}
	.col-labels {
		display: flex;
		margin-top: 0.4rem;
	}
	.col-labels span {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: #c3b9a3;
		text-align: center;
		transform: rotate(-32deg);
		transform-origin: top center;
		white-space: nowrap;
		overflow: visible;
	}

	.axis-note {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.2rem;
		margin-top: 1.3rem;
		font-size: 0.7rem;
		font-family: var(--font-mono);
		color: #b6ad99;
	}
	.axis-note .dim {
		color: #837c6c;
	}

	.stage-info {
		margin-top: 0.9rem;
		padding-top: 0.85rem;
		border-top: 1px solid rgba(217, 164, 65, 0.14);
	}
	.stage-info .cap {
		margin: 0.55rem 0 0;
	}
</style>
