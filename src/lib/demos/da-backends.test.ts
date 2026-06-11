import { describe, expect, it } from 'vitest';
import { CompositeBackend, StateBackend } from '$lib/deepagents';
import {
	CATALOG,
	BACKGROUND_STARS,
	emptyChart,
	parseChart,
	visibleTonight,
	chartRegion,
	advanceNight,
	almanacText
} from './da-backends';

// The Observatory's sky is real scenery (Hipparcos positions via
// d3-celestial): the baked data must be internally consistent, the night
// rotation must eventually show everything, and the chart operations must
// enforce their own rules. Plus: the harness's CompositeBackend now follows
// the official longest-prefix-wins semantics.

describe('the real star catalog', () => {
	it('carries a credible background sky', () => {
		expect(BACKGROUND_STARS.length).toBeGreaterThan(1200);
		for (const [ra, dec, mag] of BACKGROUND_STARS) {
			expect(ra).toBeGreaterThanOrEqual(0);
			expect(ra).toBeLessThan(360);
			expect(dec).toBeGreaterThanOrEqual(-90);
			expect(dec).toBeLessThanOrEqual(90);
			expect(mag).toBeLessThanOrEqual(5.0);
		}
	});

	it('is internally consistent', () => {
		expect(CATALOG.length).toBeGreaterThanOrEqual(10);
		for (const region of CATALOG) {
			expect(region.stars.length).toBeGreaterThanOrEqual(4);
			expect(region.segments.length).toBeGreaterThanOrEqual(3);
			for (const [[ra1, dec1], [ra2, dec2]] of region.segments) {
				for (const [ra, dec] of [
					[ra1, dec1],
					[ra2, dec2]
				]) {
					expect(ra).toBeGreaterThanOrEqual(0);
					expect(ra).toBeLessThan(360);
					expect(dec).toBeGreaterThanOrEqual(-90);
					expect(dec).toBeLessThanOrEqual(90);
				}
			}
			const brightest = [...region.stars].sort((a, b) => a.mag - b.mag)[0];
			expect(brightest.mag).toBeLessThan(4.0); // every region has a real anchor star (Delphinus is honestly faint: 3.64)
			expect(brightest.name, `${region.id} brightest star should be named`).toBeTruthy();
		}
		// The famous ones came through with their real magnitudes.
		const lyra = CATALOG.find((r) => r.id === 'lyra')!;
		const vega = lyra.stars.find((s) => s.name === 'Vega')!;
		expect(vega.mag).toBeLessThan(0.2);
		const orion = CATALOG.find((r) => r.id === 'orion')!;
		expect(orion.stars.some((s) => s.name === 'Betelgeuse')).toBe(true);
		expect(orion.stars.some((s) => s.name === 'Rigel')).toBe(true);
	});

	it('rotates the visible sky so every region eventually rises', () => {
		expect(visibleTonight(1)).toHaveLength(5);
		expect(visibleTonight(1)).not.toEqual(visibleTonight(2)); // the sky turns
		expect(visibleTonight(3)).toEqual(visibleTonight(3)); // deterministically
		const seen = new Set<string>();
		for (let night = 1; night <= CATALOG.length; night++)
			for (const id of visibleTonight(night)) seen.add(id);
		expect(seen.size).toBe(CATALOG.length);
	});
});

describe('the chart operations', () => {
	it('charts visible regions and enforces its own rules', () => {
		const [first, second, third] = visibleTonight(1);
		let json = emptyChart();

		const ok = chartRegion(json, first);
		expect(ok.ok).toBe(true);
		json = ok.json;
		expect(parseChart(json).charted).toEqual([{ region: first, night: 1 }]);

		expect(chartRegion(json, first).ok).toBe(false); // already charted
		expect(chartRegion(json, 'atlantis').ok).toBe(false); // unknown
		const hidden = CATALOG.map((r) => r.id).find((id) => !visibleTonight(1).includes(id))!;
		expect(chartRegion(json, hidden).ok).toBe(false); // not visible tonight

		json = chartRegion(json, second).json;
		expect(chartRegion(json, third).ok).toBe(false); // two per night, spent

		// A new night resets the lamp — and turns the sky.
		json = advanceNight(json);
		expect(parseChart(json).night).toBe(2);
		const visibleNow = visibleTonight(2).find(
			(id) => !parseChart(json).charted.some((e) => e.region === id)
		)!;
		expect(chartRegion(json, visibleNow).ok).toBe(true);
	});

	it('survives a corrupted chart file', () => {
		expect(parseChart(null)).toEqual({ night: 1, charted: [] });
		expect(parseChart('not json')).toEqual({ night: 1, charted: [] });
		expect(parseChart('{"night":"x"}')).toEqual({ night: 1, charted: [] });
	});

	it('writes an almanac the keeper can act on', () => {
		const text = almanacText(emptyChart());
		expect(text).toContain('NIGHT 1');
		expect(text).toContain('UNCHARTED');
		expect(text).toContain('Engravings used tonight: 0/2');
	});
});

describe('CompositeBackend routing (official semantics)', () => {
	it('routes by LONGEST matching prefix, falling back to the default', async () => {
		const shallow = new StateBackend();
		const deep = new StateBackend();
		const fallback = new StateBackend();
		const composite = new CompositeBackend(
			[
				{ prefix: '/atlas/', backend: shallow },
				{ prefix: '/atlas/deep/', backend: deep }
			],
			fallback
		);

		await composite.write('/atlas/chart.json', 'shallow');
		await composite.write('/atlas/deep/notes.md', 'deep');
		await composite.write('/scratch/tmp.md', 'fallback');

		// Longest prefix wins even though the shorter route is declared first.
		expect(await deep.read('/atlas/deep/notes.md')).toBe('deep');
		expect(await shallow.read('/atlas/deep/notes.md')).toBeNull();
		expect(await shallow.read('/atlas/chart.json')).toBe('shallow');
		expect(await fallback.read('/scratch/tmp.md')).toBe('fallback');

		// And the composite read sees one workspace.
		expect(await composite.read('/atlas/deep/notes.md')).toBe('deep');
		expect((await composite.list()).map((f) => f.path).sort()).toEqual([
			'/atlas/chart.json',
			'/atlas/deep/notes.md',
			'/scratch/tmp.md'
		]);
	});
});
