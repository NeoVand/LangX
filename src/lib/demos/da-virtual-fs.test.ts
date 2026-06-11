import { describe, expect, it } from 'vitest';
import { CORRECT_FILES, execTests, TICKETS } from './da-virtual-fs';

// The Bug Hunt only teaches if its ground truth holds: the correct project
// must be fully green, and every ticket must seed exactly the failures its
// bug report describes.

const EXPECTED_FAILS: Record<string, string[]> = {
	'coupon-stack': [
		'a percent coupon stacks on the bulk-discounted amount',
		'bulk + coupon + shipping + tax all settle correctly'
	],
	'free-shipping': [
		'free shipping starts at exactly $50.00',
		'an order of exactly $50 ships free'
	],
	'lost-items': [
		'adding the same SKU twice merges into one line',
		'bulk + coupon + shipping + tax all settle correctly'
	]
};

describe('the seeded minishop project', () => {
	it('passes its whole suite without a bug overlay', () => {
		const results = execTests({ ...CORRECT_FILES });
		expect(results).toHaveLength(16);
		expect(results.filter((r) => !r.pass)).toEqual([]);
	});

	for (const ticket of TICKETS) {
		it(`${ticket.tag} (${ticket.id}) seeds exactly the documented failures`, () => {
			const results = execTests({ ...CORRECT_FILES, ...ticket.buggy });
			expect(results).toHaveLength(16);
			const fails = results.filter((r) => !r.pass);
			expect(fails.map((f) => f.name).sort()).toEqual([...EXPECTED_FAILS[ticket.id]].sort());
			// Failure details must carry expected-vs-actual — that's what lets
			// the agent aim its grep.
			for (const f of fails) expect(f.detail).toMatch(/expected .+ but got/);
		});
	}
});
