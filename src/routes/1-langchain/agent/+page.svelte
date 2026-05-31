<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import DemoFrame from '$lib/components/DemoFrame.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { reactLoop } from '$lib/diagrams';
	import LangGraphView from '$lib/components/LangGraphView.svelte';
	import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { type BaseMessage } from '@langchain/core/messages';
	import {
		serializeMessages,
		deserializeMessages,
		type SerializedMessage
	} from '$lib/runtime/messages';
	import { runAgentScenario } from '$lib/demos/agent-react';
	import agentSrc from '$lib/demos/agent-react.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'agent',
		title: 'createAgent (real ReAct agent)',
		summary: 'A real createAgent loop, streamed node-by-node, with two scenarios.',
		entries: [{ path: 'lib/demos/agent-react.ts', code: agentSrc }],
		runner: `import { runAgentScenario } from './lib/demos/agent-react';

const log = (s: { label: string; detail?: string }) =>
	console.log('  ·', s.label, s.detail ? '— ' + s.detail : '');

const { messages, path } = await runAgentScenario(
	'multi',
	() => {},
	(p, active) => console.log('  → path:', p.join(' → '), '(active:', active + ')'),
	log
);
console.log('\\nNode path:', path.join(' → '));
console.log('Final:', messages.at(-1)?.content);
`
	};
	import type { DemoStep } from '$lib/demos/types';
	import { onMount } from 'svelte';

	type ScenarioPayload = {
		mode: 'weather' | 'multi';
		messages: SerializedMessage[];
		path: string[];
		steps: DemoStep[];
	};

	let mode = $state<'weather' | 'multi'>('multi');
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let active = $state<string | undefined>(undefined);
	let path = $state<string[]>([]);
	let steps = $state<DemoStep[]>([]);

	// Viz-only graph: same shape as createReactAgent compiles (agent ↔ tools loop).
	const vizGraph = new StateGraph(MessagesAnnotation)
		.addNode('model_request', async () => ({ messages: [] }))
		.addNode('tools', async () => ({ messages: [] }))
		.addEdge(START, 'model_request')
		.addConditionalEdges('model_request', () => END, { tools: 'tools', [END]: END })
		.addEdge('tools', 'model_request')
		.compile();

	async function runScenario() {
		running = true;
		messages = [];
		path = [];
		steps = [];
		active = 'model_request';
		const modeForRun = mode;
		try {
			const out = await withRunCache<ScenarioPayload>(
				{ demoId: `l1-agent-${modeForRun}` },
				async () => {
					const collected: DemoStep[] = [];
					const res = await runAgentScenario(
						modeForRun,
						(m) => (messages = m),
						(p, a) => {
							path = p;
							active = a;
						},
						(s) => {
							collected.push(s);
							steps = [...collected];
						}
					);
					return {
						mode: modeForRun,
						messages: serializeMessages(res.messages),
						path: res.path,
						steps: collected
					};
				}
			);
			messages = deserializeMessages(out.messages);
			path = out.path;
			active = path[path.length - 1];
			steps = out.steps;
		} finally {
			running = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<ScenarioPayload>({
			demoId: `l1-agent-${mode}`
		});
		if (cached) {
			messages = deserializeMessages(cached.payload.messages);
			path = cached.payload.path;
			active = path[path.length - 1];
			steps = cached.payload.steps ?? [];
		}
	});

	const code = `import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';

// v1's standard agent (Python: create_agent). It compiles a ReAct loop —
// the model_request node and the tools node — onto a LangGraph.
const agent = createAgent({
  model: new ChatOpenAI({ model: 'gpt-4o-mini' }),
  tools: [weatherTool, calculatorTool]
});

// Stream it: each chunk is one node firing, so you can watch the loop.
for await (const step of await agent.stream(
  { messages: [{ role: 'user', content: 'Compare Tokyo and London weather.' }] },
  { streamMode: 'updates' }
)) {
  console.log(Object.keys(step)); // ['model_request'] ... ['tools'] ... ['model_request']
}`;
</script>

