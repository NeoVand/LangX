<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		runTokenStream,
		runEventStream,
		type StreamEvent as Ev
	} from '$lib/demos/streaming';
	import streamingSrc from '$lib/demos/streaming.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'streaming',
		title: 'Streaming',
		summary: 'Stream a chain token-by-token, and emit one typed event per Runnable boundary with streamEvents.',
		entries: [{ path: 'lib/demos/streaming.ts', code: streamingSrc }],
		runner: `import { runTokenStream, runEventStream } from './lib/demos/streaming';

console.log('=== Token chunks ===');
await runTokenStream('checkpointers in LangGraph', (_tokens, text) => {
	process.stdout.write('\\r' + text);
});
console.log('\\n');

console.log('=== streamEvents v2 ===');
const { events } = await runEventStream('checkpointers in LangGraph');
for (const ev of events) console.log('  ·', ev.event, ev.name, ev.data ? '— ' + ev.data : '');
`
	};

	let topic = $state('checkpointers in LangGraph');

	type Demo1Payload = { final: string; tokens: string[] };
	let demo1Run = $state(false);
	let demo1Tokens = $state<string[]>([]);
	let demo1Final = $state('');

	async function runDemo1() {
		demo1Run = true;
		demo1Tokens = [];
		demo1Final = '';
		try {
			const topicForRun = topic;
			const out = await withRunCache<Demo1Payload>(
				{ demoId: 'l1-streaming-tokens' },
				async () =>
					await runTokenStream(topicForRun, (tokens, text) => {
						demo1Tokens = tokens;
						demo1Final = text;
					})
			);
			demo1Final = out.final;
			demo1Tokens = out.tokens;
		} finally {
			demo1Run = false;
		}
	}

	type Demo2Payload = { events: Ev[] };
	let demo2Run = $state(false);
	let demo2Events = $state<Ev[]>([]);

	async function runDemo2() {
		demo2Run = true;
		demo2Events = [];
		try {
			const topicForRun = topic;
			const out = await withRunCache<Demo2Payload>(
				{ demoId: 'l1-streaming-events' },
				async () =>
					await runEventStream(topicForRun, (events) => {
						demo2Events = events;
					})
			);
			demo2Events = out.events;
		} finally {
			demo2Run = false;
		}
	}

	onMount(async () => {
		const c1 = await loadCachedRun<Demo1Payload>({ demoId: 'l1-streaming-tokens' });
		if (c1) {
			demo1Final = c1.payload.final;
			demo1Tokens = c1.payload.tokens;
		}
		const c2 = await loadCachedRun<Demo2Payload>({ demoId: 'l1-streaming-events' });
		if (c2) demo2Events = c2.payload.events;
	});

	const codeA = `const chain = prompt.pipe(model).pipe(new StringOutputParser());

const stream = await chain.stream({ topic });
for await (const chunk of stream) {
  process.stdout.write(chunk);
}`;

	const codeB = `for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
  switch (ev.event) {
    case 'on_chat_model_start':  // model began generating
    case 'on_chat_model_stream': // a token chunk arrived
    case 'on_chat_model_end':    // model finished
    case 'on_parser_end':        // parser produced final value
      record(ev);
  }
}`;
</script>

