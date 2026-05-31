<script lang="ts">
	import { chapterById } from '$lib/curriculum';
	import LessonNav from '$lib/components/LessonNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
	const chapter = chapterById('langgraph');
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
	.chapter-shell.lesson {
		/* Full-height shell pulled up under the 60px frosted nav so BOTH panes scroll
		   under it; each pane's content adds top padding to clear the nav at rest.
		   position:relative anchors the frosted footer that content scrolls under. */
		height: 100vh;
		margin-top: -60px;
		min-height: 0;
		position: relative;
	}
	.chapter-shell.lesson .chapter-content {
		overflow: hidden;
	}
	@media (max-width: 960px) {
		.chapter-shell.lesson {
			height: auto;
			margin-top: 0;
			min-height: calc(100vh - 60px);
		}
		.chapter-shell.lesson .chapter-content {
			overflow: visible;
		}
	}
</style>
