<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { compaction as compactionDiagram } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import ContextMeter from '$lib/components/ContextMeter.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import type { VirtualFile } from '$lib/deepagents';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import type { TraceEvent } from '$lib/runtime/tracer/types';
	import {
		runCompactionDemo,
		MAX_TOKENS,
		EVICT_THRESHOLD_PCT,
		SUMMARIZE_THRESHOLD_PCT,
		type CompactionRunResult
	} from '$lib/demos/da-compaction';
	import daCompactionSrc from '$lib/demos/da-compaction.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-compaction',
		title: 'Context compaction',
		summary:
			'Run the four-tier compaction pipeline at low thresholds so eviction and summarization visibly fire.',
		entries: [{ path: 'lib/demos/da-compaction.ts', code: daCompactionSrc }],
		runner: `import { runCompactionDemo } from './lib/demos/da-compaction';

const out = await runCompactionDemo({
	onTrace: (events) => {
		const last = events[events.length - 1];
		if (last) console.log('  ·', last.kind, '—', last.label);
	}
});

console.log('\\nLive tokens:', out.liveTokens);
console.log('Files:', out.files.map((f) => f.path).join(', '));
console.log('Final:', out.finalText);
`
	};

	type RunPayload = CompactionRunResult;

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let files = $state<VirtualFile[]>([]);
	let liveTokens = $state(0);
	let finalText = $state<string>('');

	const MAX = MAX_TOKENS;

	async function run() {
		busy = true;
		events = [];
		files = [];
		liveTokens = 0;
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-compaction-run' },
				async () =>
					await runCompactionDemo({
						onTrace: (ev) => (events = ev),
						onProgress: (s) => {
							files = s.files;
							liveTokens = s.liveTokens;
						}
					})
			);
			events = result.events;
			files = result.files;
			liveTokens = result.liveTokens;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-compaction-run' });
			if (cached) {
				events = cached.payload.events;
				files = cached.payload.files;
				liveTokens = cached.payload.liveTokens;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `// 4 tiers, applied in order before each model call:
//
// 1. Eviction      — large tool results moved to /large_tool_results/<id>.txt;
//                    the message in context becomes a path + 200-char preview.
// 2. Argument trim — repeated tool args replaced with '<as before>'.
// 3. Summarize     — older messages collapsed by the model; full block goes to
//                    /conversation_history/segment-<ts>.md.
// 4. Overflow      — if anything still exceeds maxTokens, the harness raises so
//                    you can fail loudly instead of silently truncating.

createDeepAgent({
  model,
  compaction: {
    maxTokens: 8000,            // budget visible to the model
    evictThresholdPct: 50,      // tier 1 fires at 50%
    summarizeThresholdPct: 85,  // tier 3 fires at 85%
    largeToolResultMin: 1000,   // tool results bigger than this get evicted
    historyKeep: 4              // tail of history that summarization preserves
  }
});`;
</script>

<Lesson
	title="Context compaction"
	eyebrow="Phase 3 · Lesson 08"
	hero={{
		id: 'l3-compaction',
		alt: 'Long pages distilled in a printing press into a single summary card'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="Context window">Context windows</Term> are finite; useful agent runs aren't. <Term t="Context compaction">Compaction</Term> is how you keep the relevant past available without paying for the whole transcript.
	{/snippet}

	{#snippet intro()}
		<p>
			<Term t="Long-horizon">Long-horizon</Term> agents fill the model's <Term t="Context window">context window</Term>. The <Term t="Harness">harness</Term> has a four-tier
			pipeline for handling that — <Term t="Eviction" />, <Term t="Argument truncation">argument truncation</Term>,
			<Term t="Summarization" />, and <Term t="Overflow recovery">overflow recovery</Term> — and a low-threshold demo here so
			you can actually see the tiers fire.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Truncating is easy; remembering is hard" variant="dropcap">
			<p>
				A naïve "drop the oldest messages" strategy causes <Term t="Goal drift" /> almost
				immediately — the agent forgets the original task and makes up a new one to fit the
				prompt it now sees. Useful compaction preserves the system prompt, the most recent
				exchanges, and a faithful summary of everything in between, and pushes the raw
				material onto disk so nothing is silently lost.
			</p>
			<p>
				Four tiers, applied in order before every model call: <Term t="Eviction">evict</Term> the bulkiest tool
				results to the <Term t="Virtual filesystem">virtual filesystem</Term>; <Term t="Argument truncation">truncate</Term> repeated tool arguments; <Term t="Summarization">summarise</Term> older middle messages;
				and finally <Term t="Overflow recovery">raise an error</Term> rather than truncate the <Term t="System prompt">system prompt</Term>. Each tier is
				cheap; together they keep an agent coherent across dozens of turns.
			</p>
		</Slide>

		<Slide title="The four tiers" variant="code-first">
			<CodeBlock code={code} lang="ts" />
		</Slide>

		<Diagram spec={compactionDiagram} />

		<Slide variant="pull-quote">
			<p>
				Memory is not what you keep in the window. Memory is what the agent can still
				retrieve when the window is full.
			</p>
		</Slide>

		<Slide title="The needle test">
			<p>
				The pattern at the end is the standard <Term t="Needle-in-a-haystack" /> probe:
				stash a tiny fact early, force compaction, then check it can still be retrieved
				(here via <code>read_file</code>, since we evicted to disk).
			</p>
		</Slide>

		<Slide title="Demo · low thresholds">
			<p>
				Budget is 600 tokens, eviction kicks in at 35%, summarisation at 80%. The agent
				saves a needle, then calls a large-output tool three times, then reads the needle
				back. Watch the token bar approach 35%, see eviction events appear, then fall back
				below 80% as the next tool result gets evicted.
			</p>
		</Slide>

		<Slide ornament>
			<p>· compress · preserve · recall ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Context budget" subtitle="live token usage versus thresholds">
			<ContextMeter
				segments={[{ label: 'history', tokens: liveTokens, kind: 'history' }]}
				max={MAX}
				evictThresholdPct={EVICT_THRESHOLD_PCT}
				summarizeThresholdPct={SUMMARIZE_THRESHOLD_PCT}
			/>
		</Panel>

		<Panel title="Filesystem (look for /large_tool_results/)">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace (eviction / summarisation events)">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
