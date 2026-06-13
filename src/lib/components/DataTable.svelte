<script lang="ts">
	// A sortable, typed data grid — the "look at the data" surface. Renders a row
	// sample of any tabular dataset with per-column type badges (inferred from the
	// schema profile), sticky header, numeric right-alignment, null styling and a
	// row-count footer. House component; reused wherever rows need a real table.
	import { profileDataset, type ColumnProfile, type Row } from '$lib/runtime/datascience';

	interface Props {
		rows: Row[];
		/** Schema (with types). Derived from `rows` if omitted. */
		columns?: ColumnProfile[];
		title?: string;
		/** Cap on rows rendered (the grid scrolls; the footer shows the total). */
		maxRows?: number;
		maxHeight?: string;
	}
	let { rows, columns, title = 'Data', maxRows = 200, maxHeight = '24rem' }: Props = $props();

	const cols = $derived(columns ?? profileDataset(rows).columns);

	type SortDir = 1 | -1;
	let sortKey = $state<string | null>(null);
	let sortDir = $state<SortDir>(1);

	function toggleSort(name: string) {
		if (sortKey === name) {
			if (sortDir === 1) sortDir = -1;
			else sortKey = null; // asc → desc → off
		} else {
			sortKey = name;
			sortDir = 1;
		}
	}

	function cmp(a: unknown, b: unknown): number {
		const am = a === null || a === undefined || a === '';
		const bm = b === null || b === undefined || b === '';
		if (am && bm) return 0;
		if (am) return 1; // missing sorts last, always
		if (bm) return -1;
		if (typeof a === 'number' && typeof b === 'number') return a - b;
		return String(a).localeCompare(String(b), undefined, { numeric: true });
	}

	const sorted = $derived.by(() => {
		if (!sortKey) return rows;
		const k = sortKey;
		const dir = sortDir;
		return [...rows].sort((ra, rb) => cmp(ra[k], rb[k]) * dir);
	});
	const shown = $derived(sorted.slice(0, maxRows));

	const TYPE_BADGE: Record<ColumnProfile['type'], { tag: string; title: string }> = {
		quantitative: { tag: '123', title: 'numeric' },
		temporal: { tag: 'date', title: 'date / time' },
		nominal: { tag: 'abc', title: 'category' },
		identifier: { tag: 'id', title: 'identifier / label' }
	};

	function isNum(t: ColumnProfile['type']) {
		return t === 'quantitative';
	}

	function fmt(v: unknown): string {
		if (v === null || v === undefined || v === '') return '—';
		if (typeof v === 'number') {
			if (!Number.isFinite(v)) return String(v);
			if (Number.isInteger(v)) return v.toLocaleString('en-US');
			return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
		}
		return String(v);
	}
</script>

<div class="dt">
	<header>
		<h4>{title}</h4>
		<span class="shape">{rows.length.toLocaleString('en-US')} × {cols.length}</span>
	</header>
	<div class="scroll scrollbar-slim" style:max-height={maxHeight}>
		<table>
			<thead>
				<tr>
					<th class="rownum" aria-label="row number"></th>
					{#each cols as c (c.name)}
						<th
							class:numeric={isNum(c.type)}
							class:sorted={sortKey === c.name}
							onclick={() => toggleSort(c.name)}
							title="Sort by {c.name}"
						>
							<span class="thead">
								<span class="cname">{c.name}</span>
								<span class="badge {c.type}" title={TYPE_BADGE[c.type].title}
									>{TYPE_BADGE[c.type].tag}</span
								>
								{#if sortKey === c.name}
									<span class="arrow">{sortDir === 1 ? '▲' : '▼'}</span>
								{/if}
							</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each shown as row, i (i)}
					<tr>
						<td class="rownum">{i + 1}</td>
						{#each cols as c (c.name)}
							{@const v = row[c.name]}
							{@const missing = v === null || v === undefined || v === ''}
							<td class:numeric={isNum(c.type)} class:missing>{fmt(v)}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if rows.length > shown.length}
		<footer>
			showing first {shown.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} rows
		</footer>
	{/if}
</div>

<style>
	.dt {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-bg);
		overflow: hidden;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg-elev-2);
	}
	h4 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		margin: 0;
	}
	.shape {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}
	.scroll {
		overflow: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.78rem;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--color-bg-elev-2);
		border-bottom: 1px solid var(--color-border);
		padding: 0.4rem 0.6rem;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		user-select: none;
	}
	thead th.numeric {
		text-align: right;
	}
	thead th:hover {
		background: color-mix(in oklch, var(--accent) 12%, var(--color-bg-elev-2));
	}
	thead th.sorted {
		color: var(--accent-ink);
	}
	.thead {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	th.numeric .thead {
		flex-direction: row-reverse;
	}
	.cname {
		font-weight: 600;
		color: var(--color-fg);
	}
	.badge {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.04rem 0.28rem;
		border-radius: 0.25rem;
		border: 1px solid var(--color-border);
		color: var(--color-fg-faint);
	}
	.badge.quantitative {
		color: var(--accent-ink);
		border-color: color-mix(in oklch, var(--accent) 45%, var(--color-border));
	}
	.badge.temporal {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, var(--color-border));
	}
	.badge.identifier {
		color: var(--color-accent-success);
		border-color: color-mix(in oklch, var(--color-accent-success) 45%, var(--color-border));
	}
	.arrow {
		font-size: 0.6rem;
		color: var(--accent-ink);
	}
	tbody td {
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid color-mix(in oklch, var(--color-border) 55%, transparent);
		white-space: nowrap;
		max-width: 18rem;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-fg-muted);
	}
	tbody tr:nth-child(even) td {
		background: color-mix(in oklch, var(--color-fg) 3%, transparent);
	}
	tbody tr:hover td {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
	}
	td.numeric {
		text-align: right;
		font-family: var(--font-mono);
		color: var(--color-fg);
	}
	td.missing {
		color: var(--color-fg-faint);
		font-style: italic;
	}
	.rownum {
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-align: right;
		width: 2.2rem;
		background: var(--color-bg-elev-2);
		position: sticky;
		left: 0;
	}
	td.rownum {
		border-bottom: 1px solid color-mix(in oklch, var(--color-border) 55%, transparent);
	}
	footer {
		padding: 0.35rem 0.7rem;
		border-top: 1px solid var(--color-border);
		font-size: 0.7rem;
		color: var(--color-fg-faint);
		font-style: italic;
		text-align: center;
	}
</style>
