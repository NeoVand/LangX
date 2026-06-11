/**
 * "The Observatory" — backends as destiny. One agent, one workspace, two
 * shelves: everything under /atlas/ routes to a DURABLE StoreBackend
 * (IndexedDB — it survives new threads and full page reloads), everything
 * else lands in a thread-scoped StateBackend that burns off when the dome
 * closes. The CompositeBackend does the routing by path prefix; the agent
 * never knows the difference — the six filesystem tools are a contract, the
 * backend is a choice.
 *
 * Sessions are nights. Each night the keeper consults the almanac, surveys
 * what's visible, keeps raw eyepiece notes in /scratch (gone at dawn), and
 * engraves at most two constellations into /atlas/chart.json — the permanent
 * star atlas the page renders live. Close the dome, open it again: a fresh
 * agent, a fresh thread, an empty scratch shelf — and the atlas, intact.
 *
 * This is the exact source the demo runs.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	createDeepAgent,
	StateBackend,
	StoreBackend,
	CompositeBackend,
	type CompiledDeepAgent,
	type DeepAgentStateType
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

// ── The star catalog ───────────────────────────────────────────────────────────
// THE REAL SKY. Star positions (RA/Dec, J2000) and the official constellation
// figures come from d3-celestial's distillation of the Hipparcos/HYG catalogs
// (BSD-3, github.com/ofrohn/d3-celestial), baked into src/lib/data/sky.json by
// scripts/build-sky.mjs: every star to magnitude 5 as the background field,
// plus full figure geometry for the eleven regions the Observatory can chart.
// The catalog is "the sky"; the atlas file is what the keeper has MAPPED of it.
import skyData from '$lib/data/sky.json';

export interface SkyStar {
	ra: number;
	dec: number;
	/** Real apparent magnitude — lower is brighter (Vega ≈ 0.0). */
	mag: number;
	name?: string;
}

export interface SkyRegion {
	id: string;
	name: string;
	lore: string;
	stars: SkyStar[];
	/** Constellation figure: line segments as [[ra, dec], [ra, dec]] pairs. */
	segments: [[number, number], [number, number]][];
}

/** The whole-sky background field: [ra, dec, mag] to magnitude 5 (1,600+ stars). */
export const BACKGROUND_STARS = skyData.stars as [number, number, number][];

const REGION_META: { id: string; name: string; lore: string }[] = [
	{ id: 'lyra', name: 'Lyra', lore: 'Home of Vega, the harp star — fifth brightest light in the whole night.' },
	{ id: 'cygnus', name: 'Cygnus', lore: 'The Swan — its Northern Cross flies down the bright seam of the Milky Way.' },
	{ id: 'aquila', name: 'Aquila', lore: 'The Eagle. Altair completes the Summer Triangle with Vega and Deneb.' },
	{ id: 'cassiopeia', name: 'Cassiopeia', lore: "The Queen's W — five bright stars that never set from northern latitudes." },
	{ id: 'perseus', name: 'Perseus', lore: 'Carries Algol, the winking Demon Star — it dims on schedule, every 69 hours.' },
	{ id: 'andromeda', name: 'Andromeda', lore: 'A chain of stars pointing the way to the nearest great galaxy.' },
	{ id: 'ursa-major', name: 'Ursa Major', lore: 'The Great Bear. The Plough\u2019s two pointer stars find the pole from anywhere on Earth.' },
	{ id: 'draco', name: 'Draco', lore: 'The Dragon. Thuban was the pole star when the pyramids were raised.' },
	{ id: 'delphinus', name: 'Delphinus', lore: 'A tiny dolphin of faint stars, leaping clean out of the Milky Way.' },
	{ id: 'corona', name: 'Corona Borealis', lore: 'The Northern Crown — a perfect little arc with a single jewel, Alphecca.' },
	{ id: 'orion', name: 'Orion', lore: 'The Hunter strides the celestial equator; his belt never lies about east.' }
];

