<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { conditionalEdges } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import LangGraphView from '$lib/components/LangGraphView.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { onMount } from 'svelte';

	type Category = 'billing' | 'tech' | 'general';

	interface RoutePayload {
		query: string;
		category: Category;
		answer: string;
	}

	interface MergePayload {
		notes: string[];
		score: number;
		lastWriter: string;
	}

	let userQuery = $state('How do I refund order #12345?');
	let routeRun = $state(false);
	let routeResult = $state<RoutePayload | null>(null);
	let routePath = $state<string[]>([]);

	function isCategory(s: string): s is Category {
		return s === 'billing' || s === 'tech' || s === 'general';
	}

	async function runRouter() {
		routeRun = true;
		routePath = [];
		routeResult = null;
		try {
			const model = await getModel({ temperature: 0, maxTokens: 60 });
			const replyModel = await getModel({ temperature: 0.2, maxTokens: 220 });

			const State = Annotation.Root({
				query: Annotation<string>(),
				category: Annotation<Category>(),
				answer: Annotation<string>()
			});

			const classifyPrompt = ChatPromptTemplate.fromMessages([
				[
					'system',
					'Classify a customer message into exactly one of: billing, tech, general. Respond with only the lowercase label.'
				],
				['human', '{query}']
			]);
			const replyPromptFor = (kind: Category) =>
				ChatPromptTemplate.fromMessages([
					[
						'system',
						`You are a ${kind} support agent. Reply concisely (≤ 50 words). Be helpful and warm; no greetings.`
					],
					['human', '{query}']
				]);
			const parser = new StringOutputParser();

			const out = await withRunCache<RoutePayload>(
				{ demoId: `l2-conditional-route` },
				async () => {
					const graph = new StateGraph(State)
						.addNode('classify', async (s) => {
							routePath = [...routePath, 'classify'];
							const raw = await classifyPrompt
								.pipe(model)
								.pipe(parser)
								.invoke({ query: s.query });
							const guess = raw.trim().toLowerCase().split(/\s+/)[0];
							const category = isCategory(guess) ? guess : 'general';
							return { category };
						})
						.addNode('billing', async (s) => {
							routePath = [...routePath, 'billing'];
							const a = await replyPromptFor('billing')
								.pipe(replyModel)
								.pipe(parser)
								.invoke({ query: s.query });
							return { answer: `[Billing] ${a}` };
						})
						.addNode('tech', async (s) => {
							routePath = [...routePath, 'tech'];
							const a = await replyPromptFor('tech')
								.pipe(replyModel)
								.pipe(parser)
								.invoke({ query: s.query });
							return { answer: `[Tech] ${a}` };
						})
						.addNode('general', async (s) => {
							routePath = [...routePath, 'general'];
							const a = await replyPromptFor('general')
								.pipe(replyModel)
								.pipe(parser)
								.invoke({ query: s.query });
							return { answer: `[General] ${a}` };
						})
						.addEdge(START, 'classify')
						.addConditionalEdges('classify', (s) => s.category, {
							billing: 'billing',
							tech: 'tech',
							general: 'general'
						})
						.addEdge('billing', END)
						.addEdge('tech', END)
						.addEdge('general', END)
						.compile();

					const final = (await graph.invoke({
						query: userQuery,
						category: 'general',
						answer: ''
					})) as RoutePayload;
					routePath = [...routePath, '__end__'];
					return final;
				}
			);
			routeResult = out;
		} finally {
			routeRun = false;
		}
	}

	let mergeRun = $state(false);
	let mergeResult = $state<MergePayload | null>(null);

	async function runMerge() {
		mergeRun = true;
		mergeResult = null;
		try {
			const out = await withRunCache<MergePayload>(
				{ demoId: 'l2-conditional-merge' },
				async () => {
					const State = Annotation.Root({
						notes: Annotation<string[]>({
							reducer: (a, b) => [...a, ...b],
							default: () => []
						}),
						score: Annotation<number>({
							reducer: (a, b) => a + b,
							default: () => 0
						}),
						// research and draft both write this in the same superstep, so it
						// needs a reducer; "last writer wins" keeps the parallel fan-in legal.
						lastWriter: Annotation<string>({
							reducer: (a, b) => b ?? a,
							default: () => ''
						})
					});

					const research = () => ({
						notes: ['research: found 3 sources'],
						score: 1,
						lastWriter: 'research'
					});
					const draft = () => ({
						notes: ['draft: 250 words'],
						score: 2,
						lastWriter: 'draft'
					});
					const review = () => ({
						notes: ['review: 4 nits found'],
						score: -1,
						lastWriter: 'review'
					});

					const graph = new StateGraph(State)
						.addNode('research', research)
						.addNode('draft', draft)
						.addNode('review', review)
						.addEdge(START, 'research')
						.addEdge(START, 'draft')
						.addEdge('research', 'review')
						.addEdge('draft', 'review')
						.addEdge('review', END)
						.compile();
					return (await graph.invoke({})) as MergePayload;
				}
			);
			mergeResult = out;
		} finally {
			mergeRun = false;
		}
	}

	onMount(async () => {
		const cachedRoute = await loadCachedRun<RoutePayload>({ demoId: 'l2-conditional-route' });
		if (cachedRoute) {
			routeResult = cachedRoute.payload;
			routePath = ['classify', cachedRoute.payload.category, 'end'];
		}
		const cachedMerge = await loadCachedRun<MergePayload>({ demoId: 'l2-conditional-merge' });
		if (cachedMerge) mergeResult = cachedMerge.payload;
		// Map cached path 'end' → real LangGraph node id '__end__'.
		if (routePath.includes('end')) routePath = routePath.map((p) => (p === 'end' ? '__end__' : p));
	});

	// Viz-only graph for the router. Same nodes / same edges, no model calls.
	const RouteVizState = Annotation.Root({
		query: Annotation<string>(),
		category: Annotation<Category>(),
		answer: Annotation<string>()
	});
	const routeVizGraph = new StateGraph(RouteVizState)
		.addNode('classify', async () => ({}))
		.addNode('billing', async () => ({}))
		.addNode('tech', async () => ({}))
		.addNode('general', async () => ({}))
		.addEdge(START, 'classify')
		.addConditionalEdges('classify', () => 'general', {
			billing: 'billing',
			tech: 'tech',
			general: 'general'
		})
		.addEdge('billing', END)
		.addEdge('tech', END)
		.addEdge('general', END)
		.compile();

	const codeRoute = `const State = Annotation.Root({
  query: Annotation<string>(),
  category: Annotation<'billing' | 'tech' | 'general'>(),
  answer: Annotation<string>()
});

const graph = new StateGraph(State)
  .addNode('classify', classifyWithLLM)        // returns { category }
  .addNode('billing',  billingReply)
  .addNode('tech',     techReply)
  .addNode('general',  generalReply)
  .addEdge(START, 'classify')
  // Router returns a key into the third arg's lookup table.
  .addConditionalEdges('classify', (s) => s.category, {
    billing: 'billing',
    tech: 'tech',
    general: 'general'
  })
  .addEdge('billing', END)
  .addEdge('tech', END)
  .addEdge('general', END)
  .compile();`;

	const codeMerge = `const State = Annotation.Root({
  notes: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],   // concat — accumulate across nodes
    default: () => []
  }),
  score: Annotation<number>({
    reducer: (a, b) => a + b,          // sum — combine numeric updates
    default: () => 0
  }),
  lastWriter: Annotation<string>()      // default = last-write-wins
});`;
</script>

