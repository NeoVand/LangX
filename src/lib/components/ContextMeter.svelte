<script lang="ts">
	export interface ContextSegment {
		label: string;
		tokens: number;
		kind?: 'system' | 'history' | 'tool' | 'todo' | 'skill' | 'memory' | 'pending';
	}

	interface Props {
		segments: ContextSegment[];
		max: number;
		evictThresholdPct?: number;
		summarizeThresholdPct?: number;
	}

	let { segments, max, evictThresholdPct = 50, summarizeThresholdPct = 85 }: Props = $props();

	const total = $derived(segments.reduce((s, x) => s + x.tokens, 0));
	const pct = $derived(Math.min(100, (total / max) * 100));
</script>

<div class="meter">
	<div class="head">
		<span>Context budget</span>
		<span class="figure">
			<b>{total.toLocaleString()}</b> / {max.toLocaleString()} tok ({pct.toFixed(0)}%)
		</span>
	</div>
	<div class="bar">
		<div class="track">
			{#each segments as s, i (i)}
				<div
					class="seg"
					data-kind={s.kind ?? 'history'}
					style:width="{(s.tokens / max) * 100}%"
					title="{s.label}: {s.tokens} tok"
				></div>
			{/each}
			{#if evictThresholdPct < 100}
				<div class="threshold evict" style:left="{evictThresholdPct}%" title="Eviction threshold ({evictThresholdPct}%)"></div>
			{/if}
			{#if summarizeThresholdPct < 100}
				<div class="threshold summ" style:left="{summarizeThresholdPct}%" title="Summarization threshold ({summarizeThresholdPct}%)"></div>
			{/if}
		</div>
	</div>
	<ol class="legend">
		{#each segments as s, i (i)}
			<li>
				<span class="dot" data-kind={s.kind ?? 'history'}></span>
				<span class="label">{s.label}</span>
				<span class="num">{s.tokens.toLocaleString()}</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.meter {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.7rem 0.9rem 0.85rem;
		background: var(--color-bg);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.4rem;
	}

	.head b {
		color: var(--color-fg);
		font-variant-numeric: tabular-nums;
	}

	.figure {
		font-family: var(--font-mono);
	}

	.bar {
		position: relative;
		margin-bottom: 0.6rem;
	}

	.track {
		position: relative;
		height: 12px;
		background: var(--color-bg-elev-2);
		border-radius: 0.3rem;
		overflow: hidden;
		display: flex;
	}

	.seg {
		height: 100%;
		min-width: 0;
		background: var(--color-fg-faint);
		opacity: 0.85;
	}

	.seg[data-kind='system'] {
		background: color-mix(in oklch, var(--color-fg-muted) 60%, var(--color-bg-elev));
	}
	.seg[data-kind='history'] {
		background: var(--accent);
	}
	.seg[data-kind='tool'] {
		background: var(--color-accent-warning);
	}
	.seg[data-kind='todo'] {
		background: color-mix(in oklch, var(--accent) 70%, var(--color-fg));
	}
	.seg[data-kind='skill'] {
		background: var(--color-accent-success);
	}
	.seg[data-kind='memory'] {
		background: color-mix(in oklch, var(--accent) 55%, var(--color-cream-0));
	}
	.seg[data-kind='pending'] {
		background: var(--color-accent-danger);
	}

	.threshold {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
	}

	.threshold.evict {
		background: var(--color-accent-warning);
		opacity: 0.7;
	}

	.threshold.summ {
		background: var(--color-accent-danger);
		opacity: 0.85;
	}

	.legend {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.85rem;
		font-size: 0.74rem;
		color: var(--color-fg-muted);
	}

	.legend li {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--color-fg-faint);
	}

	.dot[data-kind='system'] {
		background: color-mix(in oklch, var(--color-fg-muted) 60%, var(--color-bg-elev));
	}
	.dot[data-kind='history'] {
		background: var(--accent);
	}
	.dot[data-kind='tool'] {
		background: var(--color-accent-warning);
	}
	.dot[data-kind='todo'] {
		background: color-mix(in oklch, var(--accent) 70%, var(--color-fg));
	}
	.dot[data-kind='skill'] {
		background: var(--color-accent-success);
	}
	.dot[data-kind='memory'] {
		background: color-mix(in oklch, var(--accent) 55%, var(--color-cream-0));
	}
	.dot[data-kind='pending'] {
		background: var(--color-accent-danger);
	}

	.label {
		font-family: var(--font-mono);
	}

	.num {
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
		font-family: var(--font-mono);
	}
</style>
