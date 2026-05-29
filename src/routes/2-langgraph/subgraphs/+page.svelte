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
	import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { onMount } from 'svelte';

	const RagState = Annotation.Root({
		question: Annotation<string>(),
		hits: Annotation<string[]>(),
		answer: Annotation<string>()
	});

	const ChatState = Annotation.Root({
		question: Annotation<string>(),
		category: Annotation<'rag' | 'chitchat'>(),
		answer: Annotation<string>()
	});

	type Category = 'rag' | 'chitchat';

	interface OuterPayload {
		question: string;
		category: Category;
		answer: string;
		path: string[];
	}

	const KB: { id: string; text: string }[] = [
		{
			id: 'lcel',
			text: 'LCEL (LangChain Expression Language) composes Runnables with the pipe operator. Every Runnable speaks invoke / batch / stream / streamEvents.'
		},
		{
			id: 'stategraph',
			text: 'A LangGraph StateGraph is a state machine: nodes return partial state updates, edges (fixed or conditional) decide what runs next, and a checkpointer can persist every superstep.'
		},
		{
			id: 'reducers',
			text: 'Reducers in LangGraph define how concurrent writes to the same state field combine: append for messages, sum for counters, dedupe for sets.'
		},
		{
			id: 'checkpointer',
			text: 'A LangGraph checkpointer (e.g. MemorySaver, Postgres) snapshots state after every node so you can resume, branch, or time-travel a thread.'
		},
		{
			id: 'subagent',
			text: 'A subagent in Deep Agents is a self-contained agent with its own instructions and context, spawned via the task tool.'
		}
	];

	function tinyRetrieve(question: string): string[] {
		const q = question.toLowerCase();
		const scored = KB.map((doc) => ({
			doc,
			score: doc.text.toLowerCase().split(/\W+/).filter((w) => q.includes(w)).length
		}));
		scored.sort((a, b) => b.score - a.score);
		return scored
			.filter((s) => s.score > 0)
			.slice(0, 2)
			.map((s) => `${s.doc.id}: ${s.doc.text}`);
	}

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
				async () => {
					const classifier = await getModel({ temperature: 0, maxTokens: 30 });
					const ragModel = await getModel({ temperature: 0.2, maxTokens: 220 });
					const chatModel = await getModel({ temperature: 0.6, maxTokens: 140 });
					const parser = new StringOutputParser();

					const classifyPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'Classify the user question. Reply with EXACTLY one of: rag, chitchat. Use rag when the question is asking for a factual/technical answer that benefits from documents. Use chitchat for greetings, opinions, or small talk.'
						],
						['human', '{question}']
					]);
					const ragPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'Answer the question grounded in the provided snippets. Cite the snippet ids in [] brackets. Be concise (≤ 60 words).'
						],
						[
							'human',
							'Question: {question}\n\nSnippets:\n{hits}'
						]
					]);
					const chatPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'You are a friendly assistant. Reply briefly (≤ 30 words). No greetings.'
						],
						['human', '{question}']
					]);

					/* The RAG mini-graph — compiled and used as a node below. */
					const ragSubgraph = new StateGraph(RagState)
						.addNode('retrieve', async (s) => {
							return { hits: tinyRetrieve(s.question) };
						})
						.addNode('generate', async (s) => {
							const answer = await ragPrompt
								.pipe(ragModel)
								.pipe(parser)
								.invoke({
									question: s.question,
									hits: s.hits.length ? s.hits.join('\n') : '(no matches)'
								});
							return { answer };
						})
						.addEdge(START, 'retrieve')
						.addEdge('retrieve', 'generate')
						.addEdge('generate', END)
						.compile();

					const graph = new StateGraph(ChatState)
						.addNode('classify', async (s) => {
							path = [...path, 'classify'];
							const raw = await classifyPrompt
								.pipe(classifier)
								.pipe(parser)
								.invoke({ question: s.question });
							const guess = raw.trim().toLowerCase().split(/\s+/)[0];
							const category: Category = guess === 'chitchat' ? 'chitchat' : 'rag';
							return { category };
						})
						.addNode('rag', async (s) => {
							path = [...path, 'rag'];
							const sub = await ragSubgraph.invoke({
								question: s.question,
								hits: [],
								answer: ''
							});
							return { answer: sub.answer };
						})
						.addNode('chitchat', async (s) => {
							path = [...path, 'chitchat'];
							const a = await chatPrompt
								.pipe(chatModel)
								.pipe(parser)
								.invoke({ question: s.question });
							return { answer: a };
						})
						.addEdge(START, 'classify')
						.addConditionalEdges('classify', (s) => s.category, {
							rag: 'rag',
							chitchat: 'chitchat'
						})
						.addEdge('rag', END)
						.addEdge('chitchat', END)
						.compile();

					const final = (await graph.invoke({
						question: userQuestion,
						category: 'rag',
						answer: ''
					})) as { question: string; category: Category; answer: string };
					path = [...path, '__end__'];
					return { ...final, path: [...path] };
				}
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
	eyebrow="Phase 2 · Lesson 07"
	motivation="Composability scales. A subgraph behaves exactly like a node, so the architecture you sketch on a napkin matches the architecture you ship."
	hero={{
		id: 'l2-subgraphs',
		alt: 'Nested architectural floor plans where one room zooms into its own complete plan'
	}}
>
	{#snippet intro()}
		<p>
			A compiled graph is a Runnable, so a graph can be a node inside another graph. This is
			how you compose specialized workflows — a RAG mini-graph, a code-review mini-graph, a
			research mini-graph — into a larger orchestrator without flattening everything into one
			giant diagram.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The graph is the API" variant="dropcap">
			<p>
				A subgraph isn't a special concept; it's the natural consequence of every compiled
				graph being a <Term t="Runnable" />. The very same object that powered the chat-tool
				loop in lesson 1 can drop into another graph as one of its nodes. Encapsulation,
				testing, and reuse stop being framework features and become emergent properties of
				the type signature.
			</p>
			<p>
				The win is architectural, not technical. You can sketch your system as a tree of
				graphs — outer orchestrator, retrieval subgraph, code-review subgraph, summary
				subgraph — and every box on the napkin maps to a real, compilable, testable unit.
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
				A subgraph is a contract: same input shape, same output shape, same Runnable
				protocol. That's all the runtime needs to nest them as deep as you like.
			</p>
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

		<Slide title="Demo · classify → (rag | chitchat)">
			<p>
				The outer graph classifies the question, then either calls a real RAG subgraph
				(retrieve → generate, both real model calls grounded in a tiny knowledge base) or
				replies with chit-chat. The subgraph is invoked exactly like any other node — the
				outer graph never has to know how RAG works inside.
			</p>
		</Slide>

		<Slide title="From here to harness" ornament>
			<p>
				That's Phase 2. Next chapter swaps "you wire the graph" for "the harness wires it,
				you declare policy" — and every subgraph technique here keeps working underneath.
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
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
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
		padding: 0.6rem 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		font-family: var(--font-prose);
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-ink-100);
	}
</style>
