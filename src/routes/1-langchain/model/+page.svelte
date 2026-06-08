<script lang="ts">
	import { Cpu, ArrowUpRight, Sparkles } from '@lucide/svelte';
</script>

<svelte:head>
	<title>The Model · LangX</title>
</svelte:head>

<div class="model-intro">
	<div class="inner">
		<p class="eyebrow">Level 1 · The Model</p>
		<h1>The Model</h1>
		<p class="lede">
			Everything in LangChain, LangGraph, and Deep Agents ultimately calls one thing: a language
			model. Before we wire models into chains and agents, it's worth opening one up and seeing how
			it actually works — token by token, attention head by attention head.
		</p>

		<a class="launch-card" href="/1-langchain/model/explorer">
			<div class="lc-icon"><Cpu size={28} /></div>
			<div class="lc-body">
				<span class="lc-title">Open the Transformer Workshop <ArrowUpRight size={18} /></span>
				<span class="lc-sub">
					A real GPT-2 running in your browser. Type a prompt and watch embeddings flow through 12
					attention blocks into next-token probabilities. Tweak temperature and sampling live.
				</span>
			</div>
		</a>

		<ul class="explore">
			<li><Sparkles size={15} /> Per-head attention matrices (Q·Kᵀ → mask → softmax)</li>
			<li><Sparkles size={15} /> Token embeddings and the MLP, layer by layer</li>
			<li><Sparkles size={15} /> Temperature & top-k / top-p sampling on the live logits</li>
		</ul>

		<p class="note">
			Adapted from the wonderful
			<a href="https://poloclub.github.io/transformer-explainer/" target="_blank" rel="noreferrer">
				Transformer Explainer
			</a>
			by the Polo Club of Data Science (MIT-licensed) — restyled and embedded here. The guided
			lesson around it is coming next.
		</p>
	</div>
</div>

<style>
	.model-intro {
		height: 100%;
		overflow-y: auto;
		display: flex;
		justify-content: center;
		padding: 4.75rem 1.5rem 4rem;
	}
	.inner {
		width: 100%;
		max-width: 46rem;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.78rem;
		color: var(--accent-ink);
		margin: 0 0 0.5rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 2.6rem;
		font-weight: 500;
		margin: 0 0 1rem;
		color: var(--color-fg);
	}
	.lede {
		font-size: 1.08rem;
		line-height: 1.7;
		color: var(--color-fg-muted);
		margin: 0 0 2rem;
	}
	.launch-card {
		display: flex;
		gap: 1.1rem;
		align-items: flex-start;
		padding: 1.4rem 1.5rem;
		border-radius: 1rem;
		text-decoration: none;
		border: 1px solid var(--color-border);
		background:
			radial-gradient(120% 140% at 0% 0%, color-mix(in oklch, var(--accent) 12%, transparent), transparent 60%),
			var(--color-bg-elev);
		transition: border-color 0.2s;
	}
	.launch-card:hover {
		border-color: var(--accent-rule);
	}
	.lc-icon {
		flex-shrink: 0;
		color: var(--accent-ink);
		margin-top: 0.15rem;
	}
	.lc-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lc-title {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-fg);
	}
	.lc-sub {
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
	}
	.explore {
		list-style: none;
		padding: 0;
		margin: 1.8rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.explore li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.95rem;
		color: var(--color-fg-muted);
	}
	.explore :global(svg) {
		color: var(--accent-ink);
		flex-shrink: 0;
	}
	.note {
		margin-top: 2.2rem;
		font-size: 0.86rem;
		line-height: 1.6;
		color: var(--color-fg-faint);
	}
	.note a {
		color: var(--accent-ink);
	}
</style>
