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
	import ContextTape from '$lib/components/ContextTape.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import type { VirtualFile, ContextItem } from '$lib/deepagents';
	import type { BaseMessage } from '@langchain/core/messages';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		runCompactionDemo,
		MAX_TOKENS,
		EVICT_THRESHOLD_PCT,
		SUMMARIZE_THRESHOLD_PCT,
		NEEDLE,
		INCIDENT_BRIEF,
		type CompactionRunResult,
		type Verdict
	} from '$lib/demos/da-compaction';
	import daCompactionSrc from '$lib/demos/da-compaction.ts?raw';
	import compactionSkill from '$lib/demos/skills/deepagents-compaction.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-compaction',
		title: 'Context compaction — the Incident Room',
		summary:
			'An on-call SRE agent finds the root cause of an outage by reading huge logs. Each read is evicted to disk; the long investigation summarizes the early brief; the needle (scope + 14:00 deadline) must survive to the report.',
		entries: [{ path: 'lib/demos/da-compaction.ts', code: daCompactionSrc }],
		skill: compactionSkill,
		runner: `import { runCompactionDemo } from './lib/demos/da-compaction';

const out = await runCompactionDemo({
	onTrace: (events) => {
		const last = events[events.length - 1];
		if (last?.kind === 'context_snapshot') {
			const d = last.data;
			console.log('round', d.round, '—', d.total, '/', d.max, 'tokens', JSON.stringify(d.tiers));
		}
	}
});

console.log('\\nVerdict:', out.verdict.pass ? 'PASS' : 'REJECTED');
for (const c of out.verdict.checks) console.log('  ' + (c.pass ? '✓' : '✗') + ' ' + c.label);
console.log('\\nReport:\\n' + out.report);
`
	};

	interface Snapshot {
		round: number;
		total: number;
		max: number;
		items: ContextItem[];
		tiers: { evict: boolean; trim: boolean; summarize: boolean };
	}

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let files = $state<VirtualFile[]>([]);
	let report = $state('');
	let verdict = $state<Verdict | null>(null);
	let viewRound = $state(0);
	let following = $state(true); // auto-advance to the newest snapshot during a run

	const snapshots = $derived(
		events
			.filter((e) => e.kind === 'context_snapshot')
			.map((e) => e.data as unknown as Snapshot)
	);

	$effect(() => {
		// While following, keep the scrubber pinned to the latest round.
		if (following && snapshots.length) viewRound = snapshots.length - 1;
	});

	const current = $derived(snapshots[Math.min(viewRound, snapshots.length - 1)]);

	function tierCaption(s: Snapshot | undefined): string {
		if (!s) return '';
		const parts: string[] = [];
		if (s.tiers.evict) parts.push('a log read was evicted to /large_tool_results/');
		if (s.tiers.summarize) parts.push('the early turns — including the brief — collapsed into one summary card');
		if (s.tiers.trim) parts.push('repeated tool arguments were trimmed');
		return parts.length
			? parts.join('; ')
			: 'window under threshold — nothing compacted this round';
	}

	// Needle tracker: in the window → filed to disk (in the summary) → recalled in the report.
	const needleStage = $derived.by(() => {
		const s = current;
		if (!s) return 1;
		const hasBrief = s.items.some((i) => i.role === 'human');
		const hasSummary = s.items.some((i) => i.variant === 'summary');
		const isLast = viewRound === snapshots.length - 1 && !busy;
		if (isLast && verdict?.checks[2]?.pass) return 3;
		if (!hasBrief && hasSummary) return 2;
		return 1;
	});
	const NEEDLE_STEPS = ['in the window', 'filed to disk (in the summary)', 'recalled in the report'];

	async function run() {
		busy = true;
		following = true;
		events = [];
		msgs = [];
		files = [];
		report = '';
		verdict = null;
		viewRound = 0;
		try {
			const result = await withRunCache<CompactionRunResult>(
				{ demoId: 'l3-compaction-incident' },
				async () =>
					runCompactionDemo({
						onTrace: (ev) => (events = ev),
						onProgress: (s) => {
							files = s.files;
							msgs = s.messages;
						}
					})
			);
			events = result.events;
			msgs = result.messages;
			files = result.files;
			report = result.report;
			verdict = result.verdict;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<CompactionRunResult>({ demoId: 'l3-compaction-incident' });
			if (cached) {
				events = cached.payload.events;
				msgs = cached.payload.messages;
				files = cached.payload.files;
				report = cached.payload.report;
				verdict = cached.payload.verdict;
				following = false;
				viewRound = Math.max(0, cached.payload.events.filter((e) => e.kind === 'context_snapshot').length - 1);
			}
		})();
	});

	function onScrub(e: Event) {
		following = false;
		viewRound = +(e.target as HTMLInputElement).value;
	}

	const configCode = `// The compaction budget is deliberately tiny so every tier fires on screen.
// (The real model keeps its full window — we're simulating the harness, not the limit.)
createDeepAgent({
  model, backend,
  compaction: {
    maxTokens: ${MAX_TOKENS},            // budget the pipeline targets
    evictThresholdPct: ${EVICT_THRESHOLD_PCT},      // tier 1 starts here
    summarizeThresholdPct: ${SUMMARIZE_THRESHOLD_PCT},  // tier 3 starts here
    largeToolResultMin: 400,    // a single log read is far bigger → evicted
    historyKeep: 4              // recent turns summarization always preserves
  }
});`;

	const tiersCode = `// Run in order before every model call, cheapest first:
//
// 1 · EVICT      large tool results → /large_tool_results/<id>.txt
//                the message becomes a path + 200-char preview
// 2 · TRIM       repeated tool arguments → '<as before>'
// 3 · SUMMARIZE  older middle messages → one summary card;
//                the raw block → /conversation_history/<ts>.md
// 4 · OVERFLOW   if it STILL won't fit, raise — never silently
//                drop the system prompt`;
</script>

