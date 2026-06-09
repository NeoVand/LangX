<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import BranchingChat from '$lib/components/BranchingChat.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo, type EdgeDetail } from '$lib/components/LiveGraph.svelte';
	import { MemorySaver } from '@langchain/langgraph/web';
	import { getModel } from '$lib/runtime/llm';
	import { buildChatGraph, runChatTurn, type ChatGraph } from '$lib/demos/lg-checkpointers';
	import lgCheckpointersSrc from '$lib/demos/lg-checkpointers.ts?raw';
	import checkpointersSkill from '$lib/demos/skills/langgraph-checkpointers.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { Pencil, RefreshCw } from '@lucide/svelte';

	const demoSource: DemoManifest = {
		id: 'checkpointers',
		title: 'Checkpointers & time travel',
		summary:
			'Compile with a MemorySaver and one graph gains memory across turns, a queryable checkpoint history, and the ability to rewind and fork a conversation.',
		entries: [{ path: 'lib/demos/lg-checkpointers.ts', code: lgCheckpointersSrc }],
		runner: `import { MemorySaver } from '@langchain/langgraph/web';
import { getModel } from './lib/runtime/llm';
import { buildChatGraph, sendTurn, historyOf } from './lib/demos/lg-checkpointers';

const model = await getModel({ temperature: 0.5, maxTokens: 160 });
const graph = buildChatGraph(new MemorySaver(), model);
const thread = 'demo-1';

// Memory: pass only the new message; the checkpointer reloads the rest.
await sendTurn(graph, "Hi! I'm Neo and I'm learning to bake sourdough.", thread);
const t2 = await sendTurn(graph, 'What should I make this weekend?', thread);
console.log('remembers:', t2.messages.at(-1)?.content);

console.log('\\n--- every checkpoint ---');
const history = await historyOf(graph, thread);
for (const c of history) console.log(c.step, c.checkpointId.slice(-6), 'next=' + JSON.stringify(c.next));

// Time travel: resume from the FIRST completed turn with a different message → a branch.
const firstTurn = [...history].reverse().find((c) => c.next.length === 0);
const forked = await sendTurn(graph, 'Actually I just took up watercolor — what should I paint?', thread, firstTurn.checkpointId);
console.log('\\nforked reply:', forked.messages.at(-1)?.content);`,
		skill: checkpointersSkill
	};

	// ── The chat graph (built once; one saver, threads stay isolated inside it) ──
	const saver = new MemorySaver();
	let graphPromise: Promise<ChatGraph> | null = null;
	async function getGraph(): Promise<ChatGraph> {
		graphPromise ??= (async () => buildChatGraph(saver, await getModel({ temperature: 0.6, maxTokens: 220 })))();
		return graphPromise;
	}
	let threadSeq = 0;

	// runTurn passed to <BranchingChat>: stream a turn, return reply + thread + checkpoint.
	// resume === null means fork from empty → a brand-new thread (isolated memory);
	// otherwise resume from that exact checkpoint on its thread.
	async function runTurn(
		text: string,
		resume: { threadId: string; checkpointId: string } | null,
		onToken: (full: string) => void
	) {
		const graph = await getGraph();
		const threadId = resume?.threadId ?? `chat-${++threadSeq}`;
		const r = await runChatTurn(graph, text, threadId, resume?.checkpointId, onToken);
		return { text: r.text, threadId, checkpointId: r.checkpointId };
	}

	// ── Live graph (inspection): START → chat → END, lit per turn ────────────────
	interface ChatFrameSnap {
		threadId: string;
		user: string;
		reply: string;
		checkpointId: string;
	}
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 132, cy: 40, w: 56, h: 28, shape: 'pill' as const },
		{ id: 'chat', label: 'chat', sub: 'the model replies', cx: 132, cy: 134, w: 132, h: 50, shape: 'box' as const, variant: 'llm' as const },
		{ id: '__end__', label: 'END', cx: 132, cy: 230, w: 56, h: 28, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'chat' },
		{ from: 'chat', to: '__end__', label: 'checkpoint ✓' }
	];
	const nodeMeta: Record<string, NodeMeta> = {
		__start__: {
			desc: 'Your message enters as state.',
			explain: {
				lead: 'You send a message.',
				body: 'Only the new message goes in. Because the graph was compiled with a checkpointer, the runtime first reloads this thread’s saved history, so the model sees the whole conversation.'
			}
		},
		chat: {
			label: 'chat (model node)',
			desc: 'Calls the model on the full (reloaded) history and appends the reply.',
			explain: {
				lead: 'The model answers.',
				body: 'A single node hands the reloaded conversation to the model and appends its reply. When the node finishes, the checkpointer writes a new checkpoint — that’s the save point you can rewind to.'
			},
			code: `const graph = builder.compile({ checkpointer: new MemorySaver() });
// resume a past point by passing checkpoint_id:
await graph.invoke({ messages: [msg] },
  { configurable: { thread_id, checkpoint_id } });`
		},
		__end__: {
			desc: 'A checkpoint is saved; the reply is now part of the thread.',
			explain: {
				lead: 'Saved.',
				body: 'The turn is checkpointed. Edit one of your messages or regenerate a reply and the run resumes from an earlier checkpoint — forking a new branch while the original stays intact.'
			}
		}
	};
	const EDGE_DETAIL: Record<string, EdgeDetail> = {
		'chat|__end__': {
			title: 'Checkpoint after every node',
			variant: '',
			desc: 'The checkpointer snapshots state after each super-step. That snapshot is addressable by checkpoint_id — the basis for memory, history, and time travel.',
			code: `.compile({ checkpointer: new MemorySaver() })`
		}
	};

	let frames = $state<{ node: string; snap: ChatFrameSnap }[]>([]);
	let frameIdx = $state(0);
	let pausedNode = $state<string | undefined>(undefined);
	let live = $state<ChatFrameSnap>({ threadId: 'chat-1', user: '', reply: '', checkpointId: '' });

	function onTurnStart(humanText: string) {
		live = { threadId: '', user: humanText, reply: '', checkpointId: '…saving' };
		frames = [
			{ node: '__start__', snap: { ...live } },
			{ node: 'chat', snap: { ...live } }
		];
		frameIdx = 1;
		pausedNode = 'chat';
	}
	function onStreaming(full: string) {
		live = { ...live, reply: full };
	}
	function onTurnEnd(res: { text: string; threadId: string; checkpointId: string }) {
		live = { ...live, threadId: res.threadId, reply: res.text, checkpointId: res.checkpointId };
		frames = [...frames, { node: '__end__', snap: { ...live } }];
		frameIdx = frames.length - 1;
		pausedNode = undefined;
	}
	function onNewThread() {
		frames = [];
		frameIdx = 0;
		pausedNode = undefined;
	}

	function describe(node: string, s: ChatFrameSnap): StepInfo | null {
		switch (node) {
			case '__start__':
				return {
					summary: 'Your message + the thread’s saved history become the input',
					stateChange: 'checkpointer reloads prior messages',
					insight: 'You only sent the new message — memory comes from the saver.'
				};
			case 'chat':
				return {
					summary: 'The model replies using the full conversation',
					items: s.reply ? [{ icon: '◇', text: s.reply.slice(0, 80) + (s.reply.length > 80 ? '…' : '') }] : undefined,
					stateChange: 'messages += AIMessage'
				};
			case '__end__':
				return {
					summary: `Checkpoint #${(s.checkpointId || '').slice(-6)} saved`,
					stateChange: 'a new checkpoint is written',
					insight: 'Rewind to it later by passing its checkpoint_id.'
				};
			default:
				return null;
		}
	}
	function toState(s: ChatFrameSnap): Record<string, unknown> {
		return { thread_id: s.threadId, last_message: s.user, reply: s.reply, checkpoint: s.checkpointId };
	}

	// ── Narrative code excerpts ───────────────────────────────────────────────────
	const code = `import { MemorySaver } from '@langchain/langgraph';

// One extra line at compile time. SQLite or Postgres in production.
const graph = builder.compile({ checkpointer: new MemorySaver() });
const cfg = { configurable: { thread_id: 'user-42' } };

// Pass ONLY the new message — the checkpointer reloads the thread's history.
await graph.invoke({ messages: [new HumanMessage("Hi, I'm Neo.")] }, cfg);
await graph.invoke({ messages: [new HumanMessage("What's my name?")] }, cfg);  // → "Neo"`;

	const timeTravelCode = `// List every saved checkpoint for a thread:
for await (const snap of graph.getStateHistory({ configurable: { thread_id: 'user-42' } })) {
  console.log(snap.config.configurable.checkpoint_id, snap.values);
}

// Time travel: resume from a PAST checkpoint with a different message → a branch.
await graph.invoke(
  { messages: [new HumanMessage('Actually, call me Mr. Anderson.')] },
  { configurable: { thread_id: 'user-42', checkpoint_id: pastId } }
);
// The original branch is untouched; both stay queryable.`;
</script>

