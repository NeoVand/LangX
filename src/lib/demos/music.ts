/**
 * The Clockwork Troupe's music engine — deterministic notation, validation and
 * assembly. The LLM subagents only ever DECIDE notes; everything here either
 * accepts them, rejects them with a readable reason, or stitches them together.
 * Pure functions throughout: this is the demo's unit-tested ground truth.
 */

export type Mood = 'bright' | 'solemn';
export type PartKind = 'melody' | 'bass' | 'bells';
export type DrumKind = 'kick' | 'snare' | 'hat';

export interface ScoreNote {
	/** 16th-note grid position, 0–31 (two bars of 16). */
	step: number;
	/** Scientific pitch, e.g. "A4". */
	pitch: string;
	/** Duration in steps: 1 (16th), 2 (8th), 4 (quarter) or 8 (half). */
	dur: number;
}

export interface DrumHit {
	step: number;
	drum: DrumKind;
}

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const TOTAL_STEPS = STEPS_PER_BAR * BARS;
export const TEMPO_BPM = 112;
export const ALLOWED_DURS = [1, 2, 4, 8, 16];

/**
 * Full diatonic scales, so famous public-domain themes actually fit. 'solemn'
 * additionally admits the raised neighbors G# (harmonic minor) and D# — the
 * note Für Elise is made of — while still rejecting every other chromatic.
 */
export const SCALES: Record<Mood, { label: string; classes: string[]; tonic: string }> = {
	bright: { label: 'C major', classes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], tonic: 'C' },
	solemn: {
		label: 'A minor',
		classes: ['A', 'B', 'C', 'D', 'D#', 'E', 'F', 'G', 'G#'],
		tonic: 'A'
	}
};

/** Octave fences per part — keeps the troupe out of each other's registers. */
export const PART_RANGES: Record<PartKind, { low: string; high: string }> = {
	melody: { low: 'C4', high: 'C6' },
	bass: { low: 'C2', high: 'G3' },
	bells: { low: 'C5', high: 'C7' }
};

export const PART_MINIMUMS: Record<PartKind, number> = { melody: 8, bass: 4, bells: 3 };

const PITCH_CLASS: Record<string, number> = {
	C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
	'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11
};

export interface ParsedPitch {
	cls: string;
	octave: number;
	midi: number;
}

/** "A#4" → { cls: 'A#', octave: 4, midi: 70 }, or null if unparseable. */
export function parsePitch(pitch: string): ParsedPitch | null {
	const m = /^([A-G]#?)(-?\d)$/.exec(pitch.trim());
	if (!m) return null;
	const cls = m[1];
	const octave = Number(m[2]);
	return { cls, octave, midi: (octave + 1) * 12 + PITCH_CLASS[cls] };
}

export function noteToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

export type Verdict = { ok: true; summary: string } | { ok: false; problems: string[] };

/**
 * The gatekeeper the wrights compose against. Every rejection names the exact
 * note and the exact rule — the error message is the subagent's UX.
 */
export function validatePart(kind: PartKind, notes: ScoreNote[], mood: Mood): Verdict {
	const scale = SCALES[mood];
	const range = PART_RANGES[kind];
	const lo = parsePitch(range.low)!.midi;
	const hi = parsePitch(range.high)!.midi;
	const problems: string[] = [];

	if (!Array.isArray(notes) || notes.length < PART_MINIMUMS[kind]) {
		problems.push(
			`too few notes: a ${kind} part needs at least ${PART_MINIMUMS[kind]} (got ${notes?.length ?? 0}).`
		);
	}
	for (let i = 0; i < (notes?.length ?? 0); i++) {
		const n = notes[i];
		const tag = `note ${i + 1} (step ${n.step}, ${n.pitch})`;
		if (!Number.isInteger(n.step) || n.step < 0 || n.step >= TOTAL_STEPS) {
			problems.push(`${tag}: step must be an integer 0–${TOTAL_STEPS - 1}.`);
			continue;
		}
		if (!ALLOWED_DURS.includes(n.dur)) {
			problems.push(`${tag}: dur must be one of ${ALLOWED_DURS.join(', ')} (got ${n.dur}).`);
		} else if (n.step + n.dur > TOTAL_STEPS) {
			problems.push(`${tag}: runs past the end — step ${n.step} + dur ${n.dur} > ${TOTAL_STEPS}.`);
		}
		const p = parsePitch(n.pitch);
		if (!p) {
			problems.push(`${tag}: unreadable pitch — use scientific notation like "A4".`);
			continue;
		}
		if (!scale.classes.includes(p.cls)) {
			problems.push(
				`${tag}: ${p.cls} is not in ${scale.label} — allowed pitch classes: ${scale.classes.join(', ')}.`
			);
		}
		if (p.midi < lo || p.midi > hi) {
			problems.push(`${tag}: out of the ${kind} register ${range.low}–${range.high}.`);
		}
	}

	// Monophonic line: notes must not overlap.
	const sorted = [...(notes ?? [])].sort((a, b) => a.step - b.step);
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		if (sorted[i].step < prev.step + prev.dur) {
			problems.push(
				`notes at steps ${prev.step} and ${sorted[i].step} overlap — a ${kind} line is one voice; sequence them.`
			);
		}
	}

	// A melody must visit both bars — half-empty movements sound broken.
	if (kind === 'melody' && notes?.length) {
		const bars = new Set(sorted.map((n) => Math.floor(n.step / STEPS_PER_BAR)));
		for (let b = 0; b < BARS; b++) {
			if (!bars.has(b)) problems.push(`bar ${b + 1} has no melody notes — spread the line across both bars.`);
		}
	}

	if (problems.length) return { ok: false, problems };
	return {
		ok: true,
		summary: `${notes.length}-note ${kind} in ${scale.label}, steps ${sorted[0].step}–${
			sorted[sorted.length - 1].step + sorted[sorted.length - 1].dur
		} of ${TOTAL_STEPS}.`
	};
}

