<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { subgraphs } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import LangGraphView from '$lib/components/LangGraphView.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { StateGraph, START, END } from '@langchain/langgraph/web';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		runSubgraphsDemo,
		RagState,
		ChatState,
		type OuterPayload
	} from '$lib/demos/lg-subgraphs';
	import lgSubgraphsSrc from '$lib/demos/lg-subgraphs.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'subgraphs',
		title: 'Subgraphs',
		summary: 'Compile a RAG mini-graph and use it as a node inside an outer routing graph.',
		entries: [{ path: 'lib/demos/lg-subgraphs.ts', code: lgSubgraphsSrc }],
		runner: `import { runSubgraphsDemo } from './lib/demos/lg-subgraphs';

const out = await runSubgraphsDemo('What is LCEL?', (p) =>
	console.log('  path:', p.join(' -> '))
);

console.log('\\ncategory:', out.category);
console.log('answer:', out.answer);
`
	};

	let userQuestion = $state('What is LCEL?');
	let busy = $state(false);
	let path = $state<string[]>([]);
	let result = $state<OuterPayload | null>(null);

	// Viz-only graph: same outer shape, RAG subgraph compiled inside.
	const ragVizGraph = new StateGraph(RagState)
		.addNode('retrieve', async () => ({}))
		.addNode('generate', async () => ({}))
		.addEdge(START, 'retrieve')
		.addEdge('retrieve', 'generate')
		.addEdge('generate', END)
		.compile();

	const outerVizGraph = new StateGraph(ChatState)
		.addNode('classify', async () => ({}))
		.addNode('rag', ragVizGraph)
		.addNode('chitchat', async () => ({}))
		.addEdge(START, 'classify')
		.addConditionalEdges('classify', () => 'rag', { rag: 'rag', chitchat: 'chitchat' })
		.addEdge('rag', END)
		.addEdge('chitchat', END)
		.compile();

	async function run() {
		busy = true;
		path = [];
		result = null;
		try {
			const out = await withRunCache<OuterPayload>(
				{ demoId: `l2-subgraphs-${userQuestion.slice(0, 32)}` },
				async () => await runSubgraphsDemo(userQuestion, (p) => (path = p))
			);
			result = out;
			path = out.path;
		} finally {
			busy = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<OuterPayload>({
			demoId: `l2-subgraphs-${userQuestion.slice(0, 32)}`
		});
		if (cached) {
			result = cached.payload;
			path = cached.payload.path;
		}
	});

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

