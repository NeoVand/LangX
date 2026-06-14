<script lang="ts">
	// Word embeddings + cosine similarity — the same idea the Agentic-RAG lesson
	// uses to rank documents, here on single words. Embeds each word with the app's
	// local MiniLM model (no API key) and shows the full pairwise cosine matrix:
	// related words light up, unrelated ones stay dark. Motivates "dense embedding".
	import { embedWords, similarityMatrix } from '$lib/demos/word-embed';

	let raw = $state('king, queen, man, woman, apple, banana, cat, dog');
	const words = $derived(
		raw
			.split(',')
			.map((w) => w.trim())
			.filter(Boolean)
			.slice(0, 9)
	);

	let matrix = $state<number[][]>([]);
	let shown = $state<string[]>([]);
	let loading = $state(false);
	let err = $state('');

	let host = $state<HTMLElement>();
	let visible = $state(false);
	$effect(() => {
		if (!host || visible) return;
		const io = new IntersectionObserver(
			(es) => {
				if (es.some((e) => e.isIntersecting)) {
					visible = true;
					io.disconnect();
				}
			},
			{ rootMargin: '160px 0px' }
		);
		io.observe(host);
		return () => io.disconnect();
	});

	async function embed() {
		if (!words.length) return;
		loading = true;
		err = '';
		try {
			const vecs = await embedWords(words);
			matrix = similarityMatrix(vecs);
			shown = [...words];
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// embed the default set once it scrolls into view
	$effect(() => {
		if (visible && !shown.length && !loading) embed();
	});

	// off-diagonal max → the most-similar pair, for the readout
	const topPair = $derived.by(() => {
		let best = { i: -1, j: -1, v: -1 };
		for (let i = 0; i < matrix.length; i++)
			for (let j = i + 1; j < matrix.length; j++)
				if (matrix[i][j] > best.v) best = { i, j, v: matrix[i][j] };
		return best;
	});

	function cell(c: number): string {
		// 0 → bg, 1 → gold; clamp a little above 0 so faint similarities still read
		const t = Math.max(0, Math.min(1, c));
		return `color-mix(in oklch, #d9a441 ${Math.round(t * 100)}%, var(--color-bg))`;
	}
	function ink(c: number): string {
		return c > 0.55 ? '#1a140c' : 'var(--color-fg-muted)';
	}
</script>

<figure class="we" bind:this={host}>
	<div class="card">
		<label class="lbl" for="we-input">Words to compare (edit freely)</label>
		<div class="row">
			<input id="we-input" bind:value={raw} spellcheck="false" />
			<button class="go" onclick={embed} disabled={loading}>
				{loading ? 'Embedding…' : 'Embed'}
			</button>
		</div>

		<div class="out" aria-live="polite">
			{#if err}
				<p class="err">Couldn't load the embedding model: {err}</p>
			{:else if !shown.length}
				<p class="muted">{visible ? 'Loading the local embedding model…' : 'Loads when you reach this demo…'}</p>
			{:else}
				<div class="heat" style="--n:{shown.length}">
					<div class="corner"></div>
					{#each shown as w, j (j)}
						<div class="chead" title={w}>{w}</div>
					{/each}
					{#each shown as wi, i (i)}
						<div class="rhead" title={wi}>{wi}</div>
						{#each shown as wj, j (j)}
							<div
								class="hc"
								class:diag={i === j}
								style:background={cell(matrix[i]?.[j] ?? 0)}
								style:color={ink(matrix[i]?.[j] ?? 0)}
								title="{wi} ↔ {wj}: {(matrix[i]?.[j] ?? 0).toFixed(2)}"
							>
								{(matrix[i]?.[j] ?? 0).toFixed(2)}
							</div>
						{/each}
					{/each}
				</div>
				{#if topPair.i >= 0}
					<p class="count">
						Closest pair: <span class="tok">{shown[topPair.i]}</span> ↔
						<span class="tok">{shown[topPair.j]}</span>
						(cosine <b>{topPair.v.toFixed(2)}</b>). Brighter = more alike.
					</p>
				{/if}
			{/if}
		</div>
	</div>
	<figcaption>
		Each word becomes a 384-number vector; <b>cosine similarity</b> measures the angle between two
		vectors. Words that mean similar things end up pointing the same way — meaning becomes geometry.
	</figcaption>
</figure>

<style>
	.we {
		margin: 1.6rem 0;
	}
	.card {
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		background: var(--color-bg-elev);
		padding: 1rem 1.1rem 1.1rem;
	}
	.lbl {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
		margin-bottom: 0.5rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
	input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-prose);
		font-size: 0.92rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-rule);
	}
	.go {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		color: #1a140c;
		background: linear-gradient(180deg, #e7b450, #cf982f);
		border: 0;
		border-radius: 0.5rem;
		padding: 0 0.9rem;
		cursor: pointer;
	}
	.go:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.out {
		margin-top: 0.85rem;
		min-height: 3rem;
		overflow-x: auto;
	}
	.muted {
		color: var(--color-fg-faint);
		font-size: 0.88rem;
		margin: 0.3rem 0;
	}
	.err {
		color: var(--color-accent-danger);
		font-size: 0.86rem;
	}
	.heat {
		display: grid;
		grid-template-columns: auto repeat(var(--n), minmax(2.2rem, 1fr));
		gap: 2px;
		width: 100%;
		min-width: 0;
	}
	.corner {
		background: transparent;
	}
	.chead,
	.rhead {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0.1rem;
	}
	.rhead {
		justify-content: flex-end;
		padding-right: 0.4rem;
	}
	.hc {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		border-radius: 0.2rem;
		transition: outline 0.1s ease;
	}
	.hc:hover {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.hc.diag {
		opacity: 0.85;
	}
	.count {
		margin: 0.8rem 0 0;
		font-size: 0.86rem;
		color: var(--color-fg-muted);
	}
	.count b {
		color: var(--color-fg);
	}
	.tok {
		font-family: var(--font-mono);
		color: var(--accent-ink);
	}
	figcaption {
		margin-top: 0.65rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-300);
		font-style: italic;
	}
</style>
