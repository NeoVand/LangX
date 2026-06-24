<script lang="ts">
	import type { Snippet } from 'svelte';
	import HeroImage from './HeroImage.svelte';
	import DemoSourceView from './DemoSourceView.svelte';
	import ListenPlayer from './ListenPlayer.svelte';
	import Icon from './Icon.svelte';
	import { app, ui } from '$lib/state/app.svelte';
	import { downloadDemo, downloadSkill, type DemoManifest } from '$lib/demos/download';

	interface Props {
		title: string;
		eyebrow?: string;
		motivation?: string | Snippet;
		hero?: { id: string; alt: string };
		intro?: Snippet;
		narrative: Snippet;
		demo?: Snippet;
		inspect?: Snippet;
		/** When provided, the demo pane gains a flip-to-source view + standalone download. */
		source?: DemoManifest;
	}

	let { title, eyebrow, motivation, hero, intro, narrative, demo, inspect, source }: Props =
		$props();

	let flipped = $state(false);
	let dlOpen = $state(false);

	const hasDemo = $derived(!!(demo || inspect));
	// Narrative ("book") and demo ("workshop") panes, toggled from the top nav.
	const showBook = $derived(app.viewMode.book);
	const showWorkshop = $derived(hasDemo && app.viewMode.workshop);
	const single = $derived(!(showBook && showWorkshop));

	$effect(() => {
		// Snap back to the live side whenever the demo pane is hidden.
		if (!showWorkshop) {
			flipped = false;
			dlOpen = false;
		}
	});

	$effect(() => {
		// Publish whether this lesson has a demo so the footer nav can hide the
		// pane toggle on reading-only lessons (the finale). Reset to true on unmount
		// so non-lesson routes keep the toggle.
		ui.lessonHasDemo = hasDemo;
		return () => {
			ui.lessonHasDemo = true;
		};
	});

	// Reveal the scrollbar only while actively scrolling; hide it ~800ms after.
	function revealScrollbar(node: HTMLElement) {
		let t: ReturnType<typeof setTimeout> | undefined;
		const onScroll = () => {
			node.setAttribute('data-scrolling', '');
			if (t) clearTimeout(t);
			t = setTimeout(() => node.removeAttribute('data-scrolling'), 800);
		};
		node.addEventListener('scroll', onScroll, { passive: true });
		return {
			destroy() {
				if (t) clearTimeout(t);
				node.removeEventListener('scroll', onScroll);
			}
		};
	}
</script>

