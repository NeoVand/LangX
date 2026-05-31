<script lang="ts">
	import { chapters } from '$lib/curriculum';
	import { app, TJS_MODELS } from '$lib/state/app.svelte';
	import { findHostedModel, findEmbeddingModel, type HostedProvider } from '$lib/models/catalog';
	import { Link2, VectorSquare, Bot } from '@lucide/svelte';

	const configured = $derived(!!(app.keys.anthropic || app.keys.openai || app.keys.google));

	// What the lessons will actually use, surfaced on the setup chip below.
	const chatModel = $derived.by(() => {
		const p = app.preferredProvider;
		if (p === 'transformers-js') {
			return TJS_MODELS.find((m) => m.id === app.tjsModel)?.label ?? 'Local model';
		}
		return findHostedModel(app.models[p as HostedProvider])?.label ?? '—';
	});

	const embedModel = $derived.by(() => {
		if (app.keys.openai) return findEmbeddingModel(app.embeddingModels.openai)?.label ?? '—';
		if (app.keys.voyage) return findEmbeddingModel(app.embeddingModels.voyage)?.label ?? '—';
		return 'MiniLM (local)';
	});

	const cardIcon: Record<string, typeof Bot> = {
		langchain: Link2,
		langgraph: VectorSquare,
		deepagents: Bot
	};
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
				<div class="cta">
					<a class="btn primary" href="/1-langchain">Start Level 1 →</a>
					<a class="config-chip" class:warn={!configured} href="/setup" title="Choose your models">
						{#if configured}
							<span class="cfg-grid">
								<span class="cfg-k">Model</span>
								<span class="cfg-v">{chatModel}</span>
								<span class="cfg-k">Embeddings</span>
								<span class="cfg-v">{embedModel}</span>
							</span>
						{:else}
							<span class="cfg-setup">Set up your model →</span>
						{/if}
					</a>
				</div>
			</div>
			<div class="banner-art" aria-hidden="true"></div>
		</div>
	</section>

	<div class="container">
		<section class="levels">
			{#each chapters as ch (ch.id)}
				{@const Cmp = cardIcon[ch.id]}
				<a class="card" href={ch.base} data-chapter={ch.id}>
					<div class="card-head">
						<Cmp size={18} strokeWidth={2} />
						<span class="card-num font-mono">Level {ch.number}</span>
					</div>
					<div class="card-title font-serif">{ch.title}</div>
					<div class="card-tag">{ch.tagline}</div>
					<ul class="card-list">
						{#each ch.lessons.slice(0, 4) as lesson (lesson.slug)}
							<li>{lesson.title}</li>
						{/each}
						{#if ch.lessons.length > 4}
							<li class="more">+ {ch.lessons.length - 4} more</li>
						{/if}
					</ul>
					<div class="card-cta">Open Level {ch.number} →</div>
				</a>
			{/each}
		</section>
	</div>
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
		padding: 0 2rem;
		min-height: clamp(440px, 60vh, 600px);
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
		margin: 1.4rem 0 2rem;
		max-width: 34rem;
	}

	.cta {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		align-items: stretch;
	}

	.btn {
		font-size: 0.95rem;
		padding: 0.8rem 1.4rem;
		border-radius: 0.55rem;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		border: 1px solid transparent;
		transition:
			background 0.18s ease,
			border-color 0.18s ease;
	}
	.btn.primary {
		background: var(--color-fg);
		color: #000;
	}
	.btn.primary:hover {
		background: color-mix(in oklch, var(--color-fg) 90%, var(--color-accent-langchain));
	}

	/* Setup status: shows the model + embeddings the lessons will actually use. Same
	   height as the primary button (the row stretches); a thin border marks hover. */
	.config-chip {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.95rem;
		border-radius: 0.55rem;
		text-decoration: none;
		color: var(--color-fg);
		background: color-mix(in oklch, var(--color-bg-elev) 60%, transparent);
		border: 1px solid var(--color-border);
		transition:
			border-color 0.18s ease,
			background 0.18s ease;
	}
	.config-chip:hover {
		border-color: var(--color-border-strong);
		background: var(--color-bg-elev);
	}
	.cfg-grid {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.12rem 0.7rem;
		align-items: baseline;
	}
	.cfg-k {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-fg-faint);
	}
	.cfg-v {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-accent-langchain);
	}
	.cfg-setup {
		font-size: 0.95rem;
		font-weight: 600;
	}
	.config-chip.warn .cfg-setup {
		color: var(--color-accent-warning);
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

	/* ── Levels ─────────────────────────────────────────────────────────── */
	.container {
		max-width: 64rem;
		margin: 0 auto;
		padding: 4rem 2rem 6rem;
	}

	.levels {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	@media (max-width: 800px) {
		.levels {
			grid-template-columns: 1fr;
		}
	}

	.card {
		--card-accent: var(--color-accent-langchain);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1.5rem;
		border: 1px solid transparent;
		border-radius: 0.85rem;
		/* Accent glows in the top-left and bottom-right corners over a diagonal fill that
		   stays tinted (never reaches pure black) so the middle keeps a little colour. */
		background:
			radial-gradient(
				115% 80% at 0% 0%,
				color-mix(in oklch, var(--card-accent) 20%, transparent),
				transparent 52%
			),
			radial-gradient(
				115% 80% at 100% 100%,
				color-mix(in oklch, var(--card-accent) 13%, transparent),
				transparent 52%
			),
			linear-gradient(150deg, var(--color-bg-elev), color-mix(in oklch, var(--color-bg-elev) 60%, #000));
		/* Size the gradient to the same box it's painted in (border-box), otherwise the
		   padding-box-sized gradient tiles into the 1px border and shows a mismatched edge. */
		background-origin: border-box;
		background-clip: border-box;
		text-decoration: none;
		color: var(--color-fg);
		transition: border-color 0.18s ease;
	}
	.card[data-chapter='langgraph'] {
		--card-accent: var(--color-accent-langgraph);
	}
	.card[data-chapter='deepagents'] {
		--card-accent: var(--color-accent-deepagents);
	}
	.card:hover {
		border-color: color-mix(in oklch, var(--card-accent) 50%, var(--color-border));
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

	.card-title {
		font-size: 1.4rem;
		font-weight: 600;
	}

	.card-tag {
		color: var(--color-fg-muted);
		font-size: 0.92rem;
		line-height: 1.45;
	}

	.card-list {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--color-fg-muted);
	}
	.card-list li::before {
		content: '–';
		color: var(--color-fg-faint);
		margin-right: 0.55em;
	}
	.card-list .more {
		color: var(--color-fg-faint);
	}

	.card-cta {
		margin-top: auto;
		font-size: 0.85rem;
		color: var(--color-fg-muted);
		font-weight: 500;
	}
</style>
