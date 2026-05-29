<script lang="ts">
	import type { Snippet } from 'svelte';
	import HeroImage from './HeroImage.svelte';
	import { app } from '$lib/state/app.svelte';

	interface Props {
		title: string;
		eyebrow?: string;
		motivation?: string;
		hero?: { id: string; alt: string };
		intro?: Snippet;
		narrative: Snippet;
		demo?: Snippet;
		inspect?: Snippet;
	}

	let { title, eyebrow, motivation, hero, intro, narrative, demo, inspect }: Props = $props();

	const hasDemo = $derived(!!(demo || inspect));
	// Present mode always renders the narrative (slides); otherwise honor toggles.
	const showBook = $derived(app.presentationMode || app.viewMode.book);
	const showWorkshop = $derived(hasDemo && !app.presentationMode && app.viewMode.workshop);
	const single = $derived(!(showBook && showWorkshop));
</script>

<main class="lesson-shell" class:single>
	{#if showBook}
		<section class="narrative-pane scrollbar-slim">
			<div class="narrative-inner">
			{#if eyebrow}
				<div class="eyebrow hide-in-presentation font-display">{eyebrow}</div>
			{/if}
			<section data-slide class="title-slide">
				{#if hero}
					<div class="hero-frame hide-in-presentation">
						<HeroImage id={hero.id} alt={hero.alt} />
					</div>
				{/if}
				<h1 class="font-display">{title}</h1>
				{#if motivation}
					<p class="motivation font-prose">{motivation}</p>
				{/if}
				{#if intro}
					<div class="intro font-prose">{@render intro()}</div>
				{/if}
				<hr class="ornament" aria-hidden="true" />
			</section>
			{@render narrative()}
			</div>
		</section>
	{/if}

	{#if showWorkshop}
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

	/* One pane hidden → the survivor takes the full width. */
	.lesson-shell.single {
		grid-template-columns: 1fr;
	}

	.lesson-shell.single .narrative-inner {
		max-width: 52rem;
	}

	.lesson-shell.single .demo-inner {
		max-width: 56rem;
		margin: 0 auto;
		width: 100%;
	}

	.narrative-pane {
		border-right: 1px solid var(--color-rule);
		overflow-y: auto;
		max-height: calc(100vh - 56px);
	}

	.narrative-inner {
		max-width: 40rem;
		margin: 0 auto;
		padding: 4rem 2.75rem 8rem;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.74rem;
		color: var(--accent-ink);
		font-weight: 500;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: clamp(2.4rem, 4.5vw, 3.4rem);
		font-weight: 500;
		line-height: 1.05;
		letter-spacing: -0.025em;
		margin: 0;
		color: var(--color-ink-100);
	}

	.hero-frame {
		margin: 0 0 2rem;
		border-radius: 0.7rem;
		overflow: hidden;
		border: 1px solid var(--color-rule);
		aspect-ratio: 16 / 9;
		background: var(--color-paper);
	}

	.motivation {
		margin-top: 1.5rem;
		font-size: 1.18rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		font-style: italic;
		font-family: var(--font-prose);
		max-width: 36rem;
	}

	.intro {
		margin-top: 1.25rem;
		color: var(--color-ink-200);
		font-size: 1.05rem;
		line-height: 1.65;
	}

	.intro :global(p) {
		margin: 0 0 0.85em;
	}

	.intro :global(p:first-child::first-letter) {
		font-family: var(--font-display);
		font-size: 3.2em;
		float: left;
		line-height: 0.85;
		padding: 0.05em 0.1em 0 0;
		color: var(--accent-ink);
		font-weight: 500;
	}

	.title-slide {
		margin-bottom: 3rem;
	}

	.title-slide hr.ornament {
		margin-top: 2.25rem;
	}

	.demo-pane {
		background: var(--color-paper);
		max-height: calc(100vh - 56px);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.demo-inner {
		overflow-y: auto;
		padding: 2.25rem 1.85rem 4rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Multiple <Panel>s / DemoFrames inside one snippet are direct children of
	   these blocks; without their own gap they visually touch. */
	.demo-block,
	.inspect-block {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
			border-top: 1px solid var(--color-rule);
		}
	}

	@media (max-width: 640px) {
		.narrative-inner {
			padding: 2.5rem 1.25rem 4rem;
		}
		.demo-inner {
			padding: 1.5rem 1rem 3rem;
		}
	}
</style>