<Lesson
	title="Conditional edges & reducers"
	eyebrow="Phase 2 · Lesson 02"
	motivation="The agent's choices need a place to live. Conditional edges plus reducers turn 'what next?' from a prompt-engineering trick into a routing decision your code can read."
	hero={{
		id: 'l2-conditional-edges',
		alt: 'A railway switch viewed from above with two tracks merging into one'
	}}
>
	{#snippet intro()}
		<p>
			A graph is a router and a merge strategy in one. Conditional edges decide where execution
			goes; <Term t="Reducer" /> functions decide how concurrent updates combine when nodes
			write to the same field.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Routing is a design surface" variant="dropcap">
			<p>
				Without conditional edges, every "if/else" inside an agent collapses into a prompt
				instruction the model may or may not follow. With them, your routing logic becomes a
				piece of code your colleagues can read, your tests can hit, and your monitoring can
				count. The model's job becomes <em>producing the signal</em>; the graph decides what
				to do with it.
			</p>
			<p>
				Reducers play the same trick on writes. When two nodes can update the same field, you
				stop hoping last-write-wins is the right semantics and you spell out exactly how
				updates combine. The state schema becomes a contract instead of a guess.
			</p>
		</Slide>

		<Slide title="Conditional edges" variant="code-first">
			<p>
				<code>addConditionalEdges('source', router, mapping)</code> calls the router with
				the current state and uses the returned key to look up the next node. You can return
				any string, an array of strings (run multiple branches), or an array of <code>Send</code>
				objects (covered in lesson 06).
			</p>
			<CodeBlock code={codeRoute} caption="A real-LLM support-ticket triage graph." />
		</Slide>

		<Diagram spec={conditionalEdges} />

		<Slide variant="pull-quote">
			<p>
				The model produces signal. The graph produces structure. Conditional edges are where
				the two meet, and where most production agent bugs are caught.
			</p>
		</Slide>

		<Slide title="Why reducers exist" variant="code-first">
			<p>
				When two nodes run in parallel and both write to <code>messages</code>, who wins? With
				default last-write-wins semantics, you'd silently lose data. Reducers tell the runtime
				how to merge writes — concatenate, sum, dedupe, whatever your domain wants.
			</p>
			<CodeBlock code={codeMerge} caption="Three reducer styles in one schema." />
			<p>
				The most common reducer is <code>messages</code> with the built-in
				<code>add_messages</code> reducer (you used it implicitly via
				<code>MessagesAnnotation</code> in lesson 01).
			</p>
		</Slide>

		<Slide title="Run them">
			<p>
				Demo 1 routes a real customer message through a real LLM classifier. Demo 2 fans
				research and draft into review; both append to <code>notes</code> and both update
				<code>score</code> via a sum reducer. The order of research vs. draft entries depends
				on which finished first — that's the merge in action.
			</p>
		</Slide>

		<Slide title="What this unlocks" ornament>
			<p>
				Conditional edges are the runtime surface for every router-style agent (triage,
				multi-tool selection, escalation). Reducers are the substrate every "concurrent
				writers" pattern in this chapter rests on.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · LLM-routed triage" subtitle="addConditionalEdges + real classifier">
			<label class="row">
				<span>Customer message</span>
				<input type="text" bind:value={userQuery} />
			</label>
			<RunButton onclick={runRouter} running={routeRun} />
			{#if routeResult}
				<div class="route">
					<div class="lbl">category</div>
					<code class="cat">{routeResult.category}</code>
					<div class="lbl">answer</div>
					<p class="answer">{routeResult.answer}</p>
				</div>
			{/if}
		</Panel>

		<Panel title="Live graph (Demo 1)" subtitle="rendered from getGraphAsync().drawMermaid()">
			<LangGraphView
				graph={routeVizGraph}
				path={routePath}
				activeNode={routePath[routePath.length - 1]}
				caption="Native LangGraph diagram · classify → billing/tech/general → end"
			/>
		</Panel>

		<Panel title="Demo 2 · Concurrent writes + reducers" subtitle="Three reducer styles">
			<RunButton onclick={runMerge} running={mergeRun} />
			{#if mergeResult}
				<StateInspector state={mergeResult} title="Merged state" />
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	input {
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
	}

	.route {
		margin-top: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lbl {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	.cat {
		font-family: var(--font-mono);
		color: var(--accent-ink);
		font-size: 0.85rem;
	}
	.answer {
		margin: 0;
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
