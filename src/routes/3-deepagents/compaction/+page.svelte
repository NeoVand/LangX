<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import ContextMeter from '$lib/components/ContextMeter.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type VirtualFile
	} from '$lib/deepagents';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { tool } from '@langchain/core/tools';
	import { z } from 'zod';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface RunPayload {
		events: TraceEvent[];
		files: VirtualFile[];
		liveTokens: number;
		finalText: string;
	}

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let files = $state<VirtualFile[]>([]);
	let liveTokens = $state(0);
	let finalText = $state<string>('');

	const MAX = 600;

	const INSTRUCTIONS = `You are testing the harness's compaction pipeline. You have a custom tool
called \`fetch_chunk\` that returns a large block of text. To produce visible compaction
events, follow this exact recipe in order:

1. write_file('/needle.md', 'Secret access code: PURPLE-99')
2. fetch_chunk({ label: 'PAGE 1' })  — large output
3. fetch_chunk({ label: 'PAGE 2' })  — large output
4. fetch_chunk({ label: 'PAGE 3' })  — large output
5. read_file({ path: '/needle.md' })
6. Reply with one short sentence confirming the needle is still readable after compaction.

Do not chat between tool calls. Do not skip steps.`;

	async function run() {
		busy = true;
		events = [];
		files = [];
		liveTokens = 0;
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-compaction-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const fetchChunk = tool(
						async ({ label }) => {
							const lorem =
								'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
							return `[${label}]\n` + lorem.repeat(15);
						},
						{
							name: 'fetch_chunk',
							description:
								'Return a synthetic large text block tagged with the given label. Use only as instructed.',
							schema: z.object({ label: z.string() })
						}
					);

					const model = await getModel({ temperature: 0, maxTokens: 600 });
					const backend = new StateBackend();
					const agent = createDeepAgent({
						model,
						backend,
						tools: [fetchChunk],
						instructions: INSTRUCTIONS,
						tracer,
						compaction: {
							maxTokens: MAX,
							evictThresholdPct: 35,
							summarizeThresholdPct: 80,
							largeToolResultMin: 200,
							historyKeep: 3
						},
						maxIterations: 16
					});
					agent.subscribe((s) => {
						files = [...s.files];
						liveTokens = totalMessageTokens(s.messages);
					});

					const out = await agent.invoke({
						input:
							'Save the secret, then fetch three large chunks, then verify the secret is still readable.',
						thread: `compact-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					return {
						events: localEvents,
						files: await backend.list(),
						liveTokens: totalMessageTokens(out.messages),
						finalText: text
					};
				}
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
	motivation="Context windows are finite; useful agent runs aren't. Compaction is how you keep the relevant past available without paying for the whole transcript."
	hero={{
		id: 'l3-compaction',
		alt: 'Long pages distilled in a printing press into a single summary card'
	}}
>
	{#snippet intro()}
		<p>
			Long-horizon agents fill the model's context window. The harness has a four-tier
			pipeline for handling that — <Term t="Eviction" />, argument truncation,
			<Term t="Summarization" />, and overflow recovery — and a low-threshold demo here so
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
				Four tiers, applied in order before every model call: evict the bulkiest tool
				results to disk; truncate repeated tool arguments; summarise older middle messages;
				and finally raise an error rather than truncate the system prompt. Each tier is
				cheap; together they keep an agent coherent across dozens of turns.
			</p>
		</Slide>

		<Slide title="The four tiers" variant="code-first">
			<CodeBlock code={code} lang="ts" />
		</Slide>

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
				evictThresholdPct={35}
				summarizeThresholdPct={80}
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
