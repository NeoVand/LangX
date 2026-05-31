<script lang="ts">
	import { chapterById } from '$lib/curriculum';
	import LessonNav from '$lib/components/LessonNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	const chapter = chapterById('langchain');
	const isIntro = $derived(page.url.pathname === chapter.base);
	const isRecap = $derived(page.url.pathname.endsWith('/recap'));
	const isLesson = $derived(!isIntro && !isRecap);
</script>

<div class="chapter-shell" class:lesson={isLesson}>
	<div class="chapter-content">
		{@render children?.()}
	</div>
	{#if isLesson}
		<LessonNav {chapter} />
	{/if}
</div>

<style>
	.chapter-shell {
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 60px);
	}
	.chapter-content {
		flex: 1;
		min-height: 0;
	}
	/* Lessons: fixed-height shell so the panes scroll internally and the prev/next
	   footer is always visible — no scrolling to the bottom to advance. */
	.chapter-shell.lesson {
		height: calc(100vh - 60px);
		min-height: 0;
	}
	.chapter-shell.lesson .chapter-content {
		overflow: hidden;
	}
	@media (max-width: 960px) {
		/* Narrow: panes stack, so let the page scroll naturally. */
		.chapter-shell.lesson {
			height: auto;
			min-height: calc(100vh - 60px);
		}
		.chapter-shell.lesson .chapter-content {
			overflow: visible;
		}
	}
</style>
