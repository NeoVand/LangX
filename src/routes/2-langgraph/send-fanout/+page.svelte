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
		Send,
		START,
		END
	} from '@langchain/langgraph/web';

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

	let topic = $state('the LangGraph runtime');
	let busy = $state(false);
	let result = $state<unknown>(null);
	let stages = $state<string[]>([]);

	async function run() {
		busy = true;
		result = null;
		stages = [];
		try {
			const graph = new StateGraph(State)
				.addNode('plan', async (s) => {
					stages = [...stages, 'plan'];
					await new Promise((r) => setTimeout(r, 250));
					return {
						subQuestions: [
							`What problem does ${s.topic} solve?`,
							`What is the core abstraction in ${s.topic}?`,
							`How does ${s.topic} handle failures?`,
							`When should you NOT use ${s.topic}?`,
							`What is one small example of ${s.topic}?`
						]
					};
				})
				.addNode('research', async (s: { question: string }) => {
					stages = [...stages, `research:${s.question.slice(0, 18)}…`];
					await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
					return {
						answers: [
							{
								q: s.question,
								a: `Stub answer about "${s.question}" produced by a researcher subagent.`
							}
						]
					};
				})
				.addNode('synthesize', async (s) => {
					stages = [...stages, 'synthesize'];
					await new Promise((r) => setTimeout(r, 250));
					return {
						report:
							`# ${s.topic}\n\n` +
							s.answers.map((p) => `**${p.q}**\n${p.a}`).join('\n\n')
					};
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

			result = await graph.invoke({
				topic,
				subQuestions: [],
				answers: [],
				report: ''
			});
		} finally {
			busy = false;
		}
	}

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

<Lesson title="Send & fan-out" eyebrow="Phase 2 · Lesson 06">
	{#snippet intro()}
		<p>
			A conditional edge can return one node name, an array of node names, or an array of{' '}
			<code>Send</code> objects. The last one is map-reduce inside a graph: every <code>Send</code>
			spawns a parallel branch with its own state payload, and the runtime merges the results
			back via your reducers next superstep.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The shape">
			<CodeBlock code={code} caption="One plan, N research branches, one synthesis." />
		</Slide>

		<Slide title="Why this is a big deal">
			<p>
				Each branch sees only its own state slice — it doesn't have to thread the entire
				conversation through. Their outputs flow back into a shared list (or any reducer-
				combined field) so the next node can synthesize them. Classic map-reduce, but driven
				by an LLM.
			</p>
		</Slide>

		<Slide title="Demo · 5-way research">
			<p>
				The <em>plan</em> node breaks a topic into 5 sub-questions. The conditional edge
				returns 5 <code>Send</code> objects, each carrying one question. Five parallel{' '}
				<em>research</em> branches run; each appends to <code>answers</code>. The
				<em>synthesize</em> node reads the merged list and writes a final report.
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

		<Panel title="Stages observed" subtitle="Order is non-deterministic for the parallel branches">
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
	.stages {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.stages code {
		color: var(--color-fg-faint);
		margin-right: 0.4rem;
	}
	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
		margin: 0;
	}
</style>
