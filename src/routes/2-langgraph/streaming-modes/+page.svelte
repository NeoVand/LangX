<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		runStreamingModesDemo,
		type ValuesEvent,
		type UpdatesEvent,
		type MessagesEvent,
		type StreamingPayload
	} from '$lib/demos/lg-streaming-modes';
	import lgStreamingSrc from '$lib/demos/lg-streaming-modes.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'streaming-modes',
		title: 'Streaming modes',
		summary: 'Observe one graph run three ways: values, updates, and per-token messages.',
		entries: [{ path: 'lib/demos/lg-streaming-modes.ts', code: lgStreamingSrc }],
		runner: `import { runStreamingModesDemo } from './lib/demos/lg-streaming-modes';

const out = await runStreamingModesDemo();

console.log('streamMode: values');
out.values.forEach((v) => console.log('  ', JSON.stringify(v)));
console.log('\\nstreamMode: updates');
out.updates.forEach((u) => console.log('  ', JSON.stringify(u)));
console.log('\\nstreamMode: messages (reassembled text)');
console.log('  ', out.messages.map((m) => m.chunk).join(''));
`
	};

	let busy = $state(false);
	let valuesEvents = $state<ValuesEvent[]>([]);
	let updatesEvents = $state<UpdatesEvent[]>([]);
	let messagesEvents = $state<MessagesEvent[]>([]);

	async function runAll() {
		busy = true;
		valuesEvents = [];
		updatesEvents = [];
		messagesEvents = [];
		try {
			const out = await withRunCache<StreamingPayload>(
				{ demoId: 'l2-streaming-modes' },
				async () =>
					await runStreamingModesDemo({
						onValues: (e) => (valuesEvents = e),
						onUpdates: (e) => (updatesEvents = e),
						onMessages: (e) => (messagesEvents = e)
					})
			);
			valuesEvents = out.values;
			updatesEvents = out.updates;
			messagesEvents = out.messages;
		} finally {
			busy = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<StreamingPayload>({ demoId: 'l2-streaming-modes' });
		if (cached) {
			valuesEvents = cached.payload.values;
			updatesEvents = cached.payload.updates;
			messagesEvents = cached.payload.messages;
		}
	});

	const code = `// values: full state after every superstep
for await (const v of await graph.stream(input, { streamMode: 'values' })) { ... }

// updates: just the delta from each node
for await (const u of await graph.stream(input, { streamMode: 'updates' })) { ... }

// messages: per-token chunks (ChatGenerationChunk, metadata)
for await (const [chunk, meta] of await graph.stream(input, { streamMode: 'messages' })) { ... }`;
</script>

