<script lang="ts">
	import { chapters } from '$lib/curriculum';
	import {
		app,
		TJS_MODELS,
		selectedAzureChatModel,
		selectedAzureEmbeddingModel
	} from '$lib/state/app.svelte';
	import { findHostedModel, findEmbeddingModel, type HostedProvider } from '$lib/models/catalog';
	import {
		Link2,
		VectorSquare,
		Bot,
		Heart,
		SlidersHorizontal,
		ArrowRight,
		Globe,
		KeyRound,
		Activity,
		Boxes
	} from '@lucide/svelte';

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

	// Per-level identity — accent pulled straight from each level's artwork (amber pipes,
	// teal orrery, violet engine) plus an objective blurb, signature topics, and the
	// capstone you walk away having built.
	const levelMeta: Record<
		string,
		{ color: string; tint: string; blurb: string; highlights: string[]; builds: string }
	> = {
		langchain: {
			color: 'oklch(0.8 0.15 72)',
			tint: 'oklch(0.8 0.15 72)',
			blurb:
				'The foundation layer. Six composable primitives — prompts, models, parsers, tools, and retrievers — that all speak one interface, the Runnable. Pipe them together and you get chains, RAG, and agents.',
			highlights: [
				'Live GPT-2 in the browser',
				'Streaming & structured output',
				'Tool-calling with createAgent',
				'Middleware & hooks'
			],
			builds: 'A hand-wired multimodal chatbot with memory, documents, and images.'
		},
		langgraph: {
			color: 'oklch(0.82 0.11 200)',
			tint: 'oklch(0.82 0.11 200)',
			blurb:
				'The orchestration layer. Model an agent as a stateful graph — nodes, edges, and reducers — that loops, branches, checkpoints, forks past runs, and pauses to ask a human.',
			highlights: [
				'Checkpoints & time travel',
				'Interrupts / human-in-the-loop',
				'Send & parallel fan-out',
				'Subgraphs'
			],
			builds: 'An EDGAR statement auditor that fact-checks live SEC filings.'
		},
		deepagents: {
			color: 'oklch(0.72 0.16 300)',
			tint: 'oklch(0.72 0.16 300)',
			blurb:
				'The cognitive harness. Planning, a virtual filesystem, parallel subagents, progressive-disclosure skills, and context compaction — the machinery that turns a brief into a long-running, self-directing agent.',
			highlights: [
				'Plan board & recitation',
				'Virtual filesystem',
				'Parallel subagents',
				'Context compaction'
			],
			builds: 'Deep Research and Data Science capstones that plan, act on real sources, and cite.'
		}
	};

	const totalLessons = chapters.reduce((n, ch) => n + ch.lessons.length, 0);

	// One drifting ribbon per chapter — LangChain, then LangGraph, then Deep Agents.
	// Each row's lessons are repeated so a single half always overflows the viewport;
	// rendering it twice (×4 total) gives two identical halves for a seamless loop.
	const ribbons = chapters.map((ch) => ({
		id: ch.id,
		tiles: Array.from({ length: 4 }, () =>
			ch.lessons.map((l) => ({ ...l, base: ch.base }))
		).flat()
	}));

	const principles = [
		{
			icon: Globe,
			title: 'Runs in your browser',
			body: 'Every demo executes client-side against real model APIs. No backend to deploy, nothing to install.'
		},
		{
			icon: KeyRound,
			title: 'Bring your own model',
			body: 'Anthropic, OpenAI, Google, Azure — or a local model via transformers.js. Your keys stay in your browser.'
		},
		{
			icon: Activity,
			title: 'Inspect the internals',
			body: 'Watch tokens stream, state mutate, tools fire, and graphs branch — the wiring is never hidden.'
		},
		{
			icon: Boxes,
			title: 'Built on the real stack',
			body: 'The same @langchain/* and langgraph packages you would reach for in production, nothing mocked.'
		}
	];

	const GITHUB_URL = 'https://github.com/NeoVand';
	const LINKEDIN_URL = 'https://www.linkedin.com/in/mohsenvand/';
</script>

