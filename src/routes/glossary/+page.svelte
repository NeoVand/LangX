<script lang="ts">
	import { glossary, type GlossaryEntry } from '$lib/glossary';

	let q = $state('');

	const filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return glossary;
		return glossary.filter(
			(g) =>
				g.term.toLowerCase().includes(needle) ||
				g.short.toLowerCase().includes(needle) ||
				g.long.toLowerCase().includes(needle)
		);
	});

	const grouped = $derived.by(() => {
		const order: GlossaryEntry['chapter'][] = ['general', 'langchain', 'langgraph', 'deepagents'];
		const result: Record<string, GlossaryEntry[]> = {};
		for (const ch of order) result[ch] = [];
		for (const e of filtered) result[e.chapter].push(e);
		for (const ch of order) result[ch].sort((a, b) => a.term.localeCompare(b.term));
		return order.map((ch) => ({ chapter: ch, entries: result[ch] }));
	});

	const headings: Record<string, string> = {
		general: 'General',
		langchain: 'LangChain',
		langgraph: 'LangGraph',
		deepagents: 'Deep Agents'
	};
</script>

<main class="glossary">
	<header>
		<div class="eyebrow">Glossary</div>
		<h1>Terms you'll meet across the curriculum.</h1>
		<p class="lead">
			Words that frequently confuse newcomers — sandbox, harness, reducer, eviction. Hover any
			underlined term inside a lesson to see the short version; come here for the longer one.
		</p>
		<input
			class="search"
			placeholder="Search…"
			bind:value={q}
			aria-label="Search glossary"
		/>
	</header>

	{#each grouped as group (group.chapter)}
		{#if group.entries.length}
			<section data-chapter={group.chapter}>
				<h2>{headings[group.chapter]}</h2>
				<dl>
					{#each group.entries as entry (entry.term)}
						<div>
							<dt>{entry.term}</dt>
							<dd>
								<div class="short">{entry.short}</div>
								<div class="long">{entry.long}</div>
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}
	{/each}
</main>

<style>
	.glossary {
		max-width: 56rem;
		margin: 0 auto;
		padding: 4rem 2rem 6rem;
	}

	header {
		margin-bottom: 3rem;
	}

	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
		margin-bottom: 0.75rem;
	}

	h1 {
		font-family: var(--font-serif);
		font-size: 2.25rem;
		font-weight: 600;
		margin: 0;
		line-height: 1.1;
	}

	.lead {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		color: var(--color-fg-muted);
		max-width: 38rem;
		line-height: 1.6;
		margin: 1rem 0 1.5rem;
	}

	.search {
		width: 100%;
		max-width: 24rem;
		background: var(--color-bg-elev);
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.55rem 0.75rem;
		font-size: 0.9rem;
		color: var(--color-fg);
	}

	.search:focus {
		outline: none;
		border-color: var(--accent);
	}

	section {
		margin-bottom: 2.5rem;
	}

	h2 {
		font-family: var(--font-serif);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem;
		color: var(--accent);
	}

	dl {
		margin: 0;
	}

	dl > div {
		display: grid;
		grid-template-columns: 12rem 1fr;
		gap: 1.25rem;
		padding: 1rem 0;
		border-top: 1px solid var(--color-border);
	}

	@media (max-width: 700px) {
		dl > div {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}
	}

	dt {
		font-family: var(--font-mono);
		font-size: 0.88rem;
		color: var(--color-fg);
		font-weight: 600;
	}

	dd {
		margin: 0;
	}

	.short {
		font-family: var(--font-serif);
		font-size: 1rem;
		color: var(--color-fg);
		margin-bottom: 0.25rem;
	}

	.long {
		font-size: 0.92rem;
		color: var(--color-fg-muted);
		line-height: 1.55;
	}
</style>
