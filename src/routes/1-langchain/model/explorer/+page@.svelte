<script lang="ts" module>
	// Client-only: the explorer uses onnxruntime-web, d3, the Cache API and window.
	export const ssr = false;
</script>

<script lang="ts">
	// `+page@.svelte` breaks out of the chapter's lesson chrome (LessonNav, fixed
	// two-pane shell) back to the root layout, so the visualization gets the full
	// viewport width it needs — only the 60px TopNav sits above it.
	import Explorer from '$lib/transformer-explainer/Explorer.svelte';
	import '$lib/transformer-explainer/styles/te-theme.css';
</script>

<svelte:head>
	<title>Transformer Explorer · LangX</title>
</svelte:head>

<div class="explorer-page">
	<Explorer />
</div>

<style>
	.explorer-page {
		height: calc(100dvh - 60px);
		width: 100%;
		overflow: auto;
	}
</style>
