<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import { calculatorTool, weatherTool } from '$lib/runtime/tools';
	import { MockChatModel } from '$lib/runtime/llm/mock';
	import {
		AIMessage,
		HumanMessage,
		ToolMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;
	type LooseTool = { name: string; invoke: (args: unknown) => Promise<unknown> };

	const allTools = [weatherTool, calculatorTool] as unknown as LooseTool[];
	const toolByName = Object.fromEntries(allTools.map((t) => [t.name, t])) as Record<string, LooseTool>;

	let mode = $state<'weather' | 'multi'>('multi');
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let active = $state<'agent' | 'tools' | 'end' | undefined>(undefined);
	let path = $state<string[]>([]);

	function pushPath(node: 'agent' | 'tools' | 'end') {
		path = [...path, node];
		active = node;
	}

	async function runScenario() {
		running = true;
		messages = [];
		path = [];
		active = 'agent';
		try {
			let model: BoundModel;
			if (mode === 'weather') {
				const m = new MockChatModel({
					responder: (_msgs, turn) => {
						if (turn === 0)
							return {
								content: '',
								toolCalls: [
									{ name: 'get_weather', args: { city: 'San Francisco' }, id: 'c1' }
								]
							};
						return {
							content:
								'San Francisco is foggy at 16°C — pack a jacket.'
						};
					}
				});
				model = m.bindTools(allTools as unknown as never[]) as unknown as BoundModel;
				messages = [new HumanMessage('What\'s the weather like in San Francisco today?')];
			} else {
				const m = new MockChatModel({
					responder: (_msgs, turn) => {
						if (turn === 0)
							return {
								content: '',
								toolCalls: [
									{ name: 'get_weather', args: { city: 'Tokyo' }, id: 'c1' },
									{ name: 'get_weather', args: { city: 'London' }, id: 'c2' }
								]
							};
						if (turn === 1)
							return {
								content: '',
								toolCalls: [
									{
										name: 'calculator',
										args: { expression: '28 - 14' },
										id: 'c3'
									}
								]
							};
						return {
							content:
								'Tokyo is 28°C and humid; London is 14°C and rainy. The temperature gap is 14°C.'
						};
					}
				});
				model = m.bindTools(allTools as unknown as never[]) as unknown as BoundModel;
				messages = [
					new HumanMessage(
						'Compare today\'s weather in Tokyo and London, and tell me the temperature difference.'
					)
				];
			}

			let safety = 0;
			while (safety++ < 6) {
				pushPath('agent');
				await new Promise((res) => setTimeout(res, 250));
				const ai = (await model.invoke(messages)) as AIMessage;
				messages = [...messages, ai];
				if (!ai.tool_calls?.length) {
					pushPath('end');
					break;
				}
				pushPath('tools');
				await new Promise((res) => setTimeout(res, 250));
				for (const tc of ai.tool_calls) {
					const t = toolByName[tc.name];
					const out = await t.invoke(tc.args);
					messages = [
						...messages,
						new ToolMessage({
							tool_call_id: tc.id ?? '',
							content: typeof out === 'string' ? out : JSON.stringify(out)
						})
					];
				}
			}
		} finally {
			running = false;
		}
	}

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

<Lesson title="create_agent" eyebrow="Phase 1 · Lesson 06">
	{#snippet intro()}
		<p>
			A standard tool-using agent is a tiny graph: <em>agent</em> → <em>tools</em> → <em>agent</em>
			→ … → <em>end</em>. LangChain v1 wraps this as <code>create_agent</code> (in JS, the
			equivalent prebuilt is <code>createReactAgent</code> from LangGraph). It is the bridge
			from Phase 1 to Phase 2.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The ReAct loop">
			<p>
				The agent calls the model, looks at the response. If there are tool calls, it executes
				them and appends the results as <code>ToolMessage</code>s. Then it calls the model
				again with the longer history. The model decides whether to keep calling tools or
				return a final answer.
			</p>
			<CodeBlock code={code} caption="Two lines and a list of tools — that's it." />
		</Slide>

		<Slide title="It's already a graph">
			<p>
				Notice that the prebuilt agent comes from <code>@langchain/langgraph</code>. That's not
				an accident — every agent in LangChain v1 compiles to a LangGraph state machine. The
				next chapter is what's underneath this prebuilt.
			</p>
		</Slide>

		<Slide title="Two scenarios">
			<p>
				Demo 1 (single tool, single hop): a basic weather lookup.<br />
				Demo 2 (parallel tools, then a follow-up tool): the agent fans out to two weather
				lookups, then computes a temperature difference. The graph view on the right
				highlights the active node and the edges actually traversed.
			</p>
		</Slide>

		<Slide title="Why this is a milestone">
			<p>
				If you've made it here, you can wire a real, useful agent today. Everything above this
				line — chains, streaming, structured output, tools, RAG — is the toolbox. From here we
				start owning the control flow.
			</p>
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

		<Panel title="Graph (live)" subtitle="agent ↔ tools loop">
			<GraphView
				nodes={[
					{ id: 'start', label: '·', x: 60, y: 40, kind: 'start' },
					{ id: 'agent', label: 'agent', x: 180, y: 100 },
					{ id: 'tools', label: 'tools', x: 320, y: 100, kind: 'tool' },
					{ id: 'end', label: '·', x: 180, y: 200, kind: 'end' }
				]}
				edges={[
					{ from: 'start', to: 'agent' },
					{ from: 'agent', to: 'tools', label: 'tool_calls?', conditional: true },
					{ from: 'tools', to: 'agent' },
					{ from: 'agent', to: 'end', label: 'no calls', conditional: true }
				]}
				active={active}
				path={path}
				width={400}
				height={240}
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
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		cursor: pointer;
	}
	.modes label.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
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
		color: var(--color-fg-faint);
	}
</style>
