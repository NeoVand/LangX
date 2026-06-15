<script lang="ts">
	import { chapters } from '$lib/curriculum';
	import {
		app,
		TJS_MODELS,
		selectedAzureChatModel,
		selectedAzureEmbeddingModel
	} from '$lib/state/app.svelte';
	import { findHostedModel, findEmbeddingModel, type HostedProvider } from '$lib/models/catalog';
	import { Link2, VectorSquare, Bot, Heart, SlidersHorizontal } from '@lucide/svelte';

	const configured = $derived(
		!!(app.keys.anthropic || app.keys.openai || app.keys.google || selectedAzureChatModel())
	);

	// What the lessons will actually use, surfaced on the subtle setup link in the footer.
	const chatModel = $derived.by(() => {
		const p = app.preferredProvider;
		if (p === 'transformers-js') {
			return TJS_MODELS.find((m) => m.id === app.tjsModel)?.label ?? 'Local model';
		}
		if (p === 'azure') {
			return selectedAzureChatModel()?.label ?? '—';
		}
		return findHostedModel(app.models[p as HostedProvider])?.label ?? '—';
	});

	const embedModel = $derived.by(() => {
		if (selectedAzureEmbeddingModel()) return selectedAzureEmbeddingModel()?.label ?? '—';
		if (app.keys.openai) return findEmbeddingModel(app.embeddingModels.openai)?.label ?? '—';
		if (app.keys.voyage) return findEmbeddingModel(app.embeddingModels.voyage)?.label ?? '—';
		return 'MiniLM (local)';
	});

	const cardIcon: Record<string, typeof Bot> = {
		langchain: Link2,
		langgraph: VectorSquare,
		deepagents: Bot
	};

	const GITHUB_URL = 'https://github.com/NeoVand';
	const LINKEDIN_URL = 'https://www.linkedin.com/in/mohsenvand/';
</script>

