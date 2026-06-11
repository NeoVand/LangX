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
	import {
		evaluate,
		type VirtualFile,
		type DeepAgentStateType,
		type FilesystemPermission,
		type PermissionMode,
		type HitlDecision
	} from '$lib/deepagents';
	import type { HarnessInterrupt } from '$lib/deepagents';
	import { buildNewHire, BADGE, type NewHire } from '$lib/demos/da-permissions';
	import permissionsSrc from '$lib/demos/da-permissions.ts?raw';
	import permissionsSkill from '$lib/demos/skills/deepagents-permissions.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Check, X as XIcon, MessageCircle, ArrowUp, ArrowDown, RotateCcw } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'da-permissions',
		title: 'Filesystem permissions — The New Hire',
		summary:
			'An intern agent works a real first-day task against a four-rule badge it was never shown: clean writes land, the secrets peek bounces (and the intern adapts), and the config write pauses the whole run for a human — the official interrupt permission mode.',
		entries: [{ path: 'lib/demos/da-permissions.ts', code: permissionsSrc }],
		runner: `import { buildNewHire, BADGE } from './lib/demos/da-permissions';

const hire = await buildNewHire();
console.log('THE BADGE (first match wins):');
for (const [i, r] of BADGE.entries())
	console.log('  ' + (i + 1) + ' ' + r.mode.toUpperCase().padEnd(10) + r.operations.join('+').padEnd(11) + r.paths.join(' '));

let res = await hire.start();
while (res.status === 'interrupted') {
	console.log('\\n⏸ permission gate:', res.interrupt.args.path, '— approving');
	res = await hire.resume({ type: 'approve' });
}
console.log('\\n' + hire.finalText(res.state));
console.log('\\nThe handbook afterwards:\\n' + ((await hire.readFile('/docs/handbook.md')) ?? ''));`,
		skill: permissionsSkill
	};

	// ── Run state ───────────────────────────────────────────────────────────────
	type Phase = 'idle' | 'working' | 'gate' | 'done' | 'error';
	let phase = $state<Phase>('idle');
	let busy = $state(false);
	let error = $state('');

	let hire: NewHire | null = null;
	let files = $state<VirtualFile[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let finalWord = $state('');
	let contextTokens = $state(0);
	let compactions = $state(0);
	let pending = $state<HarnessInterrupt | null>(null);
	let gateNote = $state('');

	const phaseLabel = $derived(
		phase === 'idle'
			? 'one task, one badge, three verbs'
			: phase === 'working'
				? 'the intern is at work — watch the security log'
				: phase === 'gate'
					? 'PAUSED — a permission rule summoned you'
					: phase === 'done'
						? "first day done — read the intern's report"
						: 'something broke (see below)'
	);

	const hooks = {
		onState: (s: DeepAgentStateType) => {
			files = [...s.files];
			msgs = [...(s.messages as BaseMessage[])];
			compactions = s.summarizationEvents.length;
			contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
		}
	};

	// ── The security log: every filesystem op, re-judged by the actual badge ────
	interface LogEntry {
		op: 'read' | 'write';
		path: string;
		verdict: PermissionMode;
		ruleIndex: number;
	}
	const securityLog = $derived.by((): LogEntry[] => {
		const out: LogEntry[] = [];
		for (const m of msgs) {
			if (!(m instanceof AIMessage)) continue;
			for (const tc of m.tool_calls ?? []) {
				const path = (tc.args as { path?: string })?.path;
				if (!path) continue;
				if (tc.name === 'read_file') {
					const r = evaluate(BADGE, 'read', path);
					out.push({ op: 'read', path, verdict: r.decision, ruleIndex: r.ruleIndex });
				} else if (tc.name === 'write_file' || tc.name === 'edit_file') {
					const r = evaluate(BADGE, 'write', path);
					out.push({ op: 'write', path, verdict: r.decision, ruleIndex: r.ruleIndex });
				}
			}
		}
		return out;
	});

	const GLYPH: Record<PermissionMode, string> = { allow: '✓', deny: '✗', interrupt: '⏸' };

	// Bring the gate (and the payoff) into view.
	let gateEl = $state<HTMLElement | null>(null);
	let doneEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (phase === 'gate' && gateEl) gateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		if (phase === 'done' && doneEl) doneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	async function run() {
		if (busy) return;
		busy = true;
		phase = 'working';
		error = '';
		files = [];
		msgs = [];
		finalWord = '';
		pending = null;
		gateNote = '';
		contextTokens = 0;
		compactions = 0;
		try {
			hire = await buildNewHire(hooks);
			await settle(await hire.start());
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function decide(decision: HitlDecision) {
		if (busy || !hire) return;
		busy = true;
		phase = 'working';
		try {
			await settle(await hire.resume(decision));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	async function settle(res: Awaited<ReturnType<NewHire['start']>>) {
		if (res.status === 'interrupted') {
			pending = res.interrupt;
			gateNote = '';
			phase = 'gate';
			return;
		}
		pending = null;
		finalWord = hire!.finalText(res.state);
		phase = 'done';
	}

	const pendingPreview = $derived.by(() => {
		if (!pending) return '';
		const a = pending.args as { content?: string; oldString?: string; newString?: string };
		if (typeof a.content === 'string') return a.content;
		if (typeof a.newString === 'string') return `- ${a.oldString ?? ''}\n+ ${a.newString}`;
		return JSON.stringify(pending.args, null, 2);
	});

	// ── The rule lab: the real evaluator, in your hands ─────────────────────────
	const cloneRules = () =>
		BADGE.map((r) => ({ ...r, operations: [...r.operations], paths: [...r.paths] }));
	let labRules = $state<FilesystemPermission[]>(cloneRules());

	const LAB_OPS: { op: 'read' | 'write'; path: string }[] = [
		{ op: 'read', path: '/notes/standup-mon.md' },
		{ op: 'write', path: '/notes/action-items.md' },
		{ op: 'write', path: '/docs/handbook.md' },
		{ op: 'read', path: '/secrets/payroll.md' },
		{ op: 'write', path: '/config/team.yaml' },
		{ op: 'read', path: '/finance/q2-ledger.csv' },
		{ op: 'write', path: '/finance/expenses.csv' }
	];
	const labVerdicts = $derived(
		LAB_OPS.map((o) => ({ ...o, result: evaluate(labRules, o.op, o.path) }))
	);

	function labMove(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= labRules.length) return;
		const next = [...labRules];
		[next[i], next[j]] = [next[j], next[i]];
		labRules = next;
	}
	const CYCLE: Record<PermissionMode, PermissionMode> = {
		allow: 'deny',
		deny: 'interrupt',
		interrupt: 'allow'
	};
	function labCycle(i: number) {
		labRules = labRules.map((r, k) => (k === i ? { ...r, mode: CYCLE[r.mode] } : r));
	}

	// ── Narrative code ───────────────────────────────────────────────────────────
	const badgeCode = `const BADGE: FilesystemPermission[] = [
  { operations: ['read','write'], paths: ['/secrets/**'],           mode: 'deny'      }, // 1
  { operations: ['write'],        paths: ['/config/**'],            mode: 'interrupt' }, // 2
  { operations: ['write'],        paths: ['/docs/**', '/notes/**'], mode: 'allow'     }, // 3
  { operations: ['write'],        paths: ['**'],                    mode: 'deny'      }  // 4
];
// First match wins, top to bottom — declaration order IS the policy.
// No rule matched → allowed. Rule 4 flips that default: nothing writes
// unless a rule above said so. That's the closed posture.`;

	const interruptCode = `// The third verb. Not a refusal — a summons:
{ operations: ['write'], paths: ['/config/**'], mode: 'interrupt' }

// The matched write neither runs nor fails. The whole run checkpoints
// inside the graph and waits for a decision:
const res = await agent.start({ input: task });    // → status: 'interrupted'
res.interrupt; // { tool: 'write_file',
               //   args: { path: '/config/team.yaml', content: '…' },
               //   reason: 'permission' }

await agent.resume({ decisions: [{ type: 'approve' }] }); // or edit / reject / respond`;
</script>

<Lesson
	title="Filesystem permissions"
	eyebrow="Level 3 · Lesson 05 · The badge"
	hero={{
		id: 'l3-permissions',
		alt: 'A Victorian gatehouse with three gates — an open archway, a sealed iron door, and a bell-gate where a human in a booth decides'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		An agent that can <Term t="write_file"><code>write_file</code></Term> to your filesystem is a
		feature; one that can write <em>anywhere</em> is an incident report.
		<Term t="Permissions">Permissions</Term> draw that line in config — three verbs, evaluated
		before every operation: <strong>allow</strong> it, <strong>deny</strong> it, or
		<strong>summon a human</strong>.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is <strong>The New Hire</strong>: an intern agent with a real first-day task and a
			four-rule badge it was never shown. Watch all three verbs fire naturally — the tidy writes
			land, the salary-bands peek bounces (even <Term t="read_file"><code>read_file</code></Term>
			is refusable), and the config edit pauses the whole run until <em>you</em> decide. Then take
			the rules apart yourself in the lab below.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why rules" title="Prompts ask. Rules enforce." variant="dropcap">
			<p>
				Telling a model <em>"never touch /secrets"</em> works most of the time — and "most of the
				time" is exactly the guarantee you can't ship. The deep-agents security stance is blunt
				about this: <em>"the agent can do anything its tools allow — enforce boundaries at the
				tool and sandbox level, not by expecting the model to self-police."</em> So the
				<Term t="System prompt">prompt</Term> carries intent, and a list of
				<Term t="Permissions">permission rules</Term> carries the physics: every
				<Term t="read_file">read</Term> and <Term t="write_file">write</Term> is judged
				<em>before</em> it executes, and a refused operation returns a readable error in the
				<Term t="ToolMessage">ToolMessage</Term> — so the agent can adapt instead of silently
				failing.
			</p>
			<p>
				You've already met this idea three times without the name: the Bug Hunt's tests were
				deny-write (<a href="/3-deepagents/virtual-fs">the spec is law</a>), the Data Janitor's
				original dataset was untouchable, and the Observatory's chart could only change through
				its instrument. One mechanism, every chapter: <strong>policy as data, enforced in the
				tool layer.</strong>
			</p>
		</Slide>

		<Slide title="The shape: four rules, one order" variant="code-first">
			<p>
				A permission is <code>{'{ operations, paths, mode }'}</code> — which verbs it covers,
				which glob patterns it guards (<code>**</code> crosses directories, <code>*</code>
				doesn't), and what happens on a match. The list is evaluated
				<Term t="first-match-wins">first-match-wins</Term>, top to bottom, and stops at the first
				rule whose operation <em>and</em> path both match:
			</p>
			<CodeBlock code={badgeCode} caption="The New Hire's badge — the exact rules the demo enforces." />
			<p>
				Two consequences worth tattooing somewhere. <strong>Order is policy:</strong> swap rules 1
				and 3 and <code>/secrets/notes.md</code>… still bounces (different globs) — but put an
				<code>allow **</code> above a deny and the deny never fires again; the lab below lets you
				make exactly that mistake safely. <strong>The default is open:</strong> when no rule
				matches, the operation is allowed — which is why serious badges end with a catch-all deny,
				flipping the posture to <em>closed</em>: nothing writes unless explicitly granted.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-permissions-firstmatch"
				alt="An infographic poster: a scroll falls past a column of rule plaques and is claimed by the first one that matches; the plaques below stay dark — and a footnote reads 'no rule matched → allowed'."
			/>
			<figcaption>
				First match wins: the scroll never reaches the rules below the one that claimed it. No
				match at all? It sails through — unless a catch-all is waiting at the bottom.
			</figcaption>
		</figure>

		<Slide title="The third verb" variant="code-first">
			<p>
				Allow and deny are static calls. The official surface has a third mode that neither
				refuses nor permits: <code>interrupt</code> routes the matched operation to a
				<Term t="HITL">human</Term>. The write doesn't fail — the <em>entire run</em> checkpoints
				inside the graph, exactly like the Toymaker's publish gate, and resumes with one of the
				four standard decisions:
			</p>
			<CodeBlock code={interruptCode} caption="A permission that summons you — resume with approve, edit, reject, or respond." />
			<p>
				This is the precision instrument between "the agent may edit config" and "the agent may
				never edit config": it may <em>propose</em> — with the full diff on the table — and a
				human disposes. In the demo, the badge does this for <code>/config/**</code>; the
				<a href="/3-deepagents/hitl">human-in-the-loop lesson</a> goes deeper into the decision
				machinery it rides on.
			</p>
			<p class="aside">
				Two production notes from the docs: <Term t="Subagent">subagents</Term> <em>inherit</em>
				the parent's permissions — but a subagent that declares its own gets a full
				<em>replacement</em>, not a merge (the same sharp edge as subagent tools); and permission
				checks guard the six filesystem tools — a sandbox's <code>execute()</code> needs sandbox
				isolation, not glob rules.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-permissions-threeverbs"
				alt="An infographic poster triptych: an open gate (allow), a sealed door bouncing a scroll stamped REFUSED (deny), and a gate holding a scroll mid-air while a human hand decides (interrupt)."
			/>
			<figcaption>
				The three verbs: it simply happens · refused, with a reason the agent can read · a human
				decides this one.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>A rule is not a stronger prompt. It's a different physics.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Filesystem permissions — allow / deny / interrupt',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/permissions',
					kind: 'docs'
				},
				{
					label: 'Human-in-the-loop — the decision machinery',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop',
					kind: 'docs'
				},
				{
					label: 'Backends — security model & sandboxes',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/backends',
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
		<Panel title="Try it" subtitle="one intern, four rules, three verbs">
			<ol class="howto">
				<li>
					<strong>Send the intern to work.</strong> The task naturally crosses every rule: tidy
					writes, a forbidden peek, a gated config edit. The intern was never shown the badge.
				</li>
				<li>
					<strong>Watch the security log.</strong> Every operation, the verdict, and the exact
					rule that caught it. When the config write pauses the run — your call.
				</li>
				<li>
					<strong>Then break the rules.</strong> In the lab, reorder the badge and flip modes;
					the verdict table re-judges instantly through the same evaluator the agent faces.
				</li>
			</ol>
		</Panel>

		<Panel title="The badge" subtitle={phaseLabel}>
			<ol class="rules">
				{#each BADGE as r, i (i)}
					<li data-mode={r.mode}>
						<span class="idx">{i + 1}</span>
						<code class="mode">{r.mode.toUpperCase()}</code>
						<span class="ops">{r.operations.join(' + ')}</span>
						<span class="paths">{r.paths.join(' · ')}</span>
					</li>
				{/each}
			</ol>
			<RunButton
				onclick={run}
				running={busy}
				label={phase === 'done' || phase === 'error' ? 'Run the first day again' : 'Start the first day'}
			/>
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if msgs.length}
			<Panel title="The first day" subtitle="the run itself — every word, tool call, and result, live">
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

		{#if securityLog.length}
			<Panel title="The security log" subtitle="every filesystem op, the verdict, and the rule that caught it">
				<ul class="seclog">
					{#each securityLog as e, i (i)}
						<li class={e.verdict}>
							<span class="glyph">{GLYPH[e.verdict]}</span>
							<span class="op">{e.op}</span>
							<span class="path">{e.path}</span>
							<span class="rule">
								{e.ruleIndex >= 0 ? `rule ${e.ruleIndex + 1}` : 'no match → allowed'}
							</span>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		{#if phase === 'gate' && pending}
			<div class="anchor" bind:this={gateEl}></div>
			<Panel title="The gate" subtitle="mode: 'interrupt' — a permission rule summoned you">
				<p class="gate-ask">
					The intern wants to <strong>{pending.tool === 'edit_file' ? 'edit' : 'write'}</strong>
					<code>{String((pending.args as { path?: string }).path ?? '')}</code> — matched by rule
					2 of the badge. The run is checkpointed and waiting.
				</p>
				<pre class="gate-preview">{pendingPreview}</pre>
				<label class="gate-note">
					<span>Optional note (used by reject / respond)…</span>
					<input
						type="text"
						bind:value={gateNote}
						placeholder="e.g. don't touch the on-call order, just add the member"
						disabled={busy}
					/>
				</label>
				<div class="gate-actions">
					<button class="ok" onclick={() => decide({ type: 'approve' })} disabled={busy}>
						<Check size={14} /> Approve this write
					</button>
					<button class="no" onclick={() => decide({ type: 'reject', message: gateNote || undefined })} disabled={busy}>
						<XIcon size={14} /> Reject
					</button>
					<button class="talk" onclick={() => decide({ type: 'respond', message: gateNote || 'Leave the config to the config team; note it in your report instead.' })} disabled={busy}>
						<MessageCircle size={14} /> Respond instead
					</button>
				</div>
			</Panel>
		{/if}

		{#if files.length}
			<Panel title="The office" subtitle="the workspace after the intern's pass">
				<FileTreeViewer {files} title="" />
			</Panel>
		{/if}

		{#if phase === 'done' && finalWord}
			<div class="anchor" bind:this={doneEl}></div>
			<Panel title="The intern's report" subtitle="what worked, what was refused, what you decided">
				<div class="final"><Markdown source={finalWord} /></div>
			</Panel>
		{/if}

		<Panel title="The rule lab" subtitle="the real evaluator, in your hands — reorder rules, flip modes, watch verdicts">
			{#snippet actions()}
				<button class="reset" onclick={() => (labRules = cloneRules())} title="restore the badge">
					<RotateCcw size={12} /> reset
				</button>
			{/snippet}
			<ol class="rules lab">
				{#each labRules as r, i (i)}
					<li data-mode={r.mode}>
						<span class="idx">{i + 1}</span>
						<button class="mode-btn" data-mode={r.mode} onclick={() => labCycle(i)} title="click to cycle allow → deny → interrupt">
							{r.mode.toUpperCase()}
						</button>
						<span class="ops">{r.operations.join(' + ')}</span>
						<span class="paths">{r.paths.join(' · ')}</span>
						<span class="movers">
							<button class="icon-btn" onclick={() => labMove(i, -1)} disabled={i === 0} title="move up"><ArrowUp size={12} /></button>
							<button class="icon-btn" onclick={() => labMove(i, 1)} disabled={i === labRules.length - 1} title="move down"><ArrowDown size={12} /></button>
						</span>
					</li>
				{/each}
			</ol>
			<ul class="seclog lab-verdicts">
				{#each labVerdicts as v, i (i)}
					<li class={v.result.decision}>
						<span class="glyph">{GLYPH[v.result.decision]}</span>
						<span class="op">{v.op}</span>
						<span class="path">{v.path}</span>
						<span class="rule">
							{v.result.ruleIndex >= 0 ? `rule ${v.result.ruleIndex + 1}` : 'no match → allowed'}
						</span>
					</li>
				{/each}
			</ul>
			<p class="lab-hint">
				Try it: move rule 3 (<code>allow /docs /notes</code>) above rule 1, then flip it to cover
				<code>**</code>… or just watch what reordering does to <code>/secrets</code>. The agent
				demo above always uses the original badge.
			</p>
		</Panel>
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

	/* The badge / rule lists */
	.rules {
		list-style: none;
		padding: 0;
		margin: 0 0 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.rules li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.32rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background: var(--color-paper);
		font-size: 0.76rem;
	}
	.rules li[data-mode='deny'] {
		border-color: color-mix(in oklch, var(--color-accent-warning) 35%, transparent);
	}
	.rules li[data-mode='allow'] {
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 30%, transparent);
	}
	.rules li[data-mode='interrupt'] {
		border-color: var(--accent-rule);
	}
	.idx {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		width: 0.9rem;
		text-align: right;
		flex-shrink: 0;
	}
	.rules .mode,
	.mode-btn {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		flex-shrink: 0;
	}
	.rules li[data-mode='deny'] .mode,
	.mode-btn[data-mode='deny'] {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, transparent);
	}
	.rules li[data-mode='allow'] .mode,
	.mode-btn[data-mode='allow'] {
		color: var(--color-accent-success, #4caf6e);
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 45%, transparent);
	}
	.rules li[data-mode='interrupt'] .mode,
	.mode-btn[data-mode='interrupt'] {
		color: var(--accent-ink);
		border-color: var(--accent-rule);
	}
	.mode-btn {
		background: var(--color-bg-elev);
		cursor: pointer;
	}
	.mode-btn:hover {
		background: var(--color-bg-elev-2);
	}
	.ops {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		width: 6.2rem;
		flex-shrink: 0;
	}
	.paths {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg-muted);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.movers {
		display: inline-flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.35rem;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.icon-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.rules.lab {
		margin-bottom: 0.6rem;
	}
	.reset {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.reset:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.lab-hint {
		margin: 0.6rem 0 0;
		font-size: 0.76rem;
		font-style: italic;
		color: var(--color-fg-faint);
	}

	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}
	.anchor {
		height: 0;
	}

	/* Security log */
	.seclog {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.seclog li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.12rem 0.4rem;
		border-radius: 0.35rem;
	}
	.seclog .glyph {
		flex-shrink: 0;
		width: 0.9rem;
		text-align: center;
	}
	.seclog li.allow .glyph {
		color: var(--color-accent-success, #4caf6e);
	}
	.seclog li.deny {
		background: color-mix(in oklch, var(--color-accent-warning) 7%, transparent);
	}
	.seclog li.deny .glyph {
		color: var(--color-accent-warning);
	}
	.seclog li.interrupt {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
	}
	.seclog li.interrupt .glyph {
		color: var(--accent-ink);
	}
	.seclog .op {
		color: var(--color-fg-faint);
		width: 2.8rem;
		flex-shrink: 0;
	}
	.seclog .path {
		color: var(--color-fg-muted);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seclog .rule {
		color: var(--color-fg-faint);
		font-size: 0.64rem;
		flex-shrink: 0;
	}
	.lab-verdicts {
		border-top: 1px dashed var(--color-rule);
		padding-top: 0.55rem;
	}

	/* Gate */
	.gate-ask {
		margin: 0 0 0.55rem;
		font-size: 0.86rem;
		color: var(--color-fg);
	}
	.gate-ask code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--accent-ink);
	}
	.gate-preview {
		margin: 0 0 0.6rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--accent-rule);
		border-radius: 0.45rem;
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 11rem;
		overflow-y: auto;
		color: var(--color-fg-muted);
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
	.gate-actions .ok:hover,
	.gate-actions .no:hover,
	.gate-actions .talk:hover {
		background: var(--color-bg-elev-2);
	}

	/* Final report */
	.final {
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.final :global(p) {
		margin: 0 0 0.4rem;
		line-height: 1.55;
	}
	.final :global(p:last-child) {
		margin-bottom: 0;
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
		color: var(--color-fg);
	}
	.final :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
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
