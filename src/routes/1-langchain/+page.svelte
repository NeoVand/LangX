<script lang="ts">
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { chapterById } from '$lib/curriculum';

	const chapter = chapterById('langchain');
</script>

<main class="intro">
	<section class="hero">
		<div class="hero-frame">
			<HeroImage
				id="chapter-langchain-hero"
				alt="A cross-section of an industrial pipe organ"
			/>
		</div>
		<div class="hero-text">
			<div class="eyebrow font-display">Phase {chapter.number}</div>
			<h1 class="font-display">{chapter.title}</h1>
			<p class="lead font-prose">{chapter.tagline}</p>
			<p class="motivation font-prose">
				LangChain is the foundation layer: small, composable primitives — prompts, models,
				parsers, tools, retrievers — that all speak the same Runnable protocol. Master
				these six lessons and every later chapter is a recombination of them.
			</p>
		</div>
	</section>

	<hr class="ornament" aria-hidden="true" />

	<section class="lessons">
		<header class="lessons-head">
			<h2 class="font-display">Lessons</h2>
			<p class="lessons-sub font-prose">
				Six lessons, each with editorial slides and a live demo on the right.
			</p>
		</header>
		<ol>
			{#each chapter.lessons as lesson, i (lesson.slug)}
				<li>
					<a href="{chapter.base}/{lesson.slug}">
						<span class="num">{String(i + 1).padStart(2, '0')}</span>
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
	.intro {
		max-width: 60rem;
		margin: 0 auto;
		padding: 4rem 2.25rem 6rem;
		color: var(--color-ink-100);
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: 2.5rem;
		align-items: center;
		margin-bottom: 3rem;
	}

	.hero-frame {
		border-radius: 0.7rem;
		overflow: hidden;
		border: 1px solid var(--color-rule);
		aspect-ratio: 16 / 9;
		background: var(--color-paper);
	}

	.hero-text {
		max-width: 30rem;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.74rem;
		color: var(--accent-ink);
		font-weight: 500;
		margin-bottom: 1rem;
		font-family: var(--font-mono);
	}

	h1 {
		font-size: clamp(2.4rem, 4.5vw, 3.4rem);
		font-weight: 500;
		margin: 0;
		line-height: 1.05;
		letter-spacing: -0.025em;
		color: var(--color-ink-100);
	}

	.lead {
		font-size: 1.18rem;
		color: var(--color-ink-100);
		margin-top: 1.25rem;
		line-height: 1.55;
		font-style: italic;
	}

	.motivation {
		margin-top: 1.1rem;
		color: var(--color-ink-200);
		font-size: 1.02rem;
		line-height: 1.65;
	}

	.lessons-head {
		max-width: 38rem;
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.6rem;
		font-weight: 500;
		margin: 0;
		color: var(--color-ink-100);
		letter-spacing: -0.012em;
	}

	.lessons-sub {
		margin-top: 0.35rem;
		font-size: 0.98rem;
		color: var(--color-ink-200);
	}

	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--color-rule);
	}

	li {
		border-bottom: 1px solid var(--color-rule);
	}

	a {
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

	a:hover {
		background: var(--color-paper);
		padding-left: 1.1rem;
	}

	.num {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink-300);
	}

	.title {
		font-size: 1.2rem;
		font-weight: 500;
		display: block;
		color: var(--color-ink-100);
		letter-spacing: -0.012em;
	}

	.subtitle {
		font-size: 0.95rem;
		color: var(--color-ink-200);
		display: block;
		margin-top: 0.2rem;
	}

	.arrow {
		color: var(--color-ink-300);
		font-size: 1.1rem;
		transition:
			transform 0.18s ease,
			color 0.18s ease;
	}

	a:hover .arrow {
		color: var(--accent-ink);
		transform: translateX(4px);
	}

	@media (max-width: 720px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}
</style>
