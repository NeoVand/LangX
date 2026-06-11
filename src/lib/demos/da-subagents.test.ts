import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
	StateBackend,
	withGeneralPurpose,
	runChildAgent,
	createAsyncTaskEngine,
	type SubAgentSpec,
	type ChildRunResult
} from '$lib/deepagents';
import {
	parsePitch,
	noteToFreq,
	validatePart,
	validateDrums,
	assembleMovement,
	SCALES,
	type ScoreNote
} from './music';
import { buildTroupeTools } from './da-subagents';

// The Clockwork Troupe's ground truth: the music engine's verdicts, the
// deterministic tools the wrights compose against, and the subagent
// machinery's official semantics (general-purpose roster, tool replacement,
// async lifecycle with steering).

// ── Music engine ────────────────────────────────────────────────────────────

// Für Elise's opening, the way the melody-wright is briefed to quote it —
// four bars, ends on the tonic, uses the admitted D# neighbor.
const GOOD_MELODY: ScoreNote[] = [
	{ step: 0, pitch: 'E5', dur: 2 },
	{ step: 2, pitch: 'D#5', dur: 2 },
	{ step: 4, pitch: 'E5', dur: 2 },
	{ step: 6, pitch: 'D#5', dur: 2 },
	{ step: 8, pitch: 'E5', dur: 2 },
	{ step: 10, pitch: 'B4', dur: 2 },
	{ step: 12, pitch: 'D5', dur: 2 },
	{ step: 14, pitch: 'C5', dur: 2 },
	{ step: 16, pitch: 'A4', dur: 4 },
	{ step: 32, pitch: 'E4', dur: 4 },
	{ step: 36, pitch: 'A4', dur: 4 },
	{ step: 40, pitch: 'B4', dur: 4 },
	{ step: 48, pitch: 'C5', dur: 4 },
	{ step: 52, pitch: 'B4', dur: 4 },
	{ step: 56, pitch: 'A4', dur: 8 }
];

