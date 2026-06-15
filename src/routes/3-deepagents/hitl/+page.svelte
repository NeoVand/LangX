<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import ApprovalGate from '$lib/components/ApprovalGate.svelte';
	import GreenhouseGarden from '$lib/components/GreenhouseGarden.svelte';
	import type { CompiledDeepAgent, HarnessInterrupt } from '$lib/deepagents';
	import type { BaseMessage } from '@langchain/core/messages';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		buildGreenhouse,
		GOAL_INPUT,
		seedGarden,
		inspectGarden,
		type Garden,
		type GardenVerdict
	} from '$lib/demos/da-hitl';
	import daHitlSrc from '$lib/demos/da-hitl.ts?raw';
	import hitlSkill from '$lib/demos/skills/deepagents-hitl.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	type ReviewDecision =
		| { type: 'approve' }
		| { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } }
		| { type: 'reject'; message?: string }
		| { type: 'respond'; message: string };

	const demoSource: DemoManifest = {
		id: 'da-hitl',
		title: 'Human-in-the-loop — the Greenhouse',
		summary:
			'A gardener agent proposes one action at a time; every action is gated. Approve, edit, reject, or respond — each visibly changes the garden. Risk tiers via allowedDecisions.',
		entries: [{ path: 'lib/demos/da-hitl.ts', code: daHitlSrc }],
		skill: hitlSkill,
		runner: `import { runGreenhouseDemo } from './lib/demos/da-hitl';

// A CLI host that approves everything except the pesticide, which it rejects.
const finalText = await runGreenhouseDemo((interrupt) => {
	console.log('  · gate:', interrupt.tool, JSON.stringify(interrupt.args));
	if (interrupt.tool === 'spray_pesticide')
		return { type: 'reject', message: "We're organic — pick them off by hand." };
	if (interrupt.tool === 'ask_gardener') return { type: 'respond', message: 'Plant lavender.' };
	return { type: 'approve' };
});
console.log('\\nFinal:', finalText);
`
	};

	let busy = $state(false);
	let started = $state(false);
	let garden = $state<Garden>(seedGarden());
	let msgs = $state<BaseMessage[]>([]);
	let events = $state<TraceEvent[]>([]);
	let pending = $state<HarnessInterrupt | null>(null);
	let verdict = $state<GardenVerdict | null>(null);
	let log = $state<{ tool: string; verb: string; bed?: number }[]>([]);
	let agent: CompiledDeepAgent | null = null;
	let thread = '';

	const VERB_LABEL: Record<string, string> = {
		approve: 'approved',
		edit: 'edited',
		reject: 'rejected',
		respond: 'answered'
	};

	const pendingBed = $derived(
		pending && typeof pending.args?.bed === 'number' ? (pending.args.bed as number) : null
	);
	const gateProps = $derived(
		pending
			? {
					name: pending.tool,
					args: pending.args,
					description: pending.description,
					allowedDecisions: pending.allowedDecisions ?? ['approve', 'edit', 'reject', 'respond']
				}
			: null
	);

	async function run() {
		busy = true;
		started = true;
		garden = seedGarden();
		msgs = [];
		events = [];
		pending = null;
		verdict = null;
		log = [];
		const built = await buildGreenhouse({
			onTrace: (ev) => (events = [...events, ev]),
			onGarden: (g) => (garden = g)
		});
		agent = built.agent;
		thread = built.thread;
		agent.subscribe((s) => (msgs = [...s.messages]));
		try {
			const res = await agent.start({ input: built.input, thread });
			settle(res);
		} finally {
			busy = false;
		}
	}

	function settle(res: { status: string; interrupt?: HarnessInterrupt; state?: unknown }) {
		if (res.status === 'interrupted' && res.interrupt) {
			pending = res.interrupt;
		} else {
			pending = null;
			verdict = inspectGarden(garden);
		}
	}

	async function decide(d: ReviewDecision) {
		if (!agent || !pending) return;
		const tool = pending.tool;
		const bed = pendingBed ?? undefined;
		busy = true;
		// Map the card's decision onto the harness resume shape.
		const resume =
			d.type === 'edit' ? { type: 'edit', args: d.editedAction.args } : d;
		log = [...log, { tool, verb: d.type, bed }];
		pending = null;
		try {
			const res = await agent.resume(resume, thread);
			settle(res);
		} finally {
			busy = false;
		}
	}

	const interruptCode = `createDeepAgent({
  tools: [plant, water, prune, removePestsByHand, sprayPesticide, askGardener],
  interruptOn: {
    plant: true,              // all four verbs offered
    water: true,
    prune: true,
    remove_pests_by_hand: true,
    spray_pesticide: {        // harsh + irreversible →
      allowedDecisions: ['approve', 'reject']   // no editing a chemical dose
    },
    ask_gardener: { allowedDecisions: ['respond'] }  // a question → just answer it
  },
  checkpointer                // REQUIRED — the pause lives in the saved state
});`;

	const loopCode = `// The host drives start → resume, one decision per pause:
let res = await agent.start({ input });
while (res.status === 'interrupted') {
  const { tool, args, allowedDecisions } = res.interrupt;
  const decision = await askHuman(tool, args, allowedDecisions);
  //   { type: 'approve' }
  // | { type: 'edit',   args: { ...changed } }
  // | { type: 'reject', message: 'why — the agent adapts' }
  // | { type: 'respond', message: 'answer — the tool never runs' }
  res = await agent.resume(decision);   // same thread_id
}`;
</script>

