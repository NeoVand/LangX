// ─────────────────────────────────────────────────────────────────────────────
// The deck — datasets the Analytical Engine can read.
//
// A curated gallery of famous, clean datasets pulled LIVE from vega-datasets over
// jsDelivr — keyless and CORS-clean, the same source Vega/Observable use in the
// browser. Plus an upload path so the user can feed the Engine their own punch
// cards (CSV or JSON). Parsing is typed (d3-dsv autoType), so "1925" arrives as a
// number, not a string.
// ─────────────────────────────────────────────────────────────────────────────

import { csvParse, autoType } from 'd3-dsv';

export type Row = Record<string, unknown>;
export type DatasetFormat = 'csv' | 'json';

export interface DatasetSpec {
	id: string;
	name: string;
	blurb: string;
	url: string;
	format: DatasetFormat;
	/** Approximate shape, shown on the gallery card before the data loads. */
	rows: number;
	cols: number;
	glyph: string;
	/** Example prompts surfaced as chips once this dataset is loaded. */
	suggested: string[];
}

// Pin the major version so the schema can't shift under us.
const CDN = 'https://cdn.jsdelivr.net/npm/vega-datasets@2/data';

/** The gallery — the flagship (Gapminder) leads. */
export const DATASETS: DatasetSpec[] = [
	{
		id: 'gapminder-health-income',
		name: 'Gapminder · health & income',
		blurb:
			'Every country by income per person, life expectancy, population and world region — the Hans Rosling development story in one table.',
		url: `${CDN}/gapminder-health-income.csv`,
		format: 'csv',
		rows: 187,
		cols: 5,
		glyph: '🌍',
		suggested: [
			'Auto-analyze this dataset and tell me the story it holds.',
			'How strongly does income predict life expectancy? Fit a model and quantify it.',
			'Which countries most over- and under-perform their income on longevity?'
		]
	},
	{
		id: 'penguins',
		name: 'Palmer Penguins',
		blurb:
			'344 penguins across three species — bill, flipper and body-mass measurements. The canonical modern data-science dataset (and a hidden Simpson’s paradox).',
		url: `${CDN}/penguins.json`,
		format: 'json',
		rows: 344,
		cols: 7,
		glyph: '🐧',
		suggested: [
			'Auto-analyze the penguins and find the most surprising pattern.',
			'Is beak length correlated with beak depth? Check it overall and within each species.',
			'How well do the measurements separate the three species?'
		]
	},
	{
		id: 'seattle-weather',
		name: 'Seattle weather',
		blurb:
			'Four years of daily Seattle weather (2012–2015): precipitation, temperature, wind and a weather label. A clean time series.',
		url: `${CDN}/seattle-weather.csv`,
		format: 'csv',
		rows: 1461,
		cols: 6,
		glyph: '🌧️',
		suggested: [
			'Auto-analyze the weather: seasonality, trends and the rainy-day rate.',
			'What share of days are rainy by month? Chart the seasonal pattern.',
			'Has the maximum temperature trended up over these four years?'
		]
	},
	{
		id: 'cars',
		name: 'Cars · fuel economy',
		blurb:
			'406 classic cars: horsepower, weight, displacement, MPG and origin (USA / Europe / Japan). The textbook regression set.',
		url: `${CDN}/cars.json`,
		format: 'json',
		rows: 406,
		cols: 9,
		glyph: '🚗',
		suggested: [
			'Auto-analyze the cars and explain what drives fuel economy.',
			'Fit MPG against horsepower and weight — which matters more?',
			'Did fuel economy improve over the model years, and differ by origin?'
		]
	}
];

export interface LoadedDataset {
	/** Present for gallery datasets; absent for uploads. */
	spec?: DatasetSpec;
	/** A filesystem-safe id used for /data/<id>.<ext>. */
	id: string;
	name: string;
	rows: Row[];
	/** The raw source text, written verbatim into the Store for provenance. */
	text: string;
	format: DatasetFormat;
	/** Where the rows came from (a URL, or "upload"). */
	provenance: string;
}

/** Fetch with a hard timeout so one slow CDN response can't wedge a run. */
async function timedFetch(url: string, ms = 12000): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fetch(url, { signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** Parse raw text into rows, typed. */
export function parseData(text: string, format: DatasetFormat): Row[] {
	if (format === 'json') {
		const j = JSON.parse(text);
		if (Array.isArray(j)) return j as Row[];
		if (j && typeof j === 'object' && Array.isArray((j as { data?: unknown }).data))
			return (j as { data: Row[] }).data;
		return [j as Row];
	}
	return csvParse(text, autoType) as unknown as Row[];
}

/** Load a gallery dataset live. */
export async function loadDataset(spec: DatasetSpec): Promise<LoadedDataset> {
	const res = await timedFetch(spec.url);
	if (!res.ok) throw new Error(`Could not fetch ${spec.name} (HTTP ${res.status}).`);
	const text = await res.text();
	const rows = parseData(text, spec.format);
	if (!rows.length) throw new Error(`${spec.name} parsed to zero rows.`);
	return {
		spec,
		id: spec.id,
		name: spec.name,
		rows,
		text,
		format: spec.format,
		provenance: spec.url
	};
}

/** Parse an uploaded file the user dropped in. Format detected from name/content. */
export function parseUploaded(filename: string, text: string): LoadedDataset {
	const trimmed = text.trimStart();
	const format: DatasetFormat =
		/\.json$/i.test(filename) || trimmed.startsWith('[') || trimmed.startsWith('{')
			? 'json'
			: 'csv';
	const rows = parseData(text, format);
	if (!rows.length) throw new Error('That file parsed to zero rows — is it valid CSV or JSON?');
	const base = filename.replace(/\.[^.]+$/, '');
	return {
		id: slugify(base) || 'upload',
		name: base || filename,
		rows,
		text,
		format,
		provenance: 'upload'
	};
}

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

/** The Store path a loaded dataset's raw text is written to. */
export function dataPath(d: LoadedDataset): string {
	return `/data/${d.id}.${d.format}`;
}