describe('the music engine', () => {
	it('parses pitches and tunes A4 to 440 Hz', () => {
		expect(parsePitch('A4')).toEqual({ cls: 'A', octave: 4, midi: 69 });
		expect(parsePitch('C#3')?.midi).toBe(49);
		expect(parsePitch('H4')).toBeNull();
		expect(noteToFreq(69)).toBeCloseTo(440);
		expect(noteToFreq(57)).toBeCloseTo(220);
	});

	it('accepts a lawful melody — Für Elise’s D# included', () => {
		const v = validatePart('melody', GOOD_MELODY, 'solemn');
		expect(v.ok).toBe(true);
		if (v.ok) expect(v.summary).toContain('15-note melody in A minor');
	});

	it('rejects out-of-scale notes BY NAME — the error is the wright’s UX', () => {
		const v = validatePart(
			'melody',
			GOOD_MELODY.map((n) => (n.step === 40 ? { ...n, pitch: 'F#4' } : n)),
			'solemn'
		);
		expect(v.ok).toBe(false);
		if (!v.ok) {
			expect(v.problems.join(' ')).toContain('F# is not in A minor');
			expect(v.problems.join(' ')).toContain('A, B, C, D, D#, E, F, G, G#');
		}
	});

	it('rejects overlapping notes, register escapes and empty bars', () => {
		const overlap = validatePart(
			'melody',
			[...GOOD_MELODY.slice(0, 8), { step: 17, pitch: 'A4', dur: 2 }, { step: 18, pitch: 'C5', dur: 2 }],
			'solemn'
		);
		expect(overlap.ok).toBe(false);
		if (!overlap.ok) expect(overlap.problems.join(' ')).toContain('overlap');

		const tooHigh = validatePart('bass', [{ step: 0, pitch: 'C5', dur: 4 }], 'solemn');
		expect(tooHigh.ok).toBe(false);
		if (!tooHigh.ok) expect(tooHigh.problems.join(' ')).toContain('register');

		// Theme stated in bars 1–2, then silence: bars 3 and 4 must be flagged.
		const halfEmpty = validatePart('melody', GOOD_MELODY.slice(0, 9), 'solemn');
		expect(halfEmpty.ok).toBe(false);
		if (!halfEmpty.ok) {
			expect(halfEmpty.problems.join(' ')).toContain('bar 3');
			expect(halfEmpty.problems.join(' ')).toContain('bar 4');
		}
	});

	it('drums need a downbeat kick and no duplicate hits', () => {
		const hits = [
			{ step: 0, drum: 'kick' as const },
			{ step: 4, drum: 'hat' as const },
			{ step: 8, drum: 'snare' as const },
			{ step: 12, drum: 'hat' as const },
			{ step: 16, drum: 'kick' as const },
			{ step: 20, drum: 'hat' as const },
			{ step: 24, drum: 'snare' as const },
			{ step: 28, drum: 'hat' as const },
			{ step: 32, drum: 'kick' as const },
			{ step: 36, drum: 'hat' as const },
			{ step: 40, drum: 'snare' as const },
			{ step: 44, drum: 'hat' as const },
			{ step: 48, drum: 'kick' as const },
			{ step: 52, drum: 'hat' as const },
			{ step: 56, drum: 'snare' as const },
			{ step: 60, drum: 'hat' as const }
		];
		expect(validateDrums(hits).ok).toBe(true);

		const noDownbeat = validateDrums(hits.map((h) => (h.step === 0 ? { ...h, step: 2 } : h)));
		expect(noDownbeat.ok).toBe(false);
		if (!noDownbeat.ok) expect(noDownbeat.problems.join(' ')).toContain('downbeat');

		const dup = validateDrums([...hits, { step: 0, drum: 'kick' }]);
		expect(dup.ok).toBe(false);
		if (!dup.ok) expect(dup.problems.join(' ')).toContain('duplicate');
	});

	it('assembly demands melody, bass and drums — and a single key', () => {
		const melody = JSON.stringify({ part: 'melody', mood: 'solemn', notes: GOOD_MELODY });
		const missing = assembleMovement(1, 'Test', 'solemn', {
			melody,
			bass: null,
			drums: null,
			bells: null
		});
		expect(missing.ok).toBe(false);
		if (!missing.ok) {
			expect(missing.problems.join(' ')).toContain('/score/m1/bass.json');
			expect(missing.problems.join(' ')).toContain('/score/m1/drums.json');
		}

		const wrongMood = assembleMovement(1, 'Test', 'bright', {
			melody,
			bass: JSON.stringify({ part: 'bass', mood: 'bright', notes: [{ step: 0, pitch: 'C2', dur: 8 }] }),
			drums: JSON.stringify({ part: 'drums', mood: 'bright', hits: [{ step: 0, drum: 'kick' }] }),
			bells: null
		});
		expect(wrongMood.ok).toBe(false);
		if (!wrongMood.ok) expect(wrongMood.problems.join(' ')).toContain('mood "solemn"');
	});
});

// ── The troupe’s tools against a real backend ───────────────────────────────

