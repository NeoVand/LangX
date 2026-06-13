// ─────────────────────────────────────────────────────────────────────────────
// Schema profiling — the first thing any data scientist does: look at the shape.
//
// Pure, dependency-light column inference over an array of row objects. It feeds
// two consumers: the DataTable's per-column type badges, and the machine-readable
// /data/<name>.profile.json the agent reads before it plans. Tested directly.
// ─────────────────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

/** A column's role, inferred from its values. */
export type ColumnType = 'quantitative' | 'temporal' | 'nominal' | 'identifier';

export interface ColumnProfile {
	name: string;
	type: ColumnType;
	/** Non-missing values. */
	count: number;
	/** null / undefined / '' values. */
	missing: number;
	/** Distinct non-missing values. */
	unique: number;
	/** Quantitative: numeric min/max/mean. Temporal: ISO min/max. Nominal: most common. */
	min?: number | string;
	max?: number | string;
	mean?: number;
	/** A representative value for the column (top category, or first value). */
	example?: string;
}

export interface DatasetProfile {
	rows: number;
	columns: ColumnProfile[];
}

const SAMPLE = 500; // values sampled per column for type inference
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2})?/;

function isMissing(v: unknown): boolean {
	return v === null || v === undefined || v === '';
}

function asNumber(v: unknown): number | null {
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function isDateish(v: unknown): boolean {
	if (v instanceof Date) return !Number.isNaN(v.getTime());
	if (typeof v === 'string' && DATE_RE.test(v.trim())) return !Number.isNaN(Date.parse(v));
	return false;
}

/** Union of keys across a sample of rows (JSON data can be ragged). */
export function columnNames(rows: Row[]): string[] {
	const seen = new Set<string>();
	for (const r of rows.slice(0, SAMPLE)) {
		if (r && typeof r === 'object') for (const k of Object.keys(r)) seen.add(k);
	}
	return [...seen];
}

/** Infer a single column's type from its values. */
export function inferColumnType(values: unknown[], name = ''): ColumnType {
	const present = values.filter((v) => !isMissing(v));
	if (present.length === 0) return 'nominal';
	const sample = present.slice(0, SAMPLE);
	const numeric = sample.filter((v) => asNumber(v) !== null).length;
	const dateish = sample.filter(isDateish).length;
	// Dates first: a 4-digit "year" is numeric but reads as temporal only when named so.
	if (dateish / sample.length >= 0.95 && numeric / sample.length < 0.95) return 'temporal';
	if (numeric / sample.length >= 0.95) return 'quantitative';
	// A high-cardinality text column that's ~one-per-row is a key/label.
	const unique = new Set(present).size;
	if (unique === present.length && present.length > 1) return 'identifier';
	if (/\b(id|name|country|code|key|slug|uuid)\b/i.test(name) && unique / present.length > 0.9)
		return 'identifier';
	return 'nominal';
}

/** Profile one column end to end. */
export function profileColumn(name: string, rows: Row[]): ColumnProfile {
	const values = rows.map((r) => r?.[name]);
	const present = values.filter((v) => !isMissing(v));
	const missing = values.length - present.length;
	const type = inferColumnType(values, name);
	const distinct = new Set(present);

	const profile: ColumnProfile = {
		name,
		type,
		count: present.length,
		missing,
		unique: distinct.size
	};

	if (type === 'quantitative') {
		const nums = present.map(asNumber).filter((n): n is number => n !== null);
		if (nums.length) {
			profile.min = Math.min(...nums);
			profile.max = Math.max(...nums);
			profile.mean = round(nums.reduce((a, b) => a + b, 0) / nums.length);
		}
	} else if (type === 'temporal') {
		const times = present
			.map((v) => (v instanceof Date ? v.getTime() : Date.parse(String(v))))
			.filter((t) => !Number.isNaN(t));
		if (times.length) {
			profile.min = new Date(Math.min(...times)).toISOString().slice(0, 10);
			profile.max = new Date(Math.max(...times)).toISOString().slice(0, 10);
		}
	} else {
		// Most common category, as a tiny mode.
		const counts = new Map<string, number>();
		for (const v of present) {
			const k = String(v);
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		let top = '';
		let best = -1;
		for (const [k, c] of counts) {
			if (c > best) {
				best = c;
				top = k;
			}
		}
		profile.example = top;
	}
	if (profile.example === undefined && present.length) profile.example = String(present[0]);
	return profile;
}

/** Profile a whole dataset. */
export function profileDataset(rows: Row[]): DatasetProfile {
	return { rows: rows.length, columns: columnNames(rows).map((n) => profileColumn(n, rows)) };
}

/** A compact one-line-per-column schema summary for a system prompt. */
export function describeSchema(profile: DatasetProfile): string {
	const lines = profile.columns.map((c) => {
		const range =
			c.type === 'quantitative'
				? ` range ${c.min}…${c.max}, mean ${c.mean}`
				: c.type === 'temporal'
					? ` ${c.min}…${c.max}`
					: ` e.g. "${c.example}"`;
		const miss = c.missing ? `, ${c.missing} missing` : '';
		return `- ${c.name} (${c.type}): ${c.unique} distinct${range}${miss}`;
	});
	return `${profile.rows} rows × ${profile.columns.length} columns\n${lines.join('\n')}`;
}

function round(x: number): number {
	return Math.round(x * 1000) / 1000;
}
