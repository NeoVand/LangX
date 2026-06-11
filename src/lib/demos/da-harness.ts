/**
 * "The Toymaker" — the whole deep-agent harness, on one real job: turn a brief
 * into a tiny PLAYABLE browser game, built file-by-file in the virtual
 * filesystem, tested for real, and shipped only after the human approves.
 *
 * One createDeepAgent() call assembles everything this level teaches:
 *  • write_todos     — the agent externalizes its plan (watch the board fill)
 *  • virtual FS      — GAME.md spec, the game itself, the critic's notes
 *  • task            — designer + critic subagents work in their own contexts
 *  • test_game       — a REAL verify step: we load the build in a hidden,
 *                      sandboxed iframe and report runtime errors back
 *  • interruptOn     — publish_game pauses the run for your decision
 *  • compaction      — long builds shrink instead of overflowing
 *
 * This is the exact source the demo runs.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type InterruptibleResult,
	type HitlDecision,
	type DeepAgentStateType,
	type SubAgentSpec
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

const GAME_PATH = '/game/index.html';
const SPEC_PATH = '/design/GAME.md';
const NOTES_PATH = '/notes/critique.md';

// ── test_game: actually run the build ─────────────────────────────────────────
// Browser: load the game in an offscreen sandboxed iframe with an error probe
// injected FIRST (so window.onerror is armed before the game's own scripts run),
// wait a beat, and report what happened. Node (the downloaded source): static
// checks only — the honest fallback.

let probeSeq = 0;
function probeGame(html: string): Promise<string> {
	if (typeof document === 'undefined') {
		const problems: string[] = [];
		if (!/<canvas/i.test(html)) problems.push('no <canvas> element');
		if (!/<script/i.test(html)) problems.push('no <script> — nothing can run');
		if (/src\s*=\s*["']https?:/i.test(html)) problems.push('external resources are not allowed');
		return Promise.resolve(
			problems.length ? `PROBLEMS: ${problems.join('; ')}` : 'OK (static checks only — run in a browser for a live probe)'
		);
	}
	return new Promise((resolve) => {
		const id = `toymaker-${++probeSeq}`;
		const iframe = document.createElement('iframe');
		iframe.setAttribute('sandbox', 'allow-scripts');
		iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:360px;';
		const probe =
			`<script>window.__errs=[];window.onerror=function(m,s,l){window.__errs.push(String(m)+' (line '+l+')');};` +
			`window.addEventListener('load',function(){setTimeout(function(){parent.postMessage({type:'${id}',` +
			`errors:window.__errs,canvas:!!document.querySelector('canvas'),hasBody:!!(document.body&&document.body.children.length)},'*');},700);});<` +
			`/script>`;
		let timer: ReturnType<typeof setTimeout>;
		const done = (report: string) => {
			clearTimeout(timer);
			window.removeEventListener('message', onMsg);
			iframe.remove();
			resolve(report);
		};
		const onMsg = (e: MessageEvent) => {
			const d = e.data as { type?: string; errors?: string[]; canvas?: boolean; hasBody?: boolean };
			if (d?.type !== id) return;
			if (d.errors?.length) done(`RUNTIME ERRORS:\n- ${d.errors.join('\n- ')}\nFix these and test again.`);
			else if (!d.canvas) done('Loaded without errors, but there is NO <canvas> — the game has no screen.');
			else if (!d.hasBody) done('Loaded, but <body> is empty — nothing rendered.');
			else done('OK — loaded clean: no runtime errors, canvas present, content rendered.');
		};
		window.addEventListener('message', onMsg);
		timer = setTimeout(
			() => done('TIMEOUT — the page never finished loading (likely an infinite loop before window load).'),
			5000
		);
		iframe.srcdoc = probe + html;
		document.body.appendChild(iframe);
	});
}

// ── The harness build ─────────────────────────────────────────────────────────

export interface ToymakerHooks {
	onTrace?: (events: TraceEvent[]) => void;
	onState?: (state: DeepAgentStateType) => void;
	onTest?: (report: string) => void;
}

export interface Toymaker {
	agent: CompiledDeepAgent;
	/** Run a brief to completion or the publish gate. */
	start(brief: string): Promise<InterruptibleResult>;
	/** Answer the publish gate (approve / reject / edit / respond). */
	resume(decision: HitlDecision): Promise<InterruptibleResult>;
	/** The current build, straight from the virtual filesystem. */
	gameHtml(): Promise<string | null>;
	readFile(path: string): Promise<string | null>;
	finalText(state: DeepAgentStateType): string;
	published(): boolean;
}