describe('the troupe’s tools', () => {
	it('nothing composes before the Maestro sets the key', async () => {
		const t = buildTroupeTools(new StateBackend());
		const out = await t.composeMelody.invoke({ notes: GOOD_MELODY });
		expect(out).toContain('no key has been set');
	});

	it('set_key → compose → assemble produces a playable movement file', async () => {
		const backend = new StateBackend();
		const t = buildTroupeTools(backend);
		expect(await t.setKey.invoke({ mood: 'solemn', title: 'The Launch' })).toContain(
			SCALES.solemn.label
		);

		expect(await t.composeMelody.invoke({ notes: GOOD_MELODY })).toContain('ACCEPTED');
		expect(
			await t.composeBass.invoke({
				notes: [
					{ step: 0, pitch: 'A2', dur: 8 },
					{ step: 8, pitch: 'C3', dur: 8 },
					{ step: 16, pitch: 'A2', dur: 8 },
					{ step: 24, pitch: 'E2', dur: 8 }
				]
			})
		).toContain('ACCEPTED');

		// Half-finished troupe: assembly must name exactly who hasn't delivered.
		const notReady = await t.assemble.invoke({ movement: 1 });
		expect(notReady).toContain('NOT READY');
		expect(notReady).toContain('drums.json');
		expect(notReady).not.toContain('melody.json');

		expect(
			await t.composeDrums.invoke({
				hits: [0, 16, 32, 48]
					.flatMap((bar) => [
						{ step: bar, drum: 'kick' as const },
						{ step: bar + 4, drum: 'hat' as const },
						{ step: bar + 8, drum: 'snare' as const },
						{ step: bar + 12, drum: 'hat' as const }
					])
			})
		).toContain('ACCEPTED');

		expect(await t.assemble.invoke({ movement: 1 })).toContain('ASSEMBLED');
		const file = await backend.read('/score/movement-1.json');
		expect(file).toBeTruthy();
		const movement = JSON.parse(file!);
		expect(movement.parts.melody).toHaveLength(15);
		expect(movement.title).toBe('The Launch');
		expect(movement.tempo).toBe(112);
	});

	it('a rejection names the offending note so the wright can fix it', async () => {
		const t = buildTroupeTools(new StateBackend());
		await t.setKey.invoke({ mood: 'bright', title: 'Ode' });
		// Ode to Joy's opening — with one chromatic slip the tool must call out.
		const odeish: ScoreNote[] = [
			'E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4', 'C4', 'C4', 'D4', 'E4'
		].map((pitch, i) => ({ step: i * 4, pitch, dur: 4 }));
		const out = await t.composeMelody.invoke({
			notes: [...odeish, { step: 48, pitch: 'F#4', dur: 4 }, { step: 56, pitch: 'C4', dur: 8 }]
		});
		expect(out).toContain('REJECTED');
		expect(out).toContain('F# is not in C major');
	});
});

// ── Subagent machinery: official semantics ──────────────────────────────────

/** A scripted stand-in for a chat model: returns the queued AIMessages in order. */
function fakeModel(script: AIMessage[], seen?: BaseMessage[][]): BaseChatModel {
	const queue = [...script];
	return {
		bindTools: () => ({
			invoke: async (msgs: BaseMessage[]) => {
				seen?.push([...msgs]);
				return queue.shift() ?? new AIMessage('(script exhausted)');
			}
		})
	} as unknown as BaseChatModel;
}

const pingTool = {
	name: 'ping',
	calls: 0,
	async invoke() {
		this.calls++;
		return 'pong';
	}
};

describe('subagent machinery', () => {
	it('auto-adds the general-purpose subagent — unless you replace it by name', () => {
		const roster = withGeneralPurpose([
			{ name: 'a', description: 'x', systemPrompt: 'y' }
		]);
		expect(roster.map((s) => s.name)).toEqual(['a', 'general-purpose']);

		const replaced = withGeneralPurpose([
			{ name: 'general-purpose', description: 'mine', systemPrompt: 'custom' }
		]);
		expect(replaced).toHaveLength(1);
		expect(replaced[0].description).toBe('mine');
	});

	it('a child runs its own loop and returns ONE report; spec.tools REPLACE inherited tools', async () => {
		const parentTool = { name: 'parent_only', calls: 0, async invoke() { this.calls++; return 'x'; } };
		pingTool.calls = 0;
		const spec: SubAgentSpec = {
			name: 'wright',
			description: 'test',
			systemPrompt: 'You are a wright.',
			tools: [pingTool]
		};
		const out = await runChildAgent({
			spec,
			description: 'do the thing',
			model: fakeModel([
				new AIMessage({ content: '', tool_calls: [{ name: 'ping', args: {}, id: '1' }] }),
				// The parent's custom tool must NOT exist inside this child:
				new AIMessage({ content: '', tool_calls: [{ name: 'parent_only', args: {}, id: '2' }] }),
				new AIMessage('one tidy report')
			]),
			backend: new StateBackend(),
			parentTools: [parentTool],
			parentPermissions: []
		});
		expect(out.summary).toBe('one tidy report');
		expect(out.steps).toBe(3);
		expect(out.toolCalls).toBe(2);
		expect(pingTool.calls).toBe(1);
		expect(parentTool.calls).toBe(0); // replaced, not merged
		const unknownReply = out.messages.find(
			(m) => m.getType() === 'tool' && String(m.content).includes('Unknown tool')
		);
		expect(unknownReply).toBeTruthy();
	});

	it('children harden permission "interrupt" to deny — no human to summon in a child', async () => {
		const spec: SubAgentSpec = { name: 'w', description: 'test', systemPrompt: 'p' };
		const out = await runChildAgent({
			spec,
			description: 'write something',
			model: fakeModel([
				new AIMessage({
					content: '',
					tool_calls: [{ name: 'write_file', args: { path: '/config/x.yaml', content: 'hi' }, id: '1' }]
				}),
				new AIMessage('report')
			]),
			backend: new StateBackend(),
			parentTools: [],
			parentPermissions: [{ operations: ['write'], paths: ['/config/**'], mode: 'interrupt' }]
		});
		const refusal = out.messages.find(
			(m) => m.getType() === 'tool' && String(m.content).includes('Denied by rule')
		);
		expect(refusal).toBeTruthy();
	});
});

