import { describe, it, expect } from 'vitest';
import { parseSkillFrontmatter } from '$lib/deepagents';
import {
	DATASETS,
	parseData,
	parseUploaded,
	slugify,
	runUserCode,
	profileDataset,
	inferColumnType,
	describeSchema,
	type Row
} from '$lib/runtime/datascience';
import { DS_SKILL_FILES, DS_SKILL_NAMES } from '$lib/demos/da-capstone-data-science';

import tabularEdaSkill from '$lib/demos/skills/ds-tabular-eda.md?raw';
import statisticsSkill from '$lib/demos/skills/ds-statistics.md?raw';
import chartingSkill from '$lib/demos/skills/ds-charting.md?raw';

// ── The dataset deck ──────────────────────────────────────────────────────────

describe('dataset registry', () => {
	it('headlines Gapminder and pins every source to vega-datasets@2 over jsDelivr', () => {
		expect(DATASETS[0].id).toBe('gapminder-health-income');
		for (const d of DATASETS) {
			expect(d.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/vega-datasets@2\/data\//);
			expect(d.url).toMatch(new RegExp(`\\.${d.format}$`));
			expect(d.suggested.length).toBeGreaterThan(0);
		}
		const ids = DATASETS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length); // unique ids
	});

	it('parses CSV with type inference (numbers are numbers)', () => {
		const rows = parseData('income,health\n1925,57.6\n10620,76', 'csv');
		expect(rows).toHaveLength(2);
		expect(rows[0].income).toBe(1925);
		expect(typeof rows[0].income).toBe('number');
		expect(rows[0].health).toBe(57.6);
	});

	it('detects format and slugifies an uploaded file', () => {
		const json = parseUploaded('My Sales.json', '[{"a":1},{"a":2}]');
		expect(json.format).toBe('json');
		expect(json.id).toBe('my-sales');
		expect(json.rows).toHaveLength(2);

		const csv = parseUploaded('readings.csv', 'a,b\n1,x\n2,y');
		expect(csv.format).toBe('csv');
		expect(csv.rows[0].a).toBe(1);
	});

	it('slugify is filesystem-safe', () => {
		expect(slugify('Gapminder · Health & Income!')).toBe('gapminder-health-income');
	});
});

// ── Schema profiling ──────────────────────────────────────────────────────────

const GAPMINDER: Row[] = [
	{
		country: 'Afghanistan',
		income: 1925,
		health: 57.63,
		population: 32526562,
		region: 'south_asia'
	},
	{ country: 'Albania', income: 10620, health: 76, population: 2896679, region: 'europe' },
	{ country: 'Algeria', income: 13434, health: 76.5, population: 39666519, region: 'mena' },
	{ country: 'Norway', income: 64304, health: 81.6, population: 5210967, region: 'europe' }
];

describe('schema profiling', () => {
	it('infers column roles', () => {
		expect(inferColumnType([1, 2, 3, 4.5])).toBe('quantitative');
		expect(inferColumnType(['rain', 'sun', 'rain', 'fog'])).toBe('nominal');
		expect(inferColumnType(['2012-01-01', '2012-01-02', '2013-06-30'])).toBe('temporal');
		expect(inferColumnType(['A', 'B', 'C', 'D'], 'country')).toBe('identifier');
	});

	it('profiles a Gapminder-shaped table', () => {
		const p = profileDataset(GAPMINDER);
		expect(p.rows).toBe(4);
		const by = Object.fromEntries(p.columns.map((c) => [c.name, c]));
		expect(by.country.type).toBe('identifier');
		expect(by.income.type).toBe('quantitative');
		expect(by.health.type).toBe('quantitative');
		expect(by.region.type).toBe('nominal');
		expect(by.income.min).toBe(1925);
		expect(by.income.max).toBe(64304);
		expect(by.region.unique).toBe(3);
	});

	it('describeSchema lists every column with its type', () => {
		const text = describeSchema(profileDataset(GAPMINDER));
		expect(text).toMatch(/4 rows × 5 columns/);
		expect(text).toMatch(/income \(quantitative\)/);
		expect(text).toMatch(/region \(nominal\)/);
	});
});

// ── The Mill — runUserCode ────────────────────────────────────────────────────

