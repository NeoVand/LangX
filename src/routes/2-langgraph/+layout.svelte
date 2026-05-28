<script lang="ts">
	import { chapterById } from '$lib/curriculum';
	import LessonNav from '$lib/components/LessonNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	const chapter = chapterById('langgraph');
	const isIntro = $derived(page.url.pathname === chapter.base);
</script>

<div class="chapter-shell">
	<div class="chapter-content">
		{@render children?.()}
	</div>
	{#if !isIntro}
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
