<script lang="ts">
	import { page } from '$app/state';
	import { app, toggleWorkshop, toggleBook } from '$lib/state/app.svelte';
	import Icon from './Icon.svelte';
	import type { Chapter } from '$lib/curriculum';

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
</script>

<nav class="lesson-nav app-chrome">
	<a class="link" class:disabled={!prev} href={prev ? `${chapter.base}/${prev.slug}` : chapter.base}>
		<span class="dir">←</span>
		<span class="lbl">
			<span class="role">previous</span>
			<span class="title">{prev ? prev.title : 'Chapter intro'}</span>
		</span>
	</a>

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

	<a class="link right" href={next ? `${chapter.base}/${next.slug}` : `${chapter.base}/recap`}>
		<span class="lbl">
			<span class="role">{next ? 'next' : 'wrap up'}</span>
			<span class="title">{next ? next.title : 'End of chapter'}</span>
		</span>
		<span class="dir">→</span>
	</a>
</nav>

<style>
	.lesson-nav {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1rem;
		height: 52px;
		padding: 0 1.4rem;
		background: color-mix(in oklch, var(--color-bg) 90%, transparent);
		backdrop-filter: blur(10px);
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
