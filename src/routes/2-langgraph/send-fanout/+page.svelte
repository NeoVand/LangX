<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph/web';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { onMount } from 'svelte';

	const State = Annotation.Root({
		topic: Annotation<string>(),
		subQuestions: Annotation<string[]>({
			reducer: (a, b) => [...a, ...b],
			default: () => []
		}),
		answers: Annotation<{ q: string; a: string }[]>({
			reducer: (a, b) => [...a, ...b],
			default: () => []
		}),
		report: Annotation<string>()
	});

	interface FanoutPayload {
		topic: string;
		subQuestions: string[];
		answers: { q: string; a: string }[];
		report: string;
		stages: string[];
	}

	let topic = $state('the LangGraph runtime');
	let busy = $state(false);
	let result = $state<FanoutPayload | null>(null);
	let stages = $state<string[]>([]);

	async function run() {
		busy = true;
		result = null;
		stages = [];
		try {
			const out = await withRunCache<FanoutPayload>(
				{ demoId: `l2-send-fanout-${topic.slice(0, 32)}` },
				async () => {
					const planModel = await getModel({ temperature: 0.3, maxTokens: 280 });
					const researchModel = await getModel({ temperature: 0.4, maxTokens: 220 });
					const synthModel = await getModel({ temperature: 0.3, maxTokens: 380 });
					const parser = new StringOutputParser();

					const planPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'You decompose a topic into exactly 5 distinct sub-questions a researcher can answer independently. Return ONLY 5 lines, each one a single question, no numbering.'
						],
						['human', 'Topic: {topic}']
					]);
					const researchPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'You are a careful researcher. Answer the question in 1–2 short sentences (≤ 45 words). No preamble.'
						],
						['human', '{question}']
					]);
					const synthPrompt = ChatPromptTemplate.fromMessages([
						[
							'system',
							'You synthesize a brief from research notes. Return Markdown with a "# Topic" heading, then bold each question as a sub-section followed by the answer. Be concise.'
						],
						[
							'human',
							'Topic: {topic}\n\nNotes:\n{notes}'
						]
					]);

					const graph = new StateGraph(State)
						.addNode('plan', async (s) => {
							stages = [...stages, 'plan'];
							const text = await planPrompt
								.pipe(planModel)
								.pipe(parser)
								.invoke({ topic: s.topic });
							const subQuestions = text
								.split('\n')
								.map((line) => line.replace(/^[-•\d.\s]+/, '').trim())
								.filter((line) => line.length > 0)
								.slice(0, 5);
							return { subQuestions };
						})
						.addNode('research', async (s: { question: string }) => {
							stages = [...stages, `research:${s.question.slice(0, 24)}…`];
							const a = await researchPrompt
								.pipe(researchModel)
								.pipe(parser)
								.invoke({ question: s.question });
							return { answers: [{ q: s.question, a: a.trim() }] };
						})
						.addNode('synthesize', async (s) => {
							stages = [...stages, 'synthesize'];
							const notes = s.answers
								.map((p) => `Q: ${p.q}\nA: ${p.a}`)
								.join('\n\n');
							const md = await synthPrompt
								.pipe(synthModel)
								.pipe(parser)
								.invoke({ topic: s.topic, notes });
							return { report: md };
						})
						.addEdge(START, 'plan')
						.addConditionalEdges(
							'plan',
							(s) => s.subQuestions.map((q) => new Send('research', { question: q })),
							['research']
						)
						.addEdge('research', 'synthesize')
						.addEdge('synthesize', END)
						.compile();

					const final = (await graph.invoke({
						topic,
						subQuestions: [],
						answers: [],
						report: ''
					})) as FanoutPayload;

					return { ...final, stages: [...stages] };
				}
			);
			result = out;
			stages = out.stages;
		} finally {
			busy = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<FanoutPayload>({
			demoId: `l2-send-fanout-${topic.slice(0, 32)}`
		});
		if (cached) {
			result = cached.payload;
			stages = cached.payload.stages ?? [];
		}
	});

	const code = `import { Send } from '@langchain/langgraph';

// Conditional edge returns multiple Send objects:
.addConditionalEdges(
  'plan',
  (s) => s.subQuestions.map((q) => new Send('research', { question: q })),
  ['research']
)

// Each Send spawns 'research' with a *different* state payload.
// Their outputs merge back via the schema's reducer next superstep.`;
</script>

