<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import {
		Annotation,
		StateGraph,
		MemorySaver,
		START,
		END
	} from '@langchain/langgraph/web';

	const State = Annotation.Root({
		count: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
		log: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] })
	});

	let checkpointer = new MemorySaver();
	let graphCompiled = $state(false);

	let currentState = $state<unknown>(null);
	let history = $state<Array<{ step: number; values: unknown; checkpoint_id?: string; next: string[] }>>([]);
	let chosenCheckpoint = $state<string | null>(null);
	let threadId = $state('thread-1');
	let busy = $state(false);

	const config = $derived({ configurable: { thread_id: threadId } });

	function buildGraph() {
		return new StateGraph(State)
			.addNode('add', async (s) => ({
				count: 1,
				log: [`add → count is now ${s.count + 1}`]
			}))
			.addNode('double', async (s) => ({
				count: s.count,
				log: [`double → count is now ${s.count * 2}`]
			}))
			.addEdge(START, 'add')
			.addEdge('add', 'double')
			.addEdge('double', END)
			.compile({ checkpointer });
	}

	async function runOnce() {
		busy = true;
		try {
			const graph = buildGraph();
			graphCompiled = true;
			const result = await graph.invoke({ count: 0 }, config);
			currentState = result;
			await refreshHistory();
		} finally {
			busy = false;
		}
	}

	async function refreshHistory() {
		const graph = buildGraph();
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
			const graph = buildGraph();
			const forkedConfig = {
				configurable: { thread_id: threadId, checkpoint_id: id }
			};
			const updated = await graph.updateState(
				forkedConfig,
				{ count: 100 },
				'add'
			);
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
</script>

<Lesson title="Checkpointers & time travel" eyebrow="Phase 2 · Lesson 03">
	{#snippet intro()}
		<p>
			Plug a checkpointer into a compiled graph and every step writes a snapshot. That single
			fact unlocks resume-after-crash, multi-turn conversations, and time travel — replay or
			fork from any earlier point in the run.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Compile with a checkpointer">
			<p>
				<code>graph.compile(&#123; checkpointer &#125;)</code> wires the runtime to call the saver
				after every node. <code>MemorySaver</code> is in-memory; production setups use SQLite
				or Postgres.
			</p>
			<CodeBlock code={code} caption="One Memory checkpointer, three superpowers." />
		</Slide>

		<Slide title="Threads">
			<p>
				Every call passes <code>thread_id</code> in <code>config.configurable</code>. The
				checkpointer treats threads as isolated: snapshots from one don't bleed into another.
				Two users on your app simply use two thread IDs.
			</p>
		</Slide>

		<Slide title="Time travel">
			<p>
				<code>getStateHistory</code> walks every checkpoint for a thread. You can pick one,
				call <code>updateState</code> to edit it, and call <code>invoke(null, newConfig)</code>
				to run forward from that fork. The original branch stays intact.
			</p>
		</Slide>

		<Slide title="Try it">
			<p>
				The graph on the right adds 1 then doubles the count. Press <em>Run</em>; the history
				below it lists every checkpoint. Use <em>Fork</em> on the <code>add</code> snapshot to
				replay from there with <code>count: 100</code>. The new branch lives in the same
				thread; both are queryable.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Thread" subtitle="Two threads = two timelines">
			<div class="thread">
				<input type="text" bind:value={threadId} />
				<button class="ghost" onclick={newThread}>New thread</button>
				<button class="ghost" onclick={freshSaver}>Reset checkpointer</button>
			</div>
			<div class="row">
				<RunButton onclick={runOnce} running={busy} label="Run graph" />
			</div>
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
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.4rem 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-fg);
	}
	.row {
		margin-bottom: 0.85rem;
	}
	.ghost {
		font-size: 0.78rem;
		padding: 0.35rem 0.65rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		border-radius: 0.35rem;
	}
	.ghost.small {
		font-size: 0.74rem;
		padding: 0.3rem 0.55rem;
		margin-top: 0.4rem;
	}
	.ghost:hover:not(:disabled) {
		color: var(--color-fg);
	}

	.empty {
		font-style: italic;
		color: var(--color-fg-faint);
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
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		background: var(--color-bg);
	}
	.hist li.current {
		border-color: var(--accent);
	}
	.hist header {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.3rem;
	}
	.hist .ckpt {
		color: var(--accent);
	}
	.vals {
		display: flex;
		gap: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-fg-muted);
	}
</style>