<Lesson
	title="Checkpointers & time travel"
	eyebrow="Level 2 · Lesson 03"
	hero={{
		id: 'l2-checkpointers',
		alt: 'A brass machine stamping a row of glowing checkpoint medallions along a timeline rail'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		An agent without persistence is a goldfish. A <Term t="Checkpointer">checkpointer</Term> gives the
		same graph three things at once — <strong>memory</strong> across turns, a queryable
		<strong>history</strong>, and the ability to <strong>rewind and fork</strong> — from one extra line.
	{/snippet}
	{#snippet intro()}
		<p>
			Plug a <Term t="Checkpointer" /> into a compiled graph and every
			<Term t="Superstep">super-step</Term> writes a <Term t="Checkpoint">checkpoint</Term>. The demo
			on the right is a chat that <em>remembers</em> — and because every turn is a saved checkpoint, you
			can <strong>edit an earlier message or regenerate a reply</strong> to fork the conversation into a
			parallel timeline, then switch between branches.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="State you can re-enter" variant="dropcap">
			<p>
				Most frameworks treat memory as a feature you bolt on later. <Term t="LangGraph" /> treats it
				as a property of the runtime: as long as your <Term t="State">state</Term> is well-typed, the
				same saver that powers a multi-turn chat also powers crash recovery, A/B branching, and
				point-in-time debugging — three problems that look unrelated until they share an implementation.
			</p>
			<p>
				The mental shift: stop thinking of a run as one thing and start thinking of it as
				<strong>a stream of <Term t="Superstep">super-steps</Term> with a checkpoint after each one</strong>.
				Every snapshot is addressable. Every snapshot is forkable. A <Term t="Thread">thread</Term> is
				just a sequence of those snapshots, scoped by an id.
			</p>
		</Slide>

		<Slide title="Compile with a checkpointer" variant="code-first">
			<p>
				<Term t="compile"><code>graph.compile({'{ checkpointer }'})</code></Term> tells the runtime to
				save state after every <Term t="Node">node</Term>.
				<Term t="MemorySaver"><code>MemorySaver</code></Term> is in-memory; production swaps in SQLite or
				<Term t="PostgresSaver">Postgres</Term>. The payoff is immediate: pass a
				<Term t="thread_id"><code>thread_id</code></Term> and only the <em>new</em> message — the
				checkpointer reloads the rest, so the model remembers without you resending the transcript.
			</p>
			<CodeBlock code={code} caption="One MemorySaver, three superpowers — starting with free memory." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="checkpointers-threads"
				alt="The chat graph (START → chat → END) with a checkpointer press stamping a medallion after the node, feeding two separate labelled rails — thread A and thread B — that never cross."
			/>
			<figcaption>
				One saver, many threads. Each <code>thread_id</code> is its own isolated timeline of checkpoints.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A <Term t="Checkpoint">checkpoint</Term> is more than a backup — it's an <em>address</em>. Once
				the runtime hands you an address for every <Term t="Superstep">super-step</Term>, "memory" and
				"debugging" stop being separate disciplines.
			</p>
		</Slide>

		<Slide title="Time travel" variant="code-first">
			<p>
				<Term t="getStateHistory"><code>getStateHistory</code></Term> walks every checkpoint for a
				thread — each one carries a <Term t="checkpoint_id"><code>checkpoint_id</code></Term>. Resume
				<Term t="invoke">invoke</Term> from a past id with a different input and the run <strong>forks</strong>:
				a new branch grows from that point while the original stays intact and queryable. Editing a
				message or regenerating a reply in any modern chat app is exactly this.
			</p>
			<CodeBlock code={timeTravelCode} caption="History is a list of addresses; forking is just resuming from an old one." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="checkpointers-timetravel"
				alt="A timeline of brass checkpoint medallions where one point branches into a second parallel rail — the fork — labelled getStateHistory, checkpoint_id, and resume."
			/>
			<figcaption>
				Rewind to any checkpoint and send something new; the timeline grows a second branch.
			</figcaption>
		</figure>

		<Slide title="What this unlocks" ornament>
			<p>
				The same primitive underpins the rest of Level 2:
				<Term t="Interrupt">interrupts</Term> pause on a checkpoint and resume from it,
				<Term t="streamMode">streaming</Term> replays super-steps, and any long-running agent survives a
				crash because its last good <Term t="Checkpoint">checkpoint</Term> is just an address away.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'Persistence & checkpointers', href: 'https://langchain-ai.github.io/langgraphjs/concepts/persistence/', kind: 'docs' },
				{ label: 'Time travel (how-to)', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/time-travel/', kind: 'docs' },
				{ label: 'MemorySaver & SqliteSaver', href: 'https://langchain-ai.github.io/langgraphjs/reference/classes/checkpoint.MemorySaver.html', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="a real, persistent chatbot — every message is a checkpoint">
			<ol class="howto">
				<li><strong>Chat normally.</strong> Tell it a couple of facts, then ask it to recall one — it remembers, because the thread is checkpointed.</li>
				<li><strong>Branch.</strong> Hover any message and click <Pencil size={12} /> to edit one of <em>your</em> messages, or <RefreshCw size={12} /> to regenerate a reply. Either one rewinds to that checkpoint and forks a new timeline.</li>
				<li><strong>Compare.</strong> Branched messages show <code>‹ 1/2 ›</code> arrows — flip between the original and the fork. <strong>New thread</strong> starts fresh memory.</li>
			</ol>
		</Panel>

		<BranchingChat
			{runTurn}
			title="Persistent assistant"
			placeholder="Tell me something, then ask me to recall it…"
			starters={[
				"Hi! I'm Neo. I'm planning a one-day trip to Kyoto and I love temples and street food.",
				'Plan my morning.'
			]}
			{onTurnStart}
			{onStreaming}
			{onTurnEnd}
			{onNewThread}
		/>

		{#if frames.length}
			<Panel title="The graph, live" subtitle="one node + a checkpointer — hover to inspect what gets saved">
				<div class="graph-wrap">
					<LiveGraph
						nodes={graphNodes}
						edges={graphEdges}
						{frames}
						bind:frameIdx
						meta={nodeMeta}
						edgeDetails={EDGE_DETAIL}
						{describe}
						{toState}
						{pausedNode}
					/>
				</div>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	/* In-narrative diagrams: frameless, full column width. */
	.diagram {
		margin: 1.8rem 0;
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
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}

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

	/* Keep the vertical chat graph compact + centered instead of filling the panel. */
	.graph-wrap :global(svg[aria-label='Agent graph']) {
		display: block;
		height: 300px;
		width: auto;
		max-width: 100%;
		margin: 0 auto;
	}
	.howto :global(svg) {
		display: inline;
		vertical-align: -2px;
		color: var(--accent);
	}
	.howto code {
		font-family: var(--font-mono);
		font-size: 0.82em;
		color: var(--accent-ink);
	}
</style>
