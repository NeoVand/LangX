<script lang="ts">
	interface Props {
		id: string;
		alt: string;
	}

	let { id, alt }: Props = $props();

	// Maps a hero ID to a chapter-tinted placeholder. Once real artwork lands at
	// /static/heroes/<id>.webp, the <img> below will resolve and the placeholder
	// silently disappears.
	const src = $derived(`/heroes/${id}.webp`);
	const fallbackVisible = $state(true);

	function onLoad() {
		// real image resolved — placeholder fades out via CSS.
	}
	function onError(ev: Event) {
		(ev.target as HTMLImageElement).style.display = 'none';
	}
</script>

<figure class="hero" data-fallback={fallbackVisible}>
	<div class="placeholder" aria-hidden="true">
		<svg
			viewBox="0 0 320 180"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label={alt}
		>
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
	<img {src} {alt} loading="lazy" decoding="async" onload={onLoad} onerror={onError} />
	<figcaption class="caption">{alt}</figcaption>
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
	}

	.caption {
		position: absolute;
		left: 0.75rem;
		bottom: 0.6rem;
		z-index: 3;
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
