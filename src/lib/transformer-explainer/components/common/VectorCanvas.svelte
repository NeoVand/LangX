<script lang="ts">
	// @ts-nocheck
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
import { theme } from '$lib/transformer-explainer/constants/theme';
	import { vectorHeight } from '$lib/transformer-explainer/store';


	let visibleDimension = Math.floor($vectorHeight * 3.5) * 4;
	export let active: boolean = false;
	export let data: number[] = new Array(visibleDimension).fill(0).map((d) => Math.random());
	export let colorScale: string | ((t: number, i: number) => string) | undefined = undefined;

	let canvas: HTMLCanvasElement;

	const lineHeight = 1;

	$: colorKey = typeof colorScale === 'string' ? colorScale : 'gray';
	$: isGoldFamily = ['gold', 'amber', 'bronze'].includes(colorKey);
	// dark theme: low values fade into the page, high values reach a visible colour.
	// `gray` is a light warm neutral here (the gray RAMP is kept dark for the Sankey
	// residual flows, so we can't use it as a visible high end).
	// For the gold family, ramp ENTIRELY within bright gold (clear brass → light
	// gold) so every magnitude reads as luminous gold — never a dark/grey low that
	// makes the block look muddy. Structure comes from the brass↔light variation.
	$: hiColor = colorKey === 'gray' ? '#b8af9b' : theme.colors[colorKey][isGoldFamily ? 100 : 200];
	$: loColor = isGoldFamily ? theme.colors[colorKey][300] : '#191510';
	$: color = typeof colorScale === 'function' ? colorScale : d3.interpolateRgb(loColor, hiColor);

	function drawCanvas() {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const width = canvas.parentElement.clientWidth;
		const height = canvas.parentElement.clientHeight;

		ctx.clearRect(0, 0, width, height);

		let pixelRatio = 4;
		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		for (let i = 0; i < height / lineHeight; i++) {
			const value = data[i];
			ctx.fillStyle = color(value);
			ctx.fillRect(0, i * lineHeight * pixelRatio, width * pixelRatio, lineHeight * pixelRatio);
		}
	}

	onMount(() => {
		const unsubscribe = vectorHeight.subscribe(drawCanvas);
		// redraw at the box's actual size whenever layout settles, so the texture
		// is crisp (not a low-res strip stretched over a taller box).
		let ro;
		if (canvas?.parentElement && typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => drawCanvas());
			ro.observe(canvas.parentElement);
		}
		return () => {
			unsubscribe();
			ro?.disconnect();
		};
	});

	$: if (data && canvas && color) {
		drawCanvas();
	}
</script>

<canvas class:active bind:this={canvas}></canvas>

<style lang="scss">
	canvas {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		transition: opacity 0.2s;

		&.active {
			opacity: 1;
		}

		&:hover {
			opacity: 1;
		}
	}
</style>
