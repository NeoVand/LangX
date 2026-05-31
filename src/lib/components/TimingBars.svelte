<script lang="ts">
	interface Bar {
		label: string;
		ms: number;
	}
	let { bars }: { bars: Bar[] } = $props();
	const max = $derived(bars.length ? Math.max(1, ...bars.map((b) => b.ms)) : 1);
</script>

<div class="bars">
	{#each bars as b (b.label)}
		<div class="bar-row">
			<span class="bl">{b.label}</span>
			<div class="track">
				<div class="fill" style="width: {Math.max(2, (b.ms / max) * 100)}%"></div>
			</div>
			<span class="bv">{b.ms} ms</span>
		</div>
	{/each}
</div>

<style>
	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 9rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}
	.bl {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-200);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track {
		height: 0.7rem;
		border-radius: 0.35rem;
		background: var(--color-paper);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: color-mix(in oklch, var(--accent) 45%, transparent);
		border-radius: 0.35rem;
		transition: width 0.3s ease;
	}
	.bv {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent);
		white-space: nowrap;
	}
</style>
