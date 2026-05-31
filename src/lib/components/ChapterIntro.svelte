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
		/** Richer hero subtitle; falls back to the short card tagline. */
		tagline?: string;
		intro: Snippet;
	}

	let { id, heroId, heroAlt, heroFocal = '50% 50%', tagline, intro }: Props = $props();
	const chapter = $derived(chapterById(id));
	const heroTagline = $derived(tagline ?? chapter.tagline);
</script>

<svelte:head>
	<title>{chapter.title} · LangX</title>
</svelte:head>

<main class="chapter-intro" data-chapter={id}>
	<div class="intro-grid">
		<!-- Left: artwork with the title rendered over it (art file is text-free). -->
		<header class="hero-col">
			<div class="hero-frame">
				<HeroImage id={heroId} alt={heroAlt} banner focal={heroFocal} />
				<div class="hero-overlay">
					<span class="eyebrow font-mono">Level {chapter.number}</span>
					<h1 class="hero-title font-display">{chapter.title}</h1>
					<p class="hero-tagline font-prose">{heroTagline}</p>
				</div>
			</div>
		</header>

		<!-- Right: the bird's-eye intro, then the full lesson list. -->
		<div class="side-col">
			<div class="intro-copy font-prose">
				{@render intro()}
			</div>

			<nav class="lessons" aria-label="Lessons in this level">
				<h2 class="lessons-head font-mono">Lessons</h2>
				<ol class="lesson-list">
					{#each chapter.lessons as lesson, i (lesson.slug || i)}
						<li class:soon={lesson.comingSoon}>
							{#if lesson.comingSoon}
								<div class="lesson-row">
									<span class="num font-mono">{String(i + 1).padStart(2, '0')}</span>
									<span class="body">
										<span class="title font-display">{lesson.title}</span>
										<span class="subtitle font-prose">{lesson.subtitle}</span>
									</span>
									<span class="soon-tag font-mono">soon</span>
								</div>
							{:else}
								<a class="lesson-row" href="{chapter.base}/{lesson.slug}">
									<span class="num font-mono">{String(i + 1).padStart(2, '0')}</span>
									<span class="body">
										<span class="title font-display">{lesson.title}</span>
										<span class="subtitle font-prose">{lesson.subtitle}</span>
									</span>
									<span class="arrow" aria-hidden="true">→</span>
								</a>
							{/if}
						</li>
					{/each}
				</ol>
			</nav>
		</div>
	</div>
</main>

<style>
	/* Page scrolls naturally — no inner overflow container (that caused a 2nd scrollbar). */
	.chapter-intro {
		max-width: 76rem;
		margin: 0 auto;
		padding: 1.75rem 2.25rem 3.5rem;
		color: var(--color-ink-100);
	}

	.intro-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
		gap: 2.25rem;
		align-items: start;
	}

	/* ── Hero with overlaid title ──────────────────────────────────────────── */
	.hero-frame {
		position: relative;
		border-radius: 1rem;
		overflow: hidden;
		aspect-ratio: 2 / 3;
		/* Pure black behind the (vignetted) artwork so the rounded edge melts in — no
		   visible frame border or drop-shadow halo. */
		background: #000;
	}

	.hero-overlay {
		position: absolute;
		inset: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.3rem;
		padding: 1.75rem 1.7rem;
		background: linear-gradient(
			to top,
			color-mix(in oklch, #000 86%, transparent) 0%,
			color-mix(in oklch, #000 45%, transparent) 30%,
			transparent 55%
		);
	}

	.eyebrow {
		font-size: 0.7rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--accent);
	}

	/* Editorial title: generous serif with an enlarged drop-cap initial. */
	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 4.8vw, 3.4rem);
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 0.98;
		margin: 0.1rem 0 0;
		color: var(--color-cream-0);
	}

	.hero-title::first-letter {
		font-size: 1.5em;
		font-weight: 600;
		color: var(--accent);
	}

	.hero-tagline {
		margin: 0.55rem 0 0;
		font-family: var(--font-prose);
		font-style: italic;
		font-size: 1rem;
		line-height: 1.5;
		color: var(--color-cream-2);
		max-width: 26rem;
	}

	/* ── Right column ──────────────────────────────────────────────────────── */
	.side-col {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.intro-copy {
		font-size: 1.02rem;
		line-height: 1.62;
		color: var(--color-ink-200);
	}

	.intro-copy :global(p) {
		margin: 0;
	}
	.intro-copy :global(p + p) {
		margin-top: 0.7rem;
	}
	.intro-copy :global(strong) {
		color: var(--color-ink-100);
		font-weight: 600;
	}

	.lessons-head {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-ink-300);
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

	.lesson-row {
		display: grid;
		grid-template-columns: 2rem 1fr auto;
		align-items: center;
		gap: 0.85rem;
		padding: 0.7rem 0.5rem;
		text-decoration: none;
		color: var(--color-ink-100);
		transition:
			background 0.16s ease,
			padding 0.16s ease;
	}

	a.lesson-row:hover {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		padding-left: 0.75rem;
	}

	.num {
		font-size: 0.72rem;
		color: var(--accent);
		letter-spacing: 0.06em;
	}

	.title {
		font-size: 1rem;
		font-weight: 500;
		display: block;
		color: var(--color-ink-100);
		letter-spacing: -0.01em;
	}

	.subtitle {
		font-size: 0.84rem;
		color: var(--color-ink-200);
		display: block;
		margin-top: 0.1rem;
	}

	.arrow {
		color: var(--color-ink-300);
		font-size: 1.05rem;
		font-family: var(--font-display);
		transition:
			transform 0.16s ease,
			color 0.16s ease;
	}

	a.lesson-row:hover .arrow {
		color: var(--accent);
		transform: translateX(4px);
	}

	/* Coming-soon teaser row: present but not yet linkable. */
	.lesson-list li.soon .lesson-row {
		cursor: default;
	}
	.lesson-list li.soon .title,
	.lesson-list li.soon .subtitle {
		opacity: 0.62;
	}

	.soon-tag {
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--color-rule));
		border-radius: 999px;
		padding: 0.12rem 0.45rem;
	}

	/* ── Responsive: stack hero over the lesson column ─────────────────────── */
	@media (max-width: 880px) {
		.intro-grid {
			grid-template-columns: 1fr;
			gap: 1.75rem;
		}
		/* Keep the 2:3 aspect (so the artwork never crops), just cap its width and
		   centre it so the hero isn't enormous on a tablet. */
		.hero-frame {
			max-width: 23rem;
			margin-inline: auto;
		}
	}

	@media (max-width: 520px) {
		.chapter-intro {
			padding: 1.25rem 1.1rem 3rem;
		}
	}
</style>