<Lesson
	title="Context compaction"
	eyebrow="Level 3 · Lesson 08 · The Incident Room"
	hero={{
		id: 'l3-compaction',
		alt: 'A clerk buried in coils of log-tape feeds them into a press that prints one small summary card; the bulk is filed into archive drawers'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Context window">context window</Term> is finite; a real investigation isn't. <Term t="Context compaction">Compaction</Term> is how an agent reads a mountain of logs and still remembers the one constraint it was given at the start.
	{/snippet}

	{#snippet intro()}
		<p>
			The demo is <strong>the Incident Room</strong>: an on-call agent must find why checkout is
			throwing 503s by reading several genuinely huge log files. Each read floods the window — so
			the <Term t="Harness">harness</Term> <Term t="Eviction">evicts</Term> the bulk to disk and
			<Term t="Summarization">summarizes</Term> the early turns. Buried in the opening brief is a
			<strong>needle</strong>: the rollback window closes at 14:00, and only api-gateway is in
			scope. Watch whether that needle survives all the way to the final report.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Dropping the oldest messages is a trap" variant="dropcap">
			<p>
				The naïve fix for a full window is to delete the oldest messages. It fails almost
				immediately: the agent forgets the original task and invents a new one to fit the prompt
				it can now see — <Term t="Goal drift">goal drift</Term>. In the Incident Room that means
				reading three logs, losing the brief, and confidently rolling back the wrong service one
				minute before the deadline.
			</p>
			<p>
				Good compaction keeps three things and discards nothing: the <Term t="System prompt">system prompt</Term>,
				the most recent exchanges, and a faithful <Term t="Summarization">summary</Term> of
				everything in between — while the raw material is pushed onto the
				<Term t="Virtual filesystem">filesystem</Term>, still retrievable. Nothing is lost; it's
				relocated.
			</p>
		</Slide>

		<Slide eyebrow="The official shape" title="Four tiers, cheapest first" variant="code-first">
			<p>
				The real <Term t="Summarization">SummarizationMiddleware</Term> triggers at
				<strong>85% of the model's <Term t="max_input_tokens">max input tokens</Term></strong>,
				keeps roughly the most recent <strong>10%</strong>, and writes a structured summary —
				<em>session intent, artifacts created, next steps</em>. Separately, any tool result over
				<strong>~20,000 tokens</strong> is <Term t="Eviction">offloaded</Term> to the backend and
				replaced by a file path plus a ten-line preview. Our glass-box harness mirrors this with
				four tiers you can watch fire:
			</p>
			<CodeBlock code={tiersCode} caption="The pipeline, in order — eviction and summarization are the two you'll see most." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-compaction-tiers"
				alt="An assembly line: a fat roll of log-tape is squeezed and its bulk drops into a filing drawer leaving a thin pointer; repeated stamps are struck through; a concertina of pages is pressed into one card; a relief valve marked 'raise, never truncate'."
			/>
			<figcaption>
				Each tier is cheap; together they keep an agent coherent across dozens of turns. Overflow
				is the safety valve — fail loudly rather than silently drop the system prompt.
			</figcaption>
		</figure>

		<Slide eyebrow="The test" title="The needle in the haystack">
			<p>
				The classic way to prove compaction is faithful is the
				<Term t="Needle-in-a-haystack">needle-in-a-haystack</Term> probe: plant a small, critical
				fact early, bury it under a mountain of context, then check the agent can still act on it.
				Here the needle is the brief's constraint — <em>“{NEEDLE}”</em> — and the haystack is the
				logs. By the time the report is written, that brief has long since left the active window:
				it lives only in the summary card and in <code>/conversation_history/</code>. A good
				summary keeps the <em>intent</em>; a faithful agent reads the report it was actually asked
				for.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-compaction-needle"
				alt="Three panels: a needle resting on a small stack of cards; the same needle filed into an archive drawer as a haystack of tape is baled away; a mechanical arm drawing the needle's card back out, intact."
			/>
			<figcaption>In the window → filed to disk → recalled. A dotted line follows the needle across all three.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				Memory isn't what you keep in the window. Memory is what the agent can still recall when
				the window is full.
			</p>
		</Slide>

		<Slide eyebrow="Try it" title="Read the room" variant="code-first">
			<p>
				The budget here is shrunk on purpose so the tiers fire within a handful of turns. Run the
				incident, then <strong>scrub the rounds</strong>: watch the meter climb toward the eviction
				line; see a fat <code>read_file</code> result collapse into a dashed <em>“evicted →
				/large_tool_results/”</em> pointer; watch the meter cross 82% and the early turns fold into
				a single summary card. Track the needle chip the whole way — <em>in the window → filed to
				disk → recalled in the report</em> — then let the inspector recompute the verdict.
			</p>
			<CodeBlock code={configCode} caption="Low thresholds make the pipeline visible; production uses the model's real window." />
		</Slide>

		<Slide variant="ornament">compress · preserve · recall</Slide>

		<ReadMore
			links={[
				{
					label: 'Context engineering — summarization, offloading, overflow',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/context-engineering'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="The incident" subtitle="INC-2207 · checkout returning 503s">
			<p class="brief">{INCIDENT_BRIEF}</p>
			<div class="actions">
				<RunButton onclick={run} running={busy} label="Dispatch the on-call agent" />
				{#if verdict}
					<span class="stamp" class:pass={verdict.pass}>{verdict.pass ? 'PASS' : 'REJECTED'}</span>
				{/if}
			</div>
		</Panel>

		<Panel
			title="The context window, round by round"
			subtitle="scrub to watch the window fill, evict, and summarize"
		>
			{#if snapshots.length}
				<div class="scrubber">
					<input
						type="range"
						min="0"
						max={snapshots.length - 1}
						value={Math.min(viewRound, snapshots.length - 1)}
						oninput={onScrub}
						aria-label="round"
					/>
					<span class="roundlbl">round {current ? current.round : 0} / {snapshots.length}</span>
				</div>
				{#if current}
					<ContextTape
						items={current.items}
						total={current.total}
						max={current.max}
						evictPct={EVICT_THRESHOLD_PCT}
						summarizePct={SUMMARIZE_THRESHOLD_PCT}
						tiers={current.tiers}
					/>
					<p class="caption">{tierCaption(current)}</p>
				{/if}

				<div class="needle">
					<span class="needle-icon">🪡</span>
					<div class="needle-track">
						{#each NEEDLE_STEPS as step, i (step)}
							<span class="step" class:done={needleStage >= i + 1} class:active={needleStage === i + 1}>
								{needleStage > i + 1 ? '✓' : needleStage === i + 1 ? '◆' : '○'}
								{step}
							</span>
						{/each}
					</div>
				</div>
			{:else}
				<div class="placeholder">{busy ? 'reading the logs…' : 'run the incident to populate the window'}</div>
			{/if}
		</Panel>

		<Panel title="The investigation" subtitle="the on-call agent's working transcript">
			{#if msgs.length}
				<AgentFeed messages={msgs} maxHeight="20rem" />
			{:else}
				<div class="placeholder">{busy ? 'thinking…' : 'no run yet'}</div>
			{/if}
		</Panel>

		{#if verdict}
			<Panel title="Inspector verdict" subtitle="the report, recomputed against ground truth">
				<div class="verdict" class:pass={verdict.pass}>
					<ul>
						{#each verdict.checks as c (c.label)}
							<li class:ok={c.pass}>
								{c.pass ? '✓' : '✗'}
								{c.label}{c.detail ? ` — ${c.detail}` : ''}
							</li>
						{/each}
					</ul>
				</div>
				{#if report}
					<CodeBlock code={report} caption="/report/root-cause.md" />
				{/if}
			</Panel>
		{/if}

		<Panel title="Where the bulk went" subtitle="logs in, evicted bytes and summaries out">
			<FileTreeViewer {files} />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.brief {
		white-space: pre-wrap;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		margin: 0 0 0.9rem;
		padding: 0.7rem 0.85rem;
		border-left: 3px solid var(--color-accent-danger);
		background: color-mix(in oklch, var(--color-accent-danger) 5%, transparent);
		border-radius: 0 7px 7px 0;
	}
	.actions {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.stamp {
		font-weight: 700;
		letter-spacing: 0.14em;
		font-size: 0.74rem;
		color: var(--color-accent-danger);
		border: 1.5px solid currentColor;
		border-radius: 4px;
		padding: 0.1rem 0.5rem;
		transform: rotate(-2deg);
	}
	.stamp.pass {
		color: var(--color-accent-success);
	}

	.scrubber {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.8rem;
	}
	.scrubber input {
		flex: 1;
		accent-color: var(--accent);
	}
	.roundlbl {
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.caption {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin: 0.7rem 0 0;
		min-height: 1.2rem;
	}

	.needle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 1rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--color-border);
	}
	.needle-icon {
		font-size: 1.1rem;
	}
	.needle-track {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.step {
		font-size: 0.74rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		padding: 0.1rem 0.6rem;
		color: var(--color-fg-faint);
	}
	.step.done {
		border-color: color-mix(in oklch, var(--color-accent-success) 50%, var(--color-border));
		color: var(--color-accent-success);
	}
	.step.active {
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
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
		margin-bottom: 0.9rem;
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
		font-size: 0.8rem;
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