<Lesson
	title="createAgent"
	eyebrow="Level 1 · Lesson 06"
	hero={{
		id: 'l1-agent',
		alt: 'A mechanical homunculus deciding among a row of tools at a desk'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="create_agent"><code>createAgent</code></Term> is the smallest real
		<Term t="Agent">agent</Term>: a <Term t="Model">model</Term>, some <Term t="tool">tools</Term>, and a
		<Term t="LangGraph">LangGraph</Term> that loops until the model stops calling tools.
	{/snippet}

	{#snippet intro()}
		<p>
			A standard tool-using <Term t="Agent">agent</Term> is a tiny graph:
			<em>agent</em> → <em>tools</em> → <em>agent</em> → … → <Term t="END">end</Term>.
			<Term t="LangChain" /> v1 wraps this as <Term t="create_agent"><code>createAgent</code></Term> (package
			<code>langchain</code>) — the same factory in Python (<code>create_agent</code>) and JS. The older
			<Term t="createReactAgent"><code>createReactAgent</code></Term> prebuilt from <Term t="LangGraph" /> still
			works but is deprecated in v1. This lesson is the bridge from Level 1 into Level 2.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A loop with a brain in it" variant="dropcap">
			<p>
				Every earlier lesson gave the <Term t="Model">model</Term> a single turn:
				<Term t="Prompt">prompt</Term> in, response out. Real assistants do not work that way. They look at
				what they have, take a small action, look again, and either continue or stop. The
				<Term t="ReAct" /> loop is the smallest control flow that makes that posture possible.
			</p>
			<p>
				What is striking is how little code it takes. A <Term t="Model">model</Term>, a list of
				<Term t="tool">tools</Term>, and a <Term t="StateGraph">StateGraph</Term> with two
				<Term t="Node">nodes</Term> — a model node and a <Term t="ToolNode">tools</Term> node — joined by a
				<Term t="Conditional edge">conditional edge</Term>.
				<Term t="create_agent"><code>createAgent</code></Term> packages exactly that loop, compiled and
				ready to <Term t="invoke">invoke</Term> or <Term t="stream">stream</Term>.
			</p>
		</Slide>

		<Slide title="The ReAct loop" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="A model and a list of tools — then stream the loop." />
			<p>
				The <Term t="Agent">agent</Term> <Term t="Node">node</Term> calls the <Term t="Model">model</Term>.
				If there are <Term t="tool_calls">tool_calls</Term>, the <Term t="ToolNode">tools</Term> node
				executes them and appends <Term t="ToolMessage"><code>ToolMessage</code></Term>s. Then the agent
				<Term t="invoke">invokes</Term> the model again with the longer <Term t="Message">message</Term>
				history. When the model finally answers with no tool call, the loop ends. The demo on the right
				runs <em>this</em> agent and streams it with <code>streamMode: 'updates'</code>, so each step you
				see — model call, parallel tool calls, final answer — is one real node firing.
			</p>
		</Slide>

		<Slide title="It's already a graph">
			<p>
				Notice that <code>createAgent</code> compiles down to <Term t="LangGraph">LangGraph</Term>.
				That is not an accident — every
				<Term t="Agent">agent</Term> in <Term t="LangChain" /> v1 compiles to a
				<Term t="LangGraph" /> <Term t="StateGraph">state machine</Term> with
				<Term t="MessagesAnnotation">MessagesAnnotation</Term>. The next chapter is what lives underneath
				<code>createAgent</code> — and how to build that graph yourself.
			</p>
		</Slide>

		<Diagram spec={reactLoop} />

		<Slide variant="pull-quote">
			<p>
				An <Term t="Agent">agent</Term> is not a smarter <Term t="LLM" />. It is the smallest loop that
				lets a <Term t="Model">model</Term> use the world between turns via
				<Term t="Tool calling">tool calling</Term>.
			</p>
		</Slide>

		<Slide title="Two scenarios">
			<p>
				Demo 1 (single <Term t="tool">tool</Term>, single hop): a basic weather lookup. Demo 2 (parallel
				<Term t="tool_calls">tool calls</Term>, then a follow-up): the <Term t="Agent">agent</Term> fans out to
				two weather lookups, then computes a temperature difference. The graph view uses
				<Term t="getGraphAsync">getGraphAsync</Term> and <Term t="drawMermaid">drawMermaid</Term> to highlight the
				active <Term t="Node">node</Term> and edges the model actually traverses.
			</p>
		</Slide>

		<Slide title="Why this is a milestone">
			<p>
				If you have made it here, you can wire a real, useful <Term t="Agent">agent</Term> today. Everything
				above this line — <Term t="Chain">chains</Term>, <Term t="stream">streaming</Term>,
				<Term t="Structured output">structured output</Term>, <Term t="tool">tools</Term>,
				<Term t="RAG" /> — is the toolbox. From here we start owning the
				<Term t="StateGraph">control flow</Term>.
			</p>
		</Slide>

		<Slide ornament>
			<p>Model · Tools · Loop. The rest is detail.</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<DemoFrame
			title="ReAct agent"
			subtitle="agent ↔ tools loop"
			code={agentSrc}
			codeCaption="src/lib/demos/agent-react.ts — exactly what runs"
			steps={steps}
		>
			{#snippet run()}
				<div class="modes">
					<label class:selected={mode === 'weather'}>
						<input type="radio" bind:group={mode} value="weather" />
						<span>Single tool</span>
						<small>One weather lookup, one final answer.</small>
					</label>
					<label class:selected={mode === 'multi'}>
						<input type="radio" bind:group={mode} value="multi" />
						<span>Parallel + follow-up</span>
						<small>Two weather calls, then a calculator call.</small>
					</label>
				</div>
				<RunButton onclick={runScenario} running={running} label="Run scenario" />
				<div class="stream">
					<MessageStream messages={messages} compact />
				</div>
			{/snippet}
		</DemoFrame>

		<Panel title="Graph (live)" subtitle="rendered from getGraphAsync().drawMermaid()">
			<LangGraphView
				graph={vizGraph}
				activeNode={active}
				path={path}
				caption="Native LangGraph diagram · agent ↔ tools loop"
			/>
		</Panel>
	{/snippet}
</Lesson>

<style>
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.modes label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		cursor: pointer;
		color: var(--color-ink-100);
	}
	.modes label.selected {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-weight: 500;
		font-size: 0.88rem;
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	.stream {
		margin-top: 0.85rem;
	}
</style>