export function validateDrums(hits: DrumHit[]): Verdict {
	const problems: string[] = [];
	if (!Array.isArray(hits) || hits.length < 12) {
		problems.push(`too sparse: a drum part needs at least 12 hits (got ${hits?.length ?? 0}).`);
	}
	if (hits?.length > 80) problems.push(`too busy: at most 80 hits (got ${hits.length}).`);
	const seen = new Set<string>();
	for (let i = 0; i < (hits?.length ?? 0); i++) {
		const h = hits[i];
		const tag = `hit ${i + 1} (step ${h.step}, ${h.drum})`;
		if (!Number.isInteger(h.step) || h.step < 0 || h.step >= TOTAL_STEPS) {
			problems.push(`${tag}: step must be an integer 0–${TOTAL_STEPS - 1}.`);
			continue;
		}
		const key = `${h.step}:${h.drum}`;
		if (seen.has(key)) problems.push(`${tag}: duplicate — that drum already strikes that step.`);
		seen.add(key);
	}
	if (hits?.length && !hits.some((h) => h.drum === 'kick' && h.step === 0)) {
		problems.push('no kick on step 0 — the troupe needs a downbeat to start together.');
	}
	if (problems.length) return { ok: false, problems };
	const counts = { kick: 0, snare: 0, hat: 0 };
	for (const h of hits) counts[h.drum]++;
	return {
		ok: true,
		summary: `${hits.length} hits (${counts.kick} kick, ${counts.snare} snare, ${counts.hat} hat) across ${BARS} bars.`
	};
}

// ── Assembly ────────────────────────────────────────────────────────────────

export interface PartFile {
	part: PartKind | 'drums';
	mood: Mood;
	notes?: ScoreNote[];
	hits?: DrumHit[];
}

export interface Movement {
	movement: number;
	mood: Mood;
	title: string;
	tempo: number;
	parts: {
		melody: ScoreNote[];
		bass: ScoreNote[];
		drums: DrumHit[];
		bells?: ScoreNote[];
	};
}

export type AssembleResult =
	| { ok: true; movement: Movement; summary: string }
	| { ok: false; problems: string[] };

/**
 * Stitch the wrights' part files into one playable movement. Melody, bass and
 * drums are required; bells are the arranger's optional sparkle.
 */
export function assembleMovement(
	n: number,
	title: string,
	mood: Mood,
	parts: Record<string, string | null>
): AssembleResult {
	const problems: string[] = [];
	const read = (name: string): PartFile | null => {
		const raw = parts[name];
		if (raw == null) return null;
		try {
			return JSON.parse(raw) as PartFile;
		} catch {
			problems.push(`/score/m${n}/${name}.json is not valid JSON.`);
			return null;
		}
	};
	const melody = read('melody');
	const bass = read('bass');
	const drums = read('drums');
	const bells = read('bells');
	for (const [name, part] of [
		['melody', melody],
		['bass', bass],
		['drums', drums]
	] as const) {
		if (parts[name] == null) problems.push(`missing part: /score/m${n}/${name}.json — that wright has not delivered.`);
		else if (part && part.mood !== mood)
			problems.push(`${name} was written in mood "${part.mood}" but the key is "${mood}".`);
	}
	if (problems.length) return { ok: false, problems };

	const movement: Movement = {
		movement: n,
		mood,
		title,
		tempo: TEMPO_BPM,
		parts: {
			melody: melody!.notes ?? [],
			bass: bass!.notes ?? [],
			drums: drums!.hits ?? [],
			...(bells?.notes?.length ? { bells: bells.notes } : {})
		}
	};
	return { ok: true, movement, summary: describeMovement(movement) };
}

export function describeMovement(m: Movement): string {
	const bits = [
		`${m.parts.melody.length}-note melody`,
		`${m.parts.bass.length}-note bass`,
		`${m.parts.drums.length} drum hits`
	];
	if (m.parts.bells?.length) bits.push(`${m.parts.bells.length} bell notes`);
	return `Movement ${m.movement} "${m.title}": ${bits.join(', ')} · ${BARS} bars of ${
		SCALES[m.mood].label
	} at ${m.tempo} BPM.`;
}