<Lesson
	title="Human-in-the-loop"
	eyebrow="Level 3 · Lesson 09 · The Greenhouse"
	hero={{
		id: 'l3-hitl',
		alt: 'A brass automaton gardener pauses at a turnstile gate, a watering can held mid-pour, while a human approval stamp glows beside it'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Some actions a model proposes should never run unreviewed. <Term t="interruptOn"><code>interruptOn</code></Term> makes "pause and ask a human" a property of the <Term t="Harness">harness</Term> — not glue code you write per tool.
	{/snippet}

	{#snippet intro()}
		<p>
			The demo is <strong>the Greenhouse</strong>: an autonomous gardener agent works four beds
			toward a goal, but <em>every</em> action — plant, water, prune, clear pests — is gated. You
			are the head gardener. Nothing touches a bed until you decide, and you have four ways to
			decide: <strong>approve</strong>, <strong>edit</strong>, <strong>reject</strong>, or
			<strong>respond</strong>. Each one visibly changes what grows.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A pause, not a longer prompt" variant="dropcap">
			<p>
				Some <Term t="tool">tools</Term> can't be trusted to a model alone — sending money,
				deleting data, spraying a chemical. The right primitive isn't a sterner system prompt
				asking it to be careful; it's a <em>pause</em>. <Term t="interruptOn"><code>interruptOn</code></Term> turns any
				named tool into one that halts the <Term t="LangGraph">graph</Term>, surfaces the proposed
				call with its arguments, and resumes only on a human decision.
			</p>
			<p>
				Because the pause is built into the harness, the <em>same</em> approval card works for
				every tool you ever gate — and the whole run is <Term t="Checkpointer">checkpointed</Term>
				while it waits, so a human can take a minute, a meeting, or a day.
			</p>
		</Slide>

		<Slide eyebrow="The four decisions" title="Approve · edit · reject · respond">
			<p>
				When the agent calls a gated tool, the harness pauses and hands you the proposal. You have
				four official verbs, and they are genuinely different:
			</p>
			<ul class="verbs">
				<li><b>Approve</b> — run the tool exactly as proposed.</li>
				<li><b>Edit</b> — run it with <em>changed</em> arguments (a different bed, a different species). The agent's intent, your details.</li>
				<li><b>Reject</b> — don't run it; send a note back. The agent reads it and <em>adapts</em> — propose pesticide, get rejected with "we're organic", and it switches to removing pests by hand.</li>
				<li><b>Respond</b> — for an <em>ask</em> tool: the tool never runs; your message is handed back as its result. The gardener asks "what should I plant in bed 2?" and you simply tell it.</li>
			</ul>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-hitl-four-decisions"
				alt="Four brass control stations: APPROVE stamps a seal, EDIT turns a dial that adjusts arguments, REJECT stamps a card with a note, RESPOND sends a reply down a speaking tube."
			/>
			<figcaption>The four verbs, each a different instrument — approve runs it, edit changes it, reject refuses it, respond answers it.</figcaption>
		</figure>

		<Slide eyebrow="The config" title="Gate by name, tier by risk" variant="code-first">
			<p>
				One map does it. A tool set to <code>true</code> offers all four verbs; a tool with
				<Term t="allowedDecisions"><code>allowedDecisions</code></Term> offers only the ones that
				make sense for its risk. The pesticide is approve-or-reject — you don't want to fine-tune a
				chemical dose, only say yes or no. The ask tool is respond-only.
			</p>
			<CodeBlock code={interruptCode} caption="interruptOn — a flat true, or a per-tool risk tier." />
		</Slide>

		<Slide eyebrow="The mechanism" title="Pause inside the graph, resume on a Command" variant="code-first">
			<p>
				This is built directly on Level 2's <Term t="Interrupt">interrupt</Term> primitive. The
				gated call throws an interrupt carrying the tool, its args, and the allowed verbs; the run
				is <Term t="Checkpointer">checkpointed</Term> mid-flight; and it continues only when the
				host resumes with a <Term t="Command">Command</Term> on the same thread. Multiple gated
				calls in one step batch together — one decision each.
			</p>
			<CodeBlock code={loopCode} caption="The host loop — start until interrupted, resume per decision." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-hitl-gate"
				alt="An automaton's arm holding a pesticide sprayer is halted at a closed turnstile; behind it the clockwork is frozen mid-tick; a risk dial shows pesticide set to approve-only."
			/>
			<figcaption>The run freezes at the gate. Nothing irreversible happens until you decide — and the dial says which decisions you even get.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>Trust is a UX problem before it is a model problem. The gate is where you solve it.</p>
		</Slide>

		<Slide variant="ornament">propose · pause · decide</Slide>

		<ReadMore
			links={[
				{
					label: 'Human-in-the-loop — interruptOn, the four decisions, resume',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="you hold every gate">
			<ol class="howto">
				<li><strong>Send in the automaton.</strong> It works four garden beds toward the goal, but proposes one gated action at a time — nothing touches a bed until you decide.</li>
				<li><strong>Use all four verbs.</strong> On each approval card: <strong>approve</strong> as-is, <strong>edit</strong> the arguments, <strong>reject</strong> with a note (it adapts), or <strong>respond</strong> when it asks a question. Try rejecting the pesticide as "we're organic".</li>
				<li><strong>Watch the greenhouse and your decisions.</strong> Each verb visibly changes what grows; the decisions log records every call, and the inspector checks every bed against the goal.</li>
			</ol>
		</Panel>

		<Panel title="The head gardener's brief" subtitle="you hold every approval">
			<p class="brief">{GOAL_INPUT}</p>
			<div class="actions">
				<RunButton onclick={run} running={busy && !pending} label="Send in the automaton" />
				{#if verdict}
					<span class="stamp" class:pass={verdict.pass}>
						{verdict.pass ? 'GREENHOUSE READY' : 'NOT READY'}
					</span>
				{/if}
			</div>
		</Panel>

		<Panel title="The greenhouse" subtitle={pending ? `under review: ${pending.tool}` : 'four beds, one goal'}>
			<GreenhouseGarden
				{garden}
				{pendingBed}
				pendingAction={pending?.tool ?? null}
				thinking={busy && !pending}
			/>
		</Panel>

		{#if pending && gateProps}
			<Panel title="Approval needed" subtitle="nothing runs until you decide">
				{#if pending.tool === 'ask_gardener'}
					<p class="ask">🌱 The automaton asks: <em>{String(pending.args.question ?? '')}</em></p>
				{/if}
				<ApprovalGate pending={gateProps} busy={busy} onDecision={(d) => decide(d as ReviewDecision)} />
			</Panel>
		{/if}

		{#if log.length}
			<Panel title="Your decisions">
				<ul class="decisions">
					{#each log as d, i (i)}
						<li>
							<span class="dtool">{d.tool}{d.bed ? ` · bed ${d.bed}` : ''}</span>
							<span class="dverb {d.verb}">{VERB_LABEL[d.verb] ?? d.verb}</span>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		<Panel title="The gardener's transcript" subtitle="proposals, results, and how it adapts">
			{#if msgs.length}
				<AgentFeed messages={msgs} maxHeight="18rem" />
			{:else}
				<div class="placeholder">{started ? 'thinking…' : 'no run yet'}</div>
			{/if}
		</Panel>

		{#if verdict}
			<Panel title="Inspector" subtitle="every bed, checked against the goal">
				<div class="verdict" class:pass={verdict.pass}>
					<ul>
						{#each verdict.checks as c (c.label)}
							<li class:ok={c.pass}>{c.pass ? '✓' : '✗'} {c.label}</li>
						{/each}
					</ul>
				</div>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
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

	.brief {
		white-space: pre-wrap;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
		margin: 0 0 0.9rem;
		padding: 0.7rem 0.85rem;
		border-left: 3px solid var(--accent);
		background: color-mix(in oklch, var(--accent) 5%, transparent);
		border-radius: 0 7px 7px 0;
	}
	.actions {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.stamp {
		font-weight: 700;
		letter-spacing: 0.13em;
		font-size: 0.72rem;
		color: var(--color-accent-danger);
		border: 1.5px solid currentColor;
		border-radius: 4px;
		padding: 0.1rem 0.5rem;
		transform: rotate(-2deg);
	}
	.stamp.pass {
		color: var(--color-accent-success);
	}
	.ask {
		font-size: 0.9rem;
		color: var(--color-fg-default);
		margin: 0 0 0.2rem;
	}

	.verbs {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.95rem;
		line-height: 1.5;
	}

	.decisions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.decisions li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.dtool {
		color: var(--color-fg-muted);
	}
	.dverb {
		text-transform: uppercase;
		font-size: 0.66rem;
		letter-spacing: 0.08em;
	}
	.dverb.approve {
		color: var(--color-accent-success);
	}
	.dverb.reject {
		color: var(--color-accent-danger);
	}
	.dverb.edit,
	.dverb.respond {
		color: var(--accent-ink);
	}

	.placeholder {
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		padding: 1.6rem 0.6rem;
		text-align: center;
		color: var(--color-fg-faint);
		font-size: 0.82rem;
	}

	.verdict {
		border: 1px solid color-mix(in oklch, var(--color-accent-danger) 45%, var(--color-border));
		border-radius: 8px;
		padding: 0.6rem 0.7rem;
	}
	.verdict.pass {
		border-color: color-mix(in oklch, var(--color-accent-success) 45%, var(--color-border));
	}
	.verdict ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.82rem;
	}
	.verdict li {
		color: var(--color-accent-danger);
	}
	.verdict li.ok {
		color: var(--color-fg-muted);
	}

	.diagram {
		margin: 2.2rem 0;
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
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		text-align: center;
	}
</style>