// ── Async lifecycle ─────────────────────────────────────────────────────────

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function makeEngine(runs: Array<ReturnType<typeof deferred<ChildRunResult>>>, log: string[]) {
	let i = 0;
	return createAsyncTaskEngine({
		subagents: [{ name: 'arranger', description: 'background composer', systemPrompt: 'p' }],
		model: {} as BaseChatModel,
		backend: new StateBackend(),
		parentTools: [],
		permissions: [],
		runChild: async (o) => {
			log.push(o.description);
			return runs[i++].promise;
		}
	});
}

describe('the async task lifecycle', () => {
	it('start returns immediately with a full id; check goes from running to done', async () => {
		const run = deferred<ChildRunResult>();
		const log: string[] = [];
		const engine = makeEngine([run], log);

		const started = engine.start('arranger', 'compose movement two');
		const id = engine.snapshot()[0].id;
		expect(started).toContain(id);
		expect(started).toContain('Do NOT poll it immediately');
		expect(engine.check(id)).toContain('status=running');

		run.resolve({ summary: 'second movement done', steps: 4, toolCalls: 6, messages: [] });
		await tick();
		expect(engine.check(id)).toContain('status=done');
		expect(engine.check(id)).toContain('second movement done');
		expect(engine.snapshot()[0].status).toBe('done');
	});

	it('update interrupts the run and restarts it with history + new orders, same id', async () => {
		const first = deferred<ChildRunResult>();
		const second = deferred<ChildRunResult>();
		const log: string[] = [];
		const engine = makeEngine([first, second], log);

		engine.start('arranger', 'compose movement two');
		const id = engine.snapshot()[0].id;
		expect(engine.update(id, 'brighter, add bells')).toContain('interrupted');

		// The halted run hands over its transcript; the restart replays it.
		first.resolve({
			summary: '(cancelled)',
			steps: 1,
			toolCalls: 1,
			messages: [new HumanMessage('original brief')],
			aborted: true
		});
		await tick();

		expect(log).toHaveLength(2);
		expect(log[1]).toContain('brighter, add bells');
		const snap = engine.snapshot()[0];
		expect(snap.id).toBe(id); // same task id throughout
		expect(snap.status).toBe('running'); // still the same task, still going
		expect(snap.updates).toEqual(['brighter, add bells']);

		second.resolve({ summary: 'brighter movement with bells', steps: 3, toolCalls: 5, messages: [] });
		await tick();
		expect(engine.check(id)).toContain('brighter movement with bells');
	});

	it('cancel stops a running task; a finished task is too late to steer', async () => {
		const run = deferred<ChildRunResult>();
		const engine = makeEngine([run], []);
		engine.start('arranger', 'compose');
		const id = engine.snapshot()[0].id;

		expect(engine.cancel(id)).toContain('Cancelled');
		expect(engine.snapshot()[0].status).toBe('cancelled');
		// The orphaned run resolving later must not resurrect the record.
		run.resolve({ summary: 'too late', steps: 1, toolCalls: 0, messages: [] });
		await tick();
		expect(engine.snapshot()[0].status).toBe('cancelled');

		expect(engine.update(id, 'nope')).toContain('too late to steer');
	});

	it('unknown ids get a corrective error — full ids, never truncated', () => {
		const engine = makeEngine([deferred<ChildRunResult>()], []);
		engine.start('arranger', 'compose');
		const id = engine.snapshot()[0].id;
		const out = engine.check('task_nope');
		expect(out).toContain('No task with id');
		expect(out).toContain(id);
		expect(out).toContain('never truncate');
	});
});
