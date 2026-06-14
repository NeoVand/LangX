<script lang="ts">
	// Next-token probabilities — the REAL ProbabilityBars chart + the REAL
	// Temperature and Sampling controls from the explorer, driven by the cached
	// GPT-2 logits (ex0). Drag the controls and the distribution reshapes live.
	import { modelData, temperature, sampling, predictedToken } from '$lib/transformer-explainer/store';
	import { ex0 } from '$lib/transformer-explainer/constants/examples';
	import ProbabilityBars from '$lib/transformer-explainer/components/ProbabilityBars.svelte';
	import Temperature from '$lib/transformer-explainer/components/Temperature.svelte';
	import Sampling from '$lib/transformer-explainer/components/Sampling.svelte';
	import WeightPopoverCard from '$lib/transformer-explainer/components/common/WeightPopoverCard.svelte';
	import { gsap } from '$lib/transformer-explainer/utils/gsap';
	import { onMount, onDestroy } from 'svelte';

	type Prob = {
		tokenId: number;
		token: string;
		probability: number;
		rank: number;
		logit: number;
		scaledLogit: number;
		expLogit: number;
	};
	const N = 12;
	const rowHeight = 18;
	const rowGap = 8;

	const ex = ex0 as unknown as { logits: number[]; probabilities: { tokenId: number; token: string }[] };
	const idTok: Record<number, string> = {};
	for (const p of ex.probabilities) idTok[p.tokenId] = p.token;
	const cands = ex.logits
		.map((logit, tokenId) => ({ tokenId, logit }))
		.sort((a, b) => b.logit - a.logit)
		.slice(0, 50);

	function softmax(vals: number[]): number[] {
		const max = Math.max(...vals.filter((v) => Number.isFinite(v)));
		const e = vals.map((v) => (Number.isFinite(v) ? Math.exp(v - max) : 0));
		const s = e.reduce((a, b) => a + b, 0) || 1;
		return e.map((v) => v / s);
	}
	function dist(temp: number, samp: { type: string; value: number }): Prob[] {
		const scaled = cands.map((c) => ({ ...c, s: c.logit / temp }));
		let probs: number[];
		if (samp.type === 'top-k') {
			probs = softmax(scaled.map((d, i) => (i < samp.value ? d.s : -Infinity)));
		} else {
			const all = softmax(scaled.map((d) => d.s));
			const cum: number[] = [];
			all.reduce((a, p, i) => (cum[i] = a + p), 0);
			let co = cum.findIndex((c) => c >= samp.value);
			if (co < 0) co = cum.length - 1;
			const ks = all.slice(0, co + 1).reduce((a, b) => a + b, 0) || 1;
			probs = all.map((p, i) => (i <= co ? p / ks : 0));
		}
		return scaled.map((d, i) => ({
			tokenId: d.tokenId,
			token: idTok[d.tokenId] ?? '·',
			rank: i,
			probability: probs[i],
			logit: d.logit,
			scaledLogit: d.s,
			expLogit: 0
		}));
	}
	function recompute() {
		const full = dist($temperature, $sampling);
		modelData.update((d) => ({ ...(d ?? {}), probabilities: full.slice(0, N) }));
		predictedToken.set(full[0]);
	}

	const labels = $derived(
		(($modelData as unknown as { probabilities?: Prob[] })?.probabilities ?? []).slice(0, N)
	);

	let isAnimationActive = $state(false);
	const timeline = gsap.timeline();
	let root = $state<HTMLElement>();
	let hovered = $state<number | null>(null);

	onMount(() => {
		recompute();
		// skip the subscribe's initial fire (store calls back immediately) so the bar
		// label tween isn't restarted three times on first paint
		let initT = true;
		let initS = true;
		const u1 = temperature.subscribe(() => {
			if (initT) return void (initT = false);
			recompute();
		});
		const u2 = sampling.subscribe(() => {
			if (initS) return void (initS = false);
			recompute();
		});
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
		return () => {
			u1();
			u2();
		};
	});
	onDestroy(() => timeline?.kill());

	function clean(t: string) {
		return t.replace(/^ /, '·');
	}
</script>

<WeightPopoverCard id="probabilities" title="Next-token Probabilities" bind:isAnimationActive {timeline}>
	<div class="prob weight-popover-content" bind:this={root}>
		<div class="prompt">
			…empowers users to <span class="pred">{clean(labels[0]?.token ?? '')}</span>
		</div>
		<div class="dist">
			<div class="labels" style="gap:{rowGap}px">
				{#each labels as p, i (p.tokenId)}
					<div class="lab" class:pred={i === 0} class:hov={hovered === i} style="height:{rowHeight}px">
						{clean(p.token)}
					</div>
				{/each}
			</div>
			<div class="bars" style="height:{N * (rowHeight + rowGap)}px">
				<ProbabilityBars {rowHeight} {rowGap} bind:hoveredIndex={hovered} />
			</div>
		</div>
		<div class="ctrls">
			<div class="ctrl"><span class="cl">Temperature</span><Temperature /></div>
			<div class="ctrl"><span class="cl">Sampling</span><Sampling /></div>
		</div>
	</div>
</WeightPopoverCard>

<style>
	.prob {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 2.75rem 2rem 1.5rem !important;
		min-width: 26rem;
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
	.dist {
		display: flex;
		gap: 0.7rem;
	}
	.labels {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}
	.lab {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-fg-muted);
		white-space: nowrap;
		text-align: right;
	}
	.lab.pred {
		color: var(--color-gold-200, #d9a441);
		font-weight: 600;
	}
	.lab.hov {
		color: var(--color-fg);
	}
	.bars {
		flex: 1;
		min-width: 9rem;
	}
	.ctrls {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem;
		border-top: 1px solid var(--color-border);
		padding-top: 0.85rem;
	}
	.ctrl {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.cl {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
	}
</style>
