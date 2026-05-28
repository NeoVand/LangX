<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';

	let userQuery = $state('How do I refund order #12345?');
	let routeRun = $state(false);
	let routeResult = $state<unknown>(null);
	let routePath = $state<string[]>([]);

	async function runRouter() {
		routeRun = true;
		routePath = [];
		routeResult = null;
		try {
			const State = Annotation.Root({
				query: Annotation<string>(),
				category: Annotation<string>(),
				answer: Annotation<string>()
			});

			const classify = (s: typeof State.State) => {
				const q = s.query.toLowerCase();
				if (/refund|charge|payment|invoice/.test(q)) return { category: 'billing' };
				if (/error|broken|crash|bug/.test(q)) return { category: 'tech' };
				return { category: 'general' };
			};

			const billing = (s: typeof State.State) => ({
				answer: `[Billing] We can issue a refund for "${s.query}". Allow 3–5 business days.`
			});
			const tech = (s: typeof State.State) => ({
				answer: `[Tech] Sorry to hear "${s.query}". Try clearing your cache and reloading.`
			});
			const general = (s: typeof State.State) => ({
				answer: `[General] Thanks for reaching out about "${s.query}". A teammate will reply soon.`
			});

			const graph = new StateGraph(State)
				.addNode('classify', async (s) => {
					routePath = [...routePath, 'classify'];
					await new Promise((r) => setTimeout(r, 200));
					return classify(s);
				})
				.addNode('billing', async (s) => {
					routePath = [...routePath, 'billing'];
					await new Promise((r) => setTimeout(r, 200));
					return billing(s);
				})
				.addNode('tech', async (s) => {
					routePath = [...routePath, 'tech'];
					await new Promise((r) => setTimeout(r, 200));
					return tech(s);
				})
				.addNode('general', async (s) => {
					routePath = [...routePath, 'general'];
					await new Promise((r) => setTimeout(r, 200));
					return general(s);
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

			routeResult = await graph.invoke({ query: userQuery, category: '', answer: '' });
			routePath = [...routePath, 'end'];
		} finally {
			routeRun = false;
		}
	}

	let mergeRun = $state(false);
	let mergeResult = $state<unknown>(null);

	async function runMerge() {
		mergeRun = true;
		mergeResult = null;
		try {
			const State = Annotation.Root({
				notes: Annotation<string[]>({
					reducer: (a, b) => [...a, ...b],
					default: () => []
				}),
				score: Annotation<number>({
					reducer: (a, b) => a + b,
					default: () => 0
				}),
				lastWriter: Annotation<string>()
			});

			const research = () => ({ notes: ['research: found 3 sources'], score: 1, lastWriter: 'research' });
			const draft = () => ({ notes: ['draft: 250 words'], score: 2, lastWriter: 'draft' });
			const review = () => ({ notes: ['review: 4 nits found'], score: -1, lastWriter: 'review' });

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
			mergeResult = await graph.invoke({});
		} finally {
			mergeRun = false;
		}
	}

	const codeRoute = `const State = Annotation.Root({
  query: Annotation<string>(),
  category: Annotation<string>(),
  answer: Annotation<string>()
});

const graph = new StateGraph(State)
  .addNode('classify', classifyFn)
  .addNode('billing',  billingFn)
  .addNode('tech',     techFn)
  .addNode('general',  generalFn)
  .addEdge(START, 'classify')
  // The router returns a key into the third arg's lookup table.
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
    reducer: (a, b) => [...a, ...b],   // concat — accumulates across nodes
    default: () => []
  }),
  score: Annotation<number>({
    reducer: (a, b) => a + b,          // sum
    default: () => 0
  }),
  lastWriter: Annotation<string>()      // default = last-write-wins
});`;
</script>

<Lesson title="Conditional edges & reducers" eyebrow="Phase 2 · Lesson 02">
	{#snippet intro()}
		<p>
			A graph is a router and a merge strategy in one. Conditional edges decide where execution
			goes; <Term t="Reducer" /> functions decide how concurrent updates combine when nodes
			write to the same field.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Conditional edges">
			<p>
				<code>addConditionalEdges('source', router, mapping)</code> calls the router with the
				current state and uses the returned key to look up the next node. You can return any
				string, an array of strings (run multiple branches), or an array of <code>Send</code>{' '}
				objects (covered in a later lesson).
			</p>
			<CodeBlock code={codeRoute} caption="A simple support-ticket triage graph." />
		</Slide>

		<Slide title="Why reducers exist">
			<p>
				When two nodes run in parallel and both write to <code>messages</code>, who wins? With
				default last-write-wins semantics, you'd silently lose data. Reducers tell the runtime
				how to merge the two writes — concatenate, sum, dedupe, whatever your domain wants.
			</p>
			<CodeBlock code={codeMerge} caption="Three reducer styles in one schema." />
			<p>
				The most common one is <code>messages</code> with the built-in
				<code>add_messages</code> reducer (we used it implicitly in the last lesson via{' '}
				<code>MessagesAnnotation</code>).
			</p>
		</Slide>

		<Slide title="Run them">
			<p>
				Demo 1 routes a single query through one of three specialist nodes. Demo 2 fans out to
				research and draft in parallel; both append to the same <code>notes</code> list and
				both update <code>score</code> via a sum reducer. Watch the final state on the right —
				the order of research vs. draft entries depends on which finished first.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Conditional routing" subtitle="addConditionalEdges">
			<label class="row">
				<span>Customer message</span>
				<input type="text" bind:value={userQuery} />
			</label>
			<RunButton onclick={runRouter} running={routeRun} />
			{#if routeResult}
				<StateInspector state={routeResult} title="Final state" compact />
			{/if}
		</Panel>

		<Panel title="Live graph (Demo 1)">
			<GraphView
				nodes={[
					{ id: 'start', label: '·', x: 50, y: 40, kind: 'start' },
					{ id: 'classify', label: 'classify', x: 50, y: 100 },
					{ id: 'billing', label: 'billing', x: 180, y: 60 },
					{ id: 'tech', label: 'tech', x: 180, y: 130 },
					{ id: 'general', label: 'general', x: 180, y: 200 },
					{ id: 'end', label: '·', x: 320, y: 130, kind: 'end' }
				]}
				edges={[
					{ from: 'start', to: 'classify' },
					{ from: 'classify', to: 'billing', conditional: true, label: 'billing' },
					{ from: 'classify', to: 'tech', conditional: true, label: 'tech' },
					{ from: 'classify', to: 'general', conditional: true, label: 'general' },
					{ from: 'billing', to: 'end' },
					{ from: 'tech', to: 'end' },
					{ from: 'general', to: 'end' }
				]}
				path={routePath}
				width={420}
				height={260}
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
		color: var(--color-fg-faint);
	}
	input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
</style>
