<script lang="ts">
	interface Pixel {
		x: number;
		y: number;
		color: string;
	}
	interface Props {
		pixels: Pixel[];
		cols?: number;
		rows?: number;
		/** Index of the most recently placed pixel, to flash it. */
		lastIndex?: number;
		size?: number;
	}
	let { pixels, cols = 11, rows = 11, lastIndex = -1, size = 220 }: Props = $props();

	const colorAt = $derived.by(() => {
		const m: Record<number, string> = {};
		pixels.forEach((p) => (m[p.y * cols + p.x] = p.color));
		return m;
	});
	const lastKey = $derived(lastIndex >= 0 && pixels[lastIndex] ? pixels[lastIndex].y * cols + pixels[lastIndex].x : -1);
	const cells = $derived(Array.from({ length: cols * rows }, (_, i) => i));
</script>

<div class="canvas" style="--cols:{cols};--rows:{rows};--sz:{size}px">
	{#each cells as i (i)}
		{@const c = colorAt[i]}
		<div class="cell" class:on={c} class:flash={i === lastKey} style={c ? `--c:${c}` : ''}></div>
	{/each}
</div>

<style>
	.canvas {
		width: var(--sz);
		max-width: 100%;
		aspect-ratio: var(--cols) / var(--rows);
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
		gap: 1px;
		padding: 6px;
		border-radius: 0.6rem;
		background: var(--color-paper);
		border: 1px solid var(--color-rule);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
	}
	.cell {
		border-radius: 2px;
		background: color-mix(in oklch, var(--color-fg) 4%, transparent);
		transition: background 0.18s ease, box-shadow 0.18s ease;
	}
	.cell.on {
		background: var(--c);
	}
	.cell.flash {
		box-shadow: 0 0 7px 1px var(--c);
	}
</style>
