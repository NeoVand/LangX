<script lang="ts">
	// Softmax + temperature, made tangible. A row of raw scores (logits) on top;
	// drag temperature and watch softmax reshape them into probabilities below —
	// low T sharpens toward one winner, high T flattens toward uniform. Adapted from
	// Neo Vandhana's SoftMax Explainer, restyled to the LangX theme.
	import { softmax, generateRandomData } from '$lib/demos/softmax';
	import Katex from '$lib/transformer-explainer/utils/Katex.svelte';

	let logits = $state([2.6, 0.4, 1.7, -0.6, 1.1, -1.8, 0.1, -0.9, 0.8, -2.3]);
	let temperature = $state(1);

	const probs = $derived(softmax(logits, temperature));
	const maxAbs = $derived(Math.max(...logits.map((v) => Math.abs(v)), 0.001));
	const maxProb = $derived(Math.max(...probs, 0.001));
	const tDisp = $derived(temperature.toFixed(2));

	// cold (blue) → hot (red) as temperature rises
	const tColor = $derived.by(() => {
		const t = Math.max(0, Math.min(1, (temperature - 0.1) / 3.9));
		const r = Math.round(70 + (224 - 70) * t);
		const g = Math.round(130 - 80 * t);
		const b = Math.round(225 - 160 * t);
		return `rgb(${r}, ${g}, ${b})`;
	});

	const H = 96; // chart height px
	function logitBar(v: number) {
		const half = H / 2;
		const mag = (Math.abs(v) / maxAbs) * half;
		return v >= 0
			? { top: `${half - mag}px`, height: `${mag}px`, up: true }
			: { top: `${half}px`, height: `${mag}px`, up: false };
	}

	function regenerate() {
		logits = generateRandomData(10, 0, 1.6);
	}

	const MATH = 'p_i = \\dfrac{e^{\\,x_i / T}}{\\sum_j e^{\\,x_j / T}}';
</script>

<figure class="sm">
	<div class="card">
		<div class="head">
			<span class="lbl">Softmax &amp; temperature</span>
			<button class="regen" onclick={regenerate}>↻ new scores</button>
		</div>

		<div class="chart">
			<span class="ctag">raw scores (logits)</span>
			<div class="bars logits" style:height="{H}px">
				<div class="zero"></div>
				{#each logits as v, i (i)}
					{@const b = logitBar(v)}
					<div class="col">
						<div class="bar" class:up={b.up} class:down={!b.up} style:top={b.top} style:height={b.height}></div>
					</div>
				{/each}
			</div>
		</div>

		<div class="middle">
			<div class="formula"><Katex math={MATH} displayMode style={undefined} /></div>
			<div class="tctl">
				<div class="trow">
					<span class="ticon cold">❄</span>
					<input
						class="trange"
						type="range"
						min="0.1"
						max="4"
						step="0.05"
						bind:value={temperature}
						style:--tc={tColor}
						aria-label="temperature"
					/>
					<span class="ticon hot">🔥</span>
				</div>
				<div class="tread" style:color={tColor}>T = {tDisp}</div>
			</div>
		</div>

		<div class="chart">
			<span class="ctag">probabilities after softmax</span>
			<div class="bars probs" style:height="{H}px">
				{#each probs as p, i (i)}
					<div class="col">
						<div class="pbar" style:height="{(p / maxProb) * 100}%" title="{(p * 100).toFixed(1)}%"></div>
					</div>
				{/each}
			</div>
		</div>
	</div>
	<figcaption>
		Temperature divides every score before softmax. <b>T &lt; 1</b> sharpens the distribution toward
		the top score (at <b>T → 0</b> it's all-or-nothing — greedy); <b>T &gt; 1</b> flattens it toward
		uniform (more surprising, more creative). <b>T = 1</b> is plain softmax.
	</figcaption>
</figure>

<style>
	.sm {
		margin: 1.6rem 0;
	}
	.card {
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		background: var(--color-bg-elev);
		padding: 1rem 1.1rem 1.1rem;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.8rem;
	}
	.lbl {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
	}
	.regen {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-ink);
		background: var(--accent-soft);
		border: 1px solid var(--accent-rule);
		border-radius: 0.4rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}
	.regen:hover {
		border-color: var(--accent-ink);
	}

	.chart {
		position: relative;
	}
	.ctag {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-fg-faint);
	}
	.bars {
		display: flex;
		gap: 3px;
		position: relative;
		margin-top: 0.35rem;
	}
	.bars.logits .zero {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		border-top: 1px solid var(--color-rule);
	}
	.col {
		flex: 1;
		position: relative;
		min-width: 0;
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		border-radius: 1px;
	}
	.bar.up {
		background: linear-gradient(180deg, #6f9bc4, #3e6890);
	}
	.bar.down {
		background: linear-gradient(0deg, #c87142, #9d5630);
	}
	.probs {
		align-items: flex-end;
	}
	.pbar {
		width: 100%;
		border-radius: 1px 1px 0 0;
		background: linear-gradient(180deg, #f3dca5, #cf982f);
		transition: height 0.18s ease;
	}

	.middle {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 0.9rem 0;
		flex-wrap: wrap;
	}
	.formula {
		flex-shrink: 0;
		color: var(--color-fg);
	}
	.tctl {
		flex: 1;
		min-width: 11rem;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ticon {
		font-size: 0.95rem;
		flex-shrink: 0;
		filter: grayscale(0.2);
	}
	.trange {
		flex: 1;
		min-width: 0;
		appearance: none;
		height: 5px;
		border-radius: 3px;
		background: linear-gradient(90deg, #4a7cac, #7a6f8f, #c0533f);
		cursor: pointer;
	}
	.trange::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--tc, var(--accent));
		border: 2px solid var(--color-bg-elev);
		box-shadow: 0 0 0 1px var(--tc, var(--accent));
	}
	.trange::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--tc, var(--accent));
		border: 2px solid var(--color-bg-elev);
	}
	.tread {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		margin-top: 0.35rem;
	}
	figcaption {
		margin-top: 0.65rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-300);
		font-style: italic;
	}
	figcaption b {
		color: var(--color-ink-100);
		font-style: normal;
		font-weight: 600;
	}
</style>
