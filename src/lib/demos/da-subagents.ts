import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	createDeepAgent,
	StateBackend,
	type BackendProtocol,
	type CompiledDeepAgent,
	type SubAgentSpec
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer, type Tracer } from '$lib/runtime/tracer';
import {
	BARS,
	STEPS_PER_BAR,
	TEMPO_BPM,
	SCALES,
	PART_RANGES,
	validatePart,
	validateDrums,
	assembleMovement,
	type Mood,
	type PartKind,
	type ScoreNote,
	type DrumHit,
	type Movement
} from './music';

/**
 * THE CLOCKWORK TROUPE — a mechanical band run as a deep agent.
 *
 * The Maestro (parent) takes a commission and delegates:
 *   · three sync wrights via `task`, dispatched IN ONE message → they compose
 *     in parallel, each in its own context, each owning ONLY its instrument's
 *     tool (the `tools` field REPLACES inherited tools — official semantics);
 *   · one async Arranger via `start_async_task` → it writes a whole second
 *     movement in the background while the first one plays, steerable
 *     mid-flight with `update_async_task`.
 *
 * Everything musical is deterministic (music.ts): the LLMs pick notes, the
 * tools validate them against the key and write them to the SHARED virtual
 * filesystem at /score/**.
 */

// ── Deterministic tools ─────────────────────────────────────────────────────

const noteSchema = z.object({
	step: z.number().int().describe(`Grid position 0–${BARS * STEPS_PER_BAR - 1} (16th notes).`),
	pitch: z.string().describe('Scientific pitch, e.g. "A4".'),
	dur: z.number().int().describe('Duration in steps: 1, 2, 4, 8 or 16.')
});

interface TroupeKey {
	mood: Mood;
	title: string;
}

