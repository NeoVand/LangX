<script lang="ts">
	// Next-token probabilities on the cached GPT-2 logits (ex0). We show the FULL
	// softmax distribution (so every bar is the token's true probability), and the
	// sampling rule just moves a CUTOFF: top-k keeps a fixed count, top-p keeps the
	// smallest set whose probabilities cover p. Kept tokens are gold; the dimmed
	// tail is excluded. Direct bars (no d3 tween), so a label can never exceed 100%.
	import WeightPopoverCard from '$lib/transformer-explainer/components/common/WeightPopoverCard.svelte';
	import { gsap } from '$lib/transformer-explainer/utils/gsap';
	import { ex0 } from '$lib/transformer-explainer/constants/examples';
	import { onMount, onDestroy } from 'svelte';

	type Row = { tokenId: number; token: string; probability: number; kept: boolean };
	const N = 12;

	const ex = ex0 as unknown as { logits: number[]; probabilities: { tokenId: number; token: string }[] };
	const idTok: Record<number, string> = {};
	for (const p of ex.probabilities) idTok[p.tokenId] = p.token;
	const cands = ex.logits
		.map((logit, tokenId) => ({ tokenId, logit }))
		.sort((a, b) => b.logit - a.logit)
		.slice(0, 50);

	function softmax(vals: number[]): number[] {
		const max = Math.max(...vals);
		const e = vals.map((v) => Math.exp(v - max));
		const s = e.reduce((a, b) => a + b, 0) || 1;
		return e.map((v) => v / s);
	}

	// ── Controls ──
	let temp = $state(0.8);
	let mode = $state<'top-k' | 'top-p'>('top-k');
	let kVal = $state(5);
	let pVal = $state(0.9);

	// Full softmax distribution at this temperature (sums to 1), then the cutoff.
	const all = $derived(softmax(cands.map((c) => c.logit / temp)));
	const keptCount = $derived.by(() => {
		if (mode === 'top-k') return Math.min(kVal, all.length);
		// top-p (nucleus): smallest prefix whose cumulative probability reaches p
		let acc = 0;
		for (let i = 0; i < all.length; i++) {
			acc += all[i];
			if (acc >= pVal) return i + 1;
		}
		return all.length;
	});
	const dist = $derived<Row[]>(
		cands.map((c, i) => ({
			tokenId: c.tokenId,
			token: idTok[c.tokenId] ?? '·',
			probability: all[i],
			kept: i < keptCount
		}))
	);
	const rows = $derived(dist.slice(0, N));
	const maxP = $derived(Math.max(...rows.map((d) => d.probability), 0.0001));
	const coverage = $derived(dist.reduce((s, d) => s + (d.kept ? d.probability : 0), 0));

	function clean(t: string) {
		return t.replace(/^ /, '·');
	}
	function pct(v: number): string {
		if (v < 0.001) return '<0.1%';
		return (v * 100).toFixed(1) + '%';
	}

	let isAnimationActive = $state(false);
	const timeline = gsap.timeline();
	let root = $state<HTMLElement>();
	onMount(() => {
		timeline.eventCallback('onUpdate', () => {
			if (timeline.progress() === 1) isAnimationActive = false;
		});
		setTimeout(() => {
			isAnimationActive = true;
			if (root) {
				timeline.clear();
				timeline.fromTo(root, { opacity: 0.001 }, { opacity: 1, duration: 0.45 });
			}
		}, 250);
	});
	onDestroy(() => timeline?.kill());
</script>