<Lesson
	title="Streaming"
	eyebrow="Phase 1 · Lesson 02"
	motivation="Watching tokens arrive is more than UX polish — it changes how you debug models, how you handle long contexts, and how a user lives with the latency of intelligence."
	hero={{
		id: 'l1-streaming',
		alt: 'A copper-basin water clock with cascading droplets'
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			Streaming is not a separate API on top of LangChain — it's part of the <Term
				t="Runnable"
			/> protocol. Every chain has a final-value mode, a token-by-token mode, and a third one
			that emits an event for every internal step.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Latency is part of the model" variant="dropcap">
			<p>
				Early LLM apps treated the model as a function: send a prompt, wait, receive a string.
				That framing hides everything interesting that happens between the first token and the
				last — and there can be a full second between them. Long enough for the user to
				wonder whether anything is happening at all.
			</p>
			<p>
				Streaming is the alternative framing. The model is a <em>process</em> that emits
				chunks; your job is to render them as they appear. Once you accept that, the same
				machinery becomes a debugger, a progress bar, and the substrate for every agent
				visualisation downstream.
			</p>
		</Slide>

		<Slide title="Three levels of streaming">
			<p>Pick the one that matches what you want to render:</p>
			<ul>
				<li>
					<code>invoke</code> — wait for the final value. Easiest, but the user sees nothing
					until the full response is ready.
				</li>
				<li>
					<code>stream</code> — yield chunks of the final output as they arrive. Best for
					chat UIs and live text.
				</li>
				<li>
					<code>streamEvents</code> — yield typed events for every internal step (chain,
					model, tool, parser). Best for inspectors and audit trails.
				</li>
			</ul>
		</Slide>

		<Slide title="Token chunks" variant="code-first">
			<CodeBlock code={codeA} lang="ts" caption="A chain stream — Demo 1." />
			<p>
				Press <em>Run</em> on the right. The chain is a real LangChain pipeline; only the
				model behind <code>getModel()</code> changes depending on which provider you have
				configured.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A stream is the smallest interface that lets you tell a user the model is alive
				before it is finished thinking.
			</p>
		</Slide>

		<Slide title="streamEvents v2" variant="code-first">
			<CodeBlock code={codeB} lang="ts" caption="streamEvents emits one event per Runnable boundary." />
			<p>
				Use <code>withConfig({'{ runName }'})</code> to label each Runnable so the events
				have stable, human-readable names. Demo 2 prints the chronological event log,
				including each token as it streams.
			</p>
		</Slide>

		<Slide title="What you do with this">
			<p>
				Token streaming is what makes a chat UI feel alive. Event streaming is what makes an
				agent <em>auditable</em> — every tool call, every retrieval, every parse becomes a
				visible boundary you can replay, log, or test against.
			</p>
		</Slide>

		<Slide ornament>
			<p>The model is a process. Render the process.</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Token chunks" subtitle="chain.stream(input)">
			<label class="row">
				<span>Topic</span>
				<input type="text" bind:value={topic} />
			</label>
			<RunButton onclick={runDemo1} running={demo1Run} />
			{#if demo1Final || demo1Run}
				<div class="output">
					{demo1Final}{#if demo1Run}<span class="caret">▋</span>{/if}
				</div>
				<div class="meta">{demo1Tokens.length} chunks</div>
			{/if}
		</Panel>

		<Panel title="Demo 2 · streamEvents v2" subtitle="One row per Runnable boundary">
			<RunButton onclick={runDemo2} running={demo2Run} />
			{#if demo2Events.length}
				<div class="event-log scrollbar-slim">
					{#each demo2Events as ev, i (i)}
						<div class="ev-row" data-event={ev.event}>
							<span class="ev-name">{ev.event}</span>
							<span class="ev-target">{ev.name}</span>
							{#if ev.data}
								<span class="ev-data">"{ev.data}…"</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	input {
		flex: 1;
	}
	.output {
		margin-top: 0.85rem;
		padding: 0.85rem 0.95rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-300);
		text-align: right;
		margin-top: 0.3rem;
	}
	.caret {
		color: var(--accent-ink);
		animation: blink 1s steps(1) infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	.event-log {
		margin-top: 0.85rem;
		max-height: 16rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.45rem 0.55rem;
		background: var(--color-bg);
	}
	.ev-row {
		display: grid;
		grid-template-columns: 8rem 6rem 1fr;
		gap: 0.5rem;
	}
	.ev-row[data-event='chat_model_start'] .ev-name,
	.ev-row[data-event='chat_model_end'] .ev-name {
		color: var(--accent-ink);
	}
	.ev-row[data-event='chat_model_stream'] .ev-name {
		color: var(--color-accent-success);
	}
	.ev-row[data-event='parser_end'] .ev-name {
		color: var(--color-accent-warning);
	}
	.ev-name {
		font-weight: 600;
		color: var(--color-ink-100);
	}
	.ev-target {
		color: var(--color-ink-200);
	}
	.ev-data {
		color: var(--color-ink-300);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
