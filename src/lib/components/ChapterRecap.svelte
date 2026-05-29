<script lang="ts">
	import type { Snippet } from 'svelte';
	import { chapterById, type Chapter } from '$lib/curriculum';
	import Diagram from '$lib/components/Diagram.svelte';
	import type { DiagramSpec } from '$lib/diagrams/types';

	interface Props {
		chapterId: Chapter['id'];
		blurb: string | Snippet;
		next?: { href: string; label: string } | null;
		complete?: boolean;
		diagram?: DiagramSpec | null;
	}

	let { chapterId, blurb, next = null, complete = false, diagram = null }: Props = $props();
	const chapter = $derived(chapterById(chapterId));
</script>

<main class="recap" data-chapter={chapter.id}>
	<div class="inner">
		<div class="eyebrow font-mono">Phase {chapter.number} · Recap</div>
		<h1 class="font-display">{chapter.title} — what you learned</h1>
		<p class="blurb font-prose">
			{#if typeof blurb === 'string'}
				{blurb}
			{:else}
				{@render blurb()}
			{/if}
		</p>

		{#if diagram}
			<Diagram spec={diagram} />
		{/if}

		<ol class="grid">
			{#each chapter.lessons as l, i (l.slug)}
				<li>
					<a href={`${chapter.base}/${l.slug}`}>
						<span class="n font-mono">{String(i + 1).padStart(2, '0')}</span>
						<span class="body">
							<span class="t">{l.title}</span>
							<span class="s">{l.subtitle}</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>

		{#if complete}
			<div class="cta complete">
				<h2 class="font-display">Course complete</h2>
				<p>
					You have walked the whole stack: composable Runnables, stateful graphs, and the
					full Deep Agents harness. Everything here ran live in your browser.
				</p>
				<a class="btn" href="/">Back to the start</a>
			</div>
		{:else if next}
			<a class="btn forward" href={next.href}>{next.label} →</a>
		{/if}
	</div>
</main>

<style>
	.recap {
		min-height: calc(100vh - 56px);
		display: flex;
		justify-content: center;
		padding: 4rem 2rem 6rem;
	}
	.inner {
		max-width: 44rem;
		width: 100%;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.74rem;
		color: var(--accent-ink, var(--color-accent-langchain));
		margin-bottom: 1rem;
	}
	h1 {
		font-size: clamp(2.2rem, 4vw, 3rem);
		font-weight: 500;
		letter-spacing: -0.025em;
		margin: 0 0 1rem;
		color: var(--color-ink-100);
	}
	.blurb {
		font-size: 1.1rem;
		line-height: 1.6;
		color: var(--color-ink-200);
		font-style: italic;
		margin: 0 0 2.5rem;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 0 0 2.5rem;
		display: grid;
		gap: 0.6rem;
	}
	.grid a {
		display: flex;
		gap: 0.85rem;
		align-items: baseline;
		padding: 0.85rem 1rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		text-decoration: none;
		background: var(--color-bg);
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.grid a:hover {
		border-color: var(--accent-ink, var(--color-accent-langchain));
		background: var(--color-paper);
	}
	.n {
		color: var(--color-ink-300);
		font-size: 0.8rem;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.t {
		font-weight: 600;
		color: var(--color-ink-100);
	}
	.s {
		font-size: 0.85rem;
		color: var(--color-ink-300);
	}
	.btn {
		display: inline-block;
		padding: 0.7rem 1.3rem;
		border-radius: 0.5rem;
		background: var(--accent-ink, var(--color-accent-langchain));
		color: var(--color-paper, #fff);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.cta.complete {
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		padding: 2rem;
		background: var(--color-paper);
		text-align: center;
	}
	.cta.complete h2 {
		margin: 0 0 0.75rem;
		font-size: 1.8rem;
		font-weight: 500;
	}
	.cta.complete p {
		margin: 0 0 1.5rem;
		color: var(--color-ink-200);
		line-height: 1.6;
	}
</style>