const SKY_REGIONS = skyData.constellations as unknown as Record<
	string,
	{ abbr: string; segments: [[number, number], [number, number]][]; stars: SkyStar[] }
>;

export const CATALOG: SkyRegion[] = REGION_META.map((meta) => ({
	...meta,
	stars: SKY_REGIONS[meta.id].stars,
	segments: SKY_REGIONS[meta.id].segments
}));

export const regionById = (id: string) => CATALOG.find((r) => r.id === id) ?? null;

// ── The atlas file: pure, deterministic chart operations ───────────────────────
// /atlas/chart.json is the single source of truth the page renders from. Only
// the chart_constellation instrument may write it (write_file on that path is
// denied) — so it can never be corrupted by a hand-edit.

export interface ChartEntry {
	region: string;
	night: number;
}
export interface Chart {
	night: number;
	charted: ChartEntry[];
}

export const CHART_PATH = '/atlas/chart.json';
export const LOGBOOK_PATH = '/atlas/logbook.md';
export const EYEPIECE_PATH = '/scratch/eyepiece.md';

export function emptyChart(): string {
	return JSON.stringify({ night: 1, charted: [] }, null, 2);
}

export function parseChart(json: string | null): Chart {
	try {
		const v = JSON.parse(json ?? '');
		if (typeof v?.night === 'number' && Array.isArray(v?.charted)) {
			return {
				night: v.night,
				charted: v.charted.filter(
					(e: ChartEntry) => typeof e?.region === 'string' && typeof e?.night === 'number'
				)
			};
		}
	} catch {
		// fall through to a fresh chart
	}
	return { night: 1, charted: [] };
}

/** Which regions the dome can see tonight: a deterministic rotation of the
 *  catalog by night number — five regions, charted or not. */
export function visibleTonight(night: number): string[] {
	const ids = CATALOG.map((r) => r.id);
	const rot = ((night - 1) * 3) % ids.length;
	return [...ids.slice(rot), ...ids.slice(0, rot)].slice(0, 5);
}

export function chartRegion(
	json: string | null,
	regionId: string
): { json: string; message: string; ok: boolean } {
	const chart = parseChart(json);
	const region = regionById(regionId);
	const fail = (message: string) => ({ json: JSON.stringify(chart, null, 2), message, ok: false });
	if (!region) return fail(`Unknown region "${regionId}". consult_almanac lists tonight's sky.`);
	const prior = chart.charted.find((e) => e.region === regionId);
	if (prior) return fail(`${region.name} is already in the atlas (charted night ${prior.night}).`);
	if (!visibleTonight(chart.night).includes(regionId))
		return fail(
			`${region.name} is not visible tonight — consult_almanac for what the dome can see.`
		);
	const usedTonight = chart.charted.filter((e) => e.night === chart.night).length;
	if (usedTonight >= 2)
		return fail(
			`The engraving lamp is spent — two constellations per night is the limit. ${region.name} must wait for another sky.`
		);
	chart.charted.push({ region: regionId, night: chart.night });
	return {
		json: JSON.stringify(chart, null, 2),
		message: `${region.name} engraved into the atlas — night ${chart.night}, ${region.stars.length} figure stars, ${region.segments.length} figure lines. (${1 - usedTonight} engraving left tonight.)`,
		ok: true
	};
}

export function advanceNight(json: string | null): string {
	const chart = parseChart(json);
	chart.night += 1;
	return JSON.stringify(chart, null, 2);
}

export function almanacText(json: string | null): string {
	const chart = parseChart(json);
	const visible = visibleTonight(chart.night);
	const chartedById = new Map(chart.charted.map((e) => [e.region, e.night]));
	return [
		`NIGHT ${chart.night} — the dome can see ${visible.length} regions tonight:`,
		...visible.map((id) => {
			const r = regionById(id)!;
			const when = chartedById.get(id);
			return `  · ${r.name} (${id}) — ${when ? `already charted (night ${when})` : 'UNCHARTED'}`;
		}),
		chart.charted.length
			? `Atlas so far: ${chart.charted.length}/${CATALOG.length} charted — ${chart.charted
					.map((e) => regionById(e.region)?.name ?? e.region)
					.join(', ')}.`
			: 'The atlas is empty — a fresh book of black pages.',
		`Engravings used tonight: ${chart.charted.filter((e) => e.night === chart.night).length}/2.`
	].join('\n');
}

