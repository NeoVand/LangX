<script lang="ts">
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { chapterById } from '$lib/curriculum';

	const chapter = chapterById('langgraph');
</script>

<svelte:head>
	<title>{chapter.title} · LangX</title>
</svelte:head>

<main class="intro scrollbar-slim">
	<section class="hero">
		<div class="frame">
			<HeroImage
				id="chapter-langgraph-hero"
				alt="Topographic plan view of an imaginary city, nodes as temples connected by paths"
			/>
		</div>
		<div class="copy">
			<div class="eyebrow font-display">Phase {chapter.number} · the orchestration layer</div>
			<h1 class="font-display">{chapter.title}</h1>
			<p class="lead font-prose">
				A <strong>StateGraph</strong> is a small state machine you can read like a diagram and
				step through like a debugger. Phase 2 swaps the linear pipe of LangChain for explicit
				nodes, explicit edges, and explicit shared state — the substrate every serious agent
				eventually grows into.
			</p>
			<p class="tagline font-prose">{chapter.tagline}</p>
		</div>
	</section>

	<hr class="ornament" aria-hidden="true" />

	<section class="lessons">
		<header class="lessons-head">
			<h2 class="font-display">What's in this chapter</h2>
			<p class="font-prose">
				Seven lessons. We start with the <code>StateGraph</code> primitive, layer in routing
				and reducers, add persistence and human-in-the-loop, then finish with streaming, fan-out,
				and subgraphs — every shape you'll need before reaching the harness.
			</p>
		</header>

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
	.intro {
		max-width: 64rem;
		margin: 0 auto;
		padding: 3.5rem 2rem 6rem;
		overflow-y: auto;
		max-height: calc(100vh - 56px);
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: 2.25rem;
		align-items: center;
	}

	@media (max-width: 820px) {
		.hero {
			grid-template-columns: 1fr;
		}
	}

	.frame {
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		overflow: hidden;
		aspect-ratio: 16 / 9;
		background: var(--color-paper);
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.74rem;
		color: var(--accent-ink);
		font-weight: 500;
		margin-bottom: 1.25rem;
	}

	h1 {
		font-size: clamp(2.4rem, 4.5vw, 3.4rem);
		font-weight: 500;
		line-height: 1.05;
		letter-spacing: -0.025em;
		margin: 0;
		color: var(--color-ink-100);
	}

	.lead {
		margin-top: 1.25rem;
		font-size: 1.08rem;
		line-height: 1.6;
		color: var(--color-ink-200);
	}

	.tagline {
		margin-top: 0.75rem;
		font-style: italic;
		color: var(--color-ink-300);
		font-size: 0.95rem;
	}

	.ornament {
		margin: 3.5rem auto;
		max-width: 32rem;
	}

	.lessons-head {
		text-align: center;
		margin-bottom: 2rem;
	}

	.lessons-head h2 {
		font-size: 1.8rem;
		font-weight: 500;
		letter-spacing: -0.015em;
		margin: 0 0 0.4rem;
		color: var(--color-ink-100);
	}

	.lessons-head p {
		font-size: 0.98rem;
		color: var(--color-ink-200);
		max-width: 34rem;
		margin: 0 auto;
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
		gap: 1.1rem;
		padding: 1.1rem 0.6rem;
		text-decoration: none;
		color: var(--color-ink-100);
		transition:
			background 0.15s,
			padding 0.15s;
	}

	.lesson-list a:hover {
		background: var(--color-paper);
		padding-left: 1.2rem;
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
		color: var(--color-ink-300);
		display: block;
		margin-top: 0.15rem;
	}

	.arrow {
		color: var(--color-ink-300);
		font-size: 1.15rem;
		transition:
			transform 0.18s,
			color 0.18s;
		font-family: var(--font-display);
	}

	.lesson-list a:hover .arrow {
		color: var(--accent-ink);
		transform: translateX(4px);
	}
</style>
