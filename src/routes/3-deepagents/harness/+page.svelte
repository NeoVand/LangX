<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import type { BaseMessage } from '@langchain/core/messages';
	import { buildToymaker, type Toymaker } from '$lib/demos/da-harness';
	import type { Todo, VirtualFile, HitlDecision, DeepAgentStateType } from '$lib/deepagents';
	import harnessSrc from '$lib/demos/da-harness.ts?raw';
	import harnessSkill from '$lib/demos/skills/deepagents-harness.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Gamepad2, Check, X as XIcon, MessageCircle } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'da-harness',
		title: 'The harness — The Toymaker',
		summary:
			"The whole deep-agent harness on one real job: a brief becomes a playable browser game — planned with write_todos, built file-by-file in the virtual filesystem, spec'd and reviewed by subagents, tested in a real sandboxed frame, and shipped only after human approval.",
		entries: [{ path: 'lib/demos/da-harness.ts', code: harnessSrc }],
		runner: `import { buildToymaker } from './lib/demos/da-harness';

const toymaker = await buildToymaker({
  onTrace: (events) => {
    const last = events[events.length - 1];
    console.log(' ', last.kind.padEnd(16), last.label ?? '');
  }
});

let res = await toymaker.start('catch the falling acorns before they hit the ground');
while (res.status === 'interrupted') {
  console.log('\\n⏸ paused at', res.interrupt.tool, '— approving');
  res = await toymaker.resume({ type: 'approve' });
}
console.log('\\n' + toymaker.finalText(res.state));
console.log('\\nThe game itself:\\n', (await toymaker.gameHtml())?.slice(0, 400), '…');`,
		skill: harnessSkill
	};

	// ── Run state ─────────────────────────────────────────────────────────────────
	type Phase = 'idle' | 'building' | 'gate' | 'done' | 'error';
	let phase = $state<Phase>('idle');
	let busy = $state(false);
	let error = $state('');
	let brief = $state('catch the falling acorns before they hit the ground');

	let toymaker: Toymaker | null = null;
	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let testReport = $state('');
	let contextTokens = $state(0);
	let compactions = $state(0);
	let gameHtml = $state('');
	let finalWord = $state('');
	let gateNote = $state('');
	let shipped = $state(false);

	const phaseLabel = $derived(
		phase === 'idle'
			? 'one brief in — a playable game out'
			: phase === 'building'
				? 'the studio is at work — watch every panel'
				: phase === 'gate'
					? 'PAUSED — the agent wants to publish. Your call.'
					: phase === 'done'
						? 'shipped — the game is playable below'
						: 'something broke (see below)'
	);
	const testTone = $derived(testReport.startsWith('OK') ? 'ok' : testReport ? 'bad' : '');

	const hooks = {
		onState: (s: DeepAgentStateType) => {
			todos = [...s.todos];
			files = [...s.files];
			msgs = [...(s.messages as BaseMessage[])];
			compactions = s.summarizationEvents.length;
			contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
		},
		onTest: (r: string) => (testReport = r)
	};

	// Bring the moment that needs YOU (or the payoff) into view automatically.
	let gateEl = $state<HTMLElement | null>(null);
	let arcadeEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (phase === 'gate' && gateEl) gateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (phase === 'done' && arcadeEl) arcadeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	// ── Fit the game, whatever size the agent built it ───────────────────────────
	// Games come out at arbitrary sizes, so the frame measures the content (a probe
	// script posts the document's natural size) and scales it to fit — no cropping,
	// no scrollbars, still fully playable (pointer/keyboard map through transforms).
	const SIZE_PROBE =
		`<script>window.addEventListener('load',function(){setTimeout(function(){` +
		`var d=document.documentElement,b=document.body;` +
		`var w=Math.max(d.scrollWidth,b?b.scrollWidth:0),h=Math.max(d.scrollHeight,b?b.scrollHeight:0);` +
		`parent.postMessage({type:'toymaker-size',w:Math.ceil(w),h:Math.ceil(h)},'*');},200);});<` +
		`/script>`;
	let natural = $state({ w: 640, h: 480 });
	const gameDoc = $derived(gameHtml ? SIZE_PROBE + gameHtml : '');
	function onSizeMsg(e: MessageEvent) {
		const d = e.data as { type?: string; w?: number; h?: number };
		if (d?.type !== 'toymaker-size' || !d.w || !d.h) return;
		natural = { w: Math.min(Math.max(d.w, 320), 1600), h: Math.min(Math.max(d.h, 240), 1200) };
	}
	function fit(maxW: number, maxH: number) {
		const scale = Math.min(maxW / natural.w, maxH / natural.h, 1);
		return { scale, w: Math.round(natural.w * scale), h: Math.round(natural.h * scale) };
	}
	// The width budget is MEASURED from the panel, not assumed — a hardcoded
	// budget wider than the column reintroduces cropping.
	let availW = $state(0);
	const mainFit = $derived(fit(Math.max(availW - 2, 300), 470));
	const previewFit = $derived(fit(Math.min(Math.max(availW - 2, 300), 470), 350));

	async function commission() {
		if (busy || !brief.trim()) return;
		busy = true;
		phase = 'building';
		error = '';
		todos = [];
		files = [];
		msgs = [];
		testReport = '';
		gameHtml = '';
		finalWord = '';
		gateNote = '';
		shipped = false;
		natural = { w: 640, h: 480 };
		contextTokens = 0;
		compactions = 0;
		try {
			toymaker = await buildToymaker(hooks);
			const res = await toymaker.start(brief.trim());
			await settle(res);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function decide(decision: HitlDecision) {
		if (busy || !toymaker) return;
		busy = true;
		phase = 'building';
		try {
			const res = await toymaker.resume(decision);
			await settle(res);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function settle(res: Awaited<ReturnType<Toymaker['start']>>) {
		if (res.status === 'interrupted') {
			phase = 'gate';
			gameHtml = (await toymaker!.gameHtml()) ?? '';
			return;
		}
		finalWord = toymaker!.finalText(res.state);
		gameHtml = (await toymaker!.gameHtml()) ?? '';
		shipped = toymaker!.published();
		phase = 'done';
	}

	const starters = [
		'catch the falling acorns before they hit the ground',
		'a one-button helicopter flying through a cave',
		'whack-a-mole, but the moles are bugs in code'
	];

	const TODO_GLYPH: Record<Todo['status'], string> = {
		pending: '○',
		in_progress: '◐',
		completed: '●'
	};

	// ── Narrative code ────────────────────────────────────────────────────────────
	const factoryCode = `import { createDeepAgent } from 'deepagents'; // or 'deepagents/browser'

const agent = createDeepAgent({
  model: 'anthropic:claude-sonnet-4-6', // any tool-calling model
  systemPrompt: 'You are the Toymaker — a tiny game studio in one agent…',
  tools: [testGame, publishGame],       // your tools join the built-ins
  subagents: [designer, critic],        // each runs in its OWN context
  interruptOn: { publish_game: true },  // pause for a human before shipping
  checkpointer                          // pauses need somewhere to live
});

// what you get back is a LangGraph graph — invoke, stream, time-travel
const result = await agent.invoke({ messages: [user('Build this game: …')] });`;
	const promptCode = `// The system prompt is ASSEMBLED, not written — in this exact order:
//   1 · USER    your systemPrompt        ← outranks the harness's own
//   2 · BASE    the harness's operating manual
//   3 · SUFFIX  per-model tuning (harness profiles)
//
// And the BASE reads like a work ethic, not a persona:
//   "NEVER add unnecessary preamble. Don't say 'I'll now do X' — just do it."
//   "Your first attempt is rarely correct — iterate."
//   "Verify — check your work against what was asked, not your own output."`;
</script>

<Lesson
	title="The harness"
	eyebrow="Level 3 · Lesson 01 · The big picture"
	hero={{
		id: 'l3-harness',
		alt: 'A brass engine core held inside an exoskeleton harness of instruments — plan ledger, file drawers, docked mini-engines'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Deep Agent">deep agent</Term> is not a smarter model — it's an ordinary model wearing
		a well-designed <Term t="Harness">harness</Term>. This lesson shows you the whole machine at
		work; the rest of the level takes it apart, one strap at a time.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is a complete product: <strong>The Toymaker</strong>. Give it a one-line brief and
			watch one agent plan with <Term t="write_todos"><code>write_todos</code></Term>, build real
			files in a <Term t="Virtual filesystem">virtual filesystem</Term>, delegate to
			<Term t="Subagent">subagents</Term>, test its own build in a sandboxed frame, fix what broke,
			and pause for <em>your</em> approval before shipping — a playable game.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="What makes Claude Code feel different" variant="dropcap">
			<p>
				Use Claude Code — or any serious coding agent — and something feels categorically different
				from a chatbot with tools. It <em>plans</em>, and you can see the plan. It works in
				<em>files</em>, not in one giant reply. It hands research to helpers and keeps its own head
				clear. It <em>checks its work</em>. It asks before doing anything irreversible. And it can
				keep going for an hour without drowning in its own history.
			</p>
			<p>
				None of that is the model. The model is the same one behind the chatbot. The difference is
				the <Term t="Harness">harness</Term> — the equipment the model wears. LangChain's
				<strong>Deep Agents</strong> is that harness, open-sourced: in the team's own words,
				<em>"inspired by Claude Code — an attempt to identify what makes it general-purpose, and
				push that further."</em> The stack is layered: <Term t="LangGraph" /> is the runtime,
				<code>createAgent</code> is a minimal harness on top, and Deep Agents is the
				<strong>opinionated, batteries-included</strong> harness on top of that — same building
				blocks, with the filesystem, subagents, planning, and context management bundled in.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-harness-anatomy"
				alt="An infographic poster: a model core wearing the harness — plan board, file drawers, subagent engines, a test bench, a human gate, and a compaction bellows, each labeled."
			/>
			<figcaption>
				The anatomy: one model, six pieces of equipment. Each panel of the demo below is one of
				these — and each gets its own lesson in this level.
			</figcaption>
		</figure>

		<Slide title="One factory call" variant="code-first">
			<p>
				The entire machine assembles from a single function. Everything is a named option, every
				option has a sane default, and what comes back is a plain <Term t="LangGraph" /> graph —
				so everything Level 2 taught you (streaming, <Term t="Checkpoint">checkpoints</Term>,
				<Term t="Interrupt">interrupts</Term>, <Term t="Time travel">time travel</Term>) still
				applies, unchanged.
			</p>
			<CodeBlock code={factoryCode} caption="createDeepAgent — configure, don't reimplement." />
			<p class="aside">
				In this course the demos run a small <strong>glass-box harness</strong> we built in the
				browser (~1,200 lines you can download and read whole) that mirrors the official API. The
				real package runs in the browser too (<code>deepagents/browser</code>) — we use our own so
				every lesson can show you the gears turning, not because we have to.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-middleware-stack"
				alt="An infographic poster of the deep-agent middleware stack: thirteen layers in fixed order from TodoList down to HumanInTheLoop, with the user slot highlighted."
			/>
			<figcaption>
				Under the factory: a fixed stack of <Term t="Middleware">middleware</Term> layers —
				planning, skills, filesystem, subagents, summarization, caching, memory, approval — each
				adding tools and prompt guidance. Your custom middleware gets a reserved slot; the order
				never changes, so behavior stays predictable.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				The model brings the intelligence; the harness brings the work ethic — the plan, the
				files, the helpers, the tests, and the pause before anything irreversible.
			</p>
		</Slide>

		<Slide title="The prompt is assembled, not written" variant="code-first">
			<p>
				You don't write a deep agent's system prompt — you contribute <em>one section</em> of it.
				The harness composes yours with its own operating manual, and yours comes
				<strong>first</strong>: user instructions outrank the harness's.
			</p>
			<CodeBlock code={promptCode} caption="USER → BASE → SUFFIX. The base prompt is a work ethic." />
		</Slide>

		<Slide title="Watch for all six, then dissect them" ornament>
			<p>
				As the Toymaker runs, every pillar of this level fires at least once:
				<a href="/3-deepagents/todos">planning</a> fills the board,
				<a href="/3-deepagents/virtual-fs">the filesystem</a> grows file by file (with
				<a href="/3-deepagents/backends">backends</a> deciding where files actually live),
				<a href="/3-deepagents/subagents">subagents</a> file their reports,
				<a href="/3-deepagents/compaction">compaction</a> keeps the context from drowning, and
				<a href="/3-deepagents/permissions">permissions</a> plus
				<a href="/3-deepagents/hitl">the human gate</a> stand between the agent and anything
				irreversible — with <a href="/3-deepagents/skills">skills</a> waiting one lesson over. The
				two capstones then build a deep researcher and a data scientist from these same parts.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Deep Agents — overview & quickstart', href: 'https://docs.langchain.com/oss/javascript/deepagents/overview', kind: 'docs' },
				{ label: 'createDeepAgent — every option', href: 'https://docs.langchain.com/oss/javascript/deepagents/customization', kind: 'docs' },
				{ label: 'The harness capability map', href: 'https://docs.langchain.com/oss/javascript/deepagents/harness', kind: 'docs' },
				{ label: 'deepagents on GitHub (Python + JS)', href: 'https://github.com/langchain-ai/deepagents', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="the whole harness, one real job">
			<ol class="howto">
				<li><strong>Commission a game.</strong> One line is enough — the studio plans, designs, builds, tests, and fixes on its own.</li>
				<li><strong>Watch the cockpit.</strong> The plan board, the filesystem, the crew reports, the test bench and the trace are all live views of one agent working.</li>
				<li><strong>You hold the publish button.</strong> The run pauses before shipping — approve, reject with a note, or just answer it. Then play what it built.</li>
			</ol>
		</Panel>

		<Panel title="The commission" subtitle={phaseLabel}>
			<label class="prompt">
				<span>Brief the studio…</span>
				<input
					type="text"
					bind:value={brief}
					disabled={busy || phase === 'gate'}
					placeholder="a tiny game idea, one line"
					onkeydown={(e) => { if (e.key === 'Enter') commission(); }}
				/>
			</label>
			<div class="starters">
				{#each starters as s (s)}
					<button class="starter" onclick={() => { brief = s; commission(); }} disabled={busy || phase === 'gate'}>{s}</button>
				{/each}
			</div>
			<RunButton onclick={commission} running={busy && phase === 'building'} label={phase === 'done' ? 'Commission another' : 'Commission a game'} />
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if msgs.length}
			<Panel title="The studio floor" subtitle="the run itself — every word, tool call, and result, live">
				{#snippet actions()}
					<span class="meter" title="estimated tokens currently in the agent's context">
						ctx ≈ {contextTokens.toLocaleString()} tok{compactions ? ` · ${compactions} compaction${compactions === 1 ? '' : 's'}` : ''}
					</span>
				{/snippet}
				<AgentFeed messages={msgs} />
			</Panel>
		{/if}

		{#if todos.length}
			<Panel title="The plan board" subtitle="write_todos — the agent's plan, externalized">
				<ul class="todos">
					{#each todos as t, i (i)}
						<li class={t.status}><span class="glyph">{TODO_GLYPH[t.status]}</span>{t.content}</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		{#if files.length}
			<Panel title="The workshop" subtitle="the virtual filesystem — click a file to read it">
				<FileTreeViewer {files} title="" />
			</Panel>
		{/if}

		{#if testReport}
			<Panel title="The test bench" subtitle="test_game — the build, actually executed in a sandboxed frame">
				<pre class="test {testTone}">{testReport}</pre>
			</Panel>
		{/if}

		{#if phase === 'gate'}
			<div class="anchor" bind:this={gateEl}></div>
			<Panel title="The gate" subtitle="interruptOn: publish_game — the run is paused inside the graph">
				<p class="gate-ask">
					The Toymaker wants to <strong>publish the game</strong>. The whole run is checkpointed
					and waiting on your decision.
				</p>
				{#if gameHtml}
					<div class="gamewrap" bind:clientWidth={availW}>
						<div class="gamebox" style="width:{previewFit.w}px;height:{previewFit.h}px">
							<iframe
								srcdoc={gameDoc}
								sandbox="allow-scripts"
								title="Preview the unpublished game"
								style="width:{natural.w}px;height:{natural.h}px;transform:scale({previewFit.scale})"
							></iframe>
						</div>
					</div>
					<p class="gate-hint">Try it first — this is the unpublished build.</p>
				{/if}
				<label class="gate-note">
					<span>Optional note (used by reject / respond)…</span>
					<input type="text" bind:value={gateNote} placeholder="e.g. make the acorns a bit slower first" disabled={busy} />
				</label>
				<div class="gate-actions">
					<button class="ok" onclick={() => decide({ type: 'approve' })} disabled={busy}><Check size={14} /> Approve & ship</button>
					<button class="no" onclick={() => decide({ type: 'reject', message: gateNote || undefined })} disabled={busy}><XIcon size={14} /> Reject</button>
					<button class="talk" onclick={() => decide({ type: 'respond', message: gateNote || 'Tell me more about the game before we ship.' })} disabled={busy}><MessageCircle size={14} /> Respond instead</button>
				</div>
			</Panel>
		{/if}

		{#if phase === 'done' && gameHtml}
			<div class="anchor" bind:this={arcadeEl}></div>
			<Panel title="The arcade" subtitle={shipped ? 'published — playable, built by an agent in your browser' : 'final build'}>
				{#snippet actions()}
					<span class="badge"><Gamepad2 size={13} /> click the game first, then use the keys</span>
				{/snippet}
				<div class="gamewrap" bind:clientWidth={availW}>
					<div class="gamebox" style="width:{mainFit.w}px;height:{mainFit.h}px">
						<iframe
							srcdoc={gameDoc}
							sandbox="allow-scripts"
							title="The published game"
							style="width:{natural.w}px;height:{natural.h}px;transform:scale({mainFit.scale})"
						></iframe>
					</div>
				</div>
				{#if finalWord}<div class="final"><Markdown source={finalWord} /></div>{/if}
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<svelte:window onmessage={onSizeMsg} />

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

	.prompt {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.6rem;
	}
	.prompt span {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-fg-muted);
	}
	.prompt input {
		width: 100%;
	}
	.starters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.starter {
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
		font-size: 0.76rem;
		cursor: pointer;
	}
	.starter:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	/* Plan board */
	.todos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.todos li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.84rem;
		color: var(--color-fg-muted);
		line-height: 1.4;
	}
	.todos li.completed {
		color: var(--color-fg-faint);
		text-decoration: line-through;
	}
	.todos li.in_progress {
		color: var(--color-fg);
	}
	.glyph {
		font-family: var(--font-mono);
		color: var(--accent);
		flex-shrink: 0;
	}

	.anchor {
		height: 0;
	}

	/* Test bench */
	.test {
		margin: 0;
		padding: 0.6rem 0.7rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--color-fg-muted);
	}
	.test.ok {
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 40%, transparent);
		color: var(--color-accent-success, #4caf6e);
	}
	.test.bad {
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, transparent);
		color: var(--color-accent-warning);
	}

	/* Gate */
	.gate-ask {
		margin: 0 0 0.6rem;
		font-size: 0.86rem;
		color: var(--color-fg);
	}
	.gate-hint {
		margin: 0.3rem 0 0.6rem;
		font-size: 0.72rem;
		font-style: italic;
		color: var(--color-fg-faint);
		text-align: center;
	}
	.gate-note {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.6rem;
	}
	.gate-note span {
		font-size: 0.7rem;
		font-family: var(--font-mono);
		color: var(--color-fg-muted);
	}
	.gate-note input {
		width: 100%;
	}
	.gate-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.gate-actions button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.42rem 0.8rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg-elev);
		color: var(--color-fg);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.gate-actions .ok {
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 50%, transparent);
		color: var(--color-accent-success, #4caf6e);
	}
	.gate-actions .no {
		border-color: color-mix(in oklch, var(--color-accent-warning) 50%, transparent);
		color: var(--color-accent-warning);
	}
	.gate-actions .talk:hover,
	.gate-actions .ok:hover,
	.gate-actions .no:hover {
		background: var(--color-bg-elev-2);
	}

	/* The game cabinet — sized to the SCALED content, so nothing crops or scrolls */
	.gamewrap {
		width: 100%;
	}
	.gamebox {
		position: relative;
		max-width: 100%;
		margin-inline: auto;
		overflow: hidden;
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: #0c0e12;
	}
	.gamebox iframe {
		position: absolute;
		top: 0;
		left: 0;
		border: 0;
		transform-origin: top left;
		display: block;
	}
	.final {
		margin: 0.55rem 0 0;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.final :global(p) {
		margin: 0 0 0.4rem;
		line-height: 1.55;
	}
	.final :global(ul),
	.final :global(ol) {
		margin: 0 0 0.4rem;
		padding-left: 1.2rem;
	}
	.final :global(h1),
	.final :global(h2),
	.final :global(h3) {
		font-size: 0.9rem;
		margin: 0.5rem 0 0.3rem;
	}
	.final :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.68rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
	}
	.meter {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
</style>
