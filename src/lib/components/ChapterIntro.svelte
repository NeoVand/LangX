<script lang="ts">
	import { chapterById, type Chapter } from '$lib/curriculum';

	interface Props {
		id: Chapter['id'];
	}

	let { id }: Props = $props();
	const chapter = $derived(chapterById(id));
</script>

<main class="intro">
	<section class="hero">
		<div class="eyebrow">Phase {chapter.number}</div>
		<h1>{chapter.title}</h1>
		<p class="lead">{chapter.tagline}</p>
	</section>

	<section class="lessons">
		<h2>Lessons</h2>
		<ol>
			{#each chapter.lessons as lesson, i (lesson.slug)}
				<li>
					<a href="{chapter.base}/{lesson.slug}">
						<span class="num">{String(i + 1).padStart(2, '0')}</span>
						<span class="body">
							<span class="title">{lesson.title}</span>
							<span class="subtitle">{lesson.subtitle}</span>
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
		max-width: 56rem;
		margin: 0 auto;
		padding: 4rem 2rem 6rem;
	}

	.hero {
		max-width: 38rem;
		margin-bottom: 3rem;
	}

	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
		margin-bottom: 0.75rem;
		font-weight: 600;
	}

	h1 {
		font-family: var(--font-serif);
		font-size: 3rem;
		font-weight: 600;
		margin: 0;
		line-height: 1.1;
		color: var(--color-fg);
	}

	.lead {
		font-family: var(--font-serif);
		font-size: 1.15rem;
		color: var(--color-fg-muted);
		margin-top: 1rem;
		line-height: 1.6;
	}

	h2 {
		font-family: var(--font-serif);
		font-size: 1.4rem;
		font-weight: 600;
		margin: 0 0 1rem;
	}

	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--color-border);
	}

	li {
		border-bottom: 1px solid var(--color-border);
	}

	a {
		display: grid;
		grid-template-columns: 3rem 1fr auto;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0.5rem;
		text-decoration: none;
		color: var(--color-fg);
		transition: background 0.15s, padding 0.15s;
	}

	a:hover {
		background: var(--color-bg-elev);
		padding-left: 1rem;
	}

	.num {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-fg-faint);
	}

	.title {
		font-family: var(--font-serif);
		font-size: 1.2rem;
		font-weight: 600;
		display: block;
	}

	.subtitle {
		font-size: 0.9rem;
		color: var(--color-fg-muted);
		display: block;
		margin-top: 0.15rem;
	}

	.arrow {
		color: var(--color-fg-faint);
		font-size: 1.1rem;
		transition: transform 0.15s, color 0.15s;
	}

	a:hover .arrow {
		color: var(--accent);
		transform: translateX(4px);
	}
</style>
