import { describe, expect, it } from 'vitest';
import {
	SEED_CSV,
	parseCsv,
	profileCsv,
	normalizeDatesCsv,
	dedupeCsv,
	fixTotalsCsv,
	validateCsv,
	quarantineCsv,
	dateKind
} from './da-todos';

// The Data Janitor only teaches if its ground truth holds: the seeded dirt
// must match the story (12 bad dates, 3 dupes, 2 bad totals, 3 unfixable
// rows), and the full pipeline must end green with 34 clean + 3 quarantined.

describe('the seeded orders.csv', () => {
	it('carries exactly the documented dirt', () => {
		const { rows } = parseCsv(SEED_CSV);
		expect(rows).toHaveLength(40);
		const kinds = { iso: 0, us: 0, written: 0, other: 0 };
		for (const r of rows) kinds[dateKind(r[1])]++;
		expect(kinds).toEqual({ iso: 28, us: 8, written: 4, other: 0 });
		expect(new Set(rows.map((r) => r[0])).size).toBe(37); // 3 duplicate rows
		const profile = profileCsv(SEED_CSV);
		expect(profile).toContain('3 duplicated rows');
		expect(profile).toContain('2 rows where total ≠ qty × unit_price');
	});

	it('fails validation on all the right rules, and only those', () => {
		const rules = validateCsv(SEED_CSV);
		expect(rules.map((r) => [r.rule, r.pass, r.failures])).toEqual([
			['every date is ISO (YYYY-MM-DD)', false, 12],
			['order_id is unique', false, 3],
			['total = qty × unit_price', false, 2],
			['qty ≥ 1 and total ≥ 0', false, 3]
		]);
	});
});

describe('the cleaning pipeline', () => {
	it('ends green: 34 clean rows, 3 quarantined, all rules passing', () => {
		const dated = normalizeDatesCsv(SEED_CSV);
		expect(dated.converted).toBe(12);

		const deduped = dedupeCsv(dated.csv);
		expect(deduped.removed).toBe(3);

		const fixed = fixTotalsCsv(deduped.csv);
		expect(fixed.fixed).toBe(2);

		// The surprise: everything auto-fixable is fixed, yet validation still
		// fails — the negative rows need a policy decision, not a transform.
		const beforeQuarantine = validateCsv(fixed.csv);
		expect(beforeQuarantine.filter((r) => !r.pass).map((r) => r.rule)).toEqual([
			'qty ≥ 1 and total ≥ 0'
		]);

		const { clean, quarantined, moved } = quarantineCsv(fixed.csv);
		expect(moved).toBe(3);
		expect(parseCsv(clean).rows).toHaveLength(34);
		expect(parseCsv(quarantined).rows.map((r) => r[0])).toEqual([
			'ORD-1029',
			'ORD-1033',
			'ORD-1037'
		]);
		expect(validateCsv(clean).every((r) => r.pass)).toBe(true);
	});

	it('is order-tolerant: dedupe and fixes commute with date normalization', () => {
		const a = quarantineCsv(fixTotalsCsv(dedupeCsv(normalizeDatesCsv(SEED_CSV).csv).csv).csv);
		const b = quarantineCsv(normalizeDatesCsv(fixTotalsCsv(dedupeCsv(SEED_CSV).csv).csv).csv);
		expect(a.clean).toBe(b.clean);
		expect(validateCsv(b.clean).every((r) => r.pass)).toBe(true);
	});
});