export function buildTroupeTools(backend: BackendProtocol) {
	async function readKey(): Promise<TroupeKey | null> {
		const raw = await backend.read('/score/key.json');
		if (!raw) return null;
		try {
			return JSON.parse(raw) as TroupeKey;
		} catch {
			return null;
		}
	}

	const setKey = tool(
		async ({ mood, title }) => {
			await backend.write('/score/key.json', JSON.stringify({ mood, title }, null, 1));
			return (
				`Key set: ${SCALES[mood].label} ("${title}") — ${BARS} bars × ${STEPS_PER_BAR} steps ` +
				`at ${TEMPO_BPM} BPM. Now dispatch the wrights.`
			);
		},
		{
			name: 'set_key',
			description:
				'Fix the piece\'s key and title before any composing: "bright" = C major, ' +
				'"solemn" = A minor (with the raised neighbors D#/G# admitted). Every compose tool ' +
				'validates against this.',
			schema: z.object({
				mood: z.enum(['bright', 'solemn']).describe('The harmonic mood of the commission.'),
				title: z.string().describe('A short evocative title for the piece.')
			})
		}
	);

	function composeTool(kind: PartKind) {
		const range = PART_RANGES[kind];
		return tool(
			async ({ notes, movement = 1 }) => {
				const key = await readKey();
				if (!key) return 'REJECTED: no key has been set — the Maestro must call set_key first.';
				const verdict = validatePart(kind, notes as ScoreNote[], key.mood);
				if (!verdict.ok) {
					return `REJECTED — fix exactly these and call compose_${kind} again:\n- ${verdict.problems.join('\n- ')}`;
				}
				await backend.write(
					`/score/m${movement}/${kind}.json`,
					JSON.stringify({ part: kind, mood: key.mood, notes }, null, 1)
				);
				return `ACCEPTED: ${verdict.summary} Written to /score/m${movement}/${kind}.json.`;
			},
			{
				name: `compose_${kind}`,
				description:
					`Submit the ${kind} line (register ${range.low}–${range.high}). Validates every note ` +
					`against the key — rejections name the exact notes to fix.`,
				schema: z.object({
					notes: z.array(noteSchema).describe(`The whole ${kind} line for the movement.`),
					movement: z
						.number()
						.int()
						.min(1)
						.max(2)
						.optional()
						.describe('1 (default) or 2 for the second movement.')
				})
			}
		);
	}

	const composeDrums = tool(
		async ({ hits, movement = 1 }) => {
			const key = await readKey();
			if (!key) return 'REJECTED: no key has been set — the Maestro must call set_key first.';
			const verdict = validateDrums(hits as DrumHit[]);
			if (!verdict.ok) {
				return `REJECTED — fix exactly these and call compose_drums again:\n- ${verdict.problems.join('\n- ')}`;
			}
			await backend.write(
				`/score/m${movement}/drums.json`,
				JSON.stringify({ part: 'drums', mood: key.mood, hits }, null, 1)
			);
			return `ACCEPTED: ${verdict.summary} Written to /score/m${movement}/drums.json.`;
		},
		{
			name: 'compose_drums',
			description:
				'Submit the drum pattern (kick / snare / hat on the 32-step grid). Needs a kick on ' +
				'step 0; rejections name the exact hits to fix.',
			schema: z.object({
				hits: z
					.array(
						z.object({
							step: z.number().int().describe('Grid position 0–31.'),
							drum: z.enum(['kick', 'snare', 'hat'])
						})
					)
					.describe('The whole drum pattern for the movement.'),
				movement: z.number().int().min(1).max(2).optional().describe('1 (default) or 2.')
			})
		}
	);

	const assemble = tool(
		async ({ movement }) => {
			const key = await readKey();
			if (!key) return 'NOT READY: no key has been set.';
			const parts: Record<string, string | null> = {};
			for (const name of ['melody', 'bass', 'drums', 'bells']) {
				parts[name] = await backend.read(`/score/m${movement}/${name}.json`);
			}
			const result = assembleMovement(movement, key.title, key.mood, parts);
			if (!result.ok) return `NOT READY:\n- ${result.problems.join('\n- ')}`;
			await backend.write(`/score/movement-${movement}.json`, JSON.stringify(result.movement, null, 1));
			return `ASSEMBLED: ${result.summary} Written to /score/movement-${movement}.json — playable now.`;
		},
		{
			name: 'assemble_movement',
			description:
				'Stitch the delivered parts of a movement into one playable score file. Fails with a ' +
				'list of missing parts if a wright has not delivered yet.',
			schema: z.object({
				movement: z.number().int().min(1).max(2).describe('Which movement to assemble.')
			})
		}
	);

	return {
		setKey,
		composeMelody: composeTool('melody'),
		composeBass: composeTool('bass'),
		composeBells: composeTool('bells'),
		composeDrums,
		assemble
	};
}

// ── The cast ────────────────────────────────────────────────────────────────

const WRIGHT_COMMON = `Call your compose tool ONCE with the complete line. The tool validates every
note against the key and REJECTS with exact reasons — if rejected, fix precisely what it lists and
call again. Do not read or write files yourself. When the tool says ACCEPTED, reply with ONE short
sentence describing what you wrote (your parent only sees that sentence).`;

const MELODY_PROMPT = `You are the Melody-wright of the Clockwork Troupe — the lead line.
Compose 10–28 notes across steps 0–63 (FOUR bars of 16 steps each), durations from {1,2,4,8,16}
(16th/8th/quarter/half/whole), register C4–C6, strictly in the scale named in your brief.
If the brief SPELLS a famous theme in scientific pitch, quote it FAITHFULLY, note for note, at a
comfortable pace (dur 2 or 4 per note, longer at phrase ends) — then fill the remaining bars by
repeating or answering the phrase, the way the original tune does. If no theme is spelled, craft
a singable contour: stepwise motion, a clear phrase per pair of bars, END on the tonic.
Every bar must contain melody. Leave some air — not every step needs a note.
${WRIGHT_COMMON}`;

