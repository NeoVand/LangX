<script lang="ts">
	import type { Snippet } from 'svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { chapterById, type Chapter } from '$lib/curriculum';

	interface Props {
		id: Chapter['id'];
		/** Matches `static/images/<heroId>.png` — see image-prompts.md “Chapter intros”. */
		heroId: string;
		heroAlt: string;
		/** object-position for cropping the banner artwork. */
		heroFocal?: string;
		intro: Snippet;
	}

	let { id, heroId, heroAlt, heroFocal = '50% 42%', intro }: Props = $props();
	const chapter = $derived(chapterById(id));
</script>

<svelte:head>
	<title>{chapter.title} · LangX</title>
</svelte:head>

<main class="chapter-intro scrollbar-slim">
	<header class="banner">
		<div class="banner-frame">
			<HeroImage id={heroId} alt={heroAlt} banner focal={heroFocal} />
		</div>
		<h1 class="sr-only">{chapter.title} — Phase {chapter.number}</h1>
	</header>

	<section class="intro-body">
		<div class="intro-copy font-prose">
			{@render intro()}
		</div>
		<p class="tagline font-prose">{chapter.tagline}</p>
	</section>

	<section class="lessons">
		<h2 class="font-display lessons-head">Lessons</h2>
		<ol class="lesson-list">
			{#each chapter.lessons as lesson, i (lesson.slug)}
				<li>
					<a href="{chapter.base}/{lesson.slug}">
						<span class="num font-mono">{String(i + 1).padStart(2, '0')}</span>
						<span class="body">
							<span class="title font-display">{lesson.title}</span>
							<span class="subtitle font-prose">{lesson.subtitle}</span>
						</span>
						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			{/each}
		</ol>
	</section>
</main>

<style>
	.chapter-intro {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.75rem 2.25rem 6rem;
		overflow-y: auto;
		max-height: calc(100vh - 60px);
		color: var(--color-ink-100);
	}

	.banner {
		margin: 0 0 2.75rem;
	}

	.banner-frame {
		position: relative;
		border-radius: 1rem;
		overflow: hidden;
		aspect-ratio: 16 / 9;
		min-height: clamp(18rem, 48vw, 34rem);
		background: var(--color-paper);
		box-shadow: 0 28px 64px -28px color-mix(in oklch, black 62%, transparent);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.intro-body {
		max-width: 42rem;
		margin: 0 auto 2.25rem;
		text-align: center;
	}

	.intro-copy {
		font-size: 1.12rem;
		line-height: 1.65;
		color: var(--color-ink-200);
	}

	.intro-copy :global(p) {
		margin: 0;
	}

	.intro-copy :global(p + p) {
		margin-top: 0.85rem;
	}

	.intro-copy :global(strong) {
		color: var(--color-ink-100);
		font-weight: 600;
	}

	.tagline {
		margin-top: 1rem;
		font-style: italic;
		color: var(--color-ink-300);
		font-size: 1rem;
		line-height: 1.55;
	}

	.lessons-head {
		max-width: 38rem;
		margin: 0 0 1.5rem;
		font-size: 1.6rem;
		font-weight: 500;
		letter-spacing: -0.012em;
		color: var(--color-ink-100);
	}

	.lesson-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--color-rule);
	}

	.lesson-list li {
		border-bottom: 1px solid var(--color-rule);
	}

	.lesson-list a {
		display: grid;
		grid-template-columns: 3rem 1fr auto;
		align-items: center;
		gap: 1rem;
		padding: 1.05rem 0.6rem;
		text-decoration: none;
		color: var(--color-ink-100);
		transition:
			background 0.18s ease,
			padding 0.18s ease;
	}

	.lesson-list a:hover {
		background: var(--color-paper);
		padding-left: 1.1rem;
	}

	.num {
		font-size: 0.74rem;
		color: var(--accent-ink);
		letter-spacing: 0.08em;
	}

	.title {
		font-size: 1.18rem;
		font-weight: 500;
		display: block;
		color: var(--color-ink-100);
		letter-spacing: -0.01em;
	}

	.subtitle {
		font-size: 0.92rem;
		color: var(--color-ink-200);
		display: block;
		margin-top: 0.15rem;
	}

	.arrow {
		color: var(--color-ink-300);
		font-size: 1.1rem;
		transition:
			transform 0.18s ease,
			color 0.18s ease;
		font-family: var(--font-display);
	}

	.lesson-list a:hover .arrow {
		color: var(--accent-ink);
		transform: translateX(4px);
	}

	@media (max-width: 820px) {
		.banner-frame {
			min-height: clamp(14rem, 52vw, 22rem);
			border-radius: 0.85rem;
		}

		.intro-body {
			text-align: left;
			margin-bottom: 2.5rem;
		}
	}

	@media (max-width: 520px) {
		.chapter-intro {
			padding: 1.25rem 1.1rem 4rem;
		}

		.banner {
			margin-bottom: 2rem;
		}
	}
</style>