export function surveyText(regionId: string): string {
	const region = regionById(regionId);
	if (!region) return `Unknown region "${regionId}". consult_almanac lists tonight's sky.`;
	const brightest = [...region.stars].sort((a, b) => a.mag - b.mag)[0];
	const named = region.stars.filter((s) => s.name).map((s) => s.name);
	return [
		`Through the eyepiece — ${region.name}:`,
		`  ${region.stars.length} figure stars; brightest is ${brightest.name ?? 'an unnamed star'} at magnitude ${brightest.mag.toFixed(2)}.`,
		named.length > 1 ? `  Named stars: ${named.slice(0, 7).join(', ')}${named.length > 7 ? ', …' : ''}.` : '',
		`  Figure: ${region.segments.length} lines.`,
		`  Note: ${region.lore}`
	]
		.filter(Boolean)
		.join('\n');
}

// ── The harness build ──────────────────────────────────────────────────────────

export const ATLAS_SCOPE = 'observatory-atlas';

export interface ObservatoryHooks {
	onState?: (state: DeepAgentStateType) => void;
	onChart?: (chart: Chart) => void;
	onSurvey?: (regionId: string) => void;
	onTrace?: (events: TraceEvent[]) => void;
}

export interface Observatory {
	agent: CompiledDeepAgent;
	night: number;
	/** Run one commission on tonight's thread (call repeatedly within a night). */
	observe(commission: string): Promise<DeepAgentStateType>;
	/** Advance to the next night in the durable atlas. The thread is done. */
	closeDome(): Promise<number>;
	chart(): Promise<Chart>;
	readFile(path: string): Promise<string | null>;
	finalText(state: DeepAgentStateType): string;
}

/** Read the durable atlas without building an agent (for first paint). */
export async function peekAtlas(): Promise<Chart> {
	const store = new StoreBackend(ATLAS_SCOPE);
	return parseChart(await store.read(CHART_PATH));
}

/** Read the durable logbook without building an agent (for first paint). */
export async function peekLogbook(): Promise<string | null> {
	const store = new StoreBackend(ATLAS_SCOPE);
	return store.read(LOGBOOK_PATH);
}

/** Burn the atlas and start over (clears the IndexedDB scope). */
export async function resetAtlas(): Promise<void> {
	const store = new StoreBackend(ATLAS_SCOPE);
	for (const f of await store.list()) await store.delete(f.path);
}

const SYSTEM_PROMPT = `You are the Keeper of the Observatory — an astronomer agent mapping the sky
one night at a time.

EVERY NIGHT:
1. consult_almanac FIRST. It gives the night number, what the dome can see
   tonight, and what the atlas already holds.
2. Survey before you chart: survey_region on the regions the commission calls
   for. Keep raw eyepiece notes in ${EYEPIECE_PATH} (write_file) — hunches,
   measurements, tonight's working memory.
3. chart_constellation engraves a region into the PERMANENT atlas. At most TWO
   per night — choose deliberately, guided by the commission.
4. Before finishing: update the logbook at ${LOGBOOK_PATH}. read_file it first
   (it may not exist on night 1), then write_file the WHOLE file back with a
   new section "## Night N" added at the end: 3–5 lines — what you surveyed,
   what you engraved and why, and what next night's keeper should look at.
5. Reply with a short summary of the night's work.

THE TWO SHELVES (this matters):
- /atlas/** is the permanent record. It outlives tonight, and the next keeper
  — who remembers NOTHING of this conversation — will rely on it.
- /scratch/** burns off at dawn. Never put anything there you'll need tomorrow.
- ${CHART_PATH} only changes through the chart_constellation instrument; do
  not write it by hand.`;

