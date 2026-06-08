<script>
	// @ts-nocheck
	import { tokens, expandedBlock, modelData } from '$lib/transformer-explainer/store';
	import VectorCanvas from './VectorCanvas.svelte';

	export let color;
	export let data;
</script>

<div class={`vector ${color}`} class:last={index === $tokens.length - 1}>
	<div class="canvas-container h-full w-full" class:active={isHovered || isEmbeddingExpanded}>
		{#if data}<VectorCanvas {data} />{/if}
	</div>
</div>
