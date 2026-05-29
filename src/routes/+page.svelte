<script lang="ts">
	import { chapters } from '$lib/curriculum';
	import { app } from '$lib/state/app.svelte';
</script>

<main class="landing">
	<section class="hero">
		<div class="eyebrow">A teaching environment for agentic systems</div>
		<h1>
			Learn <span class="g">LangChain</span>, <span class="g">LangGraph</span>, and
			<span class="g">Deep Agents</span> by watching them run.
		</h1>
		<p class="lead">
			LangX is a single-page tour of three architectural phases — declarative chains, stateful
			runtimes, and cognitive harnesses. Every concept comes with a live demo and an
			under-the-hood inspector so you can see exactly what happens when an agent thinks, plans,
			delegates, or remembers.
		</p>
		<div class="cta">
			<a class="btn primary" href="/setup">
				{app.keys.anthropic || app.keys.openai || app.keys.google
					? 'Models configured · review'
					: 'Set up your model'}
			</a>
			<a class="btn ghost" href="/1-langchain">Start the curriculum</a>
		</div>
	</section>

	<section class="chapters">
		{#each chapters as ch (ch.id)}
			<a class="card" href={ch.base} data-chapter={ch.id}>
				<div class="card-num">Phase {ch.number}</div>
				<div class="card-title">{ch.title}</div>
				<div class="card-tag">{ch.tagline}</div>
				<ul class="card-list">
					{#each ch.lessons.slice(0, 4) as lesson (lesson.slug)}
						<li>{lesson.title}</li>
					{/each}
					{#if ch.lessons.length > 4}
						<li class="more">+ {ch.lessons.length - 4} more</li>
					{/if}
				</ul>
				<div class="card-cta">Open chapter →</div>
			</a>
		{/each}
	</section>

	<section class="how">
		<h2>How LangX is built</h2>
		<div class="how-grid">
			<div>
				<h3>Pure browser</h3>
				<p>
					No backend. The model runs locally via Transformers.js on WebGPU, or you can paste an
					API key for Anthropic, OpenAI, or Gemini — kept only in <code>localStorage</code>.
				</p>
			</div>
			<div>
				<h3>Two panes always</h3>
				<p>
					The left pane teaches the concept. The right pane runs it and exposes the state, the
					message stream, the graph, the virtual filesystem, and the token budget — all live.
				</p>
			</div>
			<div>
				<h3>Read the source</h3>
				<p>
					The Deep Agents harness is implemented from scratch in TypeScript inside this repo, so
					the lesson can point at the exact lines that compose the system prompt or evict a
					tool result.
				</p>
			</div>
			<div>
				<h3>Presentation mode</h3>
				<p>
					Hit <kbd>P</kbd> to flip any lesson into a focused, full-screen slide deck. Hit
					<kbd>Esc</kbd> to come back to the live demo without losing position.
				</p>
			</div>
		</div>
	</section>
</main>

<style>
	.landing {
		max-width: 64rem;
		margin: 0 auto;
		padding: 6rem 2rem 6rem;
	}

	.hero {
		max-width: 44rem;
	}

	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
		margin-bottom: 1.25rem;
	}

	h1 {
		font-family: var(--font-serif);
		font-size: clamp(2rem, 4vw, 3.25rem);
		font-weight: 600;
		line-height: 1.08;
		letter-spacing: -0.015em;
		margin: 0;
	}

	.g {
		color: var(--color-accent-langchain);
		font-weight: 600;
	}

	.lead {
		font-family: var(--font-serif);
		font-size: 1.15rem;
		color: var(--color-fg-muted);
		line-height: 1.6;
		margin: 1.5rem 0 2rem;
	}

	.cta {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.btn {
		font-size: 0.92rem;
		padding: 0.65rem 1.1rem;
		border-radius: 0.5rem;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		font-weight: 500;
		border: 1px solid transparent;
	}

	.btn.primary {
		background: var(--color-fg);
		color: var(--color-bg);
	}

	.btn.ghost {
		background: transparent;
		color: var(--color-fg);
		border-color: var(--color-border);
	}

	.btn:hover {
		opacity: 0.9;
	}

	.chapters {
		margin: 5rem 0 5rem;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}

	@media (max-width: 800px) {
		.chapters {
			grid-template-columns: 1fr;
		}
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-bg-elev);
		text-decoration: none;
		color: var(--color-fg);
		transition: border-color 0.15s, transform 0.15s;
	}

	.card:hover {
		border-color: var(--color-border-strong);
		transform: translateY(-2px);
	}

	.card-num {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-accent-langchain);
		font-weight: 600;
	}

	.card-title {
		font-family: var(--font-serif);
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

	.how h2 {
		font-family: var(--font-serif);
		font-size: 1.75rem;
		font-weight: 600;
		margin: 0 0 2rem;
	}

	.how-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem 3rem;
	}

	@media (max-width: 700px) {
		.how-grid {
			grid-template-columns: 1fr;
		}
	}

	.how h3 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.4rem;
		color: var(--color-fg);
	}

	.how p {
		font-family: var(--font-serif);
		font-size: 1rem;
		color: var(--color-fg-muted);
		line-height: 1.6;
		margin: 0;
	}

	kbd {
		font-family: var(--font-mono);
		font-size: 0.78em;
		padding: 0.1em 0.4em;
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		background: var(--color-bg-elev);
		color: var(--color-fg);
	}

	code {
		background: var(--color-bg-elev);
		padding: 0.1em 0.35em;
		border-radius: 0.3em;
		border: 1px solid var(--color-border);
	}
</style>
