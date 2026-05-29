<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { checkpointer as checkpointerDiagram } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { MemorySaver } from '@langchain/langgraph/web';
	import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { buildCounterGraph, buildChatGraph } from '$lib/demos/lg-checkpointers';
	import lgCheckpointersSrc from '$lib/demos/lg-checkpointers.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'checkpointers',
		title: 'Checkpointers & time travel',
		summary:
			'Compile with a MemorySaver for resume, multi-turn chat memory, and forkable history.',
		entries: [{ path: 'lib/demos/lg-checkpointers.ts', code: lgCheckpointersSrc }],
		runner: `import { MemorySaver } from '@langchain/langgraph/web';
import { HumanMessage } from '@langchain/core/messages';
import { getModel } from './lib/runtime/llm';
import { buildCounterGraph, buildChatGraph } from './lib/demos/lg-checkpointers';

console.log('=== Time travel ===');
const saver = new MemorySaver();
const cfg = { configurable: { thread_id: 'thread-1' } };
const final = await buildCounterGraph(saver).invoke({ count: 0 }, cfg);
console.log('final state:', final);
for await (const snap of buildCounterGraph(saver).getStateHistory(cfg)) {
	console.log('  checkpoint', JSON.stringify(snap.values), 'next', snap.next);
}

console.log('\\n=== Multi-turn chat (shared thread = memory) ===');
const model = await getModel({ temperature: 0.4, maxTokens: 220 });
const chat = buildChatGraph(model, new MemorySaver());
const chatCfg = { configurable: { thread_id: 'chat-1' } };
let out = await chat.invoke({ messages: [new HumanMessage("Hi, I'm planning a trip to Tokyo.")] }, chatCfg);
console.log('assistant:', out.messages.at(-1)?.content);
out = await chat.invoke({ messages: [new HumanMessage('Where did I say I was going?')] }, chatCfg);
console.log('assistant:', out.messages.at(-1)?.content);
`
	};

	/* ------------------------------------------------------------------ */
	/* Demo 1: counter graph + fork (synthetic — best for explaining)      */
	/* ------------------------------------------------------------------ */

	let checkpointer = new MemorySaver();

	let currentState = $state<unknown>(null);
	let history = $state<Array<{ step: number; values: unknown; checkpoint_id?: string; next: string[] }>>([]);
	let chosenCheckpoint = $state<string | null>(null);
	let threadId = $state('thread-1');
	let busy = $state(false);

	const config = $derived({ configurable: { thread_id: threadId } });

	async function runOnce() {
		busy = true;
		try {
			const graph = buildCounterGraph(checkpointer);
			const result = await graph.invoke({ count: 0 }, config);
			currentState = result;
			await refreshHistory();
		} finally {
			busy = false;
		}
	}

	async function refreshHistory() {
		const graph = buildCounterGraph(checkpointer);
		const items: typeof history = [];
		let i = 0;
		for await (const snap of graph.getStateHistory(config)) {
			items.push({
				step: i++,
				values: snap.values,
				checkpoint_id: snap.config?.configurable?.checkpoint_id as string | undefined,
				next: [...snap.next]
			});
		}
		history = items;
	}

	async function forkFrom(id: string) {
		busy = true;
		try {
			const graph = buildCounterGraph(checkpointer);
			const forkedConfig = {
				configurable: { thread_id: threadId, checkpoint_id: id }
			};
			const updated = await graph.updateState(forkedConfig, { count: 100 }, 'add');
			const result = await graph.invoke(null, updated);
			currentState = result;
			chosenCheckpoint = id;
			await refreshHistory();
		} finally {
			busy = false;
		}
	}

	function newThread() {
		threadId = 'thread-' + Math.random().toString(36).slice(2, 6);
		currentState = null;
		history = [];
		chosenCheckpoint = null;
	}

	function freshSaver() {
		checkpointer = new MemorySaver();
		newThread();
	}

	/* ------------------------------------------------------------------ */
	/* Demo 2: real-LLM multi-turn chat with thread persistence           */
	/* ------------------------------------------------------------------ */

	let chatThread = $state('chat-thread');
	let chatBusy = $state(false);
	let userTurn = $state('I want to plan a trip to Tokyo.');
	let chatLog = $state<{ role: 'user' | 'assistant'; text: string }[]>([]);

	interface ChatPayload {
		thread: string;
		messages: { role: 'user' | 'assistant'; text: string }[];
	}

	const chatCheckpointer = new MemorySaver();

	async function sendChat() {
		if (!userTurn.trim()) return;
		chatBusy = true;
		const turnText = userTurn.trim();
		try {
			const model = await getModel({ temperature: 0.4, maxTokens: 220 });
			const graph = buildChatGraph(model, chatCheckpointer);
			const cfg = { configurable: { thread_id: chatThread } };

			chatLog = [...chatLog, { role: 'user', text: turnText }];
			const out = await graph.invoke({ messages: [new HumanMessage(turnText)] }, cfg);
			const last = (out.messages as BaseMessage[]).at(-1);
			const reply = typeof last?.content === 'string' ? last.content : '';
			chatLog = [...chatLog, { role: 'assistant', text: reply }];

			const payload: ChatPayload = { thread: chatThread, messages: chatLog };
			await withRunCache<ChatPayload>({ demoId: 'l2-checkpointers-chat' }, async () => payload);
			userTurn = '';
		} finally {
			chatBusy = false;
		}
	}

	function newChatThread() {
		chatThread = 'chat-' + Math.random().toString(36).slice(2, 6);
		chatLog = [];
	}

	onMount(async () => {
		const cached = await loadCachedRun<ChatPayload>({ demoId: 'l2-checkpointers-chat' });
		if (cached) {
			chatLog = cached.payload.messages;
			chatThread = cached.payload.thread;
		}
	});

	const code = `import { MemorySaver, StateGraph } from '@langchain/langgraph';

const checkpointer = new MemorySaver();           // SQLite or Postgres in production
const graph = builder.compile({ checkpointer });

await graph.invoke(input, { configurable: { thread_id: 'abc' } });

// Replay or list every saved step in this thread:
for await (const snap of graph.getStateHistory({ configurable: { thread_id: 'abc' } })) {
  console.log(snap.values, snap.next);
}

// Fork: pick a past checkpoint, edit state, then continue:
const forked = await graph.updateState(
  { configurable: { thread_id: 'abc', checkpoint_id: oldId } },
  { count: 100 }
);
await graph.invoke(null, forked);`;

	const chatCode = `// Same checkpointer turns ANY graph into a multi-turn chat.
const graph = builder.compile({ checkpointer: new MemorySaver() });
const cfg = { configurable: { thread_id: "user-42" } };

await graph.invoke({ messages: [new HumanMessage("Hi, I'm Neo.")] }, cfg);
// → assistant remembers Neo because the previous superstep's state lives in the saver.
await graph.invoke({ messages: [new HumanMessage("What's my name?")] }, cfg);`;
</script>