const SYSTEM_PROMPT = `You are the Toymaker — a tiny game studio in a single agent.
Given a brief, build a small playable browser game, end to end:

1. write_todos — plan the build first (4–6 concrete steps).
2. task the **designer** for a one-page spec; it writes ${SPEC_PATH}. Read it.
3. Write ONE self-contained file, ${GAME_PATH}, in a SINGLE write_file call: an HTML
   page with a <canvas> game (about 480×360). Inline ALL CSS and JS. No external
   resources. Prefer SIMPLE, defensive code — plain functions, one
   requestAnimationFrame loop, ~120 lines of JS. Simple and working beats clever
   and broken.
4. test_game after EVERY change to ${GAME_PATH}. On errors: read_file your code,
   fix the exact line with edit_file, test again. If it is still broken after two
   fixes, REWRITE the whole file from scratch, simpler.
5. task the **critic** once the game runs clean; it writes ${NOTES_PATH}. Apply its
   single most valuable suggestion, then test_game again.
6. publish_game — ship it. (A human reviews this step.)

PLAN DISCIPLINE — after finishing EACH step, your next tool call is write_todos
with the FULL updated list: the finished step completed, the next one in_progress.
The human is watching the plan board; a stale board is a failed job.

GAMEPLAY CHECKLIST — the game must genuinely work, not merely load:
- Collision is rectangle overlap, tested every frame (catching/hitting MUST score).
- Lives/health stop at 0 → a Game Over state that freezes play and shows the score.
- The restart key fully resets score, lives, positions, and timers.
- Things spawn on a steady timer; speeds are beatable; the player stays on-canvas.
- Controls: arrow keys AND mouse-follow both work. The canvas shows score + lives.

THE GATE — if the human rejects publish_game or replies with feedback, that is a
CHANGE REQUEST, not the end: update the plan, change the game accordingly,
test_game, then call publish_game again.`;