<Lesson
	title="Subgraphs"
	eyebrow="Level 2 · Lesson 07"
	hero={{
		id: 'l2-subgraphs',
		alt: 'Nested architectural floor plans where one room zooms into its own complete plan'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Composability scales. A <Term t="Subgraph" /> behaves exactly like a <Term t="Node" />, so the
		architecture you sketch on a napkin matches the architecture you ship.
	{/snippet}
	{#snippet intro()}
		<p>
			A compiled <Term t="StateGraph" /> is a <Term t="Runnable" />, so a graph can be a
			<Term t="Node" /> inside another graph. This is how you compose specialized workflows — a
			RAG mini-graph, a code-review mini-graph, a research mini-graph — into a larger orchestrator
			without flattening everything into one giant diagram.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The graph is the API" variant="dropcap">
			<p>
				A <Term t="Subgraph" /> isn't a special concept; it's the natural consequence of every
				compiled graph being a <Term t="Runnable" />. The very same object that powered the
				chat-tool loop in lesson 1 can drop into another graph as one of its
				<Term t="Node">nodes</Term>. Encapsulation, testing, and reuse stop being framework
				features and become emergent properties of the type signature.
			</p>
			<p>
				The win is architectural, not technical. You can sketch your system as a tree of graphs
				— outer orchestrator, retrieval <Term t="Subgraph">subgraph</Term>, code-review
				subgraph, summary subgraph — and every box on the napkin maps to a real, compilable,
				testable unit.
			</p>
		</Slide>

		<Slide title="Just compile it" variant="code-first">
			<CodeBlock
				code={code}
				caption="No special API — call invoke from inside a node."
			/>
		</Slide>

		<Diagram spec={subgraphs} />

		<Slide variant="pull-quote">
			<p>
				A <Term t="Subgraph" /> is a contract: same input shape, same output shape, same
				<Term t="Runnable" /> protocol. That's all the runtime needs to nest them as deep as you
				like.
			</p>
		</Slide>

		<Slide title="State namespacing">
			<p>
				Each <Term t="Subgraph" /> has its own <Term t="State schema">state schema</Term>. You map
				fields explicitly when you call into it, and you map them back when you return.
				Subgraphs can have their own <Term t="Checkpointer">checkpointer</Term> configuration too
				— useful when you want a sensitive subroutine to share or keep its own audit trail.
			</p>
		</Slide>

		<Slide title="When to reach for a subgraph">
			<p>
				Whenever a slice of your workflow has its own <Term t="State" />, its own loop, and its
				own tests. The <Term t="Deep Agent">Deep Agents</Term> harness uses
				<Term t="Subgraph">subgraphs</Term> for every spawned <Term t="Subagent">subagent</Term>,
				which is the next chapter's domain.
			</p>
		</Slide>

		<Slide title="Demo · classify → (rag | chitchat)">
			<p>
				The outer <Term t="StateGraph" /> classifies the question, then either calls a real RAG
				<Term t="Subgraph" /> (retrieve → generate, both real model calls grounded in a tiny
				knowledge base) or replies with chit-chat. The subgraph is invoked exactly like any other
				<Term t="Node" /> — the outer graph never has to know how <Term t="RAG">RAG</Term> works
				inside.
			</p>
		</Slide>

		<Slide title="From here to harness" ornament>
			<p>
				That's Level 2. Next chapter swaps "you wire the <Term t="StateGraph" />" for "the
				<Term t="Harness">harness</Term> wires it, you declare policy" — and every
				<Term t="Subgraph">subgraph</Term> technique here keeps working underneath.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel
			title="Question"
			subtitle="Technical questions route to RAG; small talk routes to chit-chat."
		>
			<input type="text" bind:value={userQuestion} />
			<div class="row">
				<RunButton onclick={run} running={busy} label="Run outer graph" />
			</div>
		</Panel>

		<Panel
			title="Outer graph + RAG subgraph"
			subtitle="rendered from getGraphAsync().drawMermaid()"
		>
			<LangGraphView
				graph={outerVizGraph}
				path={path}
				activeNode={path[path.length - 1]}
				xray={1}
				caption="Native LangGraph diagram · xray = 1 · subgraph expanded"
			/>
			<div class="legend">
				The <code>rag</code> node is a compiled <code>StateGraph(retrieve → generate)</code>.
				When the classifier sends us there, the subgraph runs to completion before the outer
				graph proceeds.
			</div>
		</Panel>

		{#if result}
			<Panel title="Answer">
				<div class="lbl">category</div>
				<code class="cat">{result.category}</code>
				<div class="lbl">answer</div>
				<p class="answer">{result.answer}</p>
			</Panel>
		{/if}
	{/snippet}

	{#snippet inspect()}
		{#if result}
			<Panel title="Final state">
				<StateInspector state={result} compact />
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	input {
		width: 100%;
	}
	.row {
		margin-top: 0.6rem;
	}
	.legend {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		margin-top: 0.55rem;
	}
	.lbl {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		margin-top: 0.4rem;
	}
	.cat {
		font-family: var(--font-mono);
		color: var(--accent-ink);
		font-size: 0.85rem;
	}
	.answer {
		margin: 0.3rem 0 0;
		font-family: var(--font-prose);
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-ink-100);
	}
</style>