<main class="lesson-shell" class:single>
	{#if showBook}
		<section class="narrative-pane reveal-scrollbar" use:revealScrollbar>
			<div class="narrative-inner">
				{#if eyebrow}
					<div class="eyebrow font-display">{eyebrow}</div>
				{/if}
				<section data-slide class="title-slide">
					{#if hero}
						<div class="hero-frame">
							<HeroImage id={hero.id} alt={hero.alt} />
						</div>
					{/if}
					<ListenPlayer />
					<h1 class="font-display">{title}</h1>
					{#if motivation}
						<p class="motivation font-prose">
							{#if typeof motivation === 'string'}
								{motivation}
							{:else}
								{@render motivation()}
							{/if}
						</p>
					{/if}
					{#if intro}
						<div class="intro font-prose">{@render intro()}</div>
					{/if}
				</section>
				{@render narrative()}
			</div>
		</section>
	{/if}

	{#if showWorkshop}
		<aside class="demo-pane">
			<div class="demo-inner reveal-scrollbar" class:flipped use:revealScrollbar>
				{#if source}
					<div class="demo-toolbar">
						<span class="dt-label">{flipped ? 'Source · what the demo runs' : 'Live demo'}</span>
						<div class="dt-actions">
							<button
								class="dt-btn"
								class:active={flipped}
								onclick={() => (flipped = !flipped)}
								title="Flip between the live demo and its source code"
							>
								<Icon name={flipped ? 'arrowLeft' : 'eye'} size={14} />
								{flipped ? 'Back to demo' : 'View source'}
							</button>
							<div class="dt-menu-wrap">
								<button
									class="dt-btn"
									class:active={dlOpen}
									onclick={() => (dlOpen = !dlOpen)}
									aria-haspopup="menu"
									aria-expanded={dlOpen}
									title="Download this demo"
								>
									<Icon name="download" size={14} />
									Download
									<Icon name="chevronDown" size={13} />
								</button>
								{#if dlOpen}
									<button
										class="dt-backdrop"
										aria-label="Close menu"
										onclick={() => (dlOpen = false)}
									></button>
									<div class="dt-menu" role="menu">
										<button
											class="dt-menu-item"
											role="menuitem"
											onclick={() => {
												dlOpen = false;
												if (source) downloadDemo(source);
											}}
										>
											<span class="dmi-label">Source</span>
											<span class="dmi-desc">runnable project · .zip</span>
										</button>
										{#if source.skill}
											<button
												class="dt-menu-item"
												role="menuitem"
												onclick={() => {
													dlOpen = false;
													if (source) downloadSkill(source);
												}}
											>
												<span class="dmi-label">Skill</span>
												<span class="dmi-desc">SKILL.md · rebuild with AI</span>
											</button>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
				{#if source && flipped}
					<div class="face source-face">
						<DemoSourceView manifest={source} />
					</div>
				{:else}
					<div class="face">
						{#if demo}
							<div class="demo-block">{@render demo()}</div>
						{/if}
						{#if inspect}
							<div class="inspect-block">{@render inspect()}</div>
						{/if}
					</div>
				{/if}
			</div>
		</aside>
	{/if}
</main>

<style>
	.lesson-shell {
		display: grid;
		/* Exactly 50/50 so the divide sits at the viewport centre — where the footer
		   toggle is centred too. */
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		height: 100%;
		gap: 0;
	}

	/* One pane hidden → the survivor takes the full width. */
	.lesson-shell.single {
		grid-template-columns: 1fr;
	}

	.lesson-shell.single .narrative-inner {
		max-width: 52rem;
	}

	.lesson-shell.single .demo-inner {
		max-width: 56rem;
		margin: 0 auto;
		width: 100%;
	}

	.narrative-pane {
		overflow-y: auto;
		height: 100%;
	}

	.narrative-inner {
		max-width: 40rem;
		margin: 0 auto;
		/* Top padding clears the 60px frosted nav; content scrolls under it. */
		padding: 4.75rem 2.75rem 8rem;
		min-width: 0;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.74rem;
		color: var(--accent-ink);
		font-weight: 500;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: clamp(2.4rem, 4.5vw, 3.4rem);
		font-weight: 500;
		line-height: 1.05;
		letter-spacing: -0.025em;
		margin: 0;
		color: var(--color-ink-100);
	}

	.hero-frame {
		margin: 0 0 2rem;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
	}
	/* Show the hero at its natural aspect ratio — no cropping, whatever the image's
	   proportions (the HeroImage img normally fills a fixed-aspect box with cover). */
	.hero-frame :global(.hero) {
		height: auto;
	}
	.hero-frame :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
	}

	.motivation {
		margin-top: 1.5rem;
		font-size: 1.18rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		font-style: italic;
		font-family: var(--font-prose);
		max-width: 36rem;
	}

	.intro {
		margin-top: 1.25rem;
		color: var(--color-ink-200);
		font-size: 1.05rem;
		line-height: 1.65;
	}

	.intro :global(p) {
		margin: 0 0 0.85em;
	}

	.intro :global(p:first-child::first-letter) {
		font-family: var(--font-display);
		font-size: 3.2em;
		float: left;
		line-height: 0.85;
		padding: 0.05em 0.1em 0 0;
		color: var(--accent-ink);
		font-weight: 500;
	}

	.title-slide {
		margin-bottom: 3rem;
	}

	.demo-pane {
		background: var(--color-bg-elev);
		height: 100%;
		overflow: hidden;
	}

	/* Scrolls with the content now (not pinned); demo-inner supplies the side padding. */
	.demo-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
		background: transparent;
	}
	.dt-label {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
	}
	.dt-actions {
		display: flex;
		gap: 0.4rem;
	}
	.dt-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		font-family: var(--font-mono);
		padding: 0.32rem 0.6rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg);
		color: var(--color-fg-muted);
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.dt-btn:hover {
		color: var(--color-fg);
		border-color: var(--accent-rule);
	}
	.dt-btn.active {
		color: var(--accent-ink);
		border-color: var(--accent-rule);
		background: var(--accent-soft);
	}

	/* Download dropdown. */
	.dt-menu-wrap {
		position: relative;
		display: inline-flex;
	}
	.dt-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.dt-menu {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		z-index: 31;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 12rem;
		padding: 0.3rem;
		background: var(--color-bg-elev-2, var(--color-bg-elev));
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		box-shadow: 0 14px 36px -16px rgba(0, 0, 0, 0.7);
		animation: dt-menu-in 0.13s ease;
	}
	@keyframes dt-menu-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.dt-menu-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.45rem 0.55rem;
		border-radius: 0.4rem;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.dt-menu-item:hover {
		background: var(--color-bg);
	}
	.dmi-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-fg);
	}
	.dt-menu-item:hover .dmi-label {
		color: var(--accent);
	}
	.dmi-desc {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-fg-faint);
	}
	/* Flip transition between the live demo and its source. */
	.face {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		animation: face-in 0.32s cubic-bezier(0.4, 0, 0.2, 1);
		transform-origin: top center;
	}
	@keyframes face-in {
		from {
			opacity: 0;
			transform: rotateX(8deg) translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.face {
			animation: none;
		}
	}

	.demo-inner {
		height: 100%;
		overflow-y: auto;
		/* Top padding clears the 60px frosted nav (toolbar sharp at rest, scrolls under
		   it); bottom padding clears the 52px frosted footer the content scrolls under. */
		padding: 4.25rem 1.85rem 5.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		min-width: 0;
	}

	/* Multiple <Panel>s / DemoFrames inside one snippet are direct children of
	   these blocks; without their own gap they visually touch. */
	.demo-block,
	.inspect-block {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	@media (max-width: 960px) {
		.lesson-shell {
			grid-template-columns: 1fr;
			height: auto;
		}
		.narrative-pane,
		.demo-pane {
			height: auto;
			max-height: none;
		}
	}

	@media (max-width: 640px) {
		.narrative-inner {
			padding: 2.5rem 1.25rem 4rem;
		}
		.demo-inner {
			padding: 1.5rem 1rem 3rem;
		}
	}
</style>