const BASS_PROMPT = `You are the Bass-wright of the Clockwork Troupe — the foundation.
Compose 6–14 notes across steps 0–63 (four bars of 16), register C2–G3, durations mostly 8 or 16,
strictly in the scale named in your brief. Anchor every downbeat (steps 0, 16, 32, 48) — tonic on
the first and last, tonic or fifth in between; move stepwise or by fifths. Match the harmony the
brief implies.
${WRIGHT_COMMON}`;

const DRUM_PROMPT = `You are the Drum-wright of the Clockwork Troupe — the clockwork itself.
Compose 14–40 hits on the 64-step grid (four bars of 16): kick on steps 0, 16, 32, 48 (more if
the piece marches), snare on the backbeats (8, 24, 40, 56), hats filling between. For a lullaby,
go sparse and soft — drop most hats, keep the rock of kick and gentle snare.
${WRIGHT_COMMON}`;

const ARRANGER_PROMPT = `You are the Arranger of the Clockwork Troupe. You work alone in the back
room on the SECOND movement (always pass movement: 2 to every compose tool; four bars, steps
0–63) while the troupe performs the first. Your brief describes the piece; develop it — same key,
a VARIATION on the first movement's theme (ornament it, shift its register, answer it), not
unrelated material.
Work slowly and deliberately, ONE part per response — never two compose calls in the same
message: first compose_melody, then compose_bass, then compose_drums (each with movement: 2).
Before each part, reflect in a sentence on what the movement needs next; the back room is in
no hurry. Add compose_bells ONLY if your instructions ask for bells or brightness. Tools reject
bad notes with exact reasons — fix and resubmit. If NEW instructions arrive mid-work, follow
them; parts already ACCEPTED stay unless the new instructions say otherwise (you may resubmit
a part to replace it). When every part is accepted, reply with one short sentence describing
the movement.`;

const MAESTRO_PROMPT = `You are the Maestro of the Clockwork Troupe, a mechanical band. You conduct;
you NEVER compose — you have no compose tools. Stay courteous, brief and slightly theatrical.

THE TUNEBOOK. When a commission references a known melody, the melody-wright's brief MUST spell
the theme's opening phrase in scientific pitch, copied exactly from here (or spelled yourself,
carefully, for other public-domain tunes):
- Für Elise (solemn): E5 D#5 E5 D#5 E5 B4 D5 C5 A4 — then rest, then A4 C4 E4 A4, B4 E4 G#4 B4, C5.
- Ode to Joy (bright): E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4(held).
- Twinkle Twinkle (bright): C4 C4 G4 G4 A4 A4 G4(held) F4 F4 E4 E4 D4 D4 C4(held).
Tell the bass- and drum-wrights the tune's character and implied harmony instead of the notes.

On a new commission:
1. Read its character. Call set_key with mood "bright" (C major) or "solemn" (A minor) and a
   short title.
2. Dispatch ALL THREE wrights — melody-wright, bass-wright, drum-wright — as THREE task calls in
   ONE single response, so they compose in parallel. Each description must be self-contained:
   name the title, the scale, the mood word, the character — and the spelled theme for the
   melody-wright when the tunebook applies (the wright cannot see this conversation).
3. When all three report, call assemble_movement with movement 1.
4. Launch the background arranger: start_async_task({ agent: "arranger", description: ... }) with
   a self-contained brief for a second movement that develops the first (include title, scale,
   mood, and one line on what each part did).
5. Then IMMEDIATELY tell the patron: the first movement is ready to play, and the Arranger is at
   work on a second in the back room — quote the FULL task id. Do NOT check the task you just
   started.

On later turns: for "how is it going", use check_async_task or list_async_tasks (statuses quoted
in old messages are stale — always fetch live). To change a movement still being written, use
update_async_task with the patron's wishes. If a check shows the arranger is DONE, immediately
call assemble_movement with movement 2 in the same turn, then announce the complete suite.`;

// ── Commissions & canned patron turns (the page's quick actions) ────────────

export const COMMISSIONS = [
	'A clockwork take on Beethoven’s Für Elise.',
	'Ode to Joy, arranged for the troupe’s triumphant march.',
	'Twinkle, Twinkle, Little Star — as a music-box lullaby.'
];