<Lesson
	title="Checkpointers & time travel"
	eyebrow="Phase 2 · Lesson 03"
	hero={{
		id: 'l2-checkpointers',
		alt: 'A grandfather clock with gears whose dots align like saved checkpoints'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		An agent without persistence is a goldfish. <Term t="Checkpointer">Checkpointers</Term> give you
		resumption, branching histories, and forensic <Term t="Time travel">time travel</Term> — the
		difference between a demo and a system.
	{/snippet}
	{#snippet intro()}
		<p>
			Plug a <Term t="Checkpointer" /> into a compiled graph and every
			<Term t="Superstep">superstep</Term> writes a <Term t="Checkpoint">checkpoint</Term>. That
			single fact unlocks resume-after-crash, multi-turn conversations, and
			<Term t="Time travel">time travel</Term> — replay or fork from any earlier point in the run.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="State you can re-enter" variant="dropcap">
			<p>
				Most "agent frameworks" treat memory as a feature you bolt on later.
				<Term t="LangGraph" /> treats it as a property of the runtime. As long as your
				<Term t="State">state</Term> is well-typed, the same saver that powers a multi-turn chat
				also powers crash recovery, A/B branching, and point-in-time debugging — three problems
				that look unrelated until they share an implementation.
			</p>
			<p>
				The mental shift: stop thinking of a graph run as one thing and start thinking of it as
				<strong>a stream of <Term t="Superstep">supersteps</Term> with a checkpoint after each one</strong>.
				Every snapshot is addressable. Every snapshot is forkable. Every
				<Term t="Thread">thread</Term> is just a sequence of those snapshots, scoped by an id.
			</p>
		</Slide>

		<Slide title="Compile with a checkpointer" variant="code-first">
			<p>
				<Term t="compile"><code>graph.compile({'{ checkpointer }'})</code></Term> wires the runtime
				to call the saver after every <Term t="Node">node</Term>.
				<Term t="MemorySaver"><code>MemorySaver</code></Term> is in-memory; production setups use
				SQLite, <Term t="PostgresSaver">Postgres</Term>, or any custom store you implement against
				the saver interface.
			</p>
			<CodeBlock code={code} caption="One MemorySaver, three superpowers." />
		</Slide>

		<Slide title="Threads">
			<p>
				Every call passes <Term t="thread_id"><code>thread_id</code></Term> in
				<Term t="configurable"><code>config.configurable</code></Term>. The
				<Term t="Checkpointer">checkpointer</Term> treats <Term t="Thread">threads</Term> as
				isolated: snapshots from one don't bleed into another. Two users on your app simply use
				two thread IDs — the runtime handles the rest.
			</p>
		</Slide>

		<Diagram spec={checkpointerDiagram} />

		<Slide variant="pull-quote">
			<p>
				A <Term t="Checkpoint">checkpoint</Term> is more than a backup — it's an address. Once your
				runtime hands you addresses for every <Term t="Superstep">superstep</Term>, "memory" and
				"debugging" stop being separate disciplines.
			</p>
		</Slide>

		<Slide title="Time travel">
			<p>
				<Term t="getStateHistory"><code>getStateHistory</code></Term> walks every checkpoint for a
				<Term t="Thread">thread</Term>. You can pick one, call
				<Term t="updateState"><code>updateState</code></Term> to edit it, and call
				<code>invoke(null, newConfig)</code> to run forward from that fork. The original branch
				stays intact, both branches stay queryable.
			</p>
		</Slide>

		<Slide title="Same primitive, multi-turn chat" variant="code-first">
			<p>
				The same <Term t="Checkpointer">checkpointer</Term> that powers
				<Term t="Time travel">time travel</Term> also powers a multi-turn chat.
				<Term t="State">State</Term> is whatever you defined; LangGraph just keeps loading the
				latest snapshot before each new <Term t="invoke">invoke</Term> on the same
				<Term t="thread_id"><code>thread_id</code></Term>.
			</p>
			<CodeBlock code={chatCode} caption="Memory is a free side-effect of persistence." />
		</Slide>

		<Slide title="Try both" ornament>
			<p>
				On the right: a synthetic counter graph for time-travel + fork (Demo 1), and a real
				LLM chat that remembers across turns thanks to the saver (Demo 2).
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Time travel" subtitle="Two threads = two timelines">
			<div class="thread">
				<input type="text" bind:value={threadId} />
				<button class="ghost" onclick={newThread}>New thread</button>
				<button class="ghost" onclick={freshSaver}>Reset checkpointer</button>
			</div>
			<RunButton onclick={runOnce} running={busy} label="Run graph" />
			{#if currentState}
				<StateInspector state={currentState} title="Final state" compact />
			{/if}
		</Panel>

		<Panel title="History" subtitle="Every checkpoint for this thread">
			{#if !history.length}
				<p class="empty">No checkpoints yet — run the graph.</p>
			{:else}
				<ol class="hist">
					{#each history as h, i (h.checkpoint_id ?? i)}
						<li class:current={chosenCheckpoint === h.checkpoint_id}>
							<header>
								<span class="step">step {history.length - h.step - 1}</span>
								<span class="ckpt">{(h.checkpoint_id ?? '').slice(0, 8) || '—'}</span>
							</header>
							<div class="vals">
								<code>count={(h.values as { count?: number })?.count ?? 0}</code>
								<code>next={JSON.stringify(h.next)}</code>
							</div>
							{#if h.checkpoint_id && h.next.includes('double')}
								<button
									class="ghost small"
									disabled={busy}
									onclick={() => forkFrom(h.checkpoint_id!)}
								>
									Fork from here with count = 100
								</button>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Multi-turn chat" subtitle="Same thread → real memory">
			<div class="thread">
				<input type="text" bind:value={chatThread} />
				<button class="ghost" onclick={newChatThread}>New chat thread</button>
			</div>
			<div class="chat">
				{#if !chatLog.length}
					<p class="empty">Start the conversation. The model only remembers when you stay on this thread.</p>
				{:else}
					{#each chatLog as msg, i (i)}
						<article class="chat-msg" data-role={msg.role}>
							<div class="chat-role">{msg.role}</div>
							<p>{msg.text}</p>
						</article>
					{/each}
				{/if}
			</div>
			<label class="row">
				<span>Your turn</span>
				<input type="text" bind:value={userTurn} disabled={chatBusy} />
			</label>
			<RunButton onclick={sendChat} running={chatBusy} label="Send" />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.thread {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
	}
	.thread input {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.82rem;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0.7rem 0;
	}
	.row span {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	.row input {
		width: 100%;
	}
	.ghost {
		font-size: 0.78rem;
		padding: 0.35rem 0.65rem;
		background: var(--color-bg);
		color: var(--color-ink-200);
		border: 1px solid var(--color-rule);
		border-radius: 0.35rem;
	}
	.ghost.small {
		font-size: 0.74rem;
		padding: 0.3rem 0.55rem;
		margin-top: 0.4rem;
	}
	.ghost:hover:not(:disabled) {
		color: var(--color-ink-100);
	}

	.empty {
		font-style: italic;
		color: var(--color-ink-300);
		font-size: 0.85rem;
		margin: 0;
	}

	.hist {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.hist li {
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		background: var(--color-bg);
	}
	.hist li.current {
		border-color: var(--accent-ink);
	}
	.hist header {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-300);
		margin-bottom: 0.3rem;
	}
	.hist .ckpt {
		color: var(--accent-ink);
	}
	.vals {
		display: flex;
		gap: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink-200);
	}

	.chat {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		max-height: 18rem;
		overflow-y: auto;
		padding: 0.5rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
	}
	.chat-msg {
		padding: 0.45rem 0.65rem;
		border-radius: 0.4rem;
		background: var(--color-paper);
		border: 1px solid var(--color-rule);
	}
	.chat-msg[data-role='user'] {
		border-color: color-mix(in oklch, var(--accent-ink) 50%, var(--color-rule));
	}
	.chat-role {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		margin-bottom: 0.2rem;
	}
	.chat-msg p {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.92rem;
		color: var(--color-ink-100);
		line-height: 1.55;
	}
</style>