<Lesson
	title="Send & fan-out"
	eyebrow="Phase 2 · Lesson 06"
	motivation="Map-reduce inside a graph. The Send primitive is how you make one node spawn many parallel computations and gather their answers back."
	hero={{
		id: 'l2-send-fanout',
		alt: "A postmaster's desk fans out envelopes to several waiting messengers"
	}}
>
	{#snippet intro()}
		<p>
			A conditional edge can return one node name, an array of node names, or an array of
			<Term t="Send" /> objects. The last one is map-reduce inside a graph: every
			<code>Send</code> spawns a parallel branch with its own state payload, and the runtime
			merges results back via your reducers next superstep.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Map-reduce, declared" variant="dropcap">
			<p>
				Most "agent does N things in parallel" code ends up as a hand-rolled
				<code>Promise.all</code> with a fragile join. The Send primitive turns that pattern
				into a property of the graph: <em>here is one input, here are N parallel branches,
				here's the reducer that combines their writes.</em> The runtime owns concurrency,
				cancellation, retries, and merge order; you own the shape.
			</p>
			<p>
				The killer feature: each branch sees only the slice of state it needs. You don't have
				to thread the whole conversation through. Branches stay small, the reducer keeps the
				big picture, and the synthesis node gets a clean list to work from.
			</p>
		</Slide>

		<Slide title="The shape" variant="code-first">
			<CodeBlock code={code} caption="One plan, N research branches, one synthesis." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A Send is a thought experiment with a return path. You declare the parallelism, the
				runtime does the join, and your reducers decide what "merge" means.
			</p>
		</Slide>

		<Slide title="Why this is a big deal">
			<p>
				Each branch sees only its own state slice — it doesn't have to thread the entire
				conversation through. Their outputs flow back into a shared list (or any reducer-
				combined field) so the next node can synthesize them. Classic map-reduce, but driven
				by an LLM and observable as a graph.
			</p>
		</Slide>

		<Slide title="Demo · 5-way research">
			<p>
				The <em>plan</em> node asks a real LLM to break a topic into 5 sub-questions. The
				conditional edge returns 5 <code>Send</code> objects, each carrying one question.
				Five parallel <em>research</em> branches run; each appends to <code>answers</code>.
				The <em>synthesize</em> node reads the merged list and asks the model for a final
				Markdown brief.
			</p>
		</Slide>

		<Slide title="Where you'll reach for this" ornament>
			<p>
				Multi-source research, fan-out evaluation, batched code review, parallel translation,
				reflective self-critique. Anywhere the loop is: split work → answer in parallel →
				stitch back together.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Topic">
			<input type="text" bind:value={topic} />
			<div class="row">
				<RunButton onclick={run} running={busy} label="Plan and fan-out" />
			</div>
		</Panel>

		<Panel
			title="Stages observed"
			subtitle="Order is non-deterministic for the parallel branches"
		>
			{#if stages.length}
				<ul class="stages">
					{#each stages as s, i (i)}
						<li><code>{i + 1}.</code> {s}</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">Run the demo to see the staged execution.</p>
			{/if}
		</Panel>

		{#if result}
			<Panel title="Sub-questions">
				<ol class="qlist">
					{#each result.subQuestions as q, i (i)}
						<li>{q}</li>
					{/each}
				</ol>
			</Panel>

			<Panel title="Synthesized brief">
				<pre class="report scrollbar-slim">{result.report}</pre>
			</Panel>
		{/if}
	{/snippet}

	{#snippet inspect()}
		{#if result}
			<Panel title="Inspect · merged state">
				<StateInspector
					state={{
						topic: result.topic,
						subQuestions: result.subQuestions,
						answers: result.answers
					}}
					compact
				/>
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
	.stages {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-ink-200);
	}
	.stages code {
		color: var(--color-ink-300);
		margin-right: 0.4rem;
	}
	.empty {
		font-size: 0.82rem;
		color: var(--color-ink-300);
		font-style: italic;
		margin: 0;
	}
	.qlist {
		margin: 0;
		padding-left: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: var(--color-ink-100);
		font-family: var(--font-prose);
		font-size: 0.95rem;
	}
	.report {
		font-family: var(--font-prose);
		font-size: 0.92rem;
		line-height: 1.6;
		padding: 0.7rem 0.85rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		color: var(--color-ink-100);
		max-height: 22rem;
		overflow-y: auto;
		white-space: pre-wrap;
	}
</style>
