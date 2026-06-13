---
name: ds-charting
description: Choose and specify honest charts with the plot tool, which renders Observable Plot SVGs into /reports/figures/. Use whenever you need to visualise data — a scatter plot of two numeric columns, a bar chart of a category aggregate, a line chart of a time series, colouring by group, or a log scale for skewed values like income or population. Covers which mark fits which question, how to prepare chart data in the Mill first, log scales, colouring by a category, and the rules for honest charts. Pairs with ds-tabular-eda (aggregate first) and ds-statistics (quantify first).
---

# Charting with the plot tool

A chart is an argument made in ink — make it an honest one. Pick the mark from the
_shape of the question_, prepare the data in `compute` first, then call `plot`.

## The plot tool

`plot({ title, mark, x, y, color?, from?, data?, xScale?, yScale?, caption? })`
→ writes an SVG to `/reports/figures/N.svg` and returns its path.

- `mark`: `'scatter'` (two numeric columns), `'bar'` (a category aggregate), `'line'` (a time series)
- `x`, `y`: column names to put on each axis
- `color`: a categorical column to colour by (e.g. `region`, `Species`, `Origin`)
- `from`: `'dataset'` (the loaded data, the default) **or** a Store path like `'/analysis/by_region.json'`
- `data`: an inline array of rows (overrides `from`) — for small computed tables
- `xScale` / `yScale`: `'linear'` (default) or `'log'` — use log for income, population, money
- `caption`: one honest sentence; it becomes the figure's caption

## Pick the mark from the question

| The question is about… | Mark      | Example                                                   |
| ---------------------- | --------- | --------------------------------------------------------- |
| how two numbers relate | `scatter` | income (x, log) vs. life expectancy (y), colour by region |
| a number per category  | `bar`     | mean MPG by origin; rainy-day rate by month               |
| a number over time     | `line`    | max temperature by date                                   |

## 1 · Scatter — relationship between two numeric columns

Plot the raw rows; reach for a log scale when one axis spans orders of magnitude:

```text
plot({ title: 'Income vs. life expectancy', mark: 'scatter',
       x: 'income', y: 'health', color: 'region',
       xScale: 'log', caption: 'Each point a country; income on a log scale.' })
```

## 2 · Bar — aggregate first in the Mill, then plot from the Store

Never ask `plot` to aggregate; compute the summary, save it, and plot that file:

```js
// @mill — prepare the bar-chart data: mean of y per group
return table
	.groupby('group')
	.rollup({ y: op.mean('y') })
	.orderby(aq.desc('y'))
	.objects();
```

```text
// save the result, then:
write_file('/analysis/by_group.json', <the JSON above>)
plot({ title: 'Mean y by group', mark: 'bar', x: 'group', y: 'y',
       from: '/analysis/by_group.json', caption: 'Group means, descending.' })
```

**`x` is a CATEGORY (a label); `y` is the NUMBER.** This is the rule that breaks most
often. `x` must be a text label — a country, a region, a month. `y` must be the numeric
measure. If you put a number on `x` (a residual, an income, an index) you get a row of
**identical bars** — one per value — which is the classic broken bar chart. Two more ways
to get equal bars: plotting raw rows (Plot sums them), or mapping `y` to a non-number.
Fix all three by aggregating in the Mill to one `{ label, value }` row per bar.

Don't set `color` on a simple bar chart: the x-axis already names each bar, so colouring
a bar by its own category just adds a redundant legend. Leave `color` off unless it
splits each bar by a genuine second grouping.

### Ranking — the top/bottom N (e.g. over-/under-performers)

To chart "which countries beat or miss their income's predicted life expectancy", the
**country is `x`** and the **residual is `y`** — never the other way round:

```js
// @mill — top-5 and bottom-5 by a residual, one {label, value} row per bar
const ranked = data
	.filter((d) => d.x != null && d.y != null)
	.map((d) => ({ label: String(d.group), value: d.y - d.x })) // value = residual
	.sort((a, b) => b.value - a.value);
return [...ranked.slice(0, 5), ...ranked.slice(-5)];
```

```text
write_file('/analysis/residuals.json', <the JSON above>)
plot({ title: 'Who beats / lags', mark: 'bar', x: 'label', y: 'value',
       from: '/analysis/residuals.json', caption: 'Residual in years; positive = beats its income.' })
```

## 3 · Line — a value over time

```js
// @mill — collapse a daily series to a monthly mean for a readable line
return table
	.derive({ month: aq.escape((d) => String(d.x)) }) // replace with your date→period key
	.groupby('month')
	.rollup({ y: op.mean('y') })
	.objects();
```

```text
plot({ title: 'Monthly average', mark: 'line', x: 'month', y: 'y',
       from: '/analysis/monthly.json', caption: 'Monthly mean of y.' })
```

## Rules for honest charts

- **Aggregate before you plot.** A bar/line chart shows a computed summary, not raw rows;
  do the maths in the Mill, save it, plot the file.
- **Log scales for skewed money/counts.** Income, population and revenue almost always
  want `xScale: 'log'` — otherwise everything piles against the axis and the pattern hides.
- **Colour is a second dimension, not decoration.** On a scatter, `color` by a category to
  reveal groups. On a bar chart you usually don't need it. Keep categories to a handful
  (≤ 7) so the legend stays clean; fold a long tail into an "other" bucket first.
- **Caption every figure** with what it shows and any caveat. A chart without a caption is
  a claim without a source.
- **Embed every figure in the report** with the exact line the plot tool returns —
  `![caption](/reports/figures/N.svg)` — in the section it belongs to. The report is the
  final artifact the human reads; a chart that isn't embedded may as well not exist.
