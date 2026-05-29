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
		title: 'create_agent (ReAct loop)',
		summary: 'The model ↔ tools loop that powers create_agent, with two scenarios.',
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
		.addNode('agent', async () => ({ messages: [] }))
		.addNode('tools', async () => ({ messages: [] }))
		.addEdge(START, 'agent')
		.addConditionalEdges('agent', () => END, { tools: 'tools', [END]: END })
		.addEdge('tools', 'agent')
		.compile();

	async function runScenario() {
		running = true;
		messages = [];
		path = [];
		steps = [];
		active = 'agent';
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

	const code = `import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o-mini' }),
  tools: [weatherTool, calculatorTool]
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Compare Tokyo and London weather.' }]
});`;
</script>

<Lesson
	title="create_agent"
	eyebrow="Phase 1 · Lesson 06"
	motivation="create_agent is the smallest real agent: a model, some tools, and a graph that loops until the model says it's done."
	hero={{
		id: 'l1-agent',
		alt: 'A mechanical homunculus deciding among a row of tools at a desk'
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			A standard tool-using agent is a tiny graph: <em>agent</em> → <em>tools</em> →
			<em>agent</em>
			→ … → <em>end</em>. LangChain v1 wraps this as <code>create_agent</code>; in JS the
			equivalent prebuilt is <code>createReactAgent</code> from LangGraph. This lesson is the
			bridge from Phase 1 into Phase 2.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A loop with a brain in it" variant="dropcap">
			<p>
				Every earlier lesson gave the model a single turn: prompt in, response out. Real
				assistants do not work that way. They look at what they have, take a small action,
				look again, and either continue or stop. The <Term t="ReAct" /> loop is the
				smallest control flow that makes that posture possible.
			</p>
			<p>
				What is striking is how little code it takes. A model, a list of tools, and a graph
				with two nodes — agent and tools — joined by a conditional edge. The prebuilt
				<code>create_agent</code> is exactly that loop, compiled and ready to run.
			</p>
		</Slide>

		<Slide title="The ReAct loop" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="Two lines and a list of tools — that's it." />
			<p>
				The agent calls the model, looks at the response. If there are tool calls, it
				executes them and appends the results as <code>ToolMessage</code>s. Then it calls
				the model again with the longer history. The model decides whether to keep going.
			</p>
		</Slide>

		<Slide title="It's already a graph">
			<p>
				Notice that the prebuilt agent comes from <code>@langchain/langgraph</code>. That
				is not an accident — every agent in LangChain v1 compiles to a LangGraph state
				machine. The next chapter is what lives underneath this prebuilt.
			</p>
		</Slide>

		<Diagram spec={reactLoop} />

		<Slide variant="pull-quote">
			<p>
				An agent is not a smarter model. It is the smallest loop that lets a model use the
				world between turns.
			</p>
		</Slide>

		<Slide title="Two scenarios">
			<p>
				Demo 1 (single tool, single hop): a basic weather lookup. Demo 2 (parallel tools,
				then a follow-up tool): the agent fans out to two weather lookups, then computes a
				temperature difference. The graph view on the right highlights the active node and
				the edges the model actually traverses.
			</p>
		</Slide>

		<Slide title="Why this is a milestone">
			<p>
				If you have made it here, you can wire a real, useful agent today. Everything above
				this line — chains, streaming, structured output, tools, RAG — is the toolbox.
				From here we start owning the control flow.
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
