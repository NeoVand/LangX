<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import LangGraphView from '$lib/components/LangGraphView.svelte';
	import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
	import { calculatorTool, weatherTool } from '$lib/runtime/tools';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		AIMessage,
		HumanMessage,
		SystemMessage,
		ToolMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
	import { onMount } from 'svelte';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;
	type LooseTool = { name: string; invoke: (args: unknown) => Promise<unknown> };

	const allTools = [weatherTool, calculatorTool] as unknown as LooseTool[];
	const toolByName = Object.fromEntries(allTools.map((t) => [t.name, t])) as Record<
		string,
		LooseTool
	>;

	interface SerializedMsg {
		role: 'human' | 'system' | 'ai' | 'tool';
		content: string;
		tool_call_id?: string;
		tool_calls?: { name: string; args: Record<string, unknown>; id?: string }[];
	}
	type AgentNode = 'agent' | 'tools' | 'end';
	type ScenarioPayload = {
		mode: 'weather' | 'multi';
		messages: SerializedMsg[];
		path: AgentNode[];
	};

	function serializeMsg(m: BaseMessage): SerializedMsg {
		if (m instanceof HumanMessage) return { role: 'human', content: String(m.content) };
		if (m instanceof SystemMessage) return { role: 'system', content: String(m.content) };
		if (m instanceof ToolMessage)
			return { role: 'tool', content: String(m.content), tool_call_id: m.tool_call_id };
		if (m instanceof AIMessage) {
			return {
				role: 'ai',
				content: String(m.content ?? ''),
				tool_calls: (m.tool_calls ?? []).map((tc) => ({
					name: tc.name,
					args: tc.args as Record<string, unknown>,
					id: tc.id
				}))
			};
		}
		return { role: 'ai', content: String(m.content) };
	}

	function deserializeMsg(s: SerializedMsg): BaseMessage {
		switch (s.role) {
			case 'human':
				return new HumanMessage(s.content);
			case 'system':
				return new SystemMessage(s.content);
			case 'tool':
				return new ToolMessage({
					tool_call_id: s.tool_call_id ?? '',
					content: s.content
				});
			case 'ai':
			default:
				return new AIMessage({
					content: s.content,
					tool_calls: s.tool_calls?.map((tc) => ({ ...tc })) ?? []
				});
		}
	}

	let mode = $state<'weather' | 'multi'>('multi');
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let active = $state<string | undefined>(undefined);
	let path = $state<string[]>([]);

	// Viz-only graph: same shape as createReactAgent compiles (agent ↔ tools loop).
	const vizGraph = new StateGraph(MessagesAnnotation)
		.addNode('agent', async () => ({ messages: [] }))
		.addNode('tools', async () => ({ messages: [] }))
		.addEdge(START, 'agent')
		.addConditionalEdges('agent', () => END, { tools: 'tools', [END]: END })
		.addEdge('tools', 'agent')
		.compile();

	function pushPath(node: AgentNode, log: AgentNode[]) {
		log.push(node);
		// Map our internal labels to the actual LangGraph node names so the
		// viz highlights light up correctly: 'end' → '__end__'.
		path = log.map((n) => (n === 'end' ? '__end__' : n));
		active = node === 'end' ? '__end__' : node;
	}

	async function runScenario() {
		running = true;
		messages = [];
		path = [];
		active = 'agent';
		const modeForRun = mode;
		try {
			const out = await withRunCache<ScenarioPayload>(
				{ demoId: `l1-agent-${modeForRun}` },
				async () => {
					const baseModel = await getModel({ temperature: 0, maxTokens: 320 });
					const model = baseModel.bindTools!(
						allTools as unknown as never[]
					) as unknown as BoundModel;

					const live: BaseMessage[] = [];
					const log: AgentNode[] = [];

					if (modeForRun === 'weather') {
						live.push(
							new HumanMessage("What's the weather like in San Francisco today?")
						);
					} else {
						live.push(
							new HumanMessage(
								"Compare today's weather in Tokyo and London, and tell me the temperature difference in °C."
							)
						);
					}
					messages = live.slice();

					let safety = 0;
					while (safety++ < 6) {
						pushPath('agent', log);
						await new Promise((res) => setTimeout(res, 200));
						const ai = (await model.invoke(live)) as AIMessage;
						live.push(ai);
						messages = live.slice();
						if (!ai.tool_calls?.length) {
							pushPath('end', log);
							break;
						}
						pushPath('tools', log);
						await new Promise((res) => setTimeout(res, 200));
						for (const tc of ai.tool_calls) {
							const t = toolByName[tc.name];
							if (!t) {
								live.push(
									new ToolMessage({
										tool_call_id: tc.id ?? '',
										content: `Error: unknown tool "${tc.name}"`
									})
								);
							} else {
								const result = await t.invoke(tc.args);
								live.push(
									new ToolMessage({
										tool_call_id: tc.id ?? '',
										content:
											typeof result === 'string' ? result : JSON.stringify(result)
									})
								);
							}
							messages = live.slice();
						}
					}

					return {
						mode: modeForRun,
						messages: live.map(serializeMsg),
						path: log
					};
				}
			);
			messages = out.messages.map(deserializeMsg);
			path = out.path;
			active = out.path[out.path.length - 1];
		} finally {
			running = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<ScenarioPayload>({
			demoId: `l1-agent-${mode}`
		});
		if (cached) {
			messages = cached.payload.messages.map(deserializeMsg);
			path = cached.payload.path;
			active = cached.payload.path[cached.payload.path.length - 1];
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
		<Panel title="Pick a scenario">
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
		</Panel>

		<Panel title="Graph (live)" subtitle="rendered from getGraphAsync().drawMermaid()">
			<LangGraphView
				graph={vizGraph}
				activeNode={active}
				path={path}
				caption="Native LangGraph diagram · agent ↔ tools loop"
			/>
		</Panel>

		<Panel title="Messages">
			<MessageStream messages={messages} compact />
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
</style>
