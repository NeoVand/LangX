<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import TopNav from '$lib/components/TopNav.svelte';
	import PresentationShell from '$lib/components/PresentationShell.svelte';
	import { detectWebGpu, markVisited } from '$lib/state/app.svelte';
	import { page } from '$app/state';

	let { children } = $props();

	$effect(() => {
		detectWebGpu();
	});

	$effect(() => {
		markVisited(page.url.pathname);
	});

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

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div data-chapter={chapter}>
	<PresentationShell>
		<TopNav />
		{@render children?.()}
	</PresentationShell>
</div>
