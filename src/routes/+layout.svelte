<script lang="ts">
	import './layout.css';
	import TopNav from '$lib/components/TopNav.svelte';
	import ModelDownloadBanner from '$lib/components/ModelDownloadBanner.svelte';
	import { detectWebGpu, markVisited } from '$lib/state/app.svelte';
	import { trackRoute } from '$lib/state/nav.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Detect WebGPU once. The local model is NOT pre-warmed here — it's warmed from the
	// Setup page (when picked/downloaded) and otherwise loads lazily on the first demo
	// run, then stays in memory (global worker singleton) across lesson navigation.
	onMount(() => {
		detectWebGpu();
	});

	$effect(() => {
		markVisited(page.url.pathname);
		trackRoute(page.url.pathname);
	});

	// Favicon is set once in app.html (the parrot mark) — no per-route override here,
	// otherwise it overwrites the parrot with the imported default after hydration.
	const chapter = $derived(
		page.url.pathname.startsWith('/1-langchain')
			? 'langchain'
			: page.url.pathname.startsWith('/2-langgraph')
				? 'langgraph'
				: page.url.pathname.startsWith('/3-deepagents')
					? 'deepagents'
					: undefined
	);
</script>

<div data-chapter={chapter}>
	<TopNav />
	<ModelDownloadBanner />
	{@render children?.()}
</div>
