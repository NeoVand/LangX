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
	import { AIMessage, type BaseMessage } from '@langchain/core/messages';
	import type { Todo, VirtualFile, DeepAgentStateType } from '$lib/deepagents';
	import {
		buildJanitor,
		SEED_CSV,
		parseCsv,
		dateKind,
		COL,
		type Janitor,
		type ValidationRule
	} from '$lib/demos/da-todos';
	import janitorSrc from '$lib/demos/da-todos.ts?raw';
	import todosSkill from '$lib/demos/skills/deepagents-todos.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Check, X as XIcon, Plus, ArrowUp, ArrowDown } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'da-todos',
		title: 'The plan board — The Data Janitor',
		summary:
			'Planning as the product: the agent profiles a dirty dataset, drafts its plan with write_todos and stops for your review (plan mode), executes your possibly-revised board step by step, and replans live when validation surfaces rows no transform can fix.',
		entries: [{ path: 'lib/demos/da-todos.ts', code: janitorSrc }],
		runner: `import { buildJanitor } from './lib/demos/da-todos';

const janitor = await buildJanitor({
	onValidate: (rules) =>
		console.log('  · validate →', rules.filter((r) => !r.pass).length + ' rule(s) failing')
});

const { todos, ask } = await janitor.draftPlan();
console.log('DRAFT PLAN:');
for (const t of todos) console.log('  ○', t.content);
console.log('\\n' + ask);

// Approve as-is — or pass an array of revised step strings instead.
const state = await janitor.execute();
console.log('\\nREPORT:\\n' + ((await janitor.readFile('/report/cleanup.md')) ?? '(none)'));
console.log('\\n' + janitor.finalText(state));`,
		skill: todosSkill
	};

	// ── The dirty dataset, pre-analyzed for the preview table ──────────────────
	const seedTable = (() => {
		const { header, rows } = parseCsv(SEED_CSV);
		const seen: Record<string, true> = {};
		const view = rows.map((r) => {
			const dup = !!seen[r[COL.id]];
			seen[r[COL.id]] = true;
			return {
				cells: r,
				dateBad: dateKind(r[COL.date]) !== 'iso',
				dup,
				mismatch:
					Math.abs(Number(r[COL.qty]) * Number(r[COL.price]) - Number(r[COL.total])) > 0.005,
				negative: Number(r[COL.qty]) < 1 || Number(r[COL.total]) < 0
			};
		});
		return { header, view };
	})();

	// ── Run state ───────────────────────────────────────────────────────────────
	type Phase = 'idle' | 'drafting' | 'review' | 'executing' | 'done' | 'error';
	let phase = $state<Phase>('idle');
	let busy = $state(false);
	let error = $state('');

	let janitor: Janitor | null = null;
	let files = $state<VirtualFile[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let rules = $state<ValidationRule[]>([]);
	let finalWord = $state('');
	let contextTokens = $state(0);
	let compactions = $state(0);

	// The plan gate: an editable copy of the drafted board.
	let planAsk = $state('');
	let planEdit = $state<{ id: number; text: string }[]>([]);
	let draftContents: string[] = [];
	let wasRevised = $state(false);
	let nextId = 0;

	const phaseLabel = $derived(
		phase === 'idle'
			? 'one dirty dataset, one plan, one chance to edit it'
			: phase === 'drafting'
				? 'profiling the data and drafting a plan…'
				: phase === 'review'
					? 'PAUSED — the plan is yours to edit before anything runs'
					: phase === 'executing'
						? 'executing the approved board — watch it tick and replan'
						: phase === 'done'
							? 'done — clean data, quarantine, report'
							: 'something broke (see below)'
	);

	const hooks = {
		onState: (s: DeepAgentStateType) => {
			files = [...s.files];
			msgs = [...(s.messages as BaseMessage[])];
			compactions = s.summarizationEvents.length;
			contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
		},
		onValidate: (r: ValidationRule[]) => (rules = r)
	};

	// ── The plan timeline: every write_todos call is a version ─────────────────
	const versions = $derived.by(() => {
		const out: Todo[][] = [];
		for (const m of msgs) {
			if (!(m instanceof AIMessage)) continue;
			for (const tc of m.tool_calls ?? []) {
				const t = (tc.args as { todos?: Todo[] })?.todos;
				if (tc.name === 'write_todos' && Array.isArray(t)) out.push(t);
			}
		}
		return out;
	});

	let selectedV = $state<number | null>(null);
	const shownIndex = $derived(
		selectedV !== null && selectedV < versions.length ? selectedV : Math.max(versions.length - 1, 0)
	);
	const shownBoard = $derived.by(() => {
		const cur = versions[shownIndex] ?? [];
		const prev = shownIndex > 0 ? versions[shownIndex - 1] : null;
		return {
			rows: cur.map((t) => ({
				content: t.content,
				status: t.status,
				isNew: !!prev && !prev.some((p) => p.content === t.content)
			})),
			removed: prev ? prev.filter((p) => !cur.some((t) => t.content === p.content)) : []
		};
	});
	const versionLabels = $derived(
		versions.map((v, i) => {
			if (i === 0) return 'draft';
			if (i === 1 && wasRevised) return 'yours';
			const prev = versions[i - 1];
			const hasNew = v.some((t) => !prev.some((p) => p.content === t.content));
			if (hasNew && prev.some((p) => p.status === 'completed')) return 'replan';
			return '';
		})
	);

	const failCount = $derived(rules.filter((r) => !r.pass).length);
	const report = $derived(files.find((f) => f.path === '/report/cleanup.md')?.content ?? '');
	const cleanCsv = $derived(files.find((f) => f.path === '/data/orders.csv')?.content ?? '');
	// The agent may pick its own quarantine path (the tool arg is optional) —
	// match by name, not by an exact path we hoped for.
	const quarFile = $derived(
		files.find((f) => f.path.toLowerCase().includes('quarantine') && f.content.trim())
	);

	// Bring the gate (and later the payoff) into view.
	let gateEl = $state<HTMLElement | null>(null);
	let doneEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (phase === 'review' && gateEl) gateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (phase === 'done' && doneEl) doneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	async function draft() {
		if (busy) return;
		busy = true;
		phase = 'drafting';
		error = '';
		files = [];
		msgs = [];
		rules = [];
		finalWord = '';
		planAsk = '';
		planEdit = [];
		wasRevised = false;
		selectedV = null;
		contextTokens = 0;
		compactions = 0;
		try {
			janitor = await buildJanitor(hooks);
			const { todos: drafted, ask } = await janitor.draftPlan();
			planAsk = ask;
			draftContents = drafted.map((t) => t.content);
			planEdit = drafted.map((t) => ({ id: nextId++, text: t.content }));
			phase = 'review';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function approve() {
		if (busy || !janitor) return;
		const steps = planEdit.map((p) => p.text.trim()).filter(Boolean);
		if (!steps.length) return;
		wasRevised =
			steps.length !== draftContents.length || steps.some((s, i) => s !== draftContents[i]);
		busy = true;
		phase = 'executing';
		try {
			const state = await janitor.execute(wasRevised ? steps : undefined);
			finalWord = janitor.finalText(state);
			phase = 'done';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= planEdit.length) return;
		const next = [...planEdit];
		[next[i], next[j]] = [next[j], next[i]];
		planEdit = next;
	}
	function remove(i: number) {
		planEdit = planEdit.filter((_, k) => k !== i);
	}
	function add() {
		planEdit = [...planEdit, { id: nextId++, text: '' }];
	}

	const TODO_GLYPH: Record<Todo['status'], string> = {
		pending: '○',
		in_progress: '◐',
		completed: '●'
	};

	// ── Narrative code ───────────────────────────────────────────────────────────
	const semanticsCode = `// write_todos(todos) — ONE tool, REPLACE-the-whole-list semantics.
// Statuses: pending | in_progress | completed — exactly one in_progress.
//
//  plan      write_todos([ profile ◐, dates ○, dupes ○, totals ○, validate ○, report ○ ])
//  progress  write_todos([ profile ●, dates ◐, dupes ○, … ])        ← same call, statuses moved
//  REPLAN    write_todos([ …done…, quarantine ◐ NEW, document ○ NEW, validate ○, report ○ ])
//                                                                   ← same call, steps inserted
// Replanning is not an exception path. It's just the next write_todos.`;

	const reminderCode = `// From our glass-box harness — when the board goes stale for 2+ tool rounds,
// this is appended to the LAST TOOL RESULT the model reads:
//
//   [system-reminder] The plan board is stale — call write_todos with the
//   FULL updated list (finished steps marked completed, the current one
//   in_progress) before continuing.
//
// Prompt advice gets ignored under pressure. A reminder that arrives inside
// the loop — attached to data the model is already reading — does not.`;
</script>

<Lesson
	title="The plan board"
	eyebrow="Level 3 · Lesson 03 · Plan mode & recitation"
	hero={{
		id: 'l3-todos',
		alt: 'A brass railway-style departure board of sliding task plaques, one mid-flip, while a clockwork arm inserts a new plaque mid-list'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A plan held in the model's head dies with the next long context. A plan on the board — written
		with <Term t="write_todos"><code>write_todos</code></Term>, stored in state, re-read every turn
		— survives the whole job. And because it's an object, <em>you</em> get to edit it before the
		work starts.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is <strong>The Data Janitor</strong>: a dirty orders file with four kinds of planted
			damage. The agent profiles it, drafts a cleaning plan, and <strong>stops</strong> — the board
			is yours to reword, reorder, even sabotage. Approve it, and watch the plan live: statuses
			tick, and when validation finds rows no transform can fix, the board visibly
			<em>replans itself</em> mid-run.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why a board" title="Working memory is not a plan" variant="dropcap">
			<p>
				Ask a model to do a thirty-turn job and the failure mode is rarely skill — it's memory.
				The original goal scrolls out of the recent context; <Term t="Summarization">summarization</Term>
				flattens the milestones; the agent re-derives its intent from whatever it last said and
				drifts (<Term t="Goal drift">goal drift</Term>), repeats finished work, or declares victory
				early. The fix is embarrassingly old-fashioned: <strong>write the plan down</strong>.
			</p>
			<p>
				<Term t="write_todos"><code>write_todos</code></Term> turns the plan into a state object.
				It's checkpointed with the thread, it survives <Term t="Context compaction">compaction</Term>
				untouched, and the harness re-presents it to the model every single turn — the agent
				effectively <Term t="Recitation">recites</Term> its plan before each step, so the goal
				physically cannot scroll out of attention. This is why
				<code>TodoListMiddleware</code> is <strong>layer #1</strong> of the official middleware
				stack: planning is the first thing the harness installs, before files, before subagents.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-plan-recitation"
				alt="An infographic poster: a long conversation scroll decays and is summarized at the bottom, while a small bright plan board is recited onto each fresh turn at the top — goal drift, crossed out."
			/>
			<figcaption>
				The conversation decays — eviction, summarization, truncation. The board doesn't. Recited
				each turn, it is the one thing the agent never forgets.
			</figcaption>
		</figure>

		<Slide title="One tool, replace-the-whole-list" variant="code-first">
			<p>
				The tool's design is almost aggressively simple: one call,
				<code>write_todos(todos)</code>, and the new list <em>replaces</em> the old one — no
				append, no patch, no item-level API. That sounds crude until you watch a run:
			</p>
			<CodeBlock
				code={semanticsCode}
				caption="Plan, progress, and replan are the same operation on the same object."
			/>
			<p>
				Replace-semantics means the model restates its <em>entire</em> understanding of the job
				every time it touches the board — which is precisely the recitation that fights drift.
				And it means replanning needs no special machinery: keep the completed steps, insert the
				recovery steps, write the list. In the demo you'll see the board gain
				<em>quarantine</em> steps the moment validation finds rows that no transform can fix —
				same tool, new truth.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-plan-cycle"
				alt="An infographic poster: a circular drive-train of PLAN, ACT, OBSERVE, REPLAN stations around a central plan board, with REPLAN feeding back into PLAN."
			/>
			<figcaption>
				The planning cycle: plan → act → observe → replan, with the board at the center. The
				footnote is the whole API: the list is replaced whole, every time.
			</figcaption>
		</figure>

		<Slide title="Plan mode: the pause before the work">
			<p>
				Claude Code ships a mode where the agent may <em>only</em> plan — it researches, drafts,
				and presents; nothing executes until the human accepts. That pause is the cheapest, most
				valuable gate in agent design: reviewing a six-line plan takes seconds, reviewing six
				wrong transforms takes an afternoon. The demo runs the same protocol in two phases —
				draft, <strong>stop</strong>, execute — and because the plan is an object, the gate is
				<em>editable</em>: reword a step, delete one, add one, reorder.
			</p>
			<p>
				Try the sabotage experiment: at the gate, <strong>delete the "fix totals" step</strong>
				and approve. The agent follows <em>your</em> board — and then <code>validate_data</code>
				catches the two broken totals, and the agent plans the step right back in. The plan is a
				contract, but verification is the law: a good harness recovers from bad plans, including
				yours.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The board is not a log of what happened. It is the contract for what happens next — and
				the human is allowed to edit the contract.
			</p>
		</Slide>

		<Slide title="Keeping the board honest" variant="code-first">
			<p>
				One uncomfortable truth from building this course: models <em>agree</em> to keep the
				board current and then don't — under pressure, prompt advice loses to the task at hand.
				Real harnesses solve this mechanically. Ours watches how many tool rounds pass without a
				<code>write_todos</code> and, past two, injects a reminder where the model cannot miss
				it:
			</p>
			<CodeBlock
				code={reminderCode}
				caption="The Claude Code pattern: discipline delivered inside the loop, not in the preamble."
			/>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Deep Agents overview — planning with write_todos',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/overview',
					kind: 'docs'
				},
				{
					label: 'The harness capability map',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/harness',
					kind: 'docs'
				},
				{
					label: 'Claude Code best practices — plan mode',
					href: 'https://www.anthropic.com/engineering/claude-code-best-practices',
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
		<Panel title="Try it" subtitle="draft → edit the board → execute → watch it replan">
			<ol class="howto">
				<li>
					<strong>Draft the plan.</strong> The agent profiles the dirty file and proposes its
					cleaning plan — then stops. Nothing runs yet.
				</li>
				<li>
					<strong>Edit the board.</strong> Reword, reorder, delete, add. (Try deleting the
					fix-totals step — validation will catch it and the agent will plan it back.)
				</li>
				<li>
					<strong>Approve & watch.</strong> Statuses tick live; when validation finds the three
					rows no transform can fix, recovery steps appear on the board mid-run. The timeline
					keeps every version.
				</li>
			</ol>
		</Panel>

		<Panel title="The dataset" subtitle="40 rows, four kinds of planted dirt — colors mark the damage">
			<div class="tablewrap scrollbar-slim">
				<table class="csv">
					<thead>
						<tr>{#each seedTable.header as h (h)}<th>{h}</th>{/each}</tr>
					</thead>
					<tbody>
						{#each seedTable.view as r, i (i)}
							<tr class:dup={r.dup}>
								<td>{r.cells[0]}{#if r.dup}<span class="flag">dup</span>{/if}</td>
								<td class:warn={r.dateBad}>{r.cells[1]}</td>
								<td>{r.cells[2]}</td>
								<td>{r.cells[3]}</td>
								<td class:bad={r.negative}>{r.cells[4]}</td>
								<td>{r.cells[5]}</td>
								<td class:bad={r.negative} class:warn={r.mismatch}>{r.cells[6]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="legend">
				<span><i class="dot warn"></i> wrong format / bad arithmetic</span>
				<span><i class="dot bad"></i> negative — needs a policy call</span>
				<span><i class="dot dup"></i> duplicate row</span>
			</div>
		</Panel>

		<Panel title="The brief" subtitle={phaseLabel}>
			<p class="brief">
				“Clean <code>/data/orders.csv</code>. Profile it first, then draft your cleaning plan and
				stop for my review.”
			</p>
			<RunButton
				onclick={draft}
				running={busy}
				label={phase === 'done' || phase === 'error' ? 'Start over' : 'Profile & draft a plan'}
			/>
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if phase === 'review'}
			<div class="anchor" bind:this={gateEl}></div>
			<Panel title="The plan gate" subtitle="plan mode — nothing runs until you approve this board">
				{#if planAsk}<p class="ask">“{planAsk}”</p>{/if}
				<div class="editor">
					{#each planEdit as step, i (step.id)}
						<div class="step">
							<span class="num">{i + 1}</span>
							<input type="text" bind:value={step.text} disabled={busy} />
							<button class="icon-btn" title="move up" onclick={() => move(i, -1)} disabled={busy || i === 0}><ArrowUp size={13} /></button>
							<button class="icon-btn" title="move down" onclick={() => move(i, 1)} disabled={busy || i === planEdit.length - 1}><ArrowDown size={13} /></button>
							<button class="icon-btn del" title="delete step" onclick={() => remove(i)} disabled={busy}><XIcon size={13} /></button>
						</div>
					{/each}
				</div>
				<button class="add" onclick={add} disabled={busy}><Plus size={13} /> add a step</button>
				<div class="gate-actions">
					<button class="ok" onclick={approve} disabled={busy || !planEdit.some((p) => p.text.trim())}>
						<Check size={14} /> Approve & execute
					</button>
					<span class="hint">edit freely — the agent follows YOUR board</span>
				</div>
			</Panel>
		{/if}

		{#if msgs.length}
			<Panel title="The investigation" subtitle="the run itself — every word, tool call, and result, live">
				{#snippet actions()}
					<span class="meter" title="estimated tokens currently in the agent's context">
						ctx ≈ {contextTokens.toLocaleString()} tok{compactions
							? ` · ${compactions} compaction${compactions === 1 ? '' : 's'}`
							: ''}
					</span>
				{/snippet}
				<AgentFeed messages={msgs} />
			</Panel>
		{/if}

		{#if versions.length}
			<Panel title="The plan board" subtitle="every write_todos call is a version — click through the plan's life">
				<div class="timeline">
					{#each versionLabels as label, i (i)}
						<button
							class="chip"
							class:active={i === shownIndex}
							onclick={() => (selectedV = i === versions.length - 1 ? null : i)}
						>
							v{i + 1}{#if label}<em>{label}</em>{/if}
						</button>
					{/each}
				</div>
				<ul class="todos">
					{#each shownBoard.rows as t, i (i)}
						<li class="{t.status} {t.isNew ? 'new' : ''}">
							<span class="glyph">{TODO_GLYPH[t.status]}</span>{t.content}
							{#if t.isNew}<span class="newtag">NEW</span>{/if}
						</li>
					{/each}
					{#each shownBoard.removed as r, i (i)}
						<li class="removed"><span class="glyph">✕</span>{r.content}</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		{#if rules.length}
			<Panel title="The validation bench" subtitle="validate_data — the business rules, checked for real">
				{#snippet actions()}
					<span class="bench-badge {failCount ? 'bad' : 'ok'}">
						{failCount ? `${failCount} of ${rules.length} rules failing` : `all ${rules.length} rules passing`}
					</span>
				{/snippet}
				<div class="bench">
					{#each rules as r (r.rule)}
						<div class="case {r.pass ? 'pass' : 'fail'}">
							<span class="case-glyph">{r.pass ? '✓' : '✗'}</span>
							<span>{r.rule}</span>
						</div>
						{#if !r.pass}
							<div class="case-detail">{r.detail}</div>
						{/if}
					{/each}
				</div>
			</Panel>
		{/if}

		{#if files.length}
			<Panel title="The workspace" subtitle="the dataset, its untouched original, the quarantine, the report">
				<FileTreeViewer {files} title="" />
			</Panel>
		{/if}

		{#if phase === 'done'}
			<div class="anchor" bind:this={doneEl}></div>
			<Panel title="The deliverables" subtitle="clean data · quarantined rows · the report">
				{#if quarFile}
					{@const q = parseCsv(quarFile.content)}
					<h5 class="d-head">{quarFile.path} — {q.rows.length} rows for a human decision</h5>
					<div class="tablewrap small scrollbar-slim">
						<table class="csv">
							<thead><tr>{#each q.header as h (h)}<th>{h}</th>{/each}</tr></thead>
							<tbody>
								{#each q.rows as r, i (i)}
									<tr>{#each r as c, j (j)}<td class:bad={j === 4 || j === 6}>{c}</td>{/each}</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				{#if cleanCsv}
					{@const c = parseCsv(cleanCsv)}
					<h5 class="d-head">/data/orders.csv — {c.rows.length} clean rows (first 8)</h5>
					<div class="tablewrap small scrollbar-slim">
						<table class="csv">
							<thead><tr>{#each c.header as h (h)}<th>{h}</th>{/each}</tr></thead>
							<tbody>
								{#each c.rows.slice(0, 8) as r, i (i)}
									<tr>{#each r as cell, j (j)}<td>{cell}</td>{/each}</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				{#if report}
					<h5 class="d-head">/report/cleanup.md</h5>
					<div class="note"><Markdown source={report} /></div>
				{/if}
				{#if finalWord}
					<div class="final"><Markdown source={finalWord} /></div>
				{/if}
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

	/* CSV tables */
	.tablewrap {
		max-height: 17rem;
		overflow: auto;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-paper);
	}
	.tablewrap.small {
		max-height: 12rem;
	}
	.csv {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.5;
	}
	.csv th {
		position: sticky;
		top: 0;
		background: var(--color-bg-elev-2);
		color: var(--color-fg-faint);
		text-align: left;
		padding: 0.3rem 0.55rem;
		border-bottom: 1px solid var(--color-rule);
		font-weight: 500;
	}
	.csv td {
		padding: 0.14rem 0.55rem;
		color: var(--color-fg-muted);
		white-space: nowrap;
	}
	.csv tr.dup td {
		background: color-mix(in oklch, var(--accent) 6%, transparent);
	}
	.csv td.warn {
		color: var(--color-accent-warning);
	}
	.csv td.bad {
		color: #e07a72;
	}
	.flag {
		margin-left: 0.35rem;
		font-size: 0.58rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0 0.3rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 0.45rem;
		font-size: 0.68rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.dot {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		display: inline-block;
	}
	.dot.warn {
		background: var(--color-accent-warning);
	}
	.dot.bad {
		background: #e07a72;
	}
	.dot.dup {
		background: color-mix(in oklch, var(--accent) 55%, transparent);
	}

	.brief {
		margin: 0 0 0.7rem;
		font-size: 0.86rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}
	.anchor {
		height: 0;
	}

	/* Plan gate */
	.ask {
		margin: 0 0 0.65rem;
		font-size: 0.84rem;
		font-style: italic;
		color: var(--color-fg);
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.step {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.step .num {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent-ink);
		width: 1.1rem;
		text-align: right;
		flex-shrink: 0;
	}
	.step input {
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.55rem;
		height: 1.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		cursor: pointer;
		flex-shrink: 0;
	}
	.icon-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.icon-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.icon-btn.del:hover:not(:disabled) {
		border-color: var(--color-accent-warning);
		color: var(--color-accent-warning);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.5rem;
		padding: 0.28rem 0.6rem;
		border: 1px dashed var(--color-rule);
		border-radius: 0.45rem;
		background: transparent;
		color: var(--color-fg-muted);
		font-size: 0.74rem;
		cursor: pointer;
	}
	.add:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.gate-actions {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-top: 0.75rem;
	}
	.gate-actions .ok {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.42rem 0.8rem;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklch, var(--color-accent-success, #4caf6e) 50%, transparent);
		background: var(--color-bg-elev);
		color: var(--color-accent-success, #4caf6e);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.gate-actions .ok:hover:not(:disabled) {
		background: var(--color-bg-elev-2);
	}
	.hint {
		font-size: 0.7rem;
		font-style: italic;
		color: var(--color-fg-faint);
	}

	/* Plan board + timeline */
	.timeline {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 0.65rem;
	}
	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.chip em {
		font-style: normal;
		font-size: 0.6rem;
		color: var(--accent-ink);
	}
	.chip.active {
		border-color: var(--accent-rule);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		color: var(--color-fg);
	}
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
	.todos li.new {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		border-radius: 0.35rem;
		padding: 0.1rem 0.35rem;
		margin: 0 -0.35rem;
	}
	.todos li.removed {
		color: var(--color-fg-faint);
		text-decoration: line-through;
		opacity: 0.55;
	}
	.newtag {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0 0.3rem;
		flex-shrink: 0;
	}
	.glyph {
		font-family: var(--font-mono);
		color: var(--accent);
		flex-shrink: 0;
	}

	/* Validation bench */
	.bench {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.case {
		display: flex;
		gap: 0.45rem;
		align-items: baseline;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.case-glyph {
		font-family: var(--font-mono);
		flex-shrink: 0;
	}
	.case.pass .case-glyph {
		color: var(--color-accent-success, #4caf6e);
	}
	.case.fail {
		color: var(--color-fg);
	}
	.case.fail .case-glyph {
		color: var(--color-accent-warning);
	}
	.case-detail {
		margin: 0 0 0.25rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-accent-warning);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.bench-badge {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-rule);
	}
	.bench-badge.ok {
		color: var(--color-accent-success, #4caf6e);
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 45%, transparent);
	}
	.bench-badge.bad {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, transparent);
	}

	/* Deliverables */
	.d-head {
		margin: 0.8rem 0 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--accent-ink);
	}
	.d-head:first-child {
		margin-top: 0;
	}
	.note {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		padding: 0.6rem 0.75rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.final {
		margin-top: 0.6rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.note :global(p),
	.final :global(p) {
		margin: 0 0 0.4rem;
		line-height: 1.55;
	}
	.note :global(p:last-child),
	.final :global(p:last-child) {
		margin-bottom: 0;
	}
	.note :global(ul),
	.note :global(ol),
	.final :global(ul),
	.final :global(ol) {
		margin: 0 0 0.4rem;
		padding-left: 1.2rem;
	}
	.note :global(h1),
	.note :global(h2),
	.note :global(h3),
	.final :global(h1),
	.final :global(h2),
	.final :global(h3) {
		font-size: 0.9rem;
		margin: 0.5rem 0 0.3rem;
		color: var(--color-fg);
	}
	.note :global(code),
	.final :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	.note :global(table) {
		border-collapse: collapse;
		font-size: 0.74rem;
	}
	.note :global(th),
	.note :global(td) {
		border: 1px solid var(--color-rule);
		padding: 0.2rem 0.5rem;
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
