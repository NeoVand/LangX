<script lang="ts">
	// Softmax + temperature, made tangible. A handful of candidate next-words each
	// have a raw score (logit); softmax turns the scores into probabilities, and
	// temperature reshapes them. The bars are on an ABSOLUTE 0–100% scale, so as you
	// raise T the winner visibly shrinks and the field flattens toward uniform.
	// Adapted from Neo Vandhana's SoftMax Explainer (github.com/NeoVand/SoftMaxExplainer).
	import { softmax, generateRandomData } from '$lib/demos/softmax';
	import Katex from '$lib/transformer-explainer/utils/Katex.svelte';

	const WORDS = ['mat', 'floor', 'couch', 'table', 'roof', 'moon'];
	let scores = $state([3.1, 1.9, 1.4, 1.1, 0.3, -1.2]);
	let temperature = $state(1);

	const probs = $derived(softmax(scores, temperature));
	const tDisp = $derived(temperature.toFixed(2));

	// cold (blue) → hot (red) as temperature rises
	const tColor = $derived.by(() => {
		const t = Math.max(0, Math.min(1, (temperature - 0.1) / 3.9));
		const r = Math.round(74 + (224 - 74) * t);
		const g = Math.round(124 - 76 * t);
		const b = Math.round(172 - 110 * t);
		return `rgb(${r}, ${g}, ${b})`;
	});

	function regenerate() {
		scores = generateRandomData(WORDS.length, 0.6, 1.5).map((v) => +v.toFixed(1));
	}

	const yticks = [100, 75, 50, 25, 0];
	const MATH = '\\operatorname{softmax}(x_i) = \\dfrac{e^{\\,x_i / T}}{\\sum_{j} e^{\\,x_j / T}}';
</script>

<figure class="sm">
	<div class="card">
		<div class="head">
			<span class="lbl">Softmax &amp; temperature</span>
			<button class="regen" onclick={regenerate}>↻ new scores</button>
		</div>
		<p class="prompt">next word after <span class="q">"The cat sat on the ___"</span></p>

		<div class="chart">
			<div class="yaxis">
				{#each yticks as t (t)}<span style:bottom="{t}%">{t}%</span>{/each}
			</div>
			<div class="plot">
				{#each WORDS as w, i (w)}
					<div class="col">
						<div class="bartrack">
							{#each yticks as t (t)}<span class="grid" style:bottom="{t}%"></span>{/each}
							<div class="bar" style:height="{probs[i] * 100}%">
								<span class="pct">{(probs[i] * 100).toFixed(probs[i] < 0.1 ? 1 : 0)}%</span>
							</div>
						</div>
						<div class="wlabel">{w}</div>
						<div class="xlogit">x={scores[i].toFixed(1)}</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="tctl">
			<span class="ticon">❄</span>
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
			<span class="ticon">🔥</span>
			<span class="tread" style:color={tColor}>T = {tDisp}</span>
		</div>

		<div class="eq"><Katex math={MATH} displayMode style={undefined} /></div>
	</div>
	<figcaption>
		Each candidate word has a raw score; softmax turns the scores into probabilities (they always sum
		to 100%). Temperature <b>T</b> divides every score first: <b>T &lt; 1</b> exaggerates the gaps so
		one word runs away with it (at <b>T → 0</b>, greedy); <b>T &gt; 1</b> shrinks the gaps so the
		field flattens toward uniform — more surprising, more "creative". <b>T = 1</b> is plain softmax.
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
		margin-bottom: 0.55rem;
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
	.prompt {
		margin: 0 0 0.9rem;
		font-size: 0.88rem;
		color: var(--color-fg-muted);
	}
	.prompt .q {
		font-family: var(--font-mono);
		color: var(--accent-ink);
	}

	.chart {
		display: flex;
		gap: 0.4rem;
		height: 168px;
	}
	.yaxis {
		position: relative;
		width: 2.4rem;
		flex-shrink: 0;
		/* the bar tracks are 140px tall under a 28px label band; align the axis to the
		   track band */
		margin-bottom: 28px;
	}
	.yaxis span {
		position: absolute;
		right: 0;
		transform: translateY(50%);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--color-fg-faint);
	}
	.plot {
		flex: 1;
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		min-width: 0;
	}
	.col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.bartrack {
		position: relative;
		width: 100%;
		height: 140px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		border-bottom: 1px solid var(--color-rule);
	}
	.grid {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px dashed color-mix(in oklch, var(--color-rule) 60%, transparent);
	}
	.bar {
		position: relative;
		width: 72%;
		border-radius: 2px 2px 0 0;
		background: linear-gradient(180deg, #f3dca5, #cf982f);
		transition: height 0.16s ease;
		min-height: 1px;
	}
	.pct {
		position: absolute;
		top: -1.05rem;
		left: 50%;
		transform: translateX(-50%);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-fg-muted);
		white-space: nowrap;
	}
	.wlabel {
		margin-top: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.xlogit {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--color-fg-faint);
	}

	.tctl {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.ticon {
		font-size: 0.95rem;
		flex-shrink: 0;
	}
	.trange {
		flex: 1;
		min-width: 0;
		appearance: none;
		height: 5px;
		border-radius: 3px;
		background: linear-gradient(90deg, #4a7cac, #8a7a86, #c0533f);
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
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 600;
		min-width: 4.2rem;
		text-align: right;
	}
	.eq {
		margin-top: 0.7rem;
		color: var(--color-fg);
		text-align: center;
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
