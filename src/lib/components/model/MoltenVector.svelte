<script lang="ts">
	// A thin "molten metal" vector strip — the Transformer Explainer's signature
	// way of drawing a vector (a column of numbers as a glowing gradient of cells).
	// Self-contained: it generates deterministic values from a seed and sizes to its
	// container, reusing the explainer's theme palette so it matches the live workshop.
	import * as d3 from 'd3';
	import { theme } from '$lib/transformer-explainer/constants/theme';

	type Tone = 'gold' | 'amber' | 'bronze' | 'blue' | 'red' | 'green' | 'purple';

	interface Props {
		tone?: Tone;
		/** Different seeds → different textures, so each token/vector reads distinct. */
		seed?: number;
		/** Strip width in px. */
		width?: number;
		active?: boolean;
	}
	let { tone = 'gold', seed = 1, width = 13, active = true }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let host: HTMLDivElement | undefined = $state();

	const isGold = $derived(['gold', 'amber', 'bronze'].includes(tone));
	const hi = $derived(theme.colors[tone][isGold ? 100 : 200]);
	const lo = $derived(isGold ? theme.colors[tone][300] : '#191510');

	// deterministic pseudo-random in [0,1)
	function rand(i: number): number {
		const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
		return x - Math.floor(x);
	}

	function draw() {
		if (!canvas || !host) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const w = host.clientWidth;
		const h = host.clientHeight;
		if (w === 0 || h === 0) return;
		const pr = 3;
		canvas.width = w * pr;
		canvas.height = h * pr;
		canvas.style.width = `${w}px`;
		canvas.style.height = `${h}px`;
		const color = d3.interpolateRgb(lo, hi);
		const lines = Math.max(1, Math.round(h));
		const step = (h * pr) / lines;
		for (let i = 0; i < lines; i++) {
			ctx.fillStyle = color(rand(i));
			ctx.fillRect(0, i * step, w * pr, step + 1);
		}
	}

	$effect(() => {
		// draw() reads lo/hi/seed, so this effect re-runs when the tone or seed changes
		draw();
		if (!host) return;
		const ro = new ResizeObserver(() => draw());
		ro.observe(host);
		return () => ro.disconnect();
	});
</script>

<div class="molten" class:active bind:this={host} style:width="{width}px">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.molten {
		position: relative;
		height: 100%;
		border-radius: 3px;
		overflow: hidden;
		opacity: 0.9;
		transition: opacity 0.2s;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
	}
	.molten.active {
		opacity: 1;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
