<script lang="ts">
	import { chapterById } from '$lib/curriculum';
	import LessonNav from '$lib/components/LessonNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	const chapter = chapterById('langchain');
	const isIntro = $derived(page.url.pathname === chapter.base);
	const isLesson = $derived(!isIntro);
</script>

<div class="chapter-shell">
	<div class="chapter-content">
		{@render children?.()}
	</div>
	{#if isLesson}
		<LessonNav {chapter} />
	{/if}
</div>

<style>
	.chapter-shell {
		/* Full-height shell pulled up under the 60px frosted sticky nav so page content
		   — the lesson panes, and the landing's lesson column — scrolls UNDER it; each
		   scrolling pane adds top padding to clear the nav at rest. position:relative
		   anchors the frosted footer that lesson content scrolls under. */
		display: flex;
		flex-direction: column;
		height: 100vh;
		margin-top: -60px;
		min-height: 0;
		position: relative;
	}
	.chapter-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	@media (max-width: 960px) {
		/* Narrow: content stacks and the page scrolls naturally under the sticky nav. */
		.chapter-shell {
			height: auto;
			margin-top: 0;
			min-height: calc(100vh - 60px);
		}
		.chapter-content {
			overflow: visible;
		}
	}
</style>
