<script lang="ts">
	import { chapterById } from '$lib/curriculum';
	import LessonNav from '$lib/components/LessonNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	const chapter = chapterById('deepagents');
	const isIntro = $derived(page.url.pathname === chapter.base);
	const isRecap = $derived(page.url.pathname.endsWith('/recap'));
</script>

<div class="chapter-shell">
	<div class="chapter-content">
		{@render children?.()}
	</div>
	{#if !isIntro && !isRecap}
		<LessonNav {chapter} />
	{/if}
</div>

<style>
	.chapter-shell {
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 56px);
	}
	.chapter-content {
		flex: 1;
		min-height: 0;
	}
</style>
