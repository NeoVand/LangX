<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import TroupeStage, { type StationStatus } from '$lib/components/TroupeStage.svelte';
	import PianoRoll from '$lib/components/PianoRoll.svelte';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import type { BaseMessage } from '@langchain/core/messages';
	import type {
		VirtualFile,
		AsyncTaskRecord,
		SubAgentReport,
		DeepAgentStateType
	} from '$lib/deepagents';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		buildTroupe,
		parseMovement,
		COMMISSIONS,
		PATRON_TURNS,
		type TroupeHandle
	} from '$lib/demos/da-subagents';
	import { SCALES, type ScoreNote, type DrumHit, type Movement, type Mood } from '$lib/demos/music';
	import { createTroupePlayer, type TroupePlayer } from '$lib/demos/troupe-audio';
	import troupeSrc from '$lib/demos/da-subagents.ts?raw';
	import musicSrc from '$lib/demos/music.ts?raw';
	import subagentsSkill from '$lib/demos/skills/deepagents-subagents.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Play, Square } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'da-subagents',
		title: 'Subagents — The Clockwork Troupe',
		summary:
			'A mechanical band run as a deep agent: the Maestro dispatches three wright subagents in ONE message (parallel, each owning only its instrument’s tool), assembles their parts into a playable movement, then launches an async Arranger that composes a second movement in the background — checkable, steerable mid-flight, cancellable.',
		entries: [
			{ path: 'lib/demos/da-subagents.ts', code: troupeSrc },
			{ path: 'lib/demos/music.ts', code: musicSrc }
		],
		runner: `import { buildTroupe, COMMISSIONS, PATRON_TURNS } from './lib/demos/da-subagents';

const troupe = await buildTroupe();
troupe.tracer.subscribe((ev) => {
	if (ev.kind === 'subagent_spawn') console.log('  ⚙ spawn →', ev.label);
	if (ev.kind === 'subagent_return') console.log('  ✓ return ←', ev.label);
});

console.log(await troupe.send(COMMISSIONS[0]));

// the Arranger keeps composing in the background while we wait…
await new Promise((r) => setTimeout(r, 45_000));
console.log(await troupe.send(PATRON_TURNS.check));
console.log('\\nSCORE:', (await troupe.backend.read('/score/movement-2.json')) ? 'two movements' : 'one movement');`,
		skill: subagentsSkill
	};

	// ── Run state ─────────────────────────────────────────────────────────────
	let busy = $state(false);
	let started = $state(false);
	let error = $state('');
	let commission = $state(COMMISSIONS[0]);
	let steerText = $state('brighter, please — and add a bell line on top');

	let troupe: TroupeHandle | null = null;
	let msgs = $state<BaseMessage[]>([]);
	let files = $state<VirtualFile[]>([]);
	let asyncTasks = $state<AsyncTaskRecord[]>([]);
	let reports = $state<SubAgentReport[]>([]);
	let events = $state<TraceEvent[]>([]);
	let contextTokens = $state(0);

	function onState(s: DeepAgentStateType) {
		msgs = [...(s.messages as BaseMessage[])];
		files = [...s.files];
		asyncTasks = [...s.asyncTasks];
		reports = [...s.subagentReports];
		contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
	}

	async function ensureTroupe(): Promise<TroupeHandle> {
		if (!troupe) {
			troupe = await buildTroupe();
			troupe.agent.subscribe(onState);
			troupe.tracer.subscribe((ev) => {
				events = [...events, ev];
			});
		}
		return troupe;
	}

	async function patron(text: string) {
		if (busy || !text.trim()) return;
		busy = true;
		error = '';
		try {
			const t = await ensureTroupe();
			started = true;
			await t.send(text.trim());
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function newCommission() {
		if (busy) return;
		stopPlayback();
		troupe = null;
		started = false;
		msgs = [];
		files = [];
		asyncTasks = [];
		reports = [];
		events = [];
		contextTokens = 0;
		error = '';
	}

	// ── The score, read straight off the shared filesystem ───────────────────
	function partNotes(movement: number, part: string): ScoreNote[] {
		const f = files.find((x) => x.path === `/score/m${movement}/${part}.json`);
		if (!f) return [];
		try {
			return (JSON.parse(f.content) as { notes?: ScoreNote[] }).notes ?? [];
		} catch {
			return [];
		}
	}
	function partDrums(movement: number): DrumHit[] {
		const f = files.find((x) => x.path === `/score/m${movement}/drums.json`);
		if (!f) return [];
		try {
			return (JSON.parse(f.content) as { hits?: DrumHit[] }).hits ?? [];
		} catch {
			return [];
		}
	}

	const keyInfo = $derived.by((): { mood: Mood; title: string } | null => {
		const f = files.find((x) => x.path === '/score/key.json');
		if (!f) return null;
		try {
			return JSON.parse(f.content) as { mood: Mood; title: string };
		} catch {
			return null;
		}
	});

	const movement1 = $derived(
		parseMovement(files.find((f) => f.path === '/score/movement-1.json')?.content ?? null)
	);
	const movement2 = $derived(
		parseMovement(files.find((f) => f.path === '/score/movement-2.json')?.content ?? null)
	);

	const arrangerTask = $derived(asyncTasks.length ? asyncTasks[asyncTasks.length - 1] : null);

	// ── The stage: who is doing what, derived from the live trace ────────────
	const stations = $derived.by((): Record<string, StationStatus> => {
		const s: Record<string, StationStatus> = {
			maestro: busy
				? { state: 'working', note: 'conducting…' }
				: started
					? { state: 'done', note: 'at ease' }
					: { state: 'idle' },
			'melody-wright': { state: 'idle' },
			'bass-wright': { state: 'idle' },
			'drum-wright': { state: 'idle' },
			arranger: { state: 'idle' }
		};
		for (const ev of events) {
			const agent = (ev.data?.agent ?? ev.data?.name) as string | undefined;
			if (!agent || !(agent in s) || agent === 'maestro') continue;
			if (ev.kind === 'subagent_spawn') {
				s[agent] = { state: 'working', note: 'reading the brief…' };
			} else if (ev.kind === 'tool_call') {
				s[agent] = { state: 'working', note: ev.label.split('→')[1]?.trim() ?? 'working' };
			} else if (ev.kind === 'subagent_return') {
				const steps = ev.data?.steps as number | undefined;
				s[agent] = { state: 'done', note: steps ? `reported · ${steps} rounds` : 'reported' };
			} else if (ev.kind === 'error') {
				s[agent] = { state: 'error', note: 'jammed' };
			}
		}
		// The Arranger's truth is the task ledger, not stale messages.
		const a = arrangerTask;
		if (a) {
			s.arranger =
				a.status === 'running'
					? {
							state: 'working',
							note: `${a.toolCalls} tool calls${a.updates.length ? ` · steered ${a.updates.length}×` : ''}`
						}
					: a.status === 'done'
						? { state: 'done', note: 'movement delivered' }
						: a.status === 'cancelled'
							? { state: 'cancelled', note: 'stood down' }
							: { state: 'error', note: 'jammed' };
		}
		return s;
	});

	const phaseLabel = $derived(
		!started && !busy
			? 'the stage is set — commission a piece'
			: busy
				? 'the troupe is at work…'
				: movement2
					? 'the full suite is ready — play it'
					: arrangerTask?.status === 'running'
						? 'movement 1 is ready — the Arranger still composes in the back room'
						: movement1
							? 'movement 1 is ready to play'
							: 'awaiting the troupe'
	);

	// ── Playback ──────────────────────────────────────────────────────────────
	let player: TroupePlayer | null = null;
	let playing = $state(false);
	let playhead = $state<{ roll: 1 | 2; step: number } | null>(null);

	function play(which: 'm1' | 'm2' | 'suite') {
		const movements = (
			which === 'm1' ? [movement1] : which === 'm2' ? [movement2] : [movement1, movement2]
		).filter(Boolean) as Movement[];
		if (!movements.length) return;
		if (!player) player = createTroupePlayer();
		playing = true;
		const base = which === 'm2' ? 2 : 1;
		player.play(movements, (pos) => {
			if (!pos) {
				playing = false;
				playhead = null;
				return;
			}
			playhead = { roll: (base + pos.movement) as 1 | 2, step: pos.step };
		});
	}

	function stopPlayback() {
		player?.stop();
		playing = false;
		playhead = null;
	}

	// ── Code blocks ───────────────────────────────────────────────────────────
	const castCode = `const wrights: SubAgentSpec[] = [
  {
    name: 'melody-wright',
    description: 'Composes the lead melody line for one movement.',
    systemPrompt: MELODY_PROMPT, // its OWN prompt — NEVER inherited
    tools: [composeMelody],      // REPLACES inherited tools entirely
    model: hotterModel           // optional — inherits the parent's otherwise
  },
  /* bass-wright → [composeBass] · drum-wright → [composeDrums] */
];

const maestro = createDeepAgent({
  model,
  systemPrompt: MAESTRO_PROMPT,
  tools: [setKey, assembleMovement], // the Maestro cannot compose a note
  subagents: wrights,                // ← adds the task tool (+ general-purpose)
  asyncSubagents: [arranger]         // ← adds the five async-task tools
});`;

	const fanoutCode = `// ONE assistant message, THREE task calls → the wrights overlap:
task({ subagent_type: 'melody-wright', description: '"Clockwork Elise", A minor. Quote this theme
  faithfully, then answer it: E5 D#5 E5 D#5 E5 B4 D5 C5 A4 …' })
task({ subagent_type: 'bass-wright',   description: '…A minor, a music-box sway — anchor every downbeat…' })
task({ subagent_type: 'drum-wright',   description: '…soft clockwork ticking, sparse — a nocturne, not a march…' })

// Each child loops privately:
//   compose_melody → REJECTED (note 11: F# is not in A minor) → fix → ACCEPTED
// The parent's transcript gains exactly three lines:
ToolMessage(task): "The Elise theme stated and answered, settling home on A."
ToolMessage(task): "Roots swaying under every downbeat, a fifth before each turn."
ToolMessage(task): "A hushed tick — gentle kicks, brushed snares, almost no hats."`;

	const asyncCode = `start_async_task({ agent: 'arranger', description: 'A second movement for "Clockwork Elise"…' })
 → "Started background task task_01x7f3k2 — do NOT poll it immediately…"

// …movement 1 plays for the patron while the back room works…

check_async_task({ task_id: 'task_01x7f3k2' })  // statuses in old messages are STALE
 → "task_01x7f3k2 · status=running · 3 model rounds, 4 tool calls"

update_async_task({ task_id: 'task_01x7f3k2', message: 'Brighter — add a bell line.' })
 → the current run halts at its next checkpoint and RESTARTS with its full
   history + your note. Same task id, same thread, new orders.`;
</script>

<Lesson
	title="Subagents"
	eyebrow="Level 3 · Lesson 06 · The troupe"
	hero={{
		id: 'l3-subagents',
		alt: 'A conductor automaton on a mechanical stage, pneumatic tubes running to a troupe of musician automatons'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Everything so far made <em>one</em> agent stronger — better memory, better plans, better
		shelves. The <Term t="task"><code>task</code></Term> tool is different: it gives the agent
		<strong>colleagues</strong>. A <Term t="Subagent">subagent</Term> is a whole child agent with
		its own <Term t="Context window">context window</Term>, its own prompt, its own tools — and the
		parent only ever sees its final report.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is <strong>The Clockwork Troupe</strong>: commission a piece of music, and the
			Maestro dispatches three wright subagents <em>in one message</em> — they compose in parallel,
			each owning only its instrument's tool. Their parts land on the shared filesystem, the
			movement assembles, and it <strong>plays</strong>. Then the async act: an Arranger composes a
			second movement in the back room while you listen to the first — check on it, steer it
			mid-flight, or cancel it.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why delegate" title="A context window you can throw away" variant="dropcap">
			<p>
				Watch any real agent research something: forty tool calls, a dozen dead ends, three drafts
				— and one paragraph of conclusions. If all of that happens in the parent's
				<Term t="Context window">context</Term>, the parent pays for the dead ends forever; every
				later turn re-reads them, and <Term t="Context compaction">compaction</Term> eventually has
				to guess what mattered. Delegation is the cleaner cut: hand the job to a child agent,
				let it burn <em>its own</em> context on the mess, and take back one tidy
				<Term t="ToolMessage">ToolMessage</Term>. The docs are blunt about what crosses the
				boundary: the parent <em>"receives only the final result, not the dozens of tool calls
				that produced it."</em>
			</p>
			<p>
				That's the whole trick, and it's why <Term t="Subagent">subagents</Term> are a
				<em>context-management</em> feature before they're an architecture feature. In the demo
				you can read the receipts: each wright's report card counts the model rounds and tool
				calls — including every <code>REJECTED</code>-note retry — that collapsed into the one
				sentence the Maestro saw.
			</p>
		</Slide>

		<Slide title="The cast is config" variant="code-first">
			<p>
				A subagent is declared, not built: <code>name</code>, <code>description</code> (what the
				parent reads when choosing whom to dispatch), <code>systemPrompt</code>, and optional
				overrides. The parent gets one new tool —
				<Term t="task"><code>task(subagent_type, description)</code></Term> — and the harness runs
				the child to completion behind it:
			</p>
			<CodeBlock code={castCode} caption="The troupe, verbatim from the demo — three specialists and one back-room arranger." />
			<p>
				The inheritance rules are where production incidents hide, so here is the whole matrix:
			</p>
			<table class="matrix">
				<tbody>
					<tr><th><code>systemPrompt</code></th><td><strong>never inherited</strong> — every child states its own</td></tr>
					<tr><th><code>tools</code></th><td>inherits the parent's custom tools — but declaring any <strong>REPLACES the whole set</strong> (the melody-wright literally cannot <code>set_key</code>)</td></tr>
					<tr><th><code>model</code></th><td>inherits unless overridden — the wrights run a hotter temperature than the Maestro</td></tr>
					<tr><th><code>skills</code></th><td><strong>not inherited</strong> — only the general-purpose subagent gets the parent's skills</td></tr>
					<tr><th><code>permissions</code></th><td>inherits — declaring its own <strong>replaces</strong>, not merges (<a href="/3-deepagents/permissions">same edge as last lesson</a>)</td></tr>
					<tr><th>filesystem</th><td><strong>shared</strong> — children get their own filesystem tools over the same backend, which is how the parts reach the Maestro</td></tr>
				</tbody>
			</table>
			<p class="aside">
				Every deep agent also ships with an auto-added <strong>general-purpose</strong> subagent —
				it inherits the parent's tools <em>and</em> skills, and exists even with
				<code>subagents: []</code>. Declare your own spec named <code>general-purpose</code> to
				replace it. And for arbitrary workflows there's <code>CompiledSubAgent</code>: any
				compiled <Term t="StateGraph">LangGraph graph</Term> can stand behind a name.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-subagents-quarantine"
				alt="An infographic poster: the Maestro's open skull holds one large context vessel; below, three sealed bell jars each hold a small automaton with its own tiny vessel and only its own tools — one tube down carries a brief, one tube up carries a sealed report."
			/>
			<figcaption>
				One brief down, one report back. The jars don't connect to each other — and the parent
				never sees inside them.
			</figcaption>
		</figure>

		<Slide title="Parallel, but blocking" variant="code-first">
			<p>
				Synchronous delegation has a precise shape: when the model emits <em>several</em>
				<code>task</code> calls in a single message, the harness starts them all before awaiting
				any — the children genuinely overlap, like the three wrights lighting up at once on the
				stage. But the supervisor <em>blocks</em>: the parent's turn cannot continue until every
				dispatched child has reported. Parallel work, sequential conversation.
			</p>
			<CodeBlock code={fanoutCode} caption="The fan-out turn, as the parent's transcript records it." />
			<p>
				Notice what the transcript <em>doesn't</em> contain: the melody-wright's rejected B♮, the
				drum-wright's missing downbeat, any of the retries. Those cost tokens — in the
				<em>children's</em> windows. The discipline this buys has a price, though: the brief must
				be <strong>self-contained</strong> (the child can't see the conversation, so "like we
				discussed" means nothing), and the report is all that comes back. Delegation is a
				telephone game by design — say exactly what you need, expect exactly one answer.
			</p>
		</Slide>

		<Slide title="The async wing" variant="code-first">
			<p>
				Blocking is wrong for genuinely long work. Declare a subagent under
				<code>asyncSubagents</code> instead and the parent gets five new tools —
				<code>start_async_task</code>, <code>check_async_task</code>,
				<code>update_async_task</code>, <code>cancel_async_task</code>,
				<code>list_async_tasks</code> — and a different contract:
				<Term t="start_async_task"><code>start</code></Term> returns a task id
				<em>immediately</em>, the child runs on its own thread, and the conversation moves on.
				Officially the child lives on an Agent Protocol server (LangSmith deployment or
				self-hosted); in this browser harness the "server" is a background run in the same tab —
				same five tools, same lifecycle.
			</p>
			<CodeBlock code={asyncCode} caption="The async lifecycle — launch, listen, check, steer." />
			<p>
				The subtle masterpiece is <strong>steering</strong>: <code>update_async_task</code> doesn't
				append a note to a queue — it <em>interrupts</em> the running child and restarts it with
				its full history plus your new instructions, under the same task id. Try it live: tell the
				Arranger mid-movement to go brighter and add bells, and watch a bells lane appear in a
				score that was already half-written.
			</p>
			<p class="aside">
				Three field notes baked into the demo's prompts, straight from the docs: <strong>don't
				poll right after starting</strong> (return to the user; check when asked); <strong>never
				truncate task ids</strong> (models love to); and <strong>statuses quoted in old messages
				are always stale</strong> — the only truth is a fresh <code>check</code>. And the ledger
				itself lives in a dedicated <code>asyncTasks</code> state channel rather than in messages,
				for one reason: <Term t="Context compaction">compaction</Term> can evict any message, and
				a task id that lived only in a ToolMessage would orphan the running work.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-subagents-async"
				alt="An infographic poster: a brass dispatch board of punched task cards with status seals, five labeled controls — start, check, update, cancel, list — and an automaton still composing in a side chamber while the main stage plays."
			/>
			<figcaption>
				The dispatch board: five verbs, full ids, live statuses — and a task ledger that survives
				compaction.
			</figcaption>
		</figure>

		<Slide title="Sync or async?" variant="dropcap">
			<p>
				<strong>Sync <code>task</code></strong> when the parent needs the answer to take its next
				step — research this, then write that. It's parallel across siblings but blocks the turn,
				and a sync child is fire-and-forget: no peeking, no steering, no cancelling.
				<strong>Async</strong> when the work is long, the parent should stay responsive, or you
				want mid-flight control — monitoring, steering, cancellation, state that persists across
				patron turns. The Troupe uses both in one performance: the wrights are sync (the Maestro
				cannot assemble until all three deliver), the Arranger is async (nobody waits for a second
				movement to enjoy the first).
			</p>
			<p>
				And sometimes: <strong>neither</strong>. A subagent costs latency (a whole child loop), a
				lossy interface (brief down, report up), and tokens. Don't delegate a one-tool errand the
				parent could run itself — delegate when the work would <em>pollute</em> the parent's
				context, when specialists need different tools or prompts, or when parallelism actually
				buys wall-clock time.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>The parent never sees inside the jar. That's not the limitation — that's the feature.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Subagents — specs, inheritance, general-purpose',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/subagents',
					kind: 'docs'
				},
				{
					label: 'Async subagents — the five tools & Agent Protocol',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/async-subagents',
					kind: 'docs'
				},
				{
					label: 'Event streaming — per-subagent projections for live UIs',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/event-streaming',
					kind: 'docs'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="one maestro, three parallel wrights, one background arranger">
			<ol class="howto">
				<li>
					<strong>Commission a piece.</strong> The Maestro sets the key, then dispatches all three
					wrights in a single message — watch them light up <em>together</em>, each lane of the
					score filling as its wright delivers.
				</li>
				<li>
					<strong>Press play.</strong> The assembled movement performs in the browser — while the
					async Arranger keeps composing a second movement in the back room.
				</li>
				<li>
					<strong>Run the back room.</strong> Check on the Arranger (live status, never stale),
					steer it mid-flight — bells appear in a half-written score — or cancel it. When it
					reports, ask again and the Maestro docks movement 2. Then play the suite.
				</li>
			</ol>
		</Panel>

		<Panel title="The commission" subtitle={phaseLabel}>
			<div class="presets">
				{#each COMMISSIONS as c (c)}
					<button class="preset" class:on={commission === c} onclick={() => (commission = c)} disabled={busy}>
						{c}
					</button>
				{/each}
			</div>
			<textarea rows="2" bind:value={commission} disabled={busy} placeholder="Commission the troupe…"></textarea>
			{#if !started}
				<RunButton onclick={() => patron(commission)} running={busy} label="Commission the troupe" />
			{:else}
				<div class="rowbtns">
					<RunButton onclick={() => patron(commission)} running={busy} label="Commission another (same evening)" />
					<button class="ghost" onclick={newCommission} disabled={busy}>Strike the stage (reset)</button>
				</div>
			{/if}
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		<Panel title="The stage" subtitle="every automaton is a real subagent — lights mean live model rounds">
			<TroupeStage status={stations} />
		</Panel>

		{#if msgs.length}
			<Panel title="The performance log" subtitle="the Maestro's transcript — note what it does NOT contain">
				{#snippet actions()}
					<span class="meter" title="estimated tokens currently in the Maestro's context">
						ctx ≈ {contextTokens.toLocaleString()} tok
					</span>
				{/snippet}
				<AgentFeed messages={msgs} />
			</Panel>
		{/if}

		{#if reports.length}
			<Panel title="Report cards" subtitle="what each child's whole working life collapsed into">
				<ul class="reports">
					{#each reports as r, i (i)}
						<li>
							<span class="who">{r.name}</span>
							<span class="cost">{r.steps ?? '?'} rounds · {r.toolCalls ?? '?'} tool calls · {(r.durationMs / 1000).toFixed(1)}s</span>
							<span class="said">“{r.summary}”</span>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		{#if started}
			<Panel
				title="The score"
				subtitle={keyInfo
					? `“${keyInfo.title}” — ${SCALES[keyInfo.mood].label} · parts appear as the wrights deliver`
					: 'parts appear here as the wrights deliver'}
			>
				{#snippet actions()}
					<div class="playbtns">
						<button class="playbtn" onclick={() => play('m1')} disabled={!movement1 || playing} title="Play movement 1">
							<Play size={13} /> I
						</button>
						<button class="playbtn" onclick={() => play('m2')} disabled={!movement2 || playing} title="Play movement 2">
							<Play size={13} /> II
						</button>
						<button class="playbtn" onclick={() => play('suite')} disabled={!movement1 || !movement2 || playing} title="Play both movements">
							<Play size={13} /> suite
						</button>
						<button class="playbtn stop" onclick={stopPlayback} disabled={!playing} title="Stop">
							<Square size={13} />
						</button>
					</div>
				{/snippet}
				<div class="rolls">
					<PianoRoll
						label={`Movement 1 — three sync wrights, in parallel${movement1 ? '' : ' (assembling…)'}`}
						melody={partNotes(1, 'melody')}
						bass={partNotes(1, 'bass')}
						bells={partNotes(1, 'bells')}
						drums={partDrums(1)}
						playhead={playhead?.roll === 1 ? playhead.step : null}
					/>
					<PianoRoll
						label={`Movement 2 — the async Arranger${movement2 ? '' : arrangerTask?.status === 'running' ? ' (composing in the background…)' : ''}`}
						melody={partNotes(2, 'melody')}
						bass={partNotes(2, 'bass')}
						bells={partNotes(2, 'bells')}
						drums={partDrums(2)}
						playhead={playhead?.roll === 2 ? playhead.step : null}
					/>
				</div>
			</Panel>

			<Panel title="The dispatch board" subtitle="the asyncTasks ledger — live, and it survives compaction">
				{#if asyncTasks.length}
					<ul class="board">
						{#each asyncTasks as t (t.id)}
							<li>
								<div class="card-head">
									<code class="tid">{t.id}</code>
									<span class="seal {t.status}">{t.status.toUpperCase()}</span>
								</div>
								<div class="card-meta">
									agent <strong>{t.agent}</strong> · {t.steps} rounds · {t.toolCalls} tool calls
								</div>
								{#each t.updates as u, i (i)}
									<div class="steered">⟿ steered: “{u}”</div>
								{/each}
								{#if t.status === 'done' && t.result}
									<div class="result">“{t.result}”</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hint">No background tasks yet — the Maestro launches the Arranger after movement 1 assembles.</p>
				{/if}
				<div class="patron">
					<button class="ghost" onclick={() => patron(PATRON_TURNS.check)} disabled={busy || !arrangerTask}>
						Ask for a progress check
					</button>
					<button class="ghost" onclick={() => patron(PATRON_TURNS.cancel)} disabled={busy || arrangerTask?.status !== 'running'}>
						Cancel the arranger
					</button>
				</div>
				<div class="steer">
					<input
						type="text"
						bind:value={steerText}
						disabled={busy}
						placeholder="new instructions for the arranger…"
					/>
					<button
						class="ghost"
						onclick={() => patron(`Send word to the Arranger mid-flight: ${steerText}`)}
						disabled={busy || arrangerTask?.status !== 'running' || !steerText.trim()}
					>
						Steer mid-flight
					</button>
				</div>
				<p class="hint">
					These buttons just send patron turns — the <em>Maestro</em> decides to call
					check / update / cancel_async_task. Steering interrupts the Arranger and restarts it
					with its history plus your note, same task id.
				</p>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 1.8rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}
	.aside {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
	}

	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
		margin: 0.4rem 0 0.9rem;
	}
	.matrix th {
		text-align: left;
		white-space: nowrap;
		padding: 0.35rem 0.8rem 0.35rem 0;
		color: var(--color-fg-muted);
		font-weight: 600;
		vertical-align: top;
	}
	.matrix td {
		padding: 0.35rem 0;
		color: var(--color-fg-muted);
		border-bottom: 1px solid color-mix(in oklch, var(--color-rule) 45%, transparent);
	}
	.matrix tr th {
		border-bottom: 1px solid color-mix(in oklch, var(--color-rule) 45%, transparent);
	}

	.howto {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.howto strong {
		color: var(--color-fg);
	}

	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.55rem;
	}
	.preset {
		font: inherit;
		font-size: 0.74rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-paper);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.preset:hover:not(:disabled) {
		border-color: var(--color-border-strong);
	}
	.preset.on {
		border-color: var(--accent-rule);
		color: var(--accent-ink);
	}
	textarea,
	.steer input {
		width: 100%;
		font: inherit;
		font-size: 0.85rem;
		color: var(--color-fg);
		background: var(--color-paper);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.65rem;
		resize: vertical;
		margin-bottom: 0.65rem;
	}
	textarea:focus,
	.steer input:focus {
		outline: none;
		border-color: var(--accent-rule);
	}

	.rowbtns {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.ghost {
		font: inherit;
		font-size: 0.78rem;
		padding: 0.42rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.ghost:hover:not(:disabled) {
		border-color: var(--color-border-strong);
		color: var(--color-fg);
	}
	.ghost:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.err {
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--color-accent-danger);
	}
	.hint {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin: 0.5rem 0 0;
	}
	.meter {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
	}

	.reports {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.reports li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.7rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-paper);
		font-size: 0.8rem;
	}
	.reports .who {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-ink);
	}
	.reports .cost {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		text-align: right;
	}
	.reports .said {
		grid-column: 1 / -1;
		color: var(--color-fg-muted);
		font-style: italic;
	}

	.rolls {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.playbtns {
		display: flex;
		gap: 0.35rem;
	}
	.playbtn {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		font: inherit;
		font-size: 0.72rem;
		padding: 0.26rem 0.55rem;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-paper);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.playbtn:hover:not(:disabled) {
		border-color: var(--accent-rule);
		color: var(--accent-ink);
	}
	.playbtn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.board {
		list-style: none;
		margin: 0 0 0.7rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.board li {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-paper);
		padding: 0.5rem 0.65rem;
		font-size: 0.78rem;
	}
	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.tid {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg);
	}
	.seal {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--color-border-strong);
		color: var(--color-fg-muted);
	}
	.seal.running {
		border-color: var(--accent-rule);
		color: var(--accent-ink);
	}
	.seal.done {
		border-color: color-mix(in oklch, var(--color-accent-success) 50%, transparent);
		color: var(--color-accent-success);
	}
	.seal.cancelled,
	.seal.error {
		border-color: color-mix(in oklch, var(--color-accent-danger) 50%, transparent);
		color: var(--color-accent-danger);
	}
	.card-meta {
		margin-top: 0.2rem;
		color: var(--color-fg-faint);
		font-size: 0.72rem;
	}
	.steered {
		margin-top: 0.25rem;
		color: var(--accent-ink);
		font-size: 0.74rem;
	}
	.result {
		margin-top: 0.3rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}

	.patron {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin-bottom: 0.55rem;
	}
	.steer {
		display: flex;
		gap: 0.45rem;
		align-items: stretch;
	}
	.steer input {
		flex: 1;
		margin-bottom: 0;
	}
	.steer .ghost {
		white-space: nowrap;
	}
</style>