export async function buildObservatory(hooks: ObservatoryHooks = {}): Promise<Observatory> {
	const events: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		events.push(ev);
		hooks.onTrace?.([...events]);
	});

	// The two shelves: /atlas/** is durable (IndexedDB), the rest is thread
	// state. Longest-prefix routing; the agent sees ONE workspace.
	const store = new StoreBackend(ATLAS_SCOPE);
	const backend = new CompositeBackend(
		[{ prefix: '/atlas/', backend: store }],
		new StateBackend()
	);

	if ((await store.read(CHART_PATH)) == null) await store.write(CHART_PATH, emptyChart());
	const night = parseChart(await store.read(CHART_PATH)).night;
	hooks.onChart?.(parseChart(await store.read(CHART_PATH)));

	const consultAlmanac = tool(async () => almanacText(await store.read(CHART_PATH)), {
		name: 'consult_almanac',
		description:
			"Tonight's almanac: the night number, the five regions the dome can see, what the atlas already holds, and how many engravings remain tonight. Always consult it first.",
		schema: z.object({})
	});

	const surveyRegion = tool(
		async ({ region }) => {
			const report = surveyText(region);
			if (regionById(region)) {
				hooks.onSurvey?.(region);
				tracer.emit('note', `survey_region → ${region}`);
			}
			return report;
		},
		{
			name: 'survey_region',
			description:
				'Point the telescope at a region (by id, e.g. "lyra") and report what the eyepiece shows: star count, brightest star, figure lines, lore. Looking is free — it changes nothing.',
			schema: z.object({ region: z.string() })
		}
	);

	const chartConstellation = tool(
		async ({ region }) => {
			const { json, message, ok } = chartRegion(await store.read(CHART_PATH), region);
			if (ok) {
				await store.write(CHART_PATH, json);
				hooks.onChart?.(parseChart(json));
				tracer.emit('note', `chart_constellation → ${region}`);
			}
			return message;
		},
		{
			name: 'chart_constellation',
			description:
				"Engrave a surveyed region (by id) into the permanent star atlas at /atlas/chart.json. Costs one of tonight's two engravings. Fails politely if the region is unknown, already charted, not visible tonight, or the quota is spent.",
			schema: z.object({ region: z.string() })
		}
	);

	const model = await getModel({ maxTokens: 1800, reasoningEffort: 'medium', temperature: 0.3 });

	const agent = createDeepAgent({
		model,
		systemPrompt: SYSTEM_PROMPT,
		backend,
		tools: [consultAlmanac, surveyRegion, chartConstellation],
		// The chart only changes through the instrument — a write_file to it is
		// refused at the tool layer, not by politeness.
		permissions: [{ operations: ['write'], paths: [CHART_PATH], mode: 'deny' }],
		compaction: { maxTokens: 24000, evictThresholdPct: 60, summarizeThresholdPct: 85 },
		tracer,
		maxIterations: 30
	});
	agent.subscribe((s) => hooks.onState?.(s));

	const thread = `observatory-n${night}-${Math.random().toString(36).slice(2, 8)}`;
	const finalText = (state: DeepAgentStateType) =>
		displayContent(
			(state.messages[state.messages.length - 1] as { content?: unknown })?.content as never
		) ?? '';

	return {
		agent,
		night,

		observe: (commission) => agent.invoke({ input: `Tonight's commission: ${commission}`, thread }),

		async closeDome() {
			const next = advanceNight(await store.read(CHART_PATH));
			await store.write(CHART_PATH, next);
			const chart = parseChart(next);
			hooks.onChart?.(chart);
			tracer.emit('note', `dome closed — night ${chart.night} awaits`);
			return chart.night;
		},

		chart: async () => parseChart(await store.read(CHART_PATH)),
		readFile: (path) => backend.read(path),
		finalText
	};
}
