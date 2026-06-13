---
name: ds-tabular-eda
description: Explore and summarise a tabular dataset with the Arquero dataframe library inside the compute (Mill) tool. Use whenever you need to understand, profile, clean or aggregate data — row/column counts, missing values, distinct categories, summary statistics, group-by rollups, filtering, sorting, deriving new columns, or top-N tables. Covers the Arquero verbs (groupby, rollup, filter, derive, orderby, slice), how to read columns whose names contain spaces, and the cardinal rule: never tabulate or average by hand — compute it. Worked recipes run against the active dataset as `table`/`data`.
---

# Tabular EDA with Arquero

The first job is always the same: **look at the shape before you reason about it.**
Profile the columns, count what's missing, see the distinct categories, then
aggregate. Do all of it in the `compute` tool — never eyeball numbers from a
sample and never average in your head.

## What's in scope inside `compute({ code })`

- `data` — the active dataset as an array of row objects
- `table` — an Arquero table built from `data`
- `aq` — Arquero namespace (`aq.from`, `aq.desc`, `aq.op`)
- `op` — Arquero aggregate/window operators (`op.count`, `op.mean`, `op.corr`, `op.quantile`, …)
- `ss` — simple-statistics (see the `ds-statistics` skill)

Always `return` a small, JSON-serialisable value (an Arquero table return is
auto-materialised to row objects — keep it to the rows you need).

## 1 · Shape & missingness

```js
// @mill — overall shape and per-column missing counts
const cols = table.columnNames();
const missing = {};
for (const c of cols) missing[c] = table.filter(aq.escape((d) => d[c] == null)).numRows();
return { rows: table.numRows(), columns: cols, missing };
```

## 2 · Distinct categories (the cardinality of a column)

```js
// @mill — how many groups, and how big each is
return table.groupby('group').rollup({ n: op.count() }).orderby(aq.desc('n')).objects();
```

## 3 · Group-by rollup — the workhorse

```js
// @mill — summary statistics per group
return table
	.groupby('group')
	.rollup({
		n: op.count(),
		x_mean: op.mean('x'),
		y_mean: op.mean('y'),
		y_min: op.min('y'),
		y_max: op.max('y'),
		y_sd: op.stdev('y')
	})
	.objects();
```

## 4 · Filter, derive, sort, top-N

```js
// @mill — derive a ratio, keep the interesting rows, rank them
return table
	.derive({ ratio: (d) => d.y / d.x })
	.filter((d) => d.x > 0)
	.orderby(aq.desc('ratio'))
	.slice(0, 5)
	.objects();
```

## 5 · Columns whose names contain spaces or punctuation

Dot access won't work for `Beak Length (mm)`. Read it by name with bracket access
inside `aq.escape(...)`, which tells Arquero to pass your function through verbatim:

```js
// @mill — read a column whose name is in a variable; the same works for "Beak Length (mm)"
const col = 'y'; // e.g. 'Beak Length (mm)'
return table
	.derive({ picked: aq.escape((d) => d[col]) })
	.rollup({ mean_picked: op.mean('picked') })
	.objects();
```

To rename an awkward column once and for all, map **old → new**:
`table.rename({ 'Beak Length (mm)': 'beak_len' })`.

## Method notes

- **Never compute by hand.** Counts, sums, means, group sizes — all of it goes
  through `compute`. A model that eyeballs a total is a model that hallucinates one.
- **Report the missing.** State how many values are null per column before you draw
  conclusions; a column that's 40% empty can't carry an argument.
- **Aggregate, then look.** Don't dump raw rows into your reasoning — roll them up
  first, return the small table, and reason about that.
- Next: quantify relationships with **`ds-statistics`**, then visualise with **`ds-charting`**.
