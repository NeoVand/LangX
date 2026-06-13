import { describe, it, expect } from 'vitest';
import { normalizeInterruptOn } from '$lib/deepagents';
import { seedGarden, gardenReady, inspectGarden, gardenSummary, type Garden } from './da-hitl';

// Re-derive the deterministic bed transitions the demo's tools encode, so the
// ground truth is locked even though the live tools close over run state.
function plant(g: Garden, bed: number, species: string) {
	const p = g.plots.find((x) => x.id === bed)!;
	p.species = species;
	p.stage = 2;
	p.health = 'healthy';
}
function water(g: Garden, bed: number) {
	const p = g.plots.find((x) => x.id === bed)!;
	if (p.stage < 3) p.stage = (p.stage + 1) as typeof p.stage;
}
function prune(g: Garden, bed: number) {
	const p = g.plots.find((x) => x.id === bed)!;
	if (p.health === 'overgrown') p.health = 'healthy';
}
function clearPests(g: Garden, bed: number) {
	const p = g.plots.find((x) => x.id === bed)!;
	if (p.health === 'pests') p.health = 'healthy';
}

describe('garden ground truth', () => {
	it('seeds four beds with exactly three jobs to do', () => {
		const g = seedGarden();
		expect(g.plots.map((p) => p.health)).toEqual(['overgrown', 'empty', 'pests', 'healthy']);
		expect(gardenReady(g)).toBe(false);
		const v = inspectGarden(g);
		expect(v.pass).toBe(false);
		expect(v.checks.filter((c) => c.pass).length).toBe(0); // even bed 4 isn't mature yet
	});

	it('reaches the goal through the intended sequence of actions', () => {
		const g = seedGarden();
		prune(g, 1); // overgrown roses → healthy (already mature)
		plant(g, 2, 'lavender'); // empty → sprout
		water(g, 2); // sprout → mature
		clearPests(g, 3); // aphids gone
		water(g, 3); // sprout → mature
		water(g, 4); // sprout → mature
		expect(gardenReady(g)).toBe(true);
		expect(inspectGarden(g).pass).toBe(true);
	});

	it('a bed is not done until BOTH mature and healthy', () => {
		const g = seedGarden();
		water(g, 3); // matures but pests remain
		const p3 = g.plots.find((x) => x.id === 3)!;
		expect(p3.stage).toBe(3);
		expect(inspectGarden(g).checks[2].pass).toBe(false); // still has pests
		clearPests(g, 3);
		expect(inspectGarden(g).checks[2].pass).toBe(true);
	});

	it('summarizes the beds for the agent', () => {
		expect(gardenSummary(seedGarden())).toContain('Bed 3: basil (sprout, pests)');
	});
});

describe('interruptOn risk tiers (allowedDecisions policy)', () => {
	const ALL = ['approve', 'edit', 'reject', 'respond'];

	it('a flat list gates every tool with all four verbs', () => {
		const m = normalizeInterruptOn(['write_file', 'send_email']);
		expect([...m.keys()]).toEqual(['write_file', 'send_email']);
		expect(m.get('write_file')!.allowedDecisions).toEqual(ALL);
	});

	it('true means all four; an allowedDecisions object restricts the verbs', () => {
		const m = normalizeInterruptOn({
			water: true,
			spray_pesticide: { allowedDecisions: ['approve', 'reject'], description: 'harsh' },
			ask_gardener: { allowedDecisions: ['respond'] }
		});
		expect(m.get('water')!.allowedDecisions).toEqual(ALL);
		expect(m.get('spray_pesticide')!.allowedDecisions).toEqual(['approve', 'reject']);
		expect(m.get('spray_pesticide')!.description).toBe('harsh');
		expect(m.get('ask_gardener')!.allowedDecisions).toEqual(['respond']);
	});

	it('false (or omission) never gates the tool', () => {
		const m = normalizeInterruptOn({ delete_file: true, read_file: false });
		expect(m.has('delete_file')).toBe(true);
		expect(m.has('read_file')).toBe(false);
		expect(normalizeInterruptOn(undefined).size).toBe(0);
	});
});
