<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';

	const RagState = Annotation.Root({
		question: Annotation<string>(),
		hits: Annotation<string[]>(),
		answer: Annotation<string>()
	});

	const ChatState = Annotation.Root({
		question: Annotation<string>(),
		category: Annotation<string>(),
		answer: Annotation<string>()
	});

	const ragSubgraph = new StateGraph(RagState)
		.addNode('retrieve', async (s) => ({
			hits: [
				`doc-1: ${s.question} (snippet 1)`,
				`doc-2: ${s.question} (snippet 2)`
			]
		}))
		.addNode('generate', async (s) => ({
			answer: `RAG answer for "${s.question}", grounded on ${s.hits.length} hits.`
		}))
		.addEdge(START, 'retrieve')
		.addEdge('retrieve', 'generate')
		.addEdge('generate', END)
		.compile();

	let userQuestion = $state('What is LCEL?');
	let busy = $state(false);
	let path = $state<string[]>([]);
	let result = $state<unknown>(null);

	async function run() {
		busy = true;
		path = [];
		result = null;
		try {
			const graph = new StateGraph(ChatState)
				.addNode('classify', async (s) => {
					path = [...path, 'classify'];
					await new Promise((r) => setTimeout(r, 200));
					return {
						category: /docs|how|explain/i.test(s.question) ? 'rag' : 'chitchat'
					};
				})
				.addNode('rag', async (s) => {
					path = [...path, 'rag'];
					await new Promise((r) => setTimeout(r, 200));
					const sub = await ragSubgraph.invoke({
						question: s.question,
						hits: [],
						answer: ''
					});
					return { answer: sub.answer };
				})
				.addNode('chitchat', async (s) => {
					path = [...path, 'chitchat'];
					await new Promise((r) => setTimeout(r, 200));
					return { answer: `Chit-chat reply to "${s.question}".` };
				})
				.addEdge(START, 'classify')
				.addConditionalEdges('classify', (s) => s.category, {
					rag: 'rag',
					chitchat: 'chitchat'
				})
				.addEdge('rag', END)
				.addEdge('chitchat', END)
				.compile();

			result = await graph.invoke({ question: userQuestion, category: '', answer: '' });
			path = [...path, 'end'];
		} finally {
			busy = false;
		}
	}

	const code = `// 1. Compile a small graph the usual way.
const ragSubgraph = new StateGraph(RagState)
  .addNode('retrieve', retrieveFn)
  .addNode('generate', generateFn)
  .addEdge(START, 'retrieve')
  .addEdge('retrieve', 'generate')
  .addEdge('generate', END)
  .compile();

// 2. Use it as a node inside another graph.
const chat = new StateGraph(ChatState)
  .addNode('rag', async (s) => {
    const out = await ragSubgraph.invoke({ question: s.question });
    return { answer: out.answer };
  })
  /* ... */;`;
</script>

<Lesson title="Subgraphs" eyebrow="Phase 2 · Lesson 07">
	{#snippet intro()}
		<p>
			A compiled graph is a Runnable, so a graph can be a node inside another graph. This is how
			you compose specialized workflows — a RAG mini-graph, a code-review mini-graph, a research
			mini-graph — into a larger orchestrator without flattening everything into one giant
			diagram.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Just compile it">
			<CodeBlock code={code} caption="No special API — call invoke from inside a node." />
		</Slide>

		<Slide title="State namespacing">
			<p>
				Each subgraph has its own state schema. You map fields explicitly when you call into
				it, and you map them back when you return. Subgraphs can have their own checkpointer
				configuration too — useful when you want a sensitive subroutine to share or keep its
				own audit trail.
			</p>
		</Slide>

		<Slide title="When to reach for a subgraph">
			<p>
				Whenever a slice of your workflow has its own state, its own loop, and its own tests.
				The Deep Agents harness uses subgraphs for every spawned subagent, which is the next
				chapter's domain.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Question" subtitle="'docs', 'how', 'explain' route to RAG; otherwise chit-chat">
			<input type="text" bind:value={userQuestion} />
			<div class="row">
				<RunButton onclick={run} running={busy} label="Run outer graph" />
			</div>
		</Panel>

		<Panel title="Outer graph + RAG subgraph">
			<GraphView
				nodes={[
					{ id: 'start', label: '·', x: 50, y: 30, kind: 'start' },
					{ id: 'classify', label: 'classify', x: 50, y: 100 },
					{ id: 'rag', label: 'rag', x: 200, y: 60, kind: 'subgraph' },
					{ id: 'chitchat', label: 'chitchat', x: 200, y: 150 },
					{ id: 'end', label: '·', x: 350, y: 100, kind: 'end' }
				]}
				edges={[
					{ from: 'start', to: 'classify' },
					{ from: 'classify', to: 'rag', conditional: true },
					{ from: 'classify', to: 'chitchat', conditional: true },
					{ from: 'rag', to: 'end' },
					{ from: 'chitchat', to: 'end' }
				]}
				path={path}
				width={420}
				height={210}
			/>
			<div class="legend">
				The <code>rag</code> node is a compiled <code>StateGraph(retrieve → generate)</code>.
				When the classifier sends us there, the subgraph runs to completion before the outer
				graph proceeds.
			</div>
		</Panel>

		<Panel title="Final state">
			<StateInspector state={result} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	input {
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.row {
		margin-top: 0.6rem;
	}
	.legend {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin-top: 0.55rem;
	}
</style>
