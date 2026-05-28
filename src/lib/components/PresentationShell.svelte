<script lang="ts">
	import { app, togglePresentation } from '$lib/state/app.svelte';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';

	let { children } = $props();

	let slides = $state.raw<HTMLElement[]>([]);
	let index = $state(0);
	let total = $state(0);
	let container: HTMLDivElement | undefined = $state();

	function refreshSlides() {
		if (!container) return;
		slides = Array.from(container.querySelectorAll<HTMLElement>('[data-slide]'));
		total = slides.length;
		index = Math.min(index, Math.max(0, slides.length - 1));
		paint();
	}

	function paint() {
		for (let i = 0; i < slides.length; i++) {
			slides[i].classList.toggle('is-active-slide', i === index);
		}
	}

	function next() {
		if (index < slides.length - 1) {
			index += 1;
			paint();
		}
	}
	function prev() {
		if (index > 0) {
			index -= 1;
			paint();
		}
	}

	function isTyping(el: EventTarget | null) {
		if (!(el instanceof HTMLElement)) return false;
		const tag = el.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || el.isContentEditable;
	}

	function onKey(e: KeyboardEvent) {
		if (!app.presentationMode) {
			if (e.key.toLowerCase() === 'p' && !isTyping(e.target)) {
				e.preventDefault();
				togglePresentation();
			}
			return;
		}
		if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
			e.preventDefault();
			togglePresentation();
			return;
		}
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			e.preventDefault();
			prev();
		} else if (e.key === 'Home') {
			e.preventDefault();
			index = 0;
			paint();
		} else if (e.key === 'End') {
			e.preventDefault();
			index = Math.max(0, slides.length - 1);
			paint();
		}
	}

	$effect(() => {
		if (app.presentationMode) {
			untrack(() => refreshSlides());
			document.documentElement.classList.add('presentation-active');
		} else {
			document.documentElement.classList.remove('presentation-active');
			for (const s of slides) s.classList.remove('is-active-slide');
		}
	});

	// Reset to first slide and re-scan when navigating between lessons.
	$effect(() => {
		page.url.pathname;
		if (app.presentationMode) {
			untrack(() => {
				index = 0;
				queueMicrotask(refreshSlides);
			});
		}
	});

	onMount(() => {
		const obs = new MutationObserver(() => {
			if (app.presentationMode) refreshSlides();
		});
		if (container) obs.observe(container, { childList: true, subtree: true });
		return () => obs.disconnect();
	});
</script>

<svelte:window onkeydown={onKey} />

<div bind:this={container} class="presentation-root" class:in-presentation={app.presentationMode}>
	{@render children?.()}

	{#if app.presentationMode}
		<div class="overlay">
			<button class="exit" onclick={togglePresentation} aria-label="Exit presentation (Esc)">
				Exit · Esc
			</button>
			<div class="counter">
				{index + 1} / {Math.max(1, total)}
			</div>
			<div class="bar" aria-hidden="true">
				<div
					class="bar-fill"
					style:width="{total ? ((index + 1) / total) * 100 : 0}%"
				></div>
			</div>
			<div class="hint">← → to navigate · P or Esc to exit</div>
		</div>
	{/if}
</div>

<style>
	:global(html.presentation-active) {
		overflow: hidden;
	}

	.presentation-root.in-presentation :global(.app-chrome),
	.presentation-root.in-presentation :global(.hide-in-presentation) {
		display: none !important;
	}

	.presentation-root.in-presentation :global([data-slide]) {
		display: none !important;
	}

	.presentation-root.in-presentation :global([data-slide].is-active-slide) {
		display: block !important;
		max-width: min(1100px, 90vw);
		margin: 5rem auto 0;
		padding: 0 2rem;
		animation: slide-fade 0.25s ease;
	}

	.presentation-root.in-presentation :global(.lesson-shell) {
		display: block !important;
		grid-template-columns: 1fr !important;
		min-height: 100vh;
	}

	.presentation-root.in-presentation :global(.lesson-shell .demo-pane) {
		display: none !important;
	}

	.presentation-root.in-presentation :global([data-slide].is-active-slide h1),
	.presentation-root.in-presentation :global([data-slide].is-active-slide h2) {
		font-size: 2.4rem;
		line-height: 1.15;
	}

	.presentation-root.in-presentation :global([data-slide].is-active-slide p),
	.presentation-root.in-presentation :global([data-slide].is-active-slide li) {
		font-size: 1.25rem;
		line-height: 1.55;
	}

	@keyframes slide-fade {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.overlay {
		position: fixed;
		inset: auto 0 0 0;
		padding: 1rem 1.5rem;
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: center;
		background: linear-gradient(transparent, var(--color-bg) 60%);
		font-size: 0.8rem;
		color: var(--color-fg-muted);
		z-index: 50;
	}

	.exit {
		border: 1px solid var(--color-border);
		padding: 0.4rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--color-bg-elev);
		color: var(--color-fg);
	}

	.bar {
		height: 3px;
		flex: 1;
		max-width: 320px;
		background: var(--color-border);
		border-radius: 999px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.25s ease;
	}

	.counter {
		font-variant-numeric: tabular-nums;
	}

	.hint {
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}
</style>
