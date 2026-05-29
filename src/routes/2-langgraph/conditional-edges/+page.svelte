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
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		runRouterDemo,
		runMergeDemo,
		type Category,
		type RoutePayload,
		type MergePayload
	} from '$lib/demos/lg-conditional-edges';
	import lgConditionalSrc from '$lib/demos/lg-conditional-edges.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'conditional-edges',
		title: 'Conditional edges & reducers',
		summary:
			'Route with addConditionalEdges and merge concurrent writes with field reducers.',
		entries: [{ path: 'lib/demos/lg-conditional-edges.ts', code: lgConditionalSrc }],
		runner: `import { runRouterDemo, runMergeDemo } from './lib/demos/lg-conditional-edges';

console.log('=== LLM-routed triage ===');
const route = await runRouterDemo('How do I refund order #12345?', (p) =>
	console.log('  path:', p.join(' -> '))
);
console.log('category:', route.category);
console.log('answer:', route.answer, '\\n');

console.log('=== Concurrent writes + reducers ===');
const merged = await runMergeDemo();
console.log(merged);
`
	};

	let userQuery = $state('How do I refund order #12345?');
	let routeRun = $state(false);
	let routeResult = $state<RoutePayload | null>(null);
	let routePath = $state<string[]>([]);

	async function runRouter() {
		routeRun = true;
		routePath = [];
		routeResult = null;
		try {
			const out = await withRunCache<RoutePayload>(
				{ demoId: `l2-conditional-route` },
				async () => await runRouterDemo(userQuery, (p) => (routePath = p))
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
				async () => await runMergeDemo()
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
	hero={{
		id: 'l2-conditional-edges',
		alt: 'A railway switch viewed from above with two tracks merging into one'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		The agent's choices need a place to live. <Term t="Conditional edge">Conditional edges</Term> plus
		<Term t="Reducer">reducers</Term> turn "what next?" from a prompt-engineering trick into a routing
		decision your code can read.
	{/snippet}
	{#snippet intro()}
		<p>
			A <Term t="StateGraph" /> is a router and a merge strategy in one.
			<Term t="Conditional edge">Conditional edges</Term> decide where execution goes;
			<Term t="Reducer" /> functions decide how concurrent updates combine when
			<Term t="Node">nodes</Term> write to the same field.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Routing is a design surface" variant="dropcap">
			<p>
				Without <Term t="Conditional edge">conditional edges</Term>, every "if/else" inside an
				<Term t="Agent">agent</Term> collapses into a prompt instruction the model may or may not
				follow. With them, your routing logic becomes a piece of code your colleagues can read,
				your tests can hit, and your monitoring can count. The model's job becomes
				<em>producing the signal</em>; the graph decides what to do with it.
			</p>
			<p>
				<Term t="Reducer">Reducers</Term> play the same trick on writes. When two
				<Term t="Node">nodes</Term> can update the same field, you stop hoping
				<Term t="Last-write-wins">last-write-wins</Term> is the right semantics and you spell out
				exactly how updates combine. The <Term t="State schema">state schema</Term> becomes a
				contract instead of a guess.
			</p>
		</Slide>

		<Slide title="Conditional edges" variant="code-first">
			<p>
				<Term t="addConditionalEdges"><code>addConditionalEdges('source', router, mapping)</code></Term>
				calls the <Term t="Router">router</Term> with the current <Term t="State" /> and uses the
				returned key to look up the next <Term t="Node" />. You can return any string, an array of
				strings (run multiple branches), or an array of <Term t="Send"><code>Send</code></Term>
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
				When two <Term t="Node">nodes</Term> run in parallel and both write to
				<code>messages</code>, who wins? With default
				<Term t="Last-write-wins">last-write-wins</Term> semantics, you'd silently lose data.
				<Term t="Reducer">Reducers</Term> tell the runtime how to merge writes — concatenate, sum,
				dedupe, whatever your domain wants.
			</p>
			<CodeBlock code={codeMerge} caption="Three reducer styles in one schema." />
			<p>
				The most common reducer is <code>messages</code> with the built-in
				<Term t="add_messages"><code>add_messages</code></Term> reducer (you used it implicitly via
				<Term t="MessagesAnnotation"><code>MessagesAnnotation</code></Term> in lesson 01).
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
				<Term t="Conditional edge">Conditional edges</Term> are the runtime surface for every
				router-style agent (triage, multi-tool selection, escalation).
				<Term t="Reducer">Reducers</Term> are the substrate every concurrent-writer pattern in
				this chapter rests on — including <Term t="Fan-out">fan-out</Term> and
				<Term t="Map-reduce">map-reduce</Term> in later lessons.
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
		width: 100%;
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
		font-family: var(--font-prose);
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-ink-100);
	}
</style>
