<script lang="ts">
	import './layout.css';
	import TopNav from '$lib/components/TopNav.svelte';
	import { detectWebGpu, markVisited } from '$lib/state/app.svelte';
	import { page } from '$app/state';

	let { children } = $props();

	$effect(() => {
		detectWebGpu();
	});

	$effect(() => {
		markVisited(page.url.pathname);
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
	{@render children?.()}
</div>
