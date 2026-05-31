<script lang="ts">
	import TimingBars from './TimingBars.svelte';

	interface Props {
		/** Actual wall-clock of the one concurrent call. */
		totalMs: number;
		/** Each branch/item's own duration — their sum ≈ doing it one-by-one. */
		partsMs: number[];
		/** One-line explanation of the mechanism. */
		note?: string;
	}
	let { totalMs, partsMs, note }: Props = $props();

	const sum = $derived(partsMs.reduce((a, b) => a + b, 0));
	const factor = $derived(totalMs > 0 ? sum / totalMs : 1);
	const saved = $derived(Math.max(0, sum - totalMs));
</script>

<div class="speedup">
	<TimingBars
		bars={[
			{ label: 'concurrent', ms: totalMs },
			{ label: 'one-by-one', ms: sum }
		]}
	/>
	<div class="badge">
		<span class="factor">{factor.toFixed(1)}× faster</span>
		<span class="saved">saved {saved} ms</span>
	</div>
	{#if note}<p class="note">{note}</p>{/if}
</div>

<style>
	.badge {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	.factor {
		font-family: var(--font-mono);
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--accent);
	}
	.saved {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-300);
	}
	.note {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-ink-300);
	}
</style>