<WeightPopoverCard id="probabilities" title="Next-token Probabilities" bind:isAnimationActive {timeline}>
	<div class="prob weight-popover-content" bind:this={root}>
		<div class="prompt">
			…empowers users to <span class="pred">{clean(rows[0]?.token ?? '')}</span>
		</div>

		<div class="bars">
			{#each rows as d, i (d.tokenId)}
				<div class="brow" class:out={!d.kept} class:pred={i === 0 && d.kept}>
					<span class="tk" title={d.token}>{clean(d.token)}</span>
					<span class="track">
						<span class="fill" style:width="{(d.probability / maxP) * 100}%"></span>
					</span>
					<span class="pc">{pct(d.probability)}</span>
				</div>
			{/each}
		</div>

		<p class="kept">
			{#if mode === 'top-k'}
				keeping the top <b>{keptCount}</b> tokens
			{:else}
				keeping <b>{keptCount}</b> tokens to cover <b>p</b>
			{/if}
			· they hold <b>{(coverage * 100).toFixed(0)}%</b> of the probability · grey = dropped
		</p>

		<div class="controls">
			<div class="ctl">
				<div class="ctl-row">
					<span class="ctl-l">Temperature</span>
					<span class="ctl-v">{temp.toFixed(1)}</span>
				</div>
				<input class="rng" type="range" min="0.2" max="5" step="0.1" bind:value={temp} aria-label="temperature" />
			</div>

			<div class="ctl">
				<div class="ctl-row">
					<span class="ctl-l">Sampling</span>
					<div class="seg" role="group" aria-label="Sampling method">
						<button class:on={mode === 'top-k'} onclick={() => (mode = 'top-k')}>top-k</button>
						<button class:on={mode === 'top-p'} onclick={() => (mode = 'top-p')}>top-p</button>
					</div>
				</div>
				{#if mode === 'top-k'}
					<div class="ctl-row sub"><span class="ctl-l">keep a fixed <b>k = {kVal}</b></span></div>
					<input class="rng" type="range" min="1" max="12" step="1" bind:value={kVal} aria-label="k" />
				{:else}
					<div class="ctl-row sub"><span class="ctl-l">cover probability <b>p = {pVal.toFixed(2)}</b></span></div>
					<input class="rng" type="range" min="0.1" max="1" step="0.05" bind:value={pVal} aria-label="p" />
				{/if}
			</div>
		</div>
	</div>
</WeightPopoverCard>

<style>
	.prob {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0.6rem 1.5rem 1.35rem !important;
		width: 24rem;
		max-width: 100%;
		box-sizing: border-box;
	}
	.prompt {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.prompt .pred {
		color: #1a140c;
		background: var(--color-gold-200, #d9a441);
		border-radius: 0.3rem;
		padding: 0.02rem 0.34rem;
		font-weight: 600;
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}
	.brow {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr) 3.2rem;
		align-items: center;
		gap: 0.5rem;
	}
	.brow.out {
		opacity: 0.38;
	}
	.tk {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--color-fg-muted);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.brow.pred .tk {
		color: var(--color-gold-200, #d9a441);
		font-weight: 600;
	}
	.track {
		position: relative;
		height: 9px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 5px;
		overflow: hidden;
		min-width: 0;
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 5px;
		background: linear-gradient(90deg, #9a7029, #e7b450);
		transition: width 0.2s ease;
	}
	.brow.pred .fill {
		background: linear-gradient(90deg, #cf982f, #f3dca5);
	}
	.brow.out .fill {
		background: var(--color-fg-faint);
	}
	.pc {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg-muted);
		text-align: right;
		white-space: nowrap;
	}
	.kept {
		margin: 0.1rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		line-height: 1.45;
		color: var(--color-fg-faint);
	}
	.kept b {
		color: var(--color-gold-200, #d9a441);
	}

	/* ── controls ── */
	.controls {
		margin-top: 0.2rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: 1.05rem;
	}
	.ctl {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.ctl-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.ctl-row.sub {
		margin-top: 0.1rem;
	}
	.ctl-l {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--color-fg-muted);
	}
	.ctl-l b {
		color: var(--color-gold-200, #d9a441);
		font-weight: 600;
	}
	.ctl-v {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-gold-200, #d9a441);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		overflow: hidden;
	}
	.seg button {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--color-fg-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.24rem 0.65rem;
		cursor: pointer;
		transition:
			color 0.14s ease,
			background 0.14s ease;
	}
	.seg button + button {
		border-left: 1px solid var(--color-border);
	}
	.seg button:hover {
		color: var(--color-fg);
	}
	.seg button.on {
		background: var(--color-gold-200, #d9a441);
		color: #1a140c;
		font-weight: 600;
	}
	.rng {
		width: 100%;
		appearance: none;
		height: 5px;
		border-radius: 3px;
		background: rgba(217, 164, 65, 0.22);
		cursor: pointer;
	}
	.rng::-webkit-slider-thumb {
		appearance: none;
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--color-gold-200, #d9a441);
		border: 2px solid var(--color-bg-elev-2, #1a140c);
		box-shadow: 0 0 0 1px rgba(217, 164, 65, 0.5);
	}
	.rng::-moz-range-thumb {
		width: 15px;
		height: 15px;
		border-radius: 50%;
		background: var(--color-gold-200, #d9a441);
		border: 2px solid var(--color-bg-elev-2, #1a140c);
	}
</style>
