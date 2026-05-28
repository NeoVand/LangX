<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import GraphView from '$lib/components/GraphView.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import {
		StateGraph,
		MessagesAnnotation,
		START,
		END
	} from '@langchain/langgraph/web';
	import { ToolNode } from '@langchain/langgraph/prebuilt';
	import { calculatorTool, weatherTool } from '$lib/runtime/tools';
	import { MockChatModel } from '$lib/runtime/llm/mock';
	import {
		AIMessage,
		HumanMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;

	let mode = $state<'simple' | 'multi'>('simple');
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let activeNode = $state<string | undefined>(undefined);
	let path = $state<string[]>([]);
	let stateSnapshot = $state<unknown>(null);

	function makeModel() {
		if (mode === 'simple') {
			return new MockChatModel({
				responder: (_msgs, turn) => {
					if (turn === 0)
						return {
							content: '',
							toolCalls: [{ name: 'get_weather', args: { city: 'Tokyo' }, id: 't1' }]
						};
					return {
						content: 'Tokyo is 28°C and humid. Bring water.'
					};
				}
			}).bindTools([weatherTool]) as unknown as BoundModel;
		}
		return new MockChatModel({
			responder: (_msgs, turn) => {
				if (turn === 0)
					return {
						content: '',
						toolCalls: [
							{ name: 'get_weather', args: { city: 'Tokyo' }, id: 't1' },
							{ name: 'get_weather', args: { city: 'Berlin' }, id: 't2' }
						]
					};
				if (turn === 1)
					return {
						content: '',
						toolCalls: [
							{ name: 'calculator', args: { expression: '28 - 19' }, id: 't3' }
						]
					};
				return {
					content: 'Tokyo is 9°C warmer than Berlin today (28 vs 19).'
				};
			}
		}).bindTools([weatherTool, calculatorTool]) as unknown as BoundModel;
	}

	async function runDemo() {
		running = true;
		messages = [];
		path = [];
		activeNode = undefined;
		stateSnapshot = null;
		try {
			const model = makeModel();
			const tools = mode === 'simple' ? [weatherTool] : [weatherTool, calculatorTool];
			const toolNode = new ToolNode(tools);

			const graph = new StateGraph(MessagesAnnotation)
				.addNode('agent', async (state) => {
					path = [...path, 'agent'];
					activeNode = 'agent';
					await new Promise((r) => setTimeout(r, 200));
					const ai = await model.invoke(state.messages);
					return { messages: [ai] };
				})
				.addNode('tools', async (state) => {
					path = [...path, 'tools'];
					activeNode = 'tools';
					await new Promise((r) => setTimeout(r, 200));
					return await toolNode.invoke(state);
				})
				.addEdge(START, 'agent')
				.addConditionalEdges('agent', (state) => {
					const last = state.messages[state.messages.length - 1] as AIMessage;
					if (last.tool_calls?.length) return 'tools';
					return END;
				})
				.addEdge('tools', 'agent')
				.compile();

			const userInput =
				mode === 'simple'
					? 'How is the weather in Tokyo?'
					: 'How much warmer is Tokyo than Berlin today?';

			for await (const update of await graph.stream(
				{ messages: [new HumanMessage(userInput)] },
				{ streamMode: 'values' }
			)) {
				messages = update.messages as BaseMessage[];
				stateSnapshot = update;
			}
			activeNode = 'end';
			path = [...path, 'end'];
		} finally {
			running = false;
		}
	}

	const code = `import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', async (state) => {
    const ai = await model.invoke(state.messages);
    return { messages: [ai] };           // partial update — merged via the reducer
  })
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (state) => {
    const last = state.messages.at(-1);
    return last.tool_calls?.length ? 'tools' : END;
  })
  .addEdge('tools', 'agent')
  .compile();`;
</script>

<Lesson title="StateGraph" eyebrow="Phase 2 · Lesson 01">
	{#snippet intro()}
		<p>
			Phase 2 starts here: instead of declaring a chain, you declare a state machine. A
			<Term t="StateGraph" /> is built from three primitives — a state schema, named nodes that
			produce partial state updates, and edges that route between them.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Why graphs?">
			<p>
				LCEL chains are linear: A → B → C. Real agents need cycles (model → tool → model →
				tool → … → end), branches (route to different specialists), and a place to keep state.
				A graph models all of these naturally.
			</p>
		</Slide>

		<Slide title="The three primitives">
			<ul>
				<li>
					<strong>State</strong> — a typed object that flows through every node. In TS we use{' '}
					<code>Annotation</code> or the prebuilt <code>MessagesAnnotation</code>.
				</li>
				<li>
					<strong>Nodes</strong> — async functions <code>(state) → partialState</code>.
				</li>
				<li>
					<strong>Edges</strong> — <code>addEdge('a', 'b')</code> for fixed transitions,{' '}
					<code>addConditionalEdges('a', router)</code> for dynamic ones.
				</li>
			</ul>
		</Slide>

		<Slide title="Building the chat–tool loop">
			<CodeBlock code={code} caption="The classic ReAct loop, hand-built from primitives." />
			<p>
				Phase 1's <code>create_agent</code> compiles to almost exactly this graph. Now you own
				the wiring.
			</p>
		</Slide>

		<Slide title="Stream the values">
			<p>
				When you compile a graph, you get back a Runnable. Calling <code>stream</code> with{' '}
				<code>streamMode: 'values'</code> yields the full state after every superstep — that's
				how the right pane keeps the message log and graph highlight in sync.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Pick a scenario">
			<div class="modes">
				<label class:selected={mode === 'simple'}>
					<input type="radio" bind:group={mode} value="simple" />
					<span>Single tool, single hop</span>
					<small>One weather call, one final answer.</small>
				</label>
				<label class:selected={mode === 'multi'}>
					<input type="radio" bind:group={mode} value="multi" />
					<span>Two hops</span>
					<small>Parallel weather calls, then a calculator.</small>
				</label>
			</div>
			<RunButton onclick={runDemo} running={running} label="Run graph" />
		</Panel>

		<Panel title="Live graph" subtitle="active node + traversed edges">
			<GraphView
				nodes={[
					{ id: 'start', label: '·', x: 60, y: 40, kind: 'start' },
					{ id: 'agent', label: 'agent', x: 200, y: 100 },
					{ id: 'tools', label: 'tools', x: 340, y: 100, kind: 'tool' },
					{ id: 'end', label: '·', x: 200, y: 200, kind: 'end' }
				]}
				edges={[
					{ from: 'start', to: 'agent' },
					{ from: 'agent', to: 'tools', label: 'tool_calls?', conditional: true },
					{ from: 'tools', to: 'agent' },
					{ from: 'agent', to: 'end', label: 'no calls', conditional: true }
				]}
				active={activeNode}
				path={path}
				width={420}
			/>
		</Panel>

		<Panel title="Messages">
			<MessageStream messages={messages} compact />
		</Panel>
	{/snippet}

	{#snippet inspect()}
		<Panel title="Final state">
			<StateInspector state={stateSnapshot} compact />
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