<Lesson
	title="Streaming modes"
	eyebrow="Phase 2 · Lesson 05"
	motivation="Three different streams answer three different questions: what changed, where are we now, what just got said. Pick the right one and the UI writes itself."
	hero={{
		id: 'l2-streaming-modes',
		alt: 'A three-channel printing press emitting different paper ribbons'
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			LangGraph offers three streaming projections of the same run. Use <code>values</code> to
			keep a UI in sync with the full state, <code>updates</code> for compact deltas, and
			<code>messages</code> to render real-time tokens.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Three lenses, one run" variant="dropcap">
			<p>
				Streaming an agent isn't really one feature — it's three different questions wearing
				the same word. Do you want the <em>current state</em> after each step, the
				<em>delta</em> a node just produced, or the <em>tokens</em> emerging from inside an
				LLM call? Each answer needs a different shape. Conflating them is why most agent UIs
				look either boringly flat (full re-renders) or noisily jittery (token chaos).
			</p>
			<p>
				LangGraph names the three lenses and gives each a stable shape. Pick one. Build the UI
				to that shape. Swap to a different mode when the surface changes — for example,
				switching from a chat bubble to an audit trail with two lines of code.
			</p>
		</Slide>

		<Slide title="The three modes">
			<ul>
				<li>
					<strong>values</strong> — emits the entire state object after each superstep. Best
					for a "current state" inspector or any view that re-derives from full state.
				</li>
				<li>
					<strong>updates</strong> — emits <code>{'{ nodeName: delta }'}</code> after each
					superstep. Best for an event log, for syncing diffs to a server, or for showing
					what each node contributed.
				</li>
				<li>
					<strong>messages</strong> — emits <code>[chunk, metadata]</code> tuples for every
					LLM token. Best for chat-style typing animation. The metadata tag tells you which
					node produced the chunk.
				</li>
			</ul>
		</Slide>

		<Slide title="Same graph, three streams" variant="code-first">
			<CodeBlock code={code} caption="One run can be observed three ways." />
			<p>
				The graph below is the chat–tool loop from Lesson 1. We run it three times — once per
				mode — and show what each lens yields.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A streaming mode is just a projection. Pick the lens that matches the surface you're
				building, and stop trying to make one stream do every job.
			</p>
		</Slide>

		<Slide title="What you'll notice">
			<p>
				<code>values</code> grows the message list one step at a time.
				<code>updates</code> shows you exactly which node added what.
				<code>messages</code> emits tokens as they're generated, with
				<code>metadata.langgraph_node</code> telling you whether the chunk came from
				<code>agent</code> or <code>tools</code> — useful when you want to highlight only
				model-spoken text.
			</p>
		</Slide>

		<Slide title="When you'd use each" ornament>
			<p>
				A debugger panel? <code>values</code>. A server-pushed log? <code>updates</code>. A
				chat bubble that animates? <code>messages</code>. Three primitives, three pleasant
				UIs.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run the same graph 3×" subtitle="Real model, weather tool">
			<RunButton onclick={runAll} running={busy} label="Stream with all three modes" />
		</Panel>

		<Panel title="streamMode: values" subtitle="Full state, post-superstep">
			{#if valuesEvents.length}
				<ol class="rows">
					{#each valuesEvents as v, i (i)}
						<li><code>{JSON.stringify(v)}</code></li>
					{/each}
				</ol>
			{:else}
				<p class="empty">No events yet.</p>
			{/if}
		</Panel>

		<Panel title="streamMode: updates" subtitle="Per-node deltas">
			{#if updatesEvents.length}
				<ol class="rows">
					{#each updatesEvents as u, i (i)}
						<li><code>{JSON.stringify(u)}</code></li>
					{/each}
				</ol>
			{:else}
				<p class="empty">No events yet.</p>
			{/if}
		</Panel>

		<Panel title="streamMode: messages" subtitle="Token chunks + metadata.langgraph_node">
			{#if messagesEvents.length}
				<div class="tokens">
					{#each messagesEvents as t, i (i)}
						<span class="tok" data-from={t.from}>{t.chunk}</span>
					{/each}
				</div>
				<div class="legend">
					Tokens highlighted by source node. The runtime tags each chunk with
					<code>metadata.langgraph_node</code> so the UI knows where it came from.
				</div>
			{:else}
				<p class="empty">No tokens yet.</p>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.rows {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.rows li {
		color: var(--color-ink-200);
		word-break: break-word;
	}
	.rows code {
		font-family: var(--font-mono);
	}
	.empty {
		font-size: 0.82rem;
		color: var(--color-ink-300);
		font-style: italic;
		margin: 0;
	}
	.tokens {
		font-family: var(--font-prose);
		line-height: 1.7;
		font-size: 0.95rem;
		color: var(--color-ink-100);
	}
	.tok {
		display: inline;
	}
	.tok[data-from='agent'] {
		background: color-mix(in oklch, var(--accent-ink) 22%, transparent);
		border-radius: 0.18rem;
	}
	.tok[data-from='tools'] {
		background: color-mix(in oklch, var(--color-accent-warning) 18%, transparent);
		border-radius: 0.18rem;
	}
	.legend {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		margin-top: 0.5rem;
	}
</style>
