<script lang="ts">
	import type { ContextItem } from '$lib/deepagents';

	interface Props {
		items: ContextItem[];
		total: number;
		max: number;
		evictPct: number;
		summarizePct: number;
		tiers?: { evict: boolean; trim: boolean; summarize: boolean };
	}
	let { items, total, max, evictPct, summarizePct, tiers }: Props = $props();

	const fillPct = $derived(Math.min(100, (total / max) * 100));
	const zone = $derived(
		fillPct >= summarizePct ? 'danger' : fillPct >= evictPct ? 'warn' : 'ok'
	);
	const rowMax = $derived(Math.max(1, ...items.map((i) => i.tokens)));

	const ROLE_GLYPH: Record<ContextItem['role'], string> = {
		system: '⚙',
		human: '◆',
		ai: '✦',
		tool: '▤'
	};
	function variantGlyph(it: ContextItem): string {
		if (it.variant === 'pointer') return '⤓';
		if (it.variant === 'summary') return '▣';
		if (it.variant === 'toolcall') return '→';
		return ROLE_GLYPH[it.role];
	}

	const TIER_LABEL: { key: 'evict' | 'trim' | 'summarize'; label: string }[] = [
		{ key: 'evict', label: 'evict' },
		{ key: 'trim', label: 'trim args' },
		{ key: 'summarize', label: 'summarize' }
	];
</script>

<div class="tape">
	<div class="meter" data-zone={zone}>
		<div class="track">
			<div class="fill" style:width="{fillPct}%"></div>
			<div class="mark evict" style:left="{evictPct}%" title="eviction threshold"></div>
			<div class="mark summ" style:left="{summarizePct}%" title="summarization threshold"></div>
		</div>
		<div class="readout">
			<span class="nums">{total.toLocaleString()} / {max.toLocaleString()} tokens</span>
			<span class="pct">{Math.round(fillPct)}%</span>
		</div>
		<div class="scale">
			<span style:left="{evictPct}%">evict {evictPct}%</span>
			<span style:left="{summarizePct}%">summarize {summarizePct}%</span>
		</div>
	</div>

	{#if tiers}
		<div class="tiers">
			{#each TIER_LABEL as t (t.key)}
				<span class="tier" class:fired={tiers[t.key]}>{tiers[t.key] ? '●' : '○'} {t.label}</span>
			{/each}
			{#if !tiers.evict && !tiers.trim && !tiers.summarize}
				<span class="tier idle">no compaction this round</span>
			{/if}
		</div>
	{/if}

	<ul class="stack">
		{#each items as it, i (i)}
			<li class="card {it.role}" data-variant={it.variant}>
				<span class="bar" style:width="{(it.tokens / rowMax) * 100}%"></span>
				<span class="glyph">{variantGlyph(it)}</span>
				<span class="label">{it.label}</span>
				<span class="tok">{it.tokens}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.tape {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	/* ── meter ── */
	.meter {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.track {
		position: relative;
		height: 0.95rem;
		border-radius: 5px;
		background: color-mix(in oklch, var(--color-ink-0) 65%, transparent);
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 5px;
		transition: width 0.35s ease;
		background: var(--accent);
	}
	.meter[data-zone='warn'] .fill {
		background: var(--color-accent-warning);
	}
	.meter[data-zone='danger'] .fill {
		background: var(--color-accent-danger);
	}
	.mark {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 0;
		border-left: 1.5px dashed color-mix(in oklch, var(--color-fg-faint) 75%, transparent);
	}
	.mark.summ {
		border-left-color: color-mix(in oklch, var(--color-accent-danger) 70%, transparent);
	}
	.readout {
		display: flex;
		justify-content: space-between;
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
	}
	.readout .pct {
		font-weight: 600;
		color: var(--color-fg-muted);
	}
	.scale {
		position: relative;
		height: 0.85rem;
	}
	.scale span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 0.62rem;
		color: var(--color-fg-faint);
		white-space: nowrap;
	}

	/* ── tier badges ── */
	.tiers {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.tier {
		font-size: 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.08rem 0.55rem;
		color: var(--color-fg-faint);
	}
	.tier.fired {
		border-color: color-mix(in oklch, var(--color-accent-warning) 60%, var(--color-border));
		color: var(--color-accent-warning);
	}
	.tier.idle {
		border-style: dashed;
	}

	/* ── the message stack ── */
	.stack {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.card {
		position: relative;
		display: grid;
		grid-template-columns: 1.2rem 1fr auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.32rem 0.55rem;
		border-radius: 7px;
		border: 1px solid var(--color-border);
		border-left-width: 3px;
		overflow: hidden;
		font-size: 0.8rem;
	}
	.card .bar {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in oklch, var(--color-ink-0) 45%, transparent);
		z-index: 0;
		transition: width 0.35s ease;
	}
	.card .glyph,
	.card .label,
	.card .tok {
		position: relative;
		z-index: 1;
	}
	.card .glyph {
		text-align: center;
		opacity: 0.8;
	}
	.card .label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-fg-muted);
	}
	.card .tok {
		font-size: 0.7rem;
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
	}

	.card.system {
		border-left-color: color-mix(in oklch, var(--color-cream-4) 70%, var(--color-border));
	}
	.card.human {
		border-left-color: var(--accent);
	}
	.card.human .label {
		color: var(--accent-ink);
	}
	.card.ai {
		border-left-color: color-mix(in oklch, var(--color-cream-3) 60%, var(--color-border));
	}
	.card.tool {
		border-left-color: color-mix(in oklch, var(--color-fg-faint) 55%, var(--color-border));
	}

	/* the two compaction artifacts read differently */
	.card[data-variant='pointer'] {
		border-style: dashed;
		opacity: 0.7;
	}
	.card[data-variant='pointer'] .label {
		font-style: italic;
	}
	.card[data-variant='summary'] {
		border-color: color-mix(in oklch, var(--accent) 55%, var(--color-border));
		border-left-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 7%, transparent);
	}
	.card[data-variant='summary'] .label {
		color: var(--accent-ink);
		font-weight: 600;
	}
</style>
