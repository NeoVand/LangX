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
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let busy = $state(false);
	let events = $state<TraceEvent[]>([]);
	let files = $state<VirtualFile[]>([]);
	let liveTokens = $state(0);

	const MAX = 600;

	function bigChunk(label: string) {
		const lorem =
			'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
		return `[${label}]\n` + lorem.repeat(15);
	}

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: '/needle.md', content: 'Secret access code: PURPLE-99' }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/results/page1.txt',
							content: bigChunk('PAGE 1')
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/results/page2.txt',
							content: bigChunk('PAGE 2')
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/results/page3.txt',
							content: bigChunk('PAGE 3')
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [{ name: 'read_file', args: { path: '/needle.md' } }]
			},
			{
				content:
					'Even after compaction, the secret access code (PURPLE-99) was still retrievable from /needle.md.'
			}
		];
	}

	async function run() {
		busy = true;
		events = [];
		files = [];
		liveTokens = 0;
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const backend = new StateBackend();
			const agent = createDeepAgent({
				model,
				backend,
				instructions:
					'You are testing the harness. Save a needle, then produce 3 large outputs, then verify the needle is still readable.',
				tracer,
				compaction: {
					maxTokens: MAX,
					evictThresholdPct: 35,
					summarizeThresholdPct: 80,
					largeToolResultMin: 200,
					historyKeep: 3
				}
			});
			agent.subscribe((s) => {
				files = [...s.files];
				liveTokens = totalMessageTokens(s.messages);
			});
			await agent.invoke({
				input: 'Save the secret, then write 3 oversized result pages, then read the secret back.',
				thread: 'compact-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}

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
    maxTokens: 8000,           // budget visible to the model
    evictThresholdPct: 50,     // tier 1 fires at 50%
    summarizeThresholdPct: 85, // tier 3 fires at 85%
    largeToolResultMin: 1000,  // tool results bigger than this get evicted
    historyKeep: 4              // tail of history that summarization preserves
  }
});`;
</script>

<Lesson title="Context compaction" eyebrow="Phase 3 · Lesson 08">
	{#snippet intro()}
		<p>
			Long-horizon agents fill the model's context window. The harness has a four-tier pipeline
			for handling that — <Term t="Eviction" />, argument truncation,
			<Term t="Summarization" />, and overflow recovery — and a low-threshold demo here so you
			can actually see the tiers fire.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The four tiers">
			<CodeBlock code={code} lang="ts" />
		</Slide>

		<Slide title="Why this is hard">
			<p>
				Just truncating the oldest messages causes <Term t="Goal drift" /> — the agent forgets
				the original task and makes up a new one. The harness compacts in a way that keeps the
				system prompt, the most recent exchanges, and a summary of everything in between, then
				pushes the raw block onto disk so it's still recoverable.
			</p>
		</Slide>

		<Slide title="Demo · low thresholds">
			<p>
				Budget is 600 tokens, eviction kicks in at 35%, summarization at 80%. The agent saves
				a "needle" file, generates three oversized tool outputs, then reads the needle back —
				proving compaction didn't lose it. Watch the token bar approach 35%, see eviction
				events appear, then fall back below 80% as the next tool result gets evicted.
			</p>
		</Slide>

		<Slide title="The needle test">
			<p>
				The pattern at the end is the standard <Term t="Needle-in-a-haystack" /> probe:
				stash a tiny fact early, force compaction, then check it can still be retrieved (here
				via <code>read_file</code>, since we evicted to disk).
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Context budget" subtitle="Live token usage versus thresholds">
			<ContextMeter
				segments={[{ label: 'history', tokens: liveTokens, kind: 'history' }]}
				max={MAX}
				evictThresholdPct={35}
				summarizeThresholdPct={80}
			/>
		</Panel>

		<Panel title="Filesystem (look for /large_tool_results/)">
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Trace (eviction / summarization events)">
			<TraceLog events={events} />
		</Panel>
	{/snippet}
</Lesson>
