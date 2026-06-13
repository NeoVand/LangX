---
name: ds-statistics
description: Quantify relationships and spot the unusual with simple-statistics inside the compute (Mill) tool. Use whenever a question is about correlation, association, prediction, a trend, a model, a fitted line, R², quantiles, spread, or outliers — "how strongly does X predict Y", "is there a relationship", "which rows are unusual". Covers Pearson correlation, simple linear regression with R², quantiles and an IQR outlier rule, and the analyst's discipline around confounders and Simpson's paradox (the overall trend can reverse within groups). Recipes run against the active dataset as `table`/`data` with `ss` and `op` in scope.
---

# Statistics with simple-statistics

A relationship claim needs a number, and a number needs the right method. Use
`ss` (simple-statistics) for correlation, regression and quantiles; use Arquero's
`op.corr` when you want correlation _per group_ in one rollup. Always pull the
columns you need into arrays first.

## Pull columns into arrays

```js
// @mill — column → array (drop missing pairs before any stats)
const pairs = data.filter((d) => d.x != null && d.y != null).map((d) => [d.x, d.y]);
return { n: pairs.length, first: pairs[0] };
```

## 1 · Correlation (Pearson)

```js
// @mill — how tightly do x and y move together? (-1…+1)
const xs = data.map((d) => d.x);
const ys = data.map((d) => d.y);
return { r: Number(ss.sampleCorrelation(xs, ys).toFixed(3)) };
```

Per group, in one pass with Arquero:

```js
// @mill — correlation WITHIN each group — watch for Simpson's paradox
return table
	.groupby('group')
	.rollup({ n: op.count(), r: op.corr('x', 'y') })
	.objects();
```

## 2 · Linear regression with R²

```js
// @mill — fit y ≈ m·x + b, and report how much variance it explains
const pairs = data.filter((d) => d.x != null && d.y != null).map((d) => [d.x, d.y]);
const model = ss.linearRegression(pairs); // { m, b }
const line = ss.linearRegressionLine(model); // x → predicted y
const r2 = ss.rSquared(pairs, line);
return {
	slope: Number(model.m.toFixed(4)),
	intercept: Number(model.b.toFixed(3)),
	r2: Number(r2.toFixed(3))
};
```

Read the slope in the data's units ("+1 unit of x ⇒ +m units of y") and let R²
temper the story: a strong slope with a low R² is a weak claim.

## 3 · Quantiles, spread, and an outlier rule

```js
// @mill — IQR rule: flag values outside Q1 − 1.5·IQR … Q3 + 1.5·IQR
const ys = data.map((d) => d.y).filter((v) => v != null);
const q1 = ss.quantile(ys, 0.25);
const q3 = ss.quantile(ys, 0.75);
const iqr = q3 - q1;
const lo = q1 - 1.5 * iqr;
const hi = q3 + 1.5 * iqr;
const outliers = data.filter((d) => d.y < lo || d.y > hi).length;
return {
	q1,
	median: ss.quantile(ys, 0.5),
	q3,
	iqr,
	lo,
	hi,
	outliers,
	sd: Number(ss.standardDeviation(ys).toFixed(3))
};
```

## Method notes — the discipline

- **Compute, never estimate.** No "looks strongly correlated". Run `sampleCorrelation`
  and quote the number.
- **Correlation isn't cause.** Report the association; name the plausible confounder;
  don't assert mechanism the data can't show.
- **Simpson's paradox.** The overall trend can _reverse_ inside groups. When the data
  has a categorical column, also compute the relationship per group (`op.corr` above)
  before you commit to the headline — this is exactly the surprise to hunt for.
- **Residual outliers are findings.** The rows a model gets most wrong are often the
  interesting story (the country that beats its income, the car that defies its weight).
- Visualise the relationship with **`ds-charting`**; aggregate first with **`ds-tabular-eda`**.