<main class="landing">
	<!-- ── Hero ──────────────────────────────────────────────────────────── -->
	<section class="hero">
		<div class="hero-inner">
			<div class="hero-art">
				<img
					src="/images/landing-banner.webp"
					alt="A brass steampunk tableau — amber pipework, a teal orrery, and a violet reading-engine joined as one machine, tended by a mechanical parrot, beneath the LangX wordmark"
					fetchpriority="high"
				/>
			</div>

			<div class="hero-copy">
				<p class="eyebrow">An interactive course in AI engineering</p>
				<h1 class="font-display">
					Learn the <span class="g lc">LangChain</span>, <span class="g lg">LangGraph</span>, and
					<span class="g da">Deep&nbsp;Agents</span> stack by watching it run.
				</h1>
				<p class="lead">
					{totalLessons} lessons across three levels, each one a live demo you run and inspect in the
					browser — from a single tool-calling loop to a self-planning deep agent that researches real
					sources and cites them.
				</p>
				<div class="cta-row">
					<a class="btn primary" href="/1-langchain">
						Begin Level 1 <ArrowRight size={17} strokeWidth={2.4} />
					</a>
					<a class="btn ghost" href="/setup">Choose your model</a>
				</div>
				<ul class="stat-strip">
					<li><b>3</b> levels</li>
					<li><b>{totalLessons}</b> lessons</li>
					<li><b>Every concept</b> a live demo</li>
					<li><b>100%</b> in-browser</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- ── The three levels ──────────────────────────────────────────────── -->
	<section class="levels">
		<header class="section-head">
			<p class="eyebrow">The path</p>
			<h2 class="font-display">Three levels, one continuous build.</h2>
			<p class="section-sub">
				Each level recombines the one before it: primitives become stateful graphs, graphs become a
				full agent harness.
			</p>
		</header>

		{#each chapters as ch (ch.id)}
			{@const Cmp = cardIcon[ch.id]}
			{@const meta = levelMeta[ch.id]}
			<article class="level" data-chapter={ch.id} style="--lv: {meta.color}">
				<a class="level-art" href={ch.base} aria-label="Open {ch.title}">
					<img src="/images/thumbs/{ch.poster}.webp" alt="" loading="lazy" decoding="async" />
				</a>

				<div class="level-body">
					<div class="level-meta">
						<Cmp size={16} strokeWidth={2} />
						<span class="font-mono num">Level {ch.number}</span>
						<span class="font-mono count">{ch.lessons.length} lessons</span>
					</div>

					<h3 class="font-display">{ch.title}</h3>
					<p class="level-blurb">{meta.blurb}</p>

					<ul class="chips">
						{#each meta.highlights as h (h)}
							<li>{h}</li>
						{/each}
					</ul>

					<p class="level-build">
						<span class="kicker">You build</span>
						{meta.builds}
					</p>

					<a class="btn ghost lv" href={ch.base}>
						Open Level {ch.number} <ArrowRight size={16} strokeWidth={2.4} />
					</a>
				</div>
			</article>
		{/each}
	</section>

	<!-- ── Learn by running — the banner ribbon ──────────────────────────── -->
	<section class="showcase">
		<header class="section-head">
			<p class="eyebrow">Learn by running</p>
			<h2 class="font-display">Not slides about agents. Agents you can run.</h2>
			<p class="section-sub">
				Every lesson pairs a hand-illustrated explainer with a working demo you drive yourself —
				stream a model, fork a graph mid-run, approve an agent's plan, audit a filing.
			</p>
		</header>

		{#each ribbons as row, ri (row.id)}
			<div class="marquee" class:rev={ri % 2 === 1}>
				<div class="track">
					{#each row.tiles as l, i (i)}
						<a class="tile" href="{l.base}/{l.slug}" title={l.title} aria-label={l.title}>
							<img src="/images/thumbs/{l.banner}.webp" alt="" width="640" height="480" loading="eager" decoding="async" />
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<!-- ── Principles ────────────────────────────────────────────────────── -->
	<section class="principles">
		{#each principles as p (p.title)}
			{@const Cmp = p.icon}
			<div class="principle">
				<span class="p-icon"><Cmp size={20} strokeWidth={1.8} /></span>
				<h3 class="font-display">{p.title}</h3>
				<p>{p.body}</p>
			</div>
		{/each}
	</section>

	<!-- ── Final CTA ─────────────────────────────────────────────────────── -->
	<section class="finale">
		<h2 class="font-display">Start with the foundation.</h2>
		<p>
			Level 1 assumes you can read code and nothing else. By the end of Level 3 you'll have built an
			agent that plans its own work.
		</p>
		<div class="cta-row">
			<a class="btn primary" href="/1-langchain">
				Begin Level 1 <ArrowRight size={17} strokeWidth={2.4} />
			</a>
			<a class="btn ghost" href="/glossary">Browse the glossary</a>
		</div>
	</section>

	<!-- ── Footer: setup status + attribution ────────────────────────────── -->
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
		/* Local per-level accents, pulled from each level's artwork. */
		--c-lc: oklch(0.8 0.15 72);
		--c-lg: oklch(0.82 0.11 200);
		--c-da: oklch(0.72 0.16 300);
		/* x-only clip contains any full-bleed art without creating a vertical scroll
		   container — that would break the footer's `position: sticky`. */
		overflow-x: clip;
	}

	/* ── Hero ───────────────────────────────────────────────────────────── */
	.hero {
		position: relative;
		padding: 0 0 clamp(1.5rem, 4vw, 3rem);
		/* The banner's top is a black band; tuck it slightly under the translucent nav
		   (black on frosted-black = seamless) — but not so far it clips the wordmark. */
		margin-top: clamp(-1.5rem, -1.6vw, -0.5rem);
	}

	.hero-inner {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* The banner already dissolves to pure black on every edge, so it just sits on the
	   #000 page — no mask, no glow, no frame. Black-on-black is seamless at any width. */
	.hero-art {
		width: 100%;
		max-width: 84rem;
		line-height: 0;
	}
	.hero-art img {
		width: 100%;
		height: auto;
		display: block;
	}

	.hero-copy {
		position: relative;
		text-align: center;
		max-width: 46rem;
		padding: 0 1.5rem;
		/* Pull up into the black lower band of the banner so copy and art read as one piece. */
		margin-top: clamp(-6rem, -7vw, -3rem);
	}

	.hero-copy .eyebrow {
		display: block;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: clamp(2.1rem, 5vw, 3.7rem);
		font-weight: 600;
		line-height: 1.05;
		letter-spacing: -0.025em;
		margin: 0;
		color: var(--color-cream-0);
	}

	.g {
		font-weight: 600;
		white-space: nowrap;
	}
	.g.lc {
		color: var(--c-lc);
	}
	.g.lg {
		color: var(--c-lg);
	}
	.g.da {
		color: var(--c-da);
	}

	.lead {
		font-family: var(--font-prose);
		font-size: clamp(1.05rem, 1.5vw, 1.2rem);
		color: var(--color-fg-muted);
		line-height: 1.6;
		margin: 1.3rem auto 0;
		max-width: 40rem;
	}

	.cta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 1.8rem;
	}

	/* ── Buttons ────────────────────────────────────────────────────────── */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem 1.3rem;
		border-radius: 999px;
		font-size: 0.92rem;
		font-weight: 600;
		text-decoration: none;
		border: 1px solid transparent;
		transition:
			transform 0.16s ease,
			box-shadow 0.18s ease,
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease;
	}
	.btn :global(svg) {
		transition: transform 0.18s ease;
	}
	.btn.primary {
		--b: var(--color-accent-langchain);
		color: var(--color-ink-0);
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--b) 78%, var(--color-cream-0)),
			var(--b)
		);
		box-shadow: 0 10px 30px -12px color-mix(in oklch, var(--b) 70%, transparent);
	}
	.btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 16px 38px -12px color-mix(in oklch, var(--b) 80%, transparent);
	}
	.btn.primary:hover :global(svg) {
		transform: translateX(3px);
	}
	.btn.ghost {
		color: var(--color-cream-1);
		border-color: color-mix(in oklch, var(--color-fg) 22%, transparent);
		background: color-mix(in oklch, var(--color-cream-0) 3%, transparent);
	}
	.btn.ghost:hover {
		color: var(--color-cream-0);
		border-color: color-mix(in oklch, var(--color-cream-0) 48%, transparent);
		transform: translateY(-2px);
	}
	.btn.ghost.lv {
		align-self: flex-start;
		color: color-mix(in oklch, var(--lv) 75%, var(--color-cream-0));
		border-color: color-mix(in oklch, var(--lv) 34%, var(--color-border));
	}
	.btn.ghost.lv:hover {
		border-color: var(--lv);
		background: color-mix(in oklch, var(--lv) 12%, transparent);
	}
	.btn.ghost.lv:hover :global(svg) {
		transform: translateX(3px);
	}

	.stat-strip {
		list-style: none;
		margin: 2rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem 1.6rem;
		font-size: 0.82rem;
		color: var(--color-fg-faint);
	}
	.stat-strip li {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		position: relative;
	}
	.stat-strip li + li::before {
		content: '';
		position: absolute;
		left: -0.85rem;
		top: 0.15rem;
		bottom: 0.15rem;
		width: 1px;
		background: color-mix(in oklch, var(--color-fg) 14%, transparent);
	}
	.stat-strip b {
		color: var(--color-cream-0);
		font-weight: 600;
	}

	/* ── Section scaffolding ────────────────────────────────────────────── */
	.section-head {
		max-width: 42rem;
		margin: 0 auto;
		text-align: center;
		padding: 0 1.5rem;
	}
	.section-head .eyebrow {
		display: block;
		margin-bottom: 0.7rem;
	}
	.section-head h2 {
		font-size: clamp(1.7rem, 3.2vw, 2.5rem);
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -0.02em;
		margin: 0;
		color: var(--color-cream-0);
	}
	.section-sub {
		font-family: var(--font-prose);
		color: var(--color-fg-muted);
		font-size: 1.05rem;
		line-height: 1.6;
		margin: 0.9rem auto 0;
		max-width: 36rem;
	}

	/* ── The three levels ───────────────────────────────────────────────── */
	.levels {
		max-width: 64rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 4.5rem) 1.5rem 0;
		display: flex;
		flex-direction: column;
		gap: clamp(1.5rem, 3vw, 2.5rem);
	}
	.levels .section-head {
		margin-bottom: clamp(0.5rem, 2vw, 1.5rem);
	}

	.level {
		display: flex;
		align-items: center;
		gap: clamp(1.5rem, 4vw, 3rem);
		padding: clamp(1rem, 2vw, 1.5rem) clamp(1rem, 2.5vw, 2rem);
		/* Transparent over the #000 page so each poster's black background dissolves in
		   with no rectangle. Definition comes from a single hairline, brightened on hover. */
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		background: transparent;
		transition: border-color 0.2s ease;
	}
	.level:hover {
		border-color: color-mix(in oklch, var(--lv) 38%, var(--color-border));
	}
	/* Alternate the art side for an editorial rhythm — flex keeps it a fixed width
	   on either side (grid `order` would have stretched it into the text column). */
	.level:nth-child(odd of .level) {
		flex-direction: row-reverse;
	}

	/* Poster shown whole at its native portrait ratio — no crop, no rounding, no glow.
	   It is opaque black at the edges, so it meets the page seamlessly on its own. */
	.level-art {
		display: block;
		flex: 0 0 clamp(9.5rem, 22vw, 13rem);
		width: clamp(9.5rem, 22vw, 13rem);
		align-self: stretch;
		max-height: 22rem;
	}
	.level-art img {
		width: 100%;
		height: auto;
		max-height: 22rem;
		object-fit: contain;
		display: block;
		margin: auto;
	}

	.level-body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.level-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--lv);
	}
	.level-meta .num {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 700;
	}
	.level-meta .count {
		margin-left: auto;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
	}
	.level-body h3 {
		font-size: clamp(1.6rem, 2.6vw, 2.1rem);
		font-weight: 600;
		line-height: 1;
		margin: 0;
		color: var(--color-cream-0);
	}
	.level-blurb {
		font-family: var(--font-prose);
		color: var(--color-fg-muted);
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
	}
	.chips {
		list-style: none;
		margin: 0.1rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.chips li {
		font-size: 0.76rem;
		font-weight: 500;
		padding: 0.28rem 0.65rem;
		border-radius: 999px;
		color: color-mix(in oklch, var(--lv) 70%, var(--color-cream-0));
		background: color-mix(in oklch, var(--lv) 11%, transparent);
		border: 1px solid color-mix(in oklch, var(--lv) 22%, transparent);
	}
	.level-build {
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--color-cream-1);
		margin: 0.2rem 0 0.3rem;
	}
	.level-build .kicker {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-fg-faint);
		margin-right: 0.5rem;
	}

	/* ── Showcase ribbon ────────────────────────────────────────────────── */
	.showcase {
		padding: clamp(3rem, 7vw, 5.5rem) 0 clamp(1rem, 2vw, 2rem);
		overflow: clip;
	}
	.showcase .section-head {
		margin-bottom: clamp(1.8rem, 4vw, 2.8rem);
	}

	.marquee {
		overflow: hidden;
		-webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);
		mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);
	}
	.marquee + .marquee {
		margin-top: 0.85rem;
	}
	.track {
		display: flex;
		gap: 0.85rem;
		width: max-content;
		padding: 0.3rem 0;
		animation: marquee 70s linear infinite;
	}
	.marquee.rev .track {
		animation-direction: reverse;
	}
	.marquee:hover .track {
		animation-play-state: paused;
	}
	/* The track holds two identical halves. -50% lands half a gap short of the seam
	   (the gap sits *between* the halves too), so subtract half the gap for a pixel-perfect,
	   truly infinite loop with no jump. 0.425rem = half of the 0.85rem track gap. */
	@keyframes marquee {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(calc(-50% - 0.425rem));
		}
	}

	/* Each lesson banner carries its own painted frame — shown whole, no crop, no rounding,
	   no extra border. Slightly dimmed at rest, lifting to full on hover. */
	.tile {
		flex: 0 0 auto;
		width: clamp(10.5rem, 17vw, 13rem);
		display: block;
		text-decoration: none;
		opacity: 0.9;
		transition:
			opacity 0.25s ease,
			transform 0.25s ease;
	}
	.tile img {
		width: 100%;
		height: auto;
		display: block;
	}
	.tile:hover {
		opacity: 1;
		transform: translateY(-4px);
	}

	/* ── Principles ─────────────────────────────────────────────────────── */
	.principles {
		max-width: 64rem;
		margin: 0 auto;
		padding: clamp(3rem, 7vw, 5rem) 1.5rem;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}
	.principle {
		padding: 1.4rem 1.3rem;
		border: 1px solid var(--color-border);
		border-radius: 0.9rem;
		background: linear-gradient(160deg, var(--color-bg-elev), color-mix(in oklch, var(--color-bg-elev) 55%, #000));
	}
	.p-icon {
		display: inline-flex;
		padding: 0.55rem;
		border-radius: 0.6rem;
		color: var(--color-accent-langchain);
		background: color-mix(in oklch, var(--color-accent-langchain) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--color-accent-langchain) 22%, transparent);
		margin-bottom: 0.9rem;
	}
	.principle h3 {
		font-size: 1.08rem;
		font-weight: 600;
		margin: 0 0 0.35rem;
		color: var(--color-cream-0);
	}
	.principle p {
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		margin: 0;
	}

	/* ── Final CTA ──────────────────────────────────────────────────────── */
	.finale {
		max-width: 42rem;
		margin: 0 auto;
		padding: clamp(2rem, 5vw, 3.5rem) 1.5rem clamp(2rem, 4vw, 3rem);
		text-align: center;
	}
	.finale h2 {
		font-size: clamp(1.8rem, 3.6vw, 2.7rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
		color: var(--color-cream-0);
	}
	.finale p {
		font-family: var(--font-prose);
		color: var(--color-fg-muted);
		font-size: 1.05rem;
		line-height: 1.6;
		margin: 1rem auto 0;
		max-width: 34rem;
	}
	.finale .cta-row {
		margin-top: 1.6rem;
	}

	/* ── Footer: subtle setup status + attribution ──────────────────────── */
	.site-footer {
		position: sticky;
		bottom: 0;
		z-index: 15;
		margin: 0;
		padding: 0.7rem clamp(1.25rem, 4vw, 2.5rem);
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		/* Frosted chrome, mirroring the top nav — stays reachable for model setup as you scroll. */
		background: color-mix(in oklch, var(--color-bg) 68%, transparent);
		backdrop-filter: blur(16px) saturate(1.2);
		-webkit-backdrop-filter: blur(16px) saturate(1.2);
		border-top: 1px solid color-mix(in oklch, var(--color-fg) 10%, transparent);
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

	/* ── Responsive ─────────────────────────────────────────────────────── */
	@media (max-width: 820px) {
		.level,
		.level:nth-child(odd of .level) {
			flex-direction: column;
			gap: 1.25rem;
		}
		.level-body {
			width: 100%;
		}
		.level-art {
			flex-basis: auto;
			width: min(13rem, 60%);
			aspect-ratio: 4 / 3;
			margin: 0 auto;
		}
		.principles {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 480px) {
		.principles {
			grid-template-columns: 1fr;
		}
		.stat-strip {
			gap: 0.5rem 1.2rem;
		}
	}

	@media (max-width: 560px) {
		.site-footer {
			justify-content: center;
			text-align: center;
		}
	}

	/* Freeze the ribbon when motion is reduced; tiles stay visible and scrollable. */
	@media (prefers-reduced-motion: reduce) {
		.hero-art {
			animation: none;
		}
		.track {
			animation: none;
			flex-wrap: nowrap;
		}
		.marquee {
			overflow-x: auto;
		}
	}
</style>
