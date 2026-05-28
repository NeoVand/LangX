<script lang="ts">
	import { page } from '$app/state';
	import type { Chapter } from '$lib/curriculum';

	interface Props {
		chapter: Chapter;
	}

	let { chapter }: Props = $props();

	const path = $derived(page.url.pathname);
	const idx = $derived(
		chapter.lessons.findIndex((l) => path === `${chapter.base}/${l.slug}`)
	);
	const prev = $derived(idx > 0 ? chapter.lessons[idx - 1] : null);
	const next = $derived(
		idx >= 0 && idx < chapter.lessons.length - 1 ? chapter.lessons[idx + 1] : null
	);
</script>

<nav class="lesson-nav app-chrome">
	<a class="link" class:disabled={!prev} href={prev ? `${chapter.base}/${prev.slug}` : chapter.base}>
		<span class="dir">←</span>
		<span class="lbl">
			<span class="role">previous</span>
			<span class="title">{prev ? prev.title : 'Chapter intro'}</span>
		</span>
	</a>
	<div class="dots">
		{#each chapter.lessons as l, i (l.slug)}
			<a
				class="dot"
				class:current={i === idx}
				href="{chapter.base}/{l.slug}"
				aria-label={l.title}
				title={l.title}
			></a>
		{/each}
	</div>
	<a
		class="link right"
		class:disabled={!next}
		href={next ? `${chapter.base}/${next.slug}` : chapter.base}
	>
		<span class="lbl">
			<span class="role">next</span>
			<span class="title">{next ? next.title : 'End of chapter'}</span>
		</span>
		<span class="dir">→</span>
	</a>
</nav>

<style>
	.lesson-nav {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		align-items: center;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.link {
		display: inline-flex;
		gap: 0.6rem;
		align-items: center;
		text-decoration: none;
		color: var(--color-fg);
		padding: 0.45rem 0.7rem;
		border-radius: 0.4rem;
		max-width: 16rem;
	}

	.link:hover:not(.disabled) {
		background: var(--color-bg-elev);
	}

	.link.disabled {
		opacity: 0.4;
		pointer-events: none;
	}

	.right {
		justify-self: end;
		text-align: right;
	}

	.right .lbl {
		text-align: right;
	}

	.dir {
		color: var(--accent);
		font-weight: 600;
	}

	.lbl {
		display: flex;
		flex-direction: column;
	}

	.role {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-fg-faint);
	}

	.title {
		font-size: 0.88rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 14rem;
	}

	.dots {
		display: flex;
		gap: 0.4rem;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-border);
		display: block;
	}

	.dot.current {
		background: var(--accent);
		width: 16px;
		border-radius: 4px;
	}

	.dot:hover {
		background: var(--color-fg-muted);
	}
</style>
