<script lang="ts">
	/**
	 * The sources behind an answer. Each chip is a citation id the model used
	 * (e.g. [S1]); clicking it reveals the exact passage, its document, and its
	 * similarity score — so a reader can check every claim against its evidence.
	 */
	interface Citation {
		id: string;
		source: string;
		index: number;
		snippet: string;
		score: number;
	}
	let { citations = [], label = 'Sources' }: { citations?: Citation[]; label?: string } = $props();

	let openId = $state<string | null>(null);
	const toggle = (id: string) => (openId = openId === id ? null : id);
</script>

{#if citations.length}
	<div class="citations">
		<span class="cl">{label}</span>
		<div class="chips">
			{#each citations as c (c.id)}
				<button class="chip" class:open={openId === c.id} onclick={() => toggle(c.id)}>
					<span class="cid">{c.id}</span>
					<span class="src">{c.source}</span>
				</button>
			{/each}
		</div>
		{#each citations as c (c.id)}
			{#if openId === c.id}
				<div class="passage">
					<div class="meta">
						<span class="cid">{c.id}</span>
						<span class="src">{c.source}</span>
						<span class="score">similarity {c.score.toFixed(2)}</span>
					</div>
					<p class="snippet">{c.snippet}</p>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.citations {
		margin-top: 0.6rem;
	}
	.cl {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-300);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.3rem;
	}
	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		cursor: pointer;
		font: inherit;
		color: var(--color-ink-200);
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.chip:hover,
	.chip.open {
		border-color: var(--accent);
		color: var(--accent);
	}
	.cid {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--accent);
	}
	.src {
		font-size: 0.72rem;
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.passage {
		margin-top: 0.4rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.45rem;
		border: 1px solid var(--accent-rule);
		background: color-mix(in oklch, var(--accent) 6%, var(--color-paper));
	}
	.passage .meta {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.3rem;
	}
	.passage .score {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-ink-300);
	}
	.snippet {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		white-space: pre-wrap;
	}
</style>
