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

	function toRoman(n: number): string {
		if (n <= 0) return '';
		const map: Array<[number, string]> = [
			[1000, 'M'],
			[900, 'CM'],
			[500, 'D'],
			[400, 'CD'],
			[100, 'C'],
			[90, 'XC'],
			[50, 'L'],
			[40, 'XL'],
			[10, 'X'],
			[9, 'IX'],
			[5, 'V'],
			[4, 'IV'],
			[1, 'I']
		];
		let r = '';
		for (const [v, s] of map) {
			while (n >= v) {
				r += s;
				n -= v;
			}
		}
		return r;
	}

	const roman = $derived(toRoman(index + 1));
	const romanTotal = $derived(toRoman(Math.max(1, total)));

	$effect(() => {
		if (app.presentationMode) {
			untrack(() => refreshSlides());
			document.documentElement.classList.add('presentation-active');
		} else {
			document.documentElement.classList.remove('presentation-active');
			for (const s of slides) s.classList.remove('is-active-slide');
		}
	});

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
			<div class="dots" role="tablist" aria-label="slide navigation">
				{#each slides as _, i (i)}
					<button
						type="button"
						class="dot"
						class:active={i === index}
						aria-label="Go to slide {i + 1}"
						onclick={() => {
							index = i;
							paint();
						}}
					></button>
				{/each}
			</div>
			<div class="counter font-display">
				<span class="cur">{roman}</span>
				<span class="sep">·</span>
				<span class="all">{romanTotal}</span>
			</div>
			<div class="hint font-mono">← → · P · Esc</div>
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
		max-width: min(1200px, 92vw);
		margin: 6vh auto 0;
		padding: 0 2.5rem;
		animation: slide-fade 0.28s ease;
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
		font-size: clamp(2.4rem, 5vw, 3.6rem);
		line-height: 1.05;
		letter-spacing: -0.025em;
	}

	.presentation-root.in-presentation :global([data-slide].is-active-slide p),
	.presentation-root.in-presentation :global([data-slide].is-active-slide li) {
		font-size: clamp(1.18rem, 1.8vw, 1.4rem);
		line-height: 1.55;
	}

	/* code-first slides go FULL WIDTH and the code becomes the focus */
	.presentation-root.in-presentation
		:global([data-slide][data-variant='code-first'].is-active-slide) {
		max-width: min(1400px, 96vw);
	}

	.presentation-root.in-presentation
		:global([data-slide][data-variant='code-first'].is-active-slide pre) {
		font-size: clamp(0.92rem, 1.1vw, 1.05rem);
		line-height: 1.55;
		max-height: 75vh;
	}

	/* Hero images become slide backdrops */
	.presentation-root.in-presentation :global([data-slide].is-active-slide .hero-frame) {
		max-height: 38vh;
	}

	@keyframes slide-fade {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.overlay {
		position: fixed;
		inset: auto 0 0 0;
		padding: 0.85rem 1.5rem 1rem;
		display: flex;
		gap: 1.25rem;
		align-items: center;
		justify-content: center;
		background: linear-gradient(transparent, var(--color-bg) 60%);
		font-size: 0.78rem;
		color: var(--color-ink-300);
		z-index: 50;
	}

	.exit {
		font-family: var(--font-display);
		border: 1px solid var(--color-rule);
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		background: var(--color-paper);
		color: var(--color-ink-100);
		font-size: 0.78rem;
		cursor: pointer;
	}

	.dots {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-rule);
		border: 0;
		padding: 0;
		cursor: pointer;
		transition: all 0.18s ease;
	}

	.dot:hover {
		background: var(--color-ink-300);
	}

	.dot.active {
		background: var(--accent-ink);
		width: 22px;
		border-radius: 999px;
	}

	.counter {
		font-variant-numeric: tabular-nums;
		font-size: 0.85rem;
		letter-spacing: 0.12em;
		color: var(--color-ink-200);
	}

	.counter .cur {
		color: var(--accent-ink);
		font-weight: 500;
	}
	.counter .sep {
		opacity: 0.4;
		margin: 0 0.5rem;
	}
	.counter .all {
		color: var(--color-ink-300);
	}

	.hint {
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-300);
	}

	@media (max-width: 720px) {
		.dots {
			max-width: 36vw;
			overflow: hidden;
		}
		.hint {
			display: none;
		}
	}
</style>