export async function buildToymaker(hooks: ToymakerHooks = {}): Promise<Toymaker> {
	const events: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		events.push(ev);
		hooks.onTrace?.([...events]);
	});

	const backend = new StateBackend();
	// The engineer writes whole files in single tool calls — give it room (a
	// truncated write_file is a guaranteed syntax error and a wasted fix loop).
	const engineer = await getModel({ maxTokens: 6000, reasoningEffort: 'medium', temperature: 0.4 });
	const helper = await getModel({ maxTokens: 900, reasoningEffort: 'low' });
	let isPublished = false;

	const textOf = (r: { content?: unknown }) => displayContent(r?.content as never) ?? '';

	// Subagents are real model calls with their OWN context — the parent only
	// ever sees their one-line summary; their full output goes to the filesystem.
	const subagents: SubAgentSpec[] = [
		{
			name: 'designer',
			description: 'Writes a one-page game spec to /design/GAME.md from a brief.',
			prompt: 'game designer',
			async run({ description }) {
				const spec = textOf(
					await helper.invoke(
						`You are a game designer. Brief: ${description}\n` +
							`Write a ONE-PAGE spec in markdown for a tiny canvas game (≈480×360): concept in one ` +
							`sentence, player controls, win/lose rules, scoring, and a 3-color palette. ` +
							`Keep it buildable in ~150 lines of JavaScript. No code — just the spec.`
					)
				);
				await backend.write(SPEC_PATH, spec);
				return {
					summary: `Spec written to ${SPEC_PATH}: ${spec.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 90) ?? 'done'}`
				};
			}
		},
		{
			name: 'critic',
			description: 'Reviews the built game; writes /notes/critique.md with one key improvement.',
			prompt: 'game critic',
			async run({ description }) {
				const code = (await backend.read(GAME_PATH)) ?? '(missing)';
				const notes = textOf(
					await helper.invoke(
						`You are a sharp game critic and QA reviewer. Context from the lead: ${description}\n\nThe game source:\n${code.slice(0, 7000)}\n\n` +
							`FIRST check the mechanics in the code: does collision actually award points? do lives ` +
							`stop at 0 with a real game-over (no negative lives)? does restart reset everything? ` +
							`If ANY mechanic is broken, that is your improvement — say exactly where and how to fix it. ` +
							`Otherwise: 2 things that work, then your SINGLE most valuable improvement (feel, ` +
							`feedback, or fairness — implementable in a few lines). Write it as a short markdown note.`
					)
				);
				await backend.write(NOTES_PATH, notes);
				return {
					summary: `Critique in ${NOTES_PATH}: ${notes.split('\n').filter((l) => l.trim()).pop()?.slice(0, 90) ?? 'done'}`
				};
			}
		}
	];

	const testGame = tool(
		async () => {
			const html = await backend.read(GAME_PATH);
			if (!html) return `There is no ${GAME_PATH} yet — write it first.`;
			const report = await probeGame(html);
			hooks.onTest?.(report);
			tracer.emit('note', `test_game → ${report.split('\n')[0]}`);
			return report;
		},
		{
			name: 'test_game',
			description: `Load ${GAME_PATH} in a real sandboxed browser frame and report runtime errors, missing canvas, or a clean pass. Run after every change.`,
			schema: z.object({})
		}
	);

	const publishGame = tool(
		async () => {
			isPublished = true;
			return 'Published! The game is live in the player panel.';
		},
		{
			name: 'publish_game',
			description: 'Ship the finished game to the player. Requires human approval.',
			schema: z.object({})
		}
	);

	// ── One factory call. This is the harness. ──────────────────────────────
	const agent = createDeepAgent({
		model: engineer,
		systemPrompt: SYSTEM_PROMPT,
		backend,
		subagents,
		tools: [testGame, publishGame],
		interruptOn: ['publish_game'],
		compaction: { maxTokens: 24000, evictThresholdPct: 60, summarizeThresholdPct: 85 },
		tracer,
		maxIterations: 90
	});
	agent.subscribe((s) => hooks.onState?.(s));

	const thread = `toymaker-${Math.random().toString(36).slice(2, 8)}`;

	// Completion check — the same idea as the official completion-callback
	// middleware: if the agent stops without reaching the deliverable (here:
	// the publish gate), send ONE nudge turn on the same thread instead of
	// accepting the early finish.
	async function startWithNudge(input: string): Promise<InterruptibleResult> {
		const res = await agent.start({ input, thread });
		if (res.status === 'done' && !isPublished && (await backend.read(GAME_PATH))) {
			tracer.emit('note', 'completion check: not published — nudging');
			return agent.start({
				input: 'You stopped before publishing. If the game passes test_game, call publish_game now; otherwise fix it first.',
				thread
			});
		}
		return res;
	}

	return {
		agent,
		start: (brief) => startWithNudge(`Build this game: ${brief}`),
		resume: (decision) => agent.resume({ decisions: [decision] }, thread),
		gameHtml: () => backend.read(GAME_PATH),
		readFile: (path) => backend.read(path),
		finalText: (state) =>
			displayContent((state.messages[state.messages.length - 1] as { content?: unknown })?.content as never) ?? '',
		published: () => isPublished
	};
}
