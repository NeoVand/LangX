<script lang="ts">
	interface Props {
		id: string;
		alt: string;
		/** Large cinematic banner — hides caption, fills frame edge-to-edge. */
		banner?: boolean;
		/** Focal point when cropping with object-fit: cover. */
		focal?: string;
	}

	let { id, alt, banner = false, focal = '50% 50%' }: Props = $props();

	const candidates = $derived([
		`/images/${id}.png`,
		`/images/${id}.webp`,
		`/heroes/${id}.webp`,
		`/banners/${id}.webp`
	]);

	let candidateIndex = $state(0);
	let loaded = $state(false);

	const src = $derived(candidates[candidateIndex] ?? candidates[0]);

	$effect(() => {
		src;
		loaded = false;
	});

	function onLoad() {
		loaded = true;
	}

	function onError() {
		if (candidateIndex < candidates.length - 1) {
			candidateIndex += 1;
			return;
		}
		loaded = false;
	}
</script>

<figure class="hero" class:banner class:loaded data-fallback={!loaded}>
	{#if !banner}
		<div class="placeholder" aria-hidden="true">
			<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={alt}>
				<defs>
					<linearGradient id="g-{id}" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0%" stop-color="var(--accent-soft)" stop-opacity="0.8" />
						<stop offset="100%" stop-color="var(--accent-ink)" stop-opacity="0.25" />
					</linearGradient>
				</defs>
				<rect width="320" height="180" fill="url(#g-{id})" />
				<circle cx="220" cy="60" r="28" fill="var(--accent-ink)" opacity="0.18" />
				<rect x="40" y="120" width="180" height="6" rx="3" fill="var(--accent-ink)" opacity="0.35" />
				<rect x="40" y="135" width="120" height="4" rx="2" fill="var(--accent-ink)" opacity="0.22" />
			</svg>
		</div>
	{/if}
	<img
		{src}
		{alt}
		loading={banner ? 'eager' : 'lazy'}
		decoding="async"
		style:object-position={focal}
		onload={onLoad}
		onerror={onError}
	/>
	{#if !banner}
		<figcaption class="caption">{alt}</figcaption>
	{/if}
</figure>

<style>
	.hero {
		position: relative;
		margin: 0;
		width: 100%;
		height: 100%;
		display: block;
		isolation: isolate;
	}

	.placeholder {
		position: absolute;
		inset: 0;
		z-index: 1;
		transition: opacity 0.35s ease;
	}

	.loaded .placeholder {
		opacity: 0;
		pointer-events: none;
	}

	.placeholder svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 2;
		display: block;
		opacity: 0;
		transition: opacity 0.45s ease;
	}

	.loaded img {
		opacity: 1;
	}

	.banner::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			transparent 55%,
			color-mix(in oklch, var(--color-bg) 18%, transparent) 78%,
			color-mix(in oklch, var(--color-bg) 72%, transparent) 100%
		);
	}

	.caption {
		position: absolute;
		left: 0.75rem;
		bottom: 0.6rem;
		z-index: 4;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-paper);
		mix-blend-mode: difference;
		opacity: 0.7;
		pointer-events: none;
	}
</style>
