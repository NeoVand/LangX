<script lang="ts">
	/**
	 * Retrieval as geometry. Every chunk's 384-d embedding is projected to 2-D
	 * (PCA), so similar passages sit near each other. When the agent searches, its
	 * query lands on the same map and we draw a line to each chunk it pulled — hover
	 * a chunk to read it, hover a line to see the cosine similarity.
	 */
	interface ChunkPoint {
		key: string;
		source: string;
		index: number;
		text: string;
		x: number;
		y: number;
	}
	interface SearchHit {
		key: string;
		score: number;
	}
	interface SearchEvent {
		query: string;
		x: number;
		y: number;
		hits: SearchHit[];
	}
	let {
		chunkPoints = [],
		searchEvents = []
	}: { chunkPoints?: ChunkPoint[]; searchEvents?: SearchEvent[] } = $props();

	const W = 320;
	const H = 232;
	const PAD = 22;

	const bounds = $derived.by(() => {
		if (!chunkPoints.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		for (const p of chunkPoints) {
			minX = Math.min(minX, p.x);
			maxX = Math.max(maxX, p.x);
			minY = Math.min(minY, p.y);
			maxY = Math.max(maxY, p.y);
		}
		return { minX, maxX, minY, maxY };
	});
	const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
	function sx(x: number): number {
		const { minX, maxX } = bounds;
		return clamp(PAD + ((x - minX) / (maxX - minX || 1)) * (W - 2 * PAD), PAD, W - PAD);
	}
	function sy(y: number): number {
		const { minY, maxY } = bounds;
		return clamp(H - (PAD + ((y - minY) / (maxY - minY || 1)) * (H - 2 * PAD)), PAD, H - PAD);
	}

	// Best score each retrieved chunk got this turn (for the "match" set + line label).
	const matchScore = $derived.by(() => {
		const m: Record<string, number> = {};
		for (const e of searchEvents)
			for (const h of e.hits) m[h.key] = Math.max(m[h.key] ?? -1, h.score);
		return m;
	});
	const byKey = $derived(new Map(chunkPoints.map((p) => [p.key, p])));

	// ── Tooltip via event delegation (one handler; reads data- attrs) ──────────
	let tip = $state<{ x: number; y: number; title: string; body: string } | null>(null);
	function onMove(e: MouseEvent) {
		const el = (e.target as Element)?.closest('[data-tip]');
		if (!el) {
			tip = null;
			return;
		}
		const kind = el.getAttribute('data-tip');
		const x = e.offsetX;
		const y = e.offsetY;
		if (kind === 'chunk') {
			tip = {
				x,
				y,
				title: `${el.getAttribute('data-source')} · chunk ${el.getAttribute('data-index')}`,
				body: el.getAttribute('data-text') ?? ''
			};
		} else if (kind === 'line') {
			tip = { x, y, title: 'cosine similarity', body: el.getAttribute('data-score') ?? '' };
		} else if (kind === 'query') {
			tip = { x, y, title: 'query', body: el.getAttribute('data-q') ?? '' };
		}
	}
</script>

<figure class="emap">
	<div class="plot" role="presentation" onmousemove={onMove} onmouseleave={() => (tip = null)}>
		<svg viewBox="0 0 {W} {H}" role="img" aria-label="Embedding map of document chunks and the query">
			<rect class="frame" x="1" y="1" width={W - 2} height={H - 2} rx="8" />

			<!-- query → match traces (wide invisible hit-line under each) -->
			{#each searchEvents as e, ei (ei)}
				{#each e.hits as h (h.key)}
					{@const p = byKey.get(h.key)}
					{#if p}
						<line class="trace" x1={sx(e.x)} y1={sy(e.y)} x2={sx(p.x)} y2={sy(p.y)} />
						<line
							class="trace-hit"
							x1={sx(e.x)}
							y1={sy(e.y)}
							x2={sx(p.x)}
							y2={sy(p.y)}
							data-tip="line"
							data-score={h.score.toFixed(3)}
						/>
					{/if}
				{/each}
			{/each}

			<!-- chunk dots: grey by default, gold when retrieved this turn -->
			{#each chunkPoints as p (p.key)}
				{@const hit = p.key in matchScore}
				<circle
					class="chunk"
					class:hit
					cx={sx(p.x)}
					cy={sy(p.y)}
					r={hit ? 5.5 : 3.4}
					data-tip="chunk"
					data-source={p.source}
					data-index={p.index}
					data-text={p.text}
				/>
			{/each}

			<!-- query markers (teal star + halo) -->
			{#each searchEvents as e, ei (ei)}
				<g class="query" transform="translate({sx(e.x)}, {sy(e.y)})" data-tip="query" data-q={e.query}>
					<circle class="q-halo" r="10" />
					<path
						class="q-mark"
						d="M0 -6 L1.7 -1.8 L6 -1.8 L2.6 1.3 L3.9 6 L0 3.3 L-3.9 6 L-2.6 1.3 L-6 -1.8 L-1.7 -1.8 Z"
					/>
					{#if searchEvents.length > 1}<text class="q-label" x="9" y="3">Q{ei + 1}</text>{/if}
				</g>
			{/each}
		</svg>

		{#if tip}
			<div class="tip" style="left: {tip.x}px; top: {tip.y}px">
				<span class="tip-title">{tip.title}</span>
				<span class="tip-body">{tip.body}</span>
			</div>
		{/if}
	</div>

	<div class="legend">
		<span class="lg"><span class="sw query"></span>query</span>
		<span class="lg"><span class="sw match"></span>match (retrieved)</span>
		<span class="lg"><span class="sw chunk"></span>other chunk</span>
	</div>
	<figcaption>PCA of the chunk embeddings · hover a dot to read it, a line to see its similarity.</figcaption>
</figure>

<style>
	.emap {
		margin: 0;
		--c-chunk: color-mix(in oklch, var(--color-fg) 32%, transparent);
		--c-match: var(--accent);
		--c-query: oklch(0.8 0.13 195);
	}
	.plot {
		position: relative;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		font-family: var(--font-mono);
	}
	.frame {
		fill: var(--color-paper);
		stroke: var(--color-rule);
		stroke-width: 1;
	}
	.trace {
		stroke: var(--c-query);
		stroke-width: 1.2;
		opacity: 0.45;
		stroke-dasharray: 3 3;
		pointer-events: none;
	}
	.trace-hit {
		stroke: transparent;
		stroke-width: 10;
		cursor: pointer;
	}
	.chunk {
		fill: var(--c-chunk);
		transition:
			r 0.25s ease,
			fill 0.25s ease;
		cursor: pointer;
	}
	.chunk.hit {
		fill: var(--c-match);
		stroke: color-mix(in oklch, var(--c-match) 50%, var(--color-paper));
		stroke-width: 2;
	}
	.query {
		cursor: pointer;
	}
	.q-halo {
		fill: color-mix(in oklch, var(--c-query) 28%, transparent);
	}
	.q-mark {
		fill: var(--c-query);
		stroke: var(--color-paper);
		stroke-width: 0.7;
	}
	.q-label {
		fill: var(--c-query);
		font-size: 8px;
	}

	.tip {
		position: absolute;
		transform: translate(-50%, calc(-100% - 10px));
		max-width: 15rem;
		padding: 0.4rem 0.55rem;
		border-radius: 0.45rem;
		background: var(--color-bg-elev-2, #1c1814);
		border: 1px solid var(--accent-rule);
		box-shadow: 0 10px 28px -14px rgba(0, 0, 0, 0.8);
		pointer-events: none;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.tip-title {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}
	.tip-body {
		font-size: 0.74rem;
		line-height: 1.4;
		color: var(--color-ink-100);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin-top: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-ink-300);
	}
	.lg {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
	}
	.sw {
		width: 0.62rem;
		height: 0.62rem;
		border-radius: 50%;
		display: inline-block;
	}
	.sw.query {
		background: var(--c-query);
	}
	.sw.match {
		background: var(--c-match);
	}
	.sw.chunk {
		background: var(--c-chunk);
	}
	figcaption {
		margin-top: 0.45rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.03em;
		color: var(--color-ink-300);
	}
</style>
