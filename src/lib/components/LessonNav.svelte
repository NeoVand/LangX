<script lang="ts">
	import { page } from '$app/state';
	import { app, toggleWorkshop, toggleBook, ui } from '$lib/state/app.svelte';
	import Icon from './Icon.svelte';
	import { chapters, type Chapter } from '$lib/curriculum';

	interface Props {
		chapter: Chapter;
	}

	let { chapter }: Props = $props();

	const path = $derived(page.url.pathname);
	const idx = $derived(chapter.lessons.findIndex((l) => path === `${chapter.base}/${l.slug}`));
	const prev = $derived(idx > 0 ? chapter.lessons[idx - 1] : null);
	const next = $derived(
		idx >= 0 && idx < chapter.lessons.length - 1 ? chapter.lessons[idx + 1] : null
	);

	// The next level (chapter), for the end-of-chapter hand-off.
	const chapterIdx = $derived(chapters.findIndex((c) => c.id === chapter.id));
	const nextChapter = $derived(
		chapterIdx >= 0 && chapterIdx < chapters.length - 1 ? chapters[chapterIdx + 1] : null
	);

	// Right-hand link: the next lesson → then the next chapter's landing page →
	// then home (after the final chapter). No more "End of chapter" dead-end.
	const rightHref = $derived(
		next ? `${chapter.base}/${next.slug}` : nextChapter ? nextChapter.base : '/'
	);
	const rightRole = $derived(next ? 'next' : nextChapter ? 'next chapter' : 'finish');
	const rightTitle = $derived(
		next ? next.title : nextChapter ? nextChapter.title : 'Back to LangX'
	);
</script>

<nav class="lesson-nav app-chrome">
	<a
		class="link"
		class:disabled={!prev}
		href={prev ? `${chapter.base}/${prev.slug}` : chapter.base}
	>
		<span class="dir">←</span>
		<span class="lbl">
			<span class="role">previous</span>
			<span class="title">{prev ? prev.title : 'Chapter intro'}</span>
		</span>
	</a>

	{#if ui.lessonHasDemo}
		<div class="view-toggle" role="group" aria-label="Show panes">
			<button
				class="vt"
				class:on={app.viewMode.book}
				onclick={toggleBook}
				title="Toggle the reading pane"
				aria-pressed={app.viewMode.book}
			>
				<Icon name="book" size={15} />
			</button>
			<button
				class="vt"
				class:on={app.viewMode.workshop}
				onclick={toggleWorkshop}
				title="Toggle the demo pane"
				aria-pressed={app.viewMode.workshop}
			>
				<Icon name="wrench" size={15} />
			</button>
		</div>
	{:else}
		<span></span>
	{/if}

	<a class="link right" href={rightHref}>
		<span class="lbl">
			<span class="role">{rightRole}</span>
			<span class="title">{rightTitle}</span>
		</span>
		<span class="dir">→</span>
	</a>
</nav>

<style>
	.lesson-nav {
		/* Frosted footer the panes scroll UNDER — mirrors the top nav exactly. */
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1rem;
		height: 52px;
		padding: 0 1.4rem;
		background: color-mix(in oklch, var(--color-bg) 64%, transparent);
		backdrop-filter: blur(16px) saturate(1.2);
		-webkit-backdrop-filter: blur(16px) saturate(1.2);
		border-top: 1px solid color-mix(in oklch, var(--color-fg) 8%, transparent);
	}

	.link {
		display: inline-flex;
		gap: 0.55rem;
		align-items: center;
		text-decoration: none;
		color: var(--color-fg);
		padding: 0.3rem 0.55rem;
		border-radius: 0.4rem;
		max-width: 16rem;
		transition: background 0.15s ease;
	}
	.link:hover:not(.disabled) {
		background: var(--color-bg-elev);
	}
	.link.disabled {
		opacity: 0.35;
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
		line-height: 1.1;
	}
	.role {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-fg-faint);
	}
	.title {
		font-size: 0.82rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 13rem;
	}

	/* Pane toggle — the footer's centerpiece. */
	.view-toggle {
		display: inline-flex;
		gap: 0.15rem;
		padding: 0.18rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg-elev);
	}
	.vt {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.6rem;
		border: none;
		background: transparent;
		border-radius: 0.35rem;
		color: var(--color-fg-faint);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.vt:hover {
		color: var(--color-fg);
	}
	.vt.on {
		color: var(--accent);
		background: color-mix(in oklch, var(--accent) 16%, transparent);
	}

	/* Narrow: panes stack and the page scrolls, so the footer flows at the end. */
	@media (max-width: 960px) {
		.lesson-nav {
			position: static;
		}
	}

	@media (max-width: 560px) {
		.role {
			display: none;
		}
		.title {
			max-width: 7rem;
			font-size: 0.78rem;
		}
	}
</style>
