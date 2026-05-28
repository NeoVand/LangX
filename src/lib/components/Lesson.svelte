<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		eyebrow?: string;
		intro?: Snippet;
		narrative: Snippet;
		demo?: Snippet;
		inspect?: Snippet;
	}

	let { title, eyebrow, intro, narrative, demo, inspect }: Props = $props();
</script>

<main class="lesson-shell">
	<section class="narrative-pane scrollbar-slim">
		<div class="narrative-inner">
			{#if eyebrow}
				<div class="eyebrow hide-in-presentation">{eyebrow}</div>
			{/if}
			<section data-slide class="title-slide">
				<h1>{title}</h1>
				{#if intro}
					<div class="font-prose intro">{@render intro()}</div>
				{/if}
			</section>
			{@render narrative()}
		</div>
	</section>

	{#if demo || inspect}
		<aside class="demo-pane hide-in-presentation">
			<div class="demo-inner scrollbar-slim">
				{#if demo}
					<div class="demo-block">{@render demo()}</div>
				{/if}
				{#if inspect}
					<div class="inspect-block">{@render inspect()}</div>
				{/if}
			</div>
		</aside>
	{/if}
</main>

<style>
	.lesson-shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
		min-height: calc(100vh - 56px);
		gap: 0;
	}

	.narrative-pane {
		border-right: 1px solid var(--color-border);
		overflow-y: auto;
		max-height: calc(100vh - 56px);
	}

	.narrative-inner {
		max-width: 38rem;
		margin: 0 auto;
		padding: 4rem 2.5rem 8rem;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-size: 0.72rem;
		color: var(--accent);
		font-weight: 600;
		margin-bottom: 1rem;
	}

	h1 {
		font-family: var(--font-serif);
		font-size: 2.5rem;
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.intro {
		margin-top: 1.25rem;
		color: var(--color-fg-muted);
	}

	.title-slide {
		margin-bottom: 3rem;
	}

	.demo-pane {
		background: var(--color-bg-elev);
		max-height: calc(100vh - 56px);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.demo-inner {
		overflow-y: auto;
		padding: 2rem 1.75rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	@media (max-width: 960px) {
		.lesson-shell {
			grid-template-columns: 1fr;
		}
		.narrative-pane,
		.demo-pane {
			max-height: none;
			border-right: none;
		}
		.demo-pane {
			border-top: 1px solid var(--color-border);
		}
	}

	@media (max-width: 640px) {
		.narrative-inner {
			padding: 2.5rem 1.25rem 4rem;
		}
		h1 {
			font-size: 2rem;
		}
		.demo-inner {
			padding: 1.5rem 1rem 3rem;
		}
	}
</style>
