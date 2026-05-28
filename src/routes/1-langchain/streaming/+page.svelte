<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { MockChatModel } from '$lib/runtime/llm/mock';

	let topic = $state('checkpointers in LangGraph');
	let demo1Run = $state(false);
	let demo1Tokens = $state<string[]>([]);
	let demo1Final = $state('');

	async function runDemo1() {
		demo1Run = true;
		demo1Tokens = [];
		demo1Final = '';
		try {
			const prompt = ChatPromptTemplate.fromMessages([
				['human', 'In two sentences, explain {topic}.']
			]);
			const model = new MockChatModel({
				responses: [
					{
						content: `${topic.charAt(0).toUpperCase() + topic.slice(1)} are state snapshots written after each node runs. The graph reads them on resume so it can continue without re-running prior steps.`
					}
				],
				tokenDelayMs: 35
			});
			const chain = prompt.pipe(model).pipe(new StringOutputParser());
			const stream = await chain.stream({ topic });
			let buf = '';
			for await (const chunk of stream) {
				demo1Tokens.push(chunk);
				buf += chunk;
				demo1Final = buf;
			}
		} finally {
			demo1Run = false;
		}
	}

	let demo2Run = $state(false);
	interface Ev {
		event: string;
		name: string;
		data?: string;
	}
	let demo2Events = $state<Ev[]>([]);

	async function runDemo2() {
		demo2Run = true;
		demo2Events = [];
		try {
			const prompt = ChatPromptTemplate.fromMessages([
				['human', 'Reply with two short bullet points about {topic}.']
			]).withConfig({ runName: 'prompt' });
			const model = new MockChatModel({
				responses: [{ content: `• A bullet about ${topic}.\n• Another bullet about ${topic}.` }],
				tokenDelayMs: 30
			}) as unknown as MockChatModel & { withConfig: typeof prompt.withConfig };
			const labeledModel = (model as unknown as MockChatModel).withConfig({ runName: 'model' });
			const parser = new StringOutputParser().withConfig({ runName: 'parser' });
			const chain = prompt.pipe(labeledModel).pipe(parser);
			for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
				if (
					ev.event === 'on_chain_start' ||
					ev.event === 'on_chain_end' ||
					ev.event === 'on_chat_model_start' ||
					ev.event === 'on_chat_model_end' ||
					ev.event === 'on_chat_model_stream' ||
					ev.event === 'on_parser_end'
				) {
					const dataPreview =
						ev.event === 'on_chat_model_stream'
							? (ev.data?.chunk as { content?: unknown })?.content?.toString().slice(0, 30)
							: undefined;
					demo2Events.push({
						event: ev.event.replace('on_', ''),
						name: ev.name,
						data: dataPreview
					});
				}
			}
		} finally {
			demo2Run = false;
		}
	}

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

<Lesson title="Streaming" eyebrow="Phase 1 · Lesson 02">
	{#snippet intro()}
		<p>
			Streaming is not a separate API on top of LangChain — it's part of the Runnable protocol.
			Every chain has both a final-value mode and a token-by-token mode, and a third one that
			emits an event for every internal step.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Three levels of streaming">
			<p>Pick the one that matches what you want to render:</p>
			<ul>
				<li>
					<code>invoke</code> — wait for the final value. Easiest, but the user sees nothing
					until the full response is ready.
				</li>
				<li>
					<code>stream</code> — yield chunks of the final output as they arrive. Best for chat
					UIs and live text.
				</li>
				<li>
					<code>streamEvents</code> — yield typed events for every internal step (chain, model,
					tool, parser). Best for building inspectors like the one you're using right now.
				</li>
			</ul>
		</Slide>

		<Slide title="Demo 1 — token-by-token chunks">
			<CodeBlock code={codeA} caption="Token streaming through a chain." />
			<p>
				Press <em>Run</em> on the right. The model is mocked so the order is reproducible — but
				the streaming machinery is real LangChain code; swap the model for any real provider
				and it works identically.
			</p>
		</Slide>

		<Slide title="Demo 2 — streamEvents v2">
			<CodeBlock code={codeB} caption="streamEvents emits one event per Runnable boundary." />
			<p>
				Use <code>withConfig({'{ runName }'})</code> to label each Runnable so the events have
				stable, human-readable names. The inspector on the right shows the chronological event
				log, including each token as it streams.
			</p>
		</Slide>

		<Slide title="What you do with this">
			<p>
				Token streaming is what makes a chat UI feel alive. Event streaming is what makes an{' '}
				agent <em>auditable</em> — every tool call, every retrieval, every parse becomes a
				visible boundary you can replay, log, or test against.
			</p>
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
		color: var(--color-fg-faint);
	}
	input {
		flex: 1;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.4rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	.output {
		margin-top: 0.85rem;
		padding: 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		font-size: 0.92rem;
		line-height: 1.55;
		white-space: pre-wrap;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		text-align: right;
		margin-top: 0.3rem;
	}
	.caret {
		color: var(--accent);
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
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: var(--color-bg);
	}
	.ev-row {
		display: grid;
		grid-template-columns: 8rem 6rem 1fr;
		gap: 0.5rem;
	}
	.ev-row[data-event='chat_model_start'] .ev-name,
	.ev-row[data-event='chat_model_end'] .ev-name {
		color: var(--accent);
	}
	.ev-row[data-event='chat_model_stream'] .ev-name {
		color: var(--color-accent-success);
	}
	.ev-row[data-event='parser_end'] .ev-name {
		color: var(--color-accent-warning);
	}
	.ev-name {
		font-weight: 600;
	}
	.ev-target {
		color: var(--color-fg-muted);
	}
	.ev-data {
		color: var(--color-fg-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
