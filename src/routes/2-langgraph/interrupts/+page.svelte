<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import Crest from '$lib/components/Crest.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo, type EdgeDetail } from '$lib/components/LiveGraph.svelte';
	import { MemorySaver, Command } from '@langchain/langgraph/web';
	import {
		buildCrestGraph,
		runCrestTurn,
		PALETTES,
		CHARGES,
		TRAIT_LABEL,
		type Proposal,
		type CrestSnapshot,
		type CrestGraph,
		type Trait
	} from '$lib/demos/lg-interrupts';
	import lgInterruptsSrc from '$lib/demos/lg-interrupts.ts?raw';
	import graphRunSrc from '$lib/demos/graph-run.ts?raw';
	import interruptsSkill from '$lib/demos/skills/langgraph-interrupts.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Check, RefreshCw, Pencil, X } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'interrupts',
		title: 'Interrupts & HITL',
		summary:
			'Pause a graph mid-run with interrupt(), surface a proposal to a human, then resume with Command({ resume }) — an AI crest designer you approve trait by trait.',
		entries: [
			{ path: 'lib/demos/graph-run.ts', code: graphRunSrc },
			{ path: 'lib/demos/lg-interrupts.ts', code: lgInterruptsSrc }
		],
		runner: `import { MemorySaver, Command } from '@langchain/langgraph/web';
import { buildCrestGraph, runCrestTurn } from './lib/demos/lg-interrupts';

const config = { configurable: { thread_id: 'crest-1' } };
const graph = await buildCrestGraph(new MemorySaver());

let r = await runCrestTurn(graph, { theme: 'a guild of night-owl coders' }, config);
let seed = r.snapshot;
while (r.interrupted) {
  console.log('⏸ paused — proposing', r.proposal?.trait + ':', r.proposal?.value);
  // A human would decide here; we just approve everything:
  r = await runCrestTurn(graph, new Command({ resume: { action: 'approve' } }), config, undefined, seed);
  seed = r.snapshot;
}
console.log('\\nfinished crest:', r.snapshot.blazon);`,
		skill: interruptsSkill
	};

	// ── Live graph layout: propose ⇄ gate → assemble ─────────────────────────────
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 54, cy: 50, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'propose', label: 'propose', sub: 'suggest a trait', cx: 196, cy: 50, w: 124, h: 48, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'gate', label: 'gate', sub: 'pause for you', cx: 404, cy: 50, w: 124, h: 48, shape: 'box' as const, variant: 'interrupt' as const },
		{ id: 'assemble', label: 'assemble', sub: 'finalize crest', cx: 404, cy: 156, w: 124, h: 46, shape: 'box' as const, variant: 'code' as const },
		{ id: '__end__', label: 'END', cx: 404, cy: 234, w: 52, h: 26, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'propose' },
		{ from: 'propose', to: 'gate', bow: -22, lift: -14 },
		{ from: 'gate', to: 'propose', label: 'loop', bow: -22, lift: 14, labelDy: 11 },
		{ from: 'gate', to: 'assemble', label: 'done' },
		{ from: 'assemble', to: '__end__' }
	];
	const nodeMeta: Record<string, NodeMeta> = {
		__start__: {
			desc: 'Your theme enters as state.',
			explain: { lead: 'You set a theme.', body: 'The theme ("a guild of night-owl coders") becomes the graph’s state. From it, the studio designs a crest one piece at a time.' }
		},
		propose: {
			label: 'propose (model node)',
			desc: 'The model suggests the next trait: palette → pattern → charge → motto.',
			explain: { lead: 'The AI suggests a piece.', body: 'For the current trait, the model proposes a themed value. It does NOT apply it — it just hands the suggestion to the gate, where you decide.' },
			code: `const value = await suggest(TRAITS[step], theme);
return { proposal: { trait, value, options } };`
		},
		gate: {
			label: 'gate (interrupt node)',
			desc: 'Pauses the run and surfaces the proposal — nothing continues until you resume.',
			explain: { lead: 'The pause.', body: 'interrupt(proposal) stops the graph and shows you the suggestion. The run waits — checkpointed — until you Approve, Shuffle (re-roll), or Edit. Your decision becomes the value interrupt() returns.' },
			code: `const d = interrupt(proposal);   // ⏸ pauses here
if (d.action === 'shuffle') return { proposal: null };
return { [trait]: d.value ?? proposal.value, step: step + 1 };`
		},
		assemble: {
			label: 'assemble (code node)',
			desc: 'Once every trait is decided, composes the final crest + blazon.',
			explain: { lead: 'Done designing.', body: 'When all four traits are approved, the conditional edge routes here to finalize the crest and write its heraldic blazon.' }
		},
		__end__: { desc: 'The crest is complete.', explain: { lead: 'Finished.', body: 'Every piece got a human sign-off. The crest on the right is yours.' } }
	};
	const EDGE_DETAIL: Record<string, EdgeDetail> = {
		'gate|propose': {
			title: 'Loop back',
			variant: '',
			desc: 'After your decision, control returns to propose — for the next trait, or (on Shuffle) to re-suggest the same one. This loop is what lets one graph collect many approvals.',
			code: `.addConditionalEdges('gate', (s) =>
  s.step >= TRAITS.length ? 'assemble' : 'propose')`
		},
		'gate|assemble': {
			title: 'Conditional edge · done',
			variant: 'router',
			desc: 'When every trait is decided, the same conditional edge routes to assemble instead of looping.',
			code: `s.step >= TRAITS.length ? 'assemble' : 'propose'`
		}
	};

	// ── State ─────────────────────────────────────────────────────────────────────
	const saver = new MemorySaver();
	let graphPromise: Promise<CrestGraph> | null = null;
	async function getGraph(): Promise<CrestGraph> {
		graphPromise ??= buildCrestGraph(saver);
		return graphPromise;
	}
	let threadSeq = 0;
	let threadId = '';

	const emptyView = (): CrestSnapshot => ({ theme: '', step: 0, palette: '', pattern: '', charge: '', motto: '', proposal: null, blazon: '' });

	let theme = $state('a guild of night-owl coders');
	let frames = $state<{ node: string; snap: CrestSnapshot }[]>([]);
	let frameIdx = $state(0);
	let snap = $state<CrestSnapshot>(emptyView());
	let interrupted = $state(false);
	let proposal = $state<Proposal | null>(null);
	let busy = $state(false);
	let done = $state(false);
	let error = $state('');
	let editing = $state(false);
	let editMotto = $state('');

	const pausedNode = $derived(interrupted ? 'gate' : undefined);
	// The crest preview: approved traits, with the pending proposal overlaid so you
	// see exactly what you're approving.
	const view = $derived.by(() => {
		const v: Record<Trait, string> = { palette: snap.palette, pattern: snap.pattern, charge: snap.charge, motto: snap.motto };
		if (proposal) v[proposal.trait] = proposal.value;
		return v;
	});

	const STEP_MS = 360;
	async function pushFrame(node: string, s: CrestSnapshot) {
		frames = [...frames, { node, snap: s }];
		frameIdx = frames.length - 1;
		snap = s;
		await new Promise((r) => setTimeout(r, STEP_MS));
	}

	async function start() {
		if (busy || !theme.trim()) return;
		error = '';
		done = false;
		interrupted = false;
		proposal = null;
		editing = false;
		frames = [];
		frameIdx = 0;
		snap = emptyView();
		threadId = `crest-${++threadSeq}`;
		busy = true;
		try {
			const graph = await getGraph();
			const r = await runCrestTurn(graph, { theme: theme.trim() }, { configurable: { thread_id: threadId } }, pushFrame);
			snap = r.snapshot;
			if (r.interrupted) {
				interrupted = true;
				proposal = r.proposal;
			} else done = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function decide(action: 'approve' | 'shuffle' | 'edit', value?: string) {
		if (busy || !interrupted) return;
		editing = false;
		const seed = frames.length ? frames[frames.length - 1].snap : undefined;
		interrupted = false; // stop the pulse while resuming
		proposal = null;
		busy = true;
		try {
			const graph = await getGraph();
			const r = await runCrestTurn(
				graph,
				new Command({ resume: { action, value } }),
				{ configurable: { thread_id: threadId } },
				pushFrame,
				seed
			);
			snap = r.snapshot;
			if (r.interrupted) {
				interrupted = true;
				proposal = r.proposal;
			} else done = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function startEditMotto() {
		editMotto = proposal?.value ?? '';
		editing = true;
	}

	function describe(node: string, s: CrestSnapshot): StepInfo | null {
		switch (node) {
			case '__start__':
				return { summary: `Theme set — “${s.theme}”`, stateChange: 'state = { theme }' };
			case 'propose':
				return s.proposal
					? { summary: `Proposed ${TRAIT_LABEL[s.proposal.trait]}: ${s.proposal.value}`, stateChange: 'proposal = { … }', insight: 'Nothing is committed yet — the gate waits for you.' }
					: { summary: 'Proposing the next trait' };
			case 'gate':
				return { summary: 'Applied your decision', stateChange: 'trait recorded · step += 1', insight: 'On Shuffle this loops back without advancing.' };
			case 'assemble':
				return { summary: 'Crest finalized', items: s.blazon ? [{ icon: '🛡', text: s.blazon }] : undefined };
			case '__end__':
				return { summary: 'Every piece got a human sign-off' };
			default:
				return null;
		}
	}
	function toState(s: CrestSnapshot): Record<string, unknown> {
		return { theme: s.theme, step: s.step, palette: s.palette, pattern: s.pattern, charge: s.charge, motto: s.motto, pending: s.proposal?.value ?? null };
	}

	const starters = ['a guild of night-owl coders', 'a deep-sea exploration society', 'a dragon-taming academy'];

	// ── Narrative code excerpts ───────────────────────────────────────────────────
	const code = `import { interrupt, Command, MemorySaver } from '@langchain/langgraph';

const graph = builder.compile({ checkpointer: new MemorySaver() });   // pause needs a saver

// Inside a node — pauses the whole run and surfaces a payload:
const decision = interrupt({ trait: 'palette', value: 'midnight & gold' });

// Caller side:
let out = await graph.invoke(input, { configurable: { thread_id: 't1' } });
if (out.__interrupt__) {
  const choice = await askHuman(out.__interrupt__[0].value);   // approve / edit / reject
  out = await graph.invoke(new Command({ resume: choice }),    // resume from the pause
    { configurable: { thread_id: 't1' } });
}`;

	const dangerCode = `// The same primitive, higher stakes — gate any irreversible action:
const ok = interrupt({ type: 'confirm', action: 'deploy to production' });
if (ok.action !== 'approve') return { aborted: true };
// …only runs after an explicit human yes.`;
</script>

<Lesson
	title="Interrupts & HITL"
	eyebrow="Level 2 · Lesson 04"
	hero={{ id: 'l2-interrupts', alt: 'A brass machine paused mid-run beside a human approval stamp and a glowing pause gauge' }}
	source={demoSource}
>
	{#snippet motivation()}
		Some decisions belong to humans. <Term t="Interrupt">Interrupts</Term> make "pause and ask" a
		first-class language feature, not a gluey hack — the same primitive behind
		<Term t="HITL">human-in-the-loop</Term> in Level 3.
	{/snippet}
	{#snippet intro()}
		<p>
			An <Term t="Interrupt" /> turns any <Term t="Node" /> into a "wait for the human" gate. The graph
			pauses, the <Term t="Checkpointer">checkpointer</Term> records exact <Term t="State" />, and
			execution resumes when you call <Term t="invoke">invoke</Term> with a
			<Term t="Command"><code>Command(&#123; resume &#125;)</code></Term>. The demo on the right is an
			<strong>AI crest designer</strong> — it proposes each piece and pauses for your sign-off.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Approval as a primitive" variant="dropcap">
			<p>
				Every team that ships an <Term t="Agent">agent</Term> eventually invents the same hack: a
				regex, a confirmation prompt, a side-channel queue. <Term t="Interrupt">Interrupts</Term> make
				that hack a first-class graph feature. The runtime owns the pause; the
				<Term t="Checkpointer">checkpointer</Term> owns the <Term t="State" />; your code just declares
				<em>where</em> the pause lives.
			</p>
			<p>
				This is the same primitive the <Term t="Deep Agent">Deep Agents</Term> harness uses for its
				<Term t="HITL">HITL</Term> middleware in Level 3. Wrapping a <Term t="tool">tool</Term> call in
				an approval gate compiles down to a <Term t="Node" /> that calls
				<Term t="Interrupt"><code>interrupt(...)</code></Term> and waits for a
				<Term t="Command"><code>Command</code></Term>. Once you see how thin the surface is, you stop
				reinventing it.
			</p>
		</Slide>

		<Slide title="The mechanics" variant="code-first">
			<CodeBlock code={code} caption="interrupt() + Command(resume) is a complete pause/resume API." />
			<p>
				<Term t="Interrupt"><code>interrupt(value)</code></Term> throws a signal the runtime catches; the
				<Term t="Checkpointer">checkpointer</Term> saves <Term t="State" /> with the node still pending.
				The next call with a <Term t="Command"><code>Command</code></Term> and
				<Term t="resume"><code>resume</code></Term> payload re-runs the node, and this time
				<code>interrupt()</code> <em>returns</em> your decision instead of pausing.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage id="interrupts-gate" alt="A graph propose → ⏸ gate → resume, where the gate is a brass barrier with three labelled outcomes: Accept, Edit, Reject." />
			<figcaption>An interrupt is a gate: the run halts there until a human passes a decision back.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				The runtime owns the pause. Your code owns the policy. That separation is what makes
				<Term t="HITL">HITL</Term> a feature instead of a project.
			</p>
		</Slide>

		<Slide title="Where you'll use this" variant="code-first">
			<p>
				Approve a tool call before it runs. Let a human edit the model's plan. Require sign-off before
				sending. The same primitive scales from "pick a colour" to "deploy to production" — only the
				payload and the stakes change.
			</p>
			<CodeBlock code={dangerCode} caption="Same primitive, different stakes." />
		</Slide>

		<figure class="diagram">
			<HeroImage id="interrupts-resume" alt="A checkpoint medallion held at a gate; a human stamp marked approve, edit, or reject, and a Command(resume) lever sending the run onward." />
			<figcaption>Pause → decide → resume: the checkpoint waits at the gate until your stamp sends it on.</figcaption>
		</figure>

		<Slide title="One pattern, many UIs" ornament>
			<p>
				Approval queues. Plan editors. Confirmation dialogs. A crest studio. They all read the same
				payload off <Term t="__interrupt__"><code>__interrupt__</code></Term> and resume with a
				<Term t="Command"><code>Command</code></Term>. The <Term t="StateGraph" /> is the contract;
				the UI is the wrapper.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Human-in-the-loop (concepts)', href: 'https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/', kind: 'docs' },
				{ label: 'interrupt() & Command (how-to)', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/interrupt/', kind: 'docs' },
				{ label: 'Command API', href: 'https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.Command.html', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="the studio proposes each piece — you have the final say">
			<ol class="howto">
				<li><strong>Theme it.</strong> Give the studio a vibe; it designs a crest one piece at a time.</li>
				<li><strong>Decide each pause.</strong> At every <code>interrupt()</code> you can <Check size={12} /> Approve, <RefreshCw size={12} /> Shuffle for a new idea, or <Pencil size={12} /> Edit to choose yourself.</li>
				<li><strong>Watch it build.</strong> The shield fills in as you sign off on palette → pattern → emblem → motto.</li>
			</ol>
		</Panel>

		<Panel title="Crest studio" subtitle={interrupted ? 'paused — your call' : done ? 'complete' : 'pick a theme and run'}>
			<div class="studio">
				<div class="stage">
					<Crest palette={view.palette} pattern={view.pattern} charge={view.charge} motto={view.motto} pulse={interrupted} />
				</div>

				{#if !interrupted && !done}
					<label class="theme">
						<span>Theme</span>
						<input type="text" bind:value={theme} disabled={busy} placeholder="a guild of night-owl coders" />
					</label>
					<div class="starters">
						{#each starters as s (s)}
							<button class="starter" onclick={() => { theme = s; start(); }} disabled={busy}>{s}</button>
						{/each}
					</div>
					<RunButton onclick={start} running={busy} label="Design my crest" />
				{/if}

				{#if interrupted && proposal}
					<div class="gate">
						<div class="gate-head">⏸ Paused — approve the <strong>{TRAIT_LABEL[proposal.trait]}</strong></div>
						<div class="proposal">
							{#if proposal.trait === 'palette'}
								<span class="swatch" style="--a:{PALETTES[proposal.value]?.primary};--b:{PALETTES[proposal.value]?.secondary}"></span>
							{:else if proposal.trait === 'charge'}
								<span class="emoji">{CHARGES[proposal.value]}</span>
							{/if}
							<span class="pval">{proposal.trait === 'motto' ? `“${proposal.value}”` : proposal.value}</span>
						</div>

						{#if editing}
							{#if proposal.trait === 'motto'}
								<div class="edit-motto">
									<input type="text" bind:value={editMotto} disabled={busy} maxlength="42" />
									<button class="ea accept" onclick={() => decide('edit', editMotto.trim() || proposal!.value)} disabled={busy}><Check size={14} /> Use this</button>
								</div>
							{:else}
								<div class="chips">
									{#each proposal.options as opt (opt)}
										<button class="chip" class:on={opt === proposal.value} onclick={() => decide('edit', opt)} disabled={busy}>
											{#if proposal.trait === 'palette'}<span class="swatch sm" style="--a:{PALETTES[opt]?.primary};--b:{PALETTES[opt]?.secondary}"></span>{/if}
											{#if proposal.trait === 'charge'}<span class="emoji sm">{CHARGES[opt]}</span>{/if}
											{opt}
										</button>
									{/each}
								</div>
							{/if}
							<button class="link" onclick={() => (editing = false)}><X size={12} /> cancel</button>
						{:else}
							<div class="gate-actions">
								<button class="ea accept" onclick={() => decide('approve')} disabled={busy}><Check size={15} /> Approve</button>
								<button class="ea shuffle" onclick={() => decide('shuffle')} disabled={busy}><RefreshCw size={15} /> Shuffle</button>
								<button class="ea edit" onclick={() => (proposal?.trait === 'motto' ? startEditMotto() : (editing = true))} disabled={busy}><Pencil size={15} /> Edit</button>
							</div>
						{/if}
					</div>
				{/if}

				{#if done}
					<div class="blazon">{snap.blazon}</div>
					<button class="newbtn" onclick={start} disabled={busy}>New crest</button>
				{/if}

				{#if error}<div class="err">{error}</div>{/if}
			</div>
		</Panel>

		{#if frames.length}
			<Panel title="The graph, live" subtitle="hover any node — the gate pulses while it waits for you">
				<div class="graph-wrap">
					<LiveGraph nodes={graphNodes} edges={graphEdges} {frames} bind:frameIdx meta={nodeMeta} edgeDetails={EDGE_DETAIL} {describe} {toState} {pausedNode} />
				</div>
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
	.howto :global(svg) {
		display: inline;
		vertical-align: -2px;
		color: var(--accent);
	}
	.howto code {
		font-family: var(--font-mono);
		font-size: 0.82em;
		color: var(--accent-ink);
	}

	.studio {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.stage {
		display: flex;
		justify-content: center;
		padding: 0.4rem 0 0.2rem;
	}
	.theme {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.theme span {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-fg-muted);
	}
	.theme input {
		width: 100%;
	}
	.starters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
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

	/* Approval gate */
	.gate {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--accent-rule);
		border-radius: 0.6rem;
		background: color-mix(in oklch, var(--accent) 6%, transparent);
	}
	.gate-head {
		font-size: 0.82rem;
		color: var(--color-fg);
	}
	.proposal {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.pval {
		font-family: var(--font-mono);
		font-size: 0.92rem;
		color: var(--accent-ink);
	}
	.swatch {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.3rem;
		border: 1px solid var(--color-rule);
		background: linear-gradient(135deg, var(--a) 0 50%, var(--b) 50% 100%);
	}
	.swatch.sm {
		width: 1rem;
		height: 1rem;
		border-radius: 0.2rem;
	}
	.emoji {
		font-size: 1.4rem;
		line-height: 1;
	}
	.emoji.sm {
		font-size: 1rem;
	}
	.gate-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.ea {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-rule);
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
		font-size: 0.8rem;
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
	}
	.ea:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ea.accept {
		background: var(--accent);
		color: #1a1206;
		border-color: transparent;
		font-weight: 600;
	}
	.ea.shuffle:hover:not(:disabled),
	.ea.edit:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-ink-100);
		font-size: 0.76rem;
		cursor: pointer;
	}
	.chip.on {
		border-color: var(--accent);
		color: var(--accent);
	}
	.chip:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.edit-motto {
		display: flex;
		gap: 0.4rem;
	}
	.edit-motto input {
		flex: 1;
	}
	.link {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		color: var(--color-fg-faint);
		font-size: 0.74rem;
		cursor: pointer;
	}
	.link:hover {
		color: var(--accent);
	}

	.blazon {
		text-align: center;
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-style: italic;
		color: var(--color-fg-muted);
	}
	.newbtn {
		align-self: center;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg-elev);
		color: var(--color-fg);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.newbtn:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.err {
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	.graph-wrap :global(svg[aria-label='Agent graph']) {
		display: block;
		height: 320px;
		width: auto;
		max-width: 100%;
		margin: 0 auto;
	}
</style>