<main class="landing">
	<!-- Full-bleed banner: art builds up on the right, text reads over the fade on the left.
	     Uses a CSS background-image so a missing file degrades to the dark backdrop (no broken icon). -->
	<section class="banner">
		<div class="banner-grid">
			<div class="banner-text">
				<h1 class="font-serif">
					Learn <span class="g lc">LangChain</span>, <span class="g lg">LangGraph</span>, and
					<span class="g da">Deep Agents</span> by watching them run.
				</h1>
				<p class="lead">
					Tool-calling agents, RAG pipelines, time-traveling state graphs, and self-planning deep
					agents — each one a live demo you run and inspect in the browser.
				</p>
			</div>
			<div class="banner-art" aria-hidden="true"></div>
		</div>
	</section>

	<div class="container">
		<section class="levels">
			{#each chapters as ch (ch.id)}
				{@const Cmp = cardIcon[ch.id]}
				<a class="card" href={ch.base} data-chapter={ch.id}>
					<div class="card-art">
						<img src="/images/thumbs/{ch.poster}.webp" alt="" loading="lazy" />
					</div>
					<div class="card-body">
						<div class="card-head">
							<Cmp size={18} strokeWidth={2} />
							<span class="card-num font-mono">Level {ch.number}</span>
							<span class="card-count font-mono">{ch.lessons.length} lessons</span>
						</div>
						<div class="card-title font-serif">{ch.title}</div>
						<div class="card-tag">{ch.tagline}</div>
						<div class="card-cta">Open Level {ch.number} →</div>
					</div>
				</a>
			{/each}
		</section>
	</div>

	<footer class="site-footer">
		<a class="setup-link" class:warn={!configured} href="/setup" title="Choose your models">
			<SlidersHorizontal size={13} />
			{#if configured}
				<span>{chatModel} · {embedModel}</span>
			{:else}
				<span>Set up your model →</span>
			{/if}
		</a>

		<p class="made">
			Made with
			<Heart size={14} class="heart" fill="currentColor" aria-label="love" />
			by
			<a href={GITHUB_URL} target="_blank" rel="noreferrer" class="name">Neo Mohsenvand</a>
			<span class="social">
				<a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Neo Mohsenvand on GitHub">
					<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
						<path
							fill="currentColor"
							d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
						/>
					</svg>
				</a>
				<a
					href={LINKEDIN_URL}
					target="_blank"
					rel="noreferrer"
					aria-label="Neo Mohsenvand on LinkedIn"
				>
					<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
						<path
							fill="currentColor"
							d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
						/>
					</svg>
				</a>
			</span>
		</p>
	</footer>
</main>

<style>
	.landing {
		width: 100%;
		/* Pure black so the steampunk art (which fades to #000) dissolves into the page
		   with no seam — the theme's --color-bg is a warm ~14%-light near-black, not #000. */
		background: #000;
	}

	/* ── Banner ─────────────────────────────────────────────────────────── */
	.banner {
		position: relative;
		overflow: hidden;
		background: #000;
	}

	/* Overlapping layout: text reads on the left at z-index 2; the square art is
	   absolutely placed on the right and its own faded left edge slips under the text. */
	.banner-grid {
		position: relative;
		max-width: 64rem;
		margin: 0 auto;
		/* Top padding guarantees the headline clears the 60px sticky nav even when the
		   text wraps tall and flex-centering would otherwise overflow upward. */
		padding: 2.25rem 2rem 0.5rem;
		min-height: clamp(360px, 50vh, 500px);
		display: flex;
		align-items: center;
	}

	.banner-text {
		position: relative;
		z-index: 2;
		max-width: 44rem;
	}

	/* Art fills the right half, cropped (cover) so its dark sides are trimmed. A deep
	   left feather lets the headline read over it; light right/top/bottom feathers melt
	   every edge into the pure-black page (invisible on #000 — no gradient line). */
	.banner-art {
		position: absolute;
		z-index: 1;
		top: 0;
		bottom: 0;
		right: 0;
		width: 48%;
		background: url('/images/home-hero.png') no-repeat center / cover;
		pointer-events: none;
		-webkit-mask-image:
			linear-gradient(to right, transparent, #000 32%, #000 95%, transparent),
			linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
		-webkit-mask-composite: source-in;
		mask-image:
			linear-gradient(to right, transparent, #000 32%, #000 95%, transparent),
			linear-gradient(to bottom, transparent, #000 9%, #000 91%, transparent);
		mask-composite: intersect;
	}

	h1 {
		font-size: clamp(2.1rem, 4.6vw, 3.6rem);
		font-weight: 600;
		line-height: 1.06;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.g {
		font-weight: 600;
		white-space: nowrap;
	}
	.g.lc {
		color: var(--color-accent-langchain);
	}
	.g.lg {
		color: var(--color-accent-langgraph);
	}
	.g.da {
		color: var(--color-accent-deepagents);
	}

	.lead {
		font-family: var(--font-serif);
		font-size: clamp(1.05rem, 1.6vw, 1.25rem);
		color: var(--color-fg-muted);
		line-height: 1.6;
		margin: 1.4rem 0 0;
		max-width: 34rem;
	}

	@media (max-width: 820px) {
		/* Stack: art on top as a hero, text beneath. */
		.banner-grid {
			flex-direction: column;
			padding: 1.5rem 2rem 0.5rem;
			min-height: 0;
		}
		.banner-art {
			position: relative;
			inset: auto;
			order: -1;
			width: 100%;
			height: clamp(220px, 56vw, 340px);
			background-position: center;
			background-size: contain;
			-webkit-mask-image: none;
			mask-image: none;
		}
		.banner-text {
			max-width: none;
		}
	}

	/* ── Levels: three horizontal cards, poster shown WHOLE on the left ───── */
	.container {
		max-width: 64rem;
		margin: 0 auto;
		padding: 2.5rem 2rem 3rem;
	}

	.levels {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		max-width: 46rem;
		margin: 0 auto;
	}

	.card {
		--card-accent: var(--color-accent-langchain);
		display: grid;
		grid-template-columns: 5.25rem 1fr;
		align-items: center;
		gap: 1.25rem;
		padding: 1rem 1.4rem 1rem 1rem;
		border: 1px solid transparent;
		border-radius: 0.85rem;
		/* A soft accent glow in the corner over a tinted fill (never pure black). */
		background:
			radial-gradient(
				120% 120% at 0% 0%,
				color-mix(in oklch, var(--card-accent) 13%, transparent),
				transparent 58%
			),
			linear-gradient(150deg, var(--color-bg-elev), color-mix(in oklch, var(--color-bg-elev) 62%, #000));
		background-origin: border-box;
		background-clip: border-box;
		text-decoration: none;
		color: var(--color-fg);
		transition:
			background 0.18s ease,
			border-color 0.18s ease;
	}
	.card[data-chapter='langgraph'] {
		--card-accent: var(--color-accent-langgraph);
	}
	.card[data-chapter='deepagents'] {
		--card-accent: var(--color-accent-deepagents);
	}
	/* Subtle hover: the accent fill warms slightly — a soft lift, not a hard frame. */
	.card:hover {
		border-color: color-mix(in oklch, var(--card-accent) 32%, var(--color-border));
		background:
			radial-gradient(
				120% 120% at 0% 0%,
				color-mix(in oklch, var(--card-accent) 20%, transparent),
				transparent 58%
			),
			linear-gradient(150deg, var(--color-bg-elev), color-mix(in oklch, var(--color-bg-elev) 62%, #000));
	}

	/* The whole portrait poster, contained on a black tile — never cropped. Its own
	   black margins blend into the #000 tile, so it reads as a neat little poster. */
	.card-art {
		width: 5.25rem;
		aspect-ratio: 2 / 3;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #000;
	}
	.card-art img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	[data-chapter='langchain'] .card-head {
		color: var(--color-accent-langchain);
	}
	[data-chapter='langgraph'] .card-head {
		color: var(--color-accent-langgraph);
	}
	[data-chapter='deepagents'] .card-head {
		color: var(--color-accent-deepagents);
	}

	.card-num {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 700;
		color: inherit;
	}
	.card-count {
		margin-left: auto;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
	}

	.card-title {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-fg);
	}

	.card-tag {
		color: var(--color-fg-muted);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.card-cta {
		margin-top: 0.3rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
		font-weight: 500;
	}

	/* ── Footer: subtle setup status + attribution ──────────────────────── */
	.site-footer {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1.5rem 2rem 3rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.9rem 1.5rem;
		border-top: 1px solid color-mix(in oklch, var(--color-fg) 8%, transparent);
	}

	/* Model setup, demoted to a quiet link. */
	.setup-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		text-decoration: none;
		transition: color 0.16s ease;
	}
	.setup-link:hover {
		color: var(--color-fg-muted);
	}
	.setup-link.warn {
		color: var(--color-accent-warning);
	}

	.made {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: 0.84rem;
		color: var(--color-fg-muted);
	}
	.made :global(.heart) {
		color: #df5d6e;
		vertical-align: middle;
	}
	.made .name {
		color: var(--color-fg);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 1px solid transparent;
		transition: border-color 0.16s ease;
	}
	.made .name:hover {
		border-bottom-color: color-mix(in oklch, var(--color-fg) 45%, transparent);
	}

	.social {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 0.35rem;
	}
	.social a {
		display: inline-flex;
		color: var(--color-fg-faint);
		transition:
			color 0.16s ease,
			transform 0.16s ease;
	}
	.social a:hover {
		color: var(--color-fg);
		transform: translateY(-1px);
	}

	@media (max-width: 560px) {
		.site-footer {
			justify-content: center;
			text-align: center;
		}
	}
</style>
