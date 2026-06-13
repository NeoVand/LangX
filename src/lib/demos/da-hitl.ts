import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type HarnessInterrupt
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

/**
 * THE GREENHOUSE AUTOMATON — a human-in-the-loop demo you can watch.
 *
 * An autonomous gardener agent proposes one action at a time (plant, water,
 * prune, clear pests). EVERY action is gated: nothing touches a bed until the
 * head gardener — you — decides. The four decisions each change the garden
 * visibly:
 *   approve  → the action runs as proposed
 *   edit     → run it with changed arguments (different bed or species)
 *   reject   → it doesn't run; the agent reads your note and adapts
 *   respond  → answer the agent's question (the ask tool never "runs")
 *
 * Risk tiers ride on `allowedDecisions`: the chemical pesticide is approve-or-
 * reject only (no fiddling with a hazardous dose), and ask_gardener is respond-
 * only. Every tool here is deterministic — the garden state IS the demo.
 */

export type Stage = 0 | 1 | 2 | 3; // empty · seedling · sprout · mature
export type Health = 'empty' | 'healthy' | 'pests' | 'overgrown';

export interface Plot {
	id: number;
	name: string;
	species: string | null;
	stage: Stage;
	health: Health;
}
export interface Garden {
	plots: Plot[];
}

export const STAGE_LABEL: Record<Stage, string> = {
	0: 'empty',
	1: 'seedling',
	2: 'sprout',
	3: 'mature'
};

/** A fresh garden for each run — four beds, three jobs to do. */
export function seedGarden(): Garden {
	return {
		plots: [
			{ id: 1, name: 'Bed 1', species: 'roses', stage: 3, health: 'overgrown' },
			{ id: 2, name: 'Bed 2', species: null, stage: 0, health: 'empty' },
			{ id: 3, name: 'Bed 3', species: 'basil', stage: 2, health: 'pests' },
			{ id: 4, name: 'Bed 4', species: 'tomato', stage: 2, health: 'healthy' }
		]
	};
}

/** The goal: every bed a healthy plant at the mature stage. */
export function gardenReady(g: Garden): boolean {
	return g.plots.every((p) => p.species && p.stage >= 3 && p.health === 'healthy');
}

export interface GardenVerdict {
	pass: boolean;
	checks: { label: string; pass: boolean }[];
}
export function inspectGarden(g: Garden): GardenVerdict {
	const checks = g.plots.map((p) => ({
		label: `${p.name}: healthy plant, mature`,
		pass: !!p.species && p.stage >= 3 && p.health === 'healthy'
	}));
	return { pass: checks.every((c) => c.pass), checks };
}

function plotById(g: Garden, bed: number): Plot | undefined {
	return g.plots.find((p) => p.id === bed);
}
function describe(p: Plot): string {
	if (p.health === 'empty') return `${p.name}: empty`;
	return `${p.name}: ${p.species} (${STAGE_LABEL[p.stage]}, ${p.health})`;
}
export function gardenSummary(g: Garden): string {
	return g.plots.map(describe).join('; ');
}

// ── The agent ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Greenhouse Automaton, an autonomous gardener tending four beds toward
the head gardener's goal. EVERY action you take must be approved by the head gardener before it
happens — that is how this greenhouse works. Propose ONE action at a time and wait for the result.

Rules:
- Work bed by bed toward the goal. Use inspect_garden whenever you need the current state.
- If a bed's planting choice is not specified, call ask_gardener to ask BEFORE planting — never guess a species.
- If an action is rejected, read the head gardener's note and ADAPT — do not repeat the rejected action.
- A bed is done when it holds a healthy plant at the "mature" stage.
- When every bed is a healthy, mature plant, stop and report what you did in one short paragraph.`;

export const GOAL_INPUT = `Ready the greenhouse for the spring show: all four beds should hold a healthy plant at the mature stage.
Bed 1's roses are overgrown. Bed 3 has aphids — deal with them. Bed 2 is empty; ask me what to plant when you get to it.`;

export interface GreenhouseCallbacks {
	onTrace?: (event: TraceEvent) => void;
	/** Live garden snapshot whenever a tool mutates a bed. */
	onGarden?: (garden: Garden) => void;
}

export interface GreenhouseHandle {
	agent: CompiledDeepAgent;
	thread: string;
	input: string;
	garden: Garden;
}

/**
 * Builds the gardener agent with all of its actions gated behind human approval.
 * Returned un-driven so the host runs start/resume and surfaces each pause.
 * This is the exact source the demo runs.
 */