export const PATRON_TURNS = {
	check: 'How is the Arranger getting on back there? Check honestly and tell me.',
	steer: 'Send word to the Arranger mid-flight: brighter, please — and add a bell line on top.',
	cancel: 'Actually, stop the Arranger — one movement is enough today.'
};

// ── Build & drive ───────────────────────────────────────────────────────────

export interface TroupeHandle {
	agent: CompiledDeepAgent;
	tracer: Tracer;
	backend: BackendProtocol;
	/** One patron turn to the Maestro on the shared thread; resolves to its reply. */
	send(input: string): Promise<string>;
}

export function finalText(messages: { content: unknown }[]): string {
	const last = messages[messages.length - 1];
	const c = last?.content;
	if (typeof c === 'string') return c;
	if (Array.isArray(c))
		return c.map((b) => (typeof b === 'string' ? b : ((b as { text?: string }).text ?? ''))).join('');
	return JSON.stringify(c ?? '');
}

/**
 * Wire the whole troupe. The wrights' `tools` arrays REPLACE inherited tools
 * (official semantics): each wright owns exactly one instrument and cannot
 * touch the Maestro's set_key/assemble — or each other's instruments.
 */
export async function buildTroupe(): Promise<TroupeHandle> {
	const backend = new StateBackend();
	const t = buildTroupeTools(backend);
	const tracer = createTracer();

	const [maestroModel, wrightModel, arrangerModel] = await Promise.all([
		getModel({ maxTokens: 1600, temperature: 0.3, reasoningEffort: 'low' }),
		// Four bars of JSON notes is a long tool call — give the wrights headroom.
		getModel({ maxTokens: 3200, temperature: 0.7, reasoningEffort: 'low' }),
		// The back room thinks harder on purpose — a real steering window for the demo.
		getModel({ maxTokens: 3600, temperature: 0.7, reasoningEffort: 'medium' })
	]);

	const wrights: SubAgentSpec[] = [
		{
			name: 'melody-wright',
			description: 'Composes the lead melody line for one movement.',
			systemPrompt: MELODY_PROMPT,
			tools: [t.composeMelody],
			model: wrightModel,
			maxIterations: 6
		},
		{
			name: 'bass-wright',
			description: 'Composes the bass foundation for one movement.',
			systemPrompt: BASS_PROMPT,
			tools: [t.composeBass],
			model: wrightModel,
			maxIterations: 6
		},
		{
			name: 'drum-wright',
			description: 'Composes the drum pattern for one movement.',
			systemPrompt: DRUM_PROMPT,
			tools: [t.composeDrums],
			model: wrightModel,
			maxIterations: 6
		}
	];

	const arranger: SubAgentSpec = {
		name: 'arranger',
		description:
			'Composes a complete second movement (melody, bass, drums, optional bells) — slow, thorough back-room work.',
		systemPrompt: ARRANGER_PROMPT,
		tools: [t.composeMelody, t.composeBass, t.composeDrums, t.composeBells],
		model: arrangerModel,
		maxIterations: 14
	};

	const agent = createDeepAgent({
		model: maestroModel,
		backend,
		systemPrompt: MAESTRO_PROMPT,
		tools: [t.setKey, t.assemble],
		subagents: wrights,
		asyncSubagents: [arranger],
		tracer,
		maxIterations: 40
	});

	const thread = `troupe-${Math.random().toString(36).slice(2, 8)}`;
	return {
		agent,
		tracer,
		backend,
		async send(input: string) {
			const out = await agent.invoke({ input, thread });
			return finalText(out.messages as { content: unknown }[]);
		}
	};
}

/** Parse an assembled movement file for the piano roll / playback. */
export function parseMovement(content: string | null): Movement | null {
	if (!content) return null;
	try {
		const m = JSON.parse(content) as Movement;
		return m && m.parts ? m : null;
	} catch {
		return null;
	}
}