describe('the Mill (runUserCode)', () => {
	it('runs an Arquero group-by rollup correctly', async () => {
		const out = await runUserCode(
			`return table.groupby('region').rollup({ n: op.count(), health: op.mean('health') })
			   .orderby('region').objects();`,
			GAPMINDER
		);
		expect(out.ok).toBe(true);
		const rows = out.value as Row[];
		const europe = rows.find((r) => r.region === 'europe')!;
		expect(europe.n).toBe(2);
		expect(europe.health).toBeCloseTo(78.8, 1);
	});

	it('computes a real correlation with simple-statistics (log income tracks longevity)', async () => {
		const out = await runUserCode(
			`const xs = data.map(d => Math.log10(d.income)), ys = data.map(d => d.health);
			 return { r: ss.sampleCorrelation(xs, ys) };`,
			GAPMINDER
		);
		expect(out.ok).toBe(true);
		// The relationship is logarithmic — strong once income is on a log scale.
		expect((out.value as { r: number }).r).toBeGreaterThan(0.9);
	});

	it('materialises an Arquero table return to row objects', async () => {
		const out = await runUserCode(`return table.filter(d => d.income > 12000);`, GAPMINDER);
		expect(out.ok).toBe(true);
		expect(Array.isArray(out.value)).toBe(true);
		expect((out.value as Row[]).length).toBe(2);
	});

	it('surfaces an error instead of throwing', async () => {
		const out = await runUserCode(`return data.nope.nope;`, GAPMINDER);
		expect(out.ok).toBe(false);
		expect(out.error).toBeTruthy();
	});
});

// ── The skill shelf — heavily tested, recipes actually executed ───────────────

const SKILLS: { name: string; md: string }[] = [
	{ name: 'ds-tabular-eda', md: tabularEdaSkill },
	{ name: 'ds-statistics', md: statisticsSkill },
	{ name: 'ds-charting', md: chartingSkill }
];

// A neutral fixture the skills' recipes are written against (group / x / y).
const RECIPE_FIXTURE: Row[] = [
	{ group: 'A', x: 1, y: 2 },
	{ group: 'A', x: 2, y: 4 },
	{ group: 'A', x: 3, y: 5 },
	{ group: 'B', x: 4, y: 9 },
	{ group: 'B', x: 5, y: 9 },
	{ group: 'B', x: 6, y: 13 },
	{ group: 'C', x: 7, y: 14 },
	{ group: 'C', x: 8, y: 17 }
];

/** Extract fenced js/ts code blocks whose first lines carry the `// @mill` marker. */
function millRecipes(md: string): string[] {
	const out: string[] = [];
	const re = /```(?:js|javascript|ts|typescript)\n([\s\S]*?)```/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(md))) {
		if (/\/\/\s*@mill\b/.test(m[1])) out.push(m[1]);
	}
	return out;
}

describe('skill files — frontmatter', () => {
	it('mounts exactly the three named skills', () => {
		expect(DS_SKILL_NAMES).toEqual(['ds-tabular-eda', 'ds-statistics', 'ds-charting']);
		for (const name of DS_SKILL_NAMES) {
			expect(DS_SKILL_FILES[`/skills/${name}/SKILL.md`]).toBeTruthy();
		}
	});

	for (const { name, md } of SKILLS) {
		it(`${name}: frontmatter is valid (name matches dir, description within limits)`, () => {
			const parsed = parseSkillFrontmatter(md);
			expect(parsed).toBeTruthy();
			expect(parsed!.name).toBe(name);
			expect(parsed!.description.length).toBeGreaterThan(40);
			expect(parsed!.description.length).toBeLessThanOrEqual(1024); // Agent Skills limit
			expect(md.split('\n').length).toBeLessThan(500); // keep skills lean
		});
	}
});

describe('skill files — every recipe actually runs in the Mill', () => {
	for (const { name, md } of SKILLS) {
		const recipes = millRecipes(md);
		it(`${name}: has runnable recipes`, () => {
			expect(recipes.length).toBeGreaterThan(0);
		});
		recipes.forEach((code, i) => {
			it(`${name}: recipe #${i + 1} executes and returns a value`, async () => {
				const out = await runUserCode(code, RECIPE_FIXTURE);
				expect(out.ok, out.error).toBe(true);
				expect(out.value).toBeDefined();
			});
		});
	}
});
