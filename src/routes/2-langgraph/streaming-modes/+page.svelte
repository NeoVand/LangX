<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import {
		Annotation,
		StateGraph,
		MessagesAnnotation,
		START,
		END
	} from '@langchain/langgraph/web';
	import { ToolNode } from '@langchain/langgraph/prebuilt';
	import { weatherTool } from '$lib/runtime/tools';
	import { MockChatModel } from '$lib/runtime/llm/mock';
	import {
		HumanMessage,
		AIMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;

	let busy = $state(false);
	let valuesEvents = $state<unknown[]>([]);
	let updatesEvents = $state<unknown[]>([]);
	let messagesEvents = $state<{ chunk: string; from: string }[]>([]);

	function buildGraph() {
		const model = new MockChatModel({
			tokenDelayMs: 25,
			responder: (_msgs, turn) => {
				if (turn === 0)
					return {
						content: '',
						toolCalls: [{ name: 'get_weather', args: { city: 'Tokyo' }, id: 'w1' }]
					};
				return { content: 'Tokyo is 28°C and humid — pack water and a hat.' };
			}
		}).bindTools([weatherTool]) as unknown as BoundModel;
		const tools = new ToolNode([weatherTool]);

		return new StateGraph(MessagesAnnotation)
			.addNode('agent', async (s) => ({ messages: [await model.invoke(s.messages)] }))
			.addNode('tools', tools)
			.addEdge(START, 'agent')
			.addConditionalEdges('agent', (s) => {
				const last = s.messages[s.messages.length - 1] as AIMessage;
				return last.tool_calls?.length ? 'tools' : END;
			})
			.addEdge('tools', 'agent')
			.compile();
	}

	async function runAll() {
		busy = true;
		valuesEvents = [];
		updatesEvents = [];
		messagesEvents = [];
		try {
			const graph = buildGraph();
			const input = { messages: [new HumanMessage("What's the weather in Tokyo?")] };

			for await (const v of await graph.stream(input, { streamMode: 'values' })) {
				const messages = (v as { messages: BaseMessage[] }).messages;
				valuesEvents = [
					...valuesEvents,
					{ messageCount: messages.length, last: messages[messages.length - 1]?.constructor?.name }
				];
			}

			const graph2 = buildGraph();
			for await (const u of await graph2.stream(input, { streamMode: 'updates' })) {
				updatesEvents = [
					...updatesEvents,
					Object.fromEntries(
						Object.entries(u).map(([node, payload]) => {
							const msgs = (payload as { messages: BaseMessage[] }).messages;
							return [node, { added: msgs.length, last: msgs[msgs.length - 1]?.constructor?.name }];
						})
					)
				];
			}

			const graph3 = buildGraph();
			for await (const [chunk, meta] of await graph3.stream(input, {
				streamMode: 'messages'
			})) {
				const c = chunk as { content?: unknown };
				const m = meta as { langgraph_node?: string };
				const text = typeof c.content === 'string' ? c.content : '';
				if (text) {
					messagesEvents = [...messagesEvents, { chunk: text, from: m.langgraph_node ?? '?' }];
				}
			}
		} finally {
			busy = false;
		}
	}

	const code = `// values: full state after every superstep
for await (const v of await graph.stream(input, { streamMode: 'values' })) { ... }

// updates: just the delta from each node
for await (const u of await graph.stream(input, { streamMode: 'updates' })) { ... }

// messages: per-token chunks (ChatGenerationChunk, metadata)
for await (const [chunk, meta] of await graph.stream(input, { streamMode: 'messages' })) { ... }`;
</script>

<Lesson title="Streaming modes" eyebrow="Phase 2 · Lesson 05">
	{#snippet intro()}
		<p>
			LangGraph offers three streaming projections of the same run. Use <code>values</code> to
			keep a UI in sync with the full state, <code>updates</code> for compact deltas, and{' '}
			<code>messages</code> to render real-time tokens.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Three lenses">
			<p>
				All three modes describe the same execution; they differ only in payload.
			</p>
			<ul>
				<li>
					<strong>values</strong> — emits the entire state object after each superstep. Best
					for a "current state" inspector.
				</li>
				<li>
					<strong>updates</strong> — emits <code>{'{ nodeName: delta }'}</code> after each
					superstep. Best for an event log.
				</li>
				<li>
					<strong>messages</strong> — emits <code>[chunk, metadata]</code> tuples for every
					LLM token. Best for chat-style typing animation.
				</li>
			</ul>
			<CodeBlock code={code} caption="Same graph, three lenses." />
		</Slide>

		<Slide title="Compare them live">
			<p>
				The graph below is the same chat–tool loop you saw in lesson 1. We'll run it three
				times, once per mode, and show what each one yields.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run the same graph 3×">
			<RunButton onclick={runAll} running={busy} label="Run with all three modes" />
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
					Tokens highlighted by source node. The runtime tags each chunk with{' '}
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
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--color-border);
		border-radius: 0.35rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		word-break: break-word;
	}
	.rows code {
		font-family: var(--font-mono);
	}
	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
		margin: 0;
	}
	.tokens {
		font-family: var(--font-sans);
		line-height: 1.7;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-size: 0.92rem;
	}
	.tok {
		display: inline;
	}
	.tok[data-from='agent'] {
		background: color-mix(in oklch, var(--accent) 22%, transparent);
		border-radius: 0.18rem;
	}
	.tok[data-from='tools'] {
		background: color-mix(in oklch, var(--color-accent-warning) 18%, transparent);
		border-radius: 0.18rem;
	}
	.legend {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin-top: 0.5rem;
	}
</style>