export async function buildGreenhouse(cb: GreenhouseCallbacks = {}): Promise<GreenhouseHandle> {
	const tracer = createTracer();
	tracer.subscribe((ev) => cb.onTrace?.(ev));
	const garden = seedGarden();
	const emit = () => cb.onGarden?.({ plots: garden.plots.map((p) => ({ ...p })) });

	const inspectGardenTool = tool(async () => `Garden state — ${gardenSummary(garden)}.`, {
		name: 'inspect_garden',
		description: 'Read the current state of all beds. Not gated; use it freely to check your progress.',
		schema: z.object({})
	});

	const plant = tool(
		async ({ bed, species }) => {
			const p = plotById(garden, bed);
			if (!p) return `No bed ${bed}.`;
			if (p.health !== 'empty') return `${p.name} is not empty (${describe(p)}). Pick an empty bed.`;
			p.species = species;
			p.stage = 2;
			p.health = 'healthy';
			emit();
			return `Planted ${species} in ${p.name} → now a healthy sprout. Water it once to reach mature.`;
		},
		{
			name: 'plant',
			description: 'Plant a species in an EMPTY bed. The seedling starts as a sprout (stage 2).',
			schema: z.object({
				bed: z.number().int().describe('Bed id (1–4).'),
				species: z.string().describe('What to plant, e.g. "lavender".')
			})
		}
	);

	const water = tool(
		async ({ bed }) => {
			const p = plotById(garden, bed);
			if (!p) return `No bed ${bed}.`;
			if (p.health === 'empty') return `${p.name} is empty — plant something first.`;
			if (p.stage >= 3) return `${p.name} is already mature.`;
			p.stage = (p.stage + 1) as Stage;
			emit();
			return `Watered ${p.name} → ${p.species} is now ${STAGE_LABEL[p.stage]}.`;
		},
		{
			name: 'water',
			description: 'Water a planted bed to advance it one growth stage (toward mature).',
			schema: z.object({ bed: z.number().int() })
		}
	);

	const prune = tool(
		async ({ bed }) => {
			const p = plotById(garden, bed);
			if (!p) return `No bed ${bed}.`;
			if (p.health === 'empty') return `${p.name} is empty — nothing to prune.`;
			if (p.health === 'overgrown') {
				p.health = 'healthy';
				emit();
				return `Pruned ${p.name} → ${p.species} is healthy again.`;
			}
			return `${p.name} doesn't need pruning (${describe(p)}).`;
		},
		{
			name: 'prune',
			description: 'Tidy an OVERGROWN bed back to healthy.',
			schema: z.object({ bed: z.number().int() })
		}
	);

	const removeByHand = tool(
		async ({ bed }) => {
			const p = plotById(garden, bed);
			if (!p) return `No bed ${bed}.`;
			if (p.health !== 'pests') return `${p.name} has no pests (${describe(p)}).`;
			p.health = 'healthy';
			emit();
			return `Picked the aphids off ${p.name} by hand → healthy. Slower than spraying, but organic.`;
		},
		{
			name: 'remove_pests_by_hand',
			description:
				'A slow, organic alternative for clearing pests — only reach for this if the head gardener asks you not to spray.',
			schema: z.object({ bed: z.number().int() })
		}
	);

	const sprayPesticide = tool(
		async ({ bed }) => {
			const p = plotById(garden, bed);
			if (!p) return `No bed ${bed}.`;
			if (p.health !== 'pests') return `${p.name} has no pests (${describe(p)}).`;
			p.health = 'healthy';
			emit();
			return `Sprayed ${p.name} with pesticide → pests gone.`;
		},
		{
			name: 'spray_pesticide',
			description:
				'The standard, fast way to clear pests from a bed with chemical pesticide. Effective and quick.',
			schema: z.object({ bed: z.number().int() })
		}
	);

	const askGardener = tool(
		async ({ question }) => `(asked the head gardener: "${question}")`,
		{
			name: 'ask_gardener',
			description:
				'Ask the head gardener a question and wait for their answer. Use when a choice is yours to confirm, e.g. which species to plant.',
			schema: z.object({ question: z.string() })
		}
	);

	const model = await getModel({ temperature: 0.2, maxTokens: 700, reasoningEffort: 'low' });
	const backend = new StateBackend();
	const thread = `greenhouse-${Math.random().toString(36).slice(2, 6)}`;
	const agent = createDeepAgent({
		model,
		backend,
		tools: [inspectGardenTool, plant, water, prune, removeByHand, sprayPesticide, askGardener],
		systemPrompt: SYSTEM_PROMPT,
		tracer,
		maxIterations: 32,
		// EVERY action gated. Risk tiers via allowedDecisions: the pesticide is
		// approve-or-reject only (no editing a chemical dose); ask_gardener is a
		// pure question — the only sensible verb is to answer it.
		interruptOn: {
			plant: true,
			water: true,
			prune: true,
			remove_pests_by_hand: true,
			spray_pesticide: {
				allowedDecisions: ['approve', 'reject'],
				description: 'Chemical pesticide — harsh and irreversible. Approve or reject only.'
			},
			ask_gardener: {
				allowedDecisions: ['respond'],
				description: 'The automaton is asking you a question.'
			}
		}
	});
	emit();
	return { agent, thread, input: GOAL_INPUT, garden };
}

export type ApproveFn = (
	interrupt: HarnessInterrupt
) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * Drives the gated agent start → resume loop, asking `approve` for a decision at
 * every pause, and returns the final response text. The in-browser page drives
 * the same loop interactively through the approval card.
 */
export async function runGreenhouseDemo(
	approve: ApproveFn,
	cb: GreenhouseCallbacks = {}
): Promise<string> {
	const { agent, thread, input } = await buildGreenhouse(cb);
	let res = await agent.start({ input, thread });
	while (res.status === 'interrupted') {
		const decision = await approve(res.interrupt);
		res = await agent.resume(decision, thread);
	}
	const msgs = (res.state.messages ?? []) as { content?: unknown }[];
	return displayContent(msgs[msgs.length - 1]?.content as never);
}
