<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { stateGraphTriad } from '$lib/diagrams';
	import RunButton from '$lib/components/RunButton.svelte';
	import LangGraphView from '$lib/components/LangGraphView.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph/web';
	import { ToolNode } from '@langchain/langgraph/prebuilt';
	import { calculatorTool, weatherTool } from '$lib/runtime/tools';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		HumanMessage,
		AIMessage,
		ToolMessage,
		SystemMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import { onMount } from 'svelte';

	type SerializedMsg =
		| { kind: 'human'; content: string }
		| { kind: 'ai'; content: string; toolCalls?: { name: string; args: unknown }[] }
		| { kind: 'tool'; content: string; name?: string }
		| { kind: 'system'; content: string };

	interface DemoPayload {
		question: string;
		mode: 'simple' | 'multi';
		messages: SerializedMsg[];
		path: string[];
		final: string;
	}

	let mode = $state<'simple' | 'multi'>('simple');
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let activeNode = $state<string | undefined>(undefined);
	let path = $state<string[]>([]);
	let finalAnswer = $state('');

	const userInput = $derived(
		mode === 'simple'
			? "What's the weather in Tokyo right now? Reply in one sentence."
			: 'How much warmer is Tokyo than Berlin today? Use the weather tool then the calculator. Reply in one sentence.'
	);

	function rehydrate(msgs: SerializedMsg[]): BaseMessage[] {
		return msgs.map((m) => {
			if (m.kind === 'human') return new HumanMessage(m.content);
			if (m.kind === 'system') return new SystemMessage(m.content);
			if (m.kind === 'tool')
				return new ToolMessage({ content: m.content, tool_call_id: 'cached', name: m.name });
			return new AIMessage({
				content: m.content,
				tool_calls: m.toolCalls?.map((tc, i) => ({
					name: tc.name,
					args: (tc.args ?? {}) as Record<string, unknown>,
					id: `cached-${i}`,
					type: 'tool_call' as const
				}))
			});
		});
	}

	function serialize(msgs: BaseMessage[]): SerializedMsg[] {
		return msgs.map((m): SerializedMsg => {
			const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
			if (m instanceof HumanMessage) return { kind: 'human', content };
			if (m instanceof SystemMessage) return { kind: 'system', content };
			if (m instanceof ToolMessage) return { kind: 'tool', content, name: m.name };
			if (m instanceof AIMessage) {
				return {
					kind: 'ai',
					content,
					toolCalls: m.tool_calls?.map((tc) => ({ name: tc.name, args: tc.args }))
				};
			}
			return { kind: 'ai', content };
		});
	}

	async function runDemo() {
		running = true;
		messages = [];
		path = [];
		activeNode = undefined;
		finalAnswer = '';
		try {
			const tools = mode === 'simple' ? [weatherTool] : [weatherTool, calculatorTool];
			const out = await withRunCache<DemoPayload>(
				{ demoId: `l2-stategraph-${mode}` },
				async () => {
					const model = await getModel({ temperature: 0, maxTokens: 320 });
					const bound = model.bindTools!(tools);
					const toolNode = new ToolNode(tools);

					const graph = new StateGraph(MessagesAnnotation)
						.addNode('agent', async (state) => {
							path = [...path, 'agent'];
							activeNode = 'agent';
							const ai = await bound.invoke(state.messages);
							return { messages: [ai] };
						})
						.addNode('tools', async (state) => {
							path = [...path, 'tools'];
							activeNode = 'tools';
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

					const seedMessages: BaseMessage[] = [new HumanMessage(userInput)];
					let collected: BaseMessage[] = seedMessages;
					for await (const update of await graph.stream(
						{ messages: seedMessages },
						{ streamMode: 'values' }
					)) {
						collected = update.messages as BaseMessage[];
						messages = collected;
					}
					activeNode = '__end__';
					path = [...path, '__end__'];

					const last = collected[collected.length - 1];
					const final = typeof last?.content === 'string' ? last.content : '';
					return {
						question: userInput,
						mode,
						messages: serialize(collected),
						path: [...path],
						final
					};
				}
			);
			messages = rehydrate(out.messages);
			path = out.path;
			activeNode = '__end__';
			finalAnswer = out.final;
		} finally {
			running = false;
		}
	}

	onMount(async () => {
		for (const m of ['simple', 'multi'] as const) {
			const cached = await loadCachedRun<DemoPayload>({ demoId: `l2-stategraph-${m}` });
			if (cached && cached.payload.mode === mode) {
				messages = rehydrate(cached.payload.messages);
				path = cached.payload.path;
				finalAnswer = cached.payload.final;
				activeNode = '__end__';
				return;
			}
		}
	});

	$effect(() => {
		void mode;
		messages = [];
		path = [];
		finalAnswer = '';
		activeNode = undefined;
		void (async () => {
			const cached = await loadCachedRun<DemoPayload>({ demoId: `l2-stategraph-${mode}` });
			if (cached) {
				messages = rehydrate(cached.payload.messages);
				path = cached.payload.path;
				finalAnswer = cached.payload.final;
				activeNode = '__end__';
			}
		})();
	});

	// A "viz-only" copy of the graph: identical nodes and edges, no model calls.
	// `getGraphAsync()` returns the same drawable representation as the live graph,
	// so what the user sees is the structure LangGraph itself reports.
	const vizGraph = new StateGraph(MessagesAnnotation)
		.addNode('agent', async () => ({ messages: [] }))
		.addNode('tools', async () => ({ messages: [] }))
		.addEdge(START, 'agent')
		.addConditionalEdges(
			'agent',
			() => END,
			{ tools: 'tools', [END]: END }
		)
		.addEdge('tools', 'agent')
		.compile();

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

<Lesson
	title="StateGraph"
	eyebrow="Phase 2 · Lesson 01"
	motivation="When the loop has shape — explicit nodes, explicit edges, explicit state — agents stop being mystery boxes and become inspectable systems."
	hero={{
		id: 'l2-stategraph',
		alt: 'A garden-maze with gazebos as nodes and a glass jar of state at the center'
	}}
>
	{#snippet intro()}
		<p>
			Phase 2 starts here: instead of declaring a chain, you declare a state machine. A
			<Term t="StateGraph" /> is built from three primitives — a state schema, named nodes that
			produce partial state updates, and edges that route between them.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From pipe to plan" variant="dropcap">
			<p>
				LCEL chains are linear: A → B → C. That's enough for a tutor or a translator, but it
				falls apart the moment your agent needs to <em>loop</em> — call a tool, read the
				result, decide whether to call another tool, and only then answer. A graph is the
				smallest abstraction that cleanly describes that loop.
			</p>
			<p>
				The trick is splitting the run into two things you can read separately: <strong>state</strong>
				(what's known) and <strong>nodes</strong> (work to do next). Once those are explicit,
				the runtime can checkpoint, resume, branch, and stream the same machine with no extra
				API surface. The graph is the spec; everything else is bookkeeping.
			</p>
		</Slide>

		<Slide title="The three primitives">
			<ul>
				<li>
					<strong>State</strong> — a typed object that flows through every node. We'll use
					the prebuilt <code>MessagesAnnotation</code> here, which is a state with a single
					<code>messages</code> field and an <code>add_messages</code> reducer.
				</li>
				<li>
					<strong>Nodes</strong> — async functions <code>(state) → partialState</code>.
					Anything you return is merged into the next state via the schema's reducer.
				</li>
				<li>
					<strong>Edges</strong> — <code>addEdge('a', 'b')</code> for a fixed transition,
					<code>addConditionalEdges('a', router)</code> when the next node depends on state.
				</li>
			</ul>
		</Slide>

		<Slide title="The triad, drawn" variant="figure">
			<Diagram spec={stateGraphTriad} title="StateGraph triad" />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A LangGraph isn't a clever way to call an LLM. It's a state machine where one of the
				nodes happens to call an LLM — and that reframing is the whole point of the chapter.
			</p>
		</Slide>

		<Slide title="Building the chat–tool loop" variant="code-first">
			<p>
				Here's the smallest interesting graph: an <code>agent</code> node that calls the model
				and a <code>tools</code> node that runs whatever the model asked for. A conditional
				edge after <code>agent</code> decides whether to keep looping or finish.
			</p>
			<CodeBlock code={code} caption="The classic ReAct loop, hand-built from primitives." />
			<p>
				Phase 1's <code>create_agent</code> compiles to almost exactly this. Now you own the
				wiring — the same wiring you'll keep extending in every later lesson.
			</p>
		</Slide>

		<Slide title="Stream the values">
			<p>
				When you compile a graph you get back a Runnable. Calling <code>stream</code> with
				<code>streamMode: 'values'</code> yields the <em>full state after every superstep</em>
				— that's how the right pane keeps the message log and the highlighted graph in sync as
				the agent loops.
			</p>
		</Slide>

		<Slide title="Why this matters" ornament>
			<p>
				Every later lesson — conditional routing, reducers, checkpointers, interrupts,
				streaming modes, fan-out, subgraphs — is a property of <em>this</em> shape. Once you
				see the graph, the rest of Phase 2 reads as a series of features bolted onto the same
				skeleton.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo · agent + tools loop" subtitle="Real model, real tool calls">
			<div class="modes" role="radiogroup" aria-label="Scenario">
				<label class:selected={mode === 'simple'}>
					<input type="radio" bind:group={mode} value="simple" />
					<span>Single tool, single hop</span>
					<small>One weather call, one final sentence.</small>
				</label>
				<label class:selected={mode === 'multi'}>
					<input type="radio" bind:group={mode} value="multi" />
					<span>Two hops</span>
					<small>Weather × 2, then a calculator.</small>
				</label>
			</div>
			<div class="prompt-row">
				<span class="lbl">Prompt</span>
				<code>{userInput}</code>
			</div>
			<RunButton onclick={runDemo} running={running} label="Run graph" />
			{#if finalAnswer}
				<div class="output">{finalAnswer}</div>
			{/if}
		</Panel>

		<Panel
			title="Live graph"
			subtitle="rendered from compiledGraph.getGraphAsync().drawMermaid()"
		>
			<LangGraphView
				graph={vizGraph}
				activeNode={activeNode}
				path={path}
				caption="Native LangGraph diagram · agent + tools loop"
			/>
		</Panel>

		<Panel title="Messages" subtitle="Every step the agent took">
			<MessageStream {messages} compact />
		</Panel>
	{/snippet}

	{#snippet inspect()}
		<Panel title="Path observed">
			<StateInspector state={path} title="superstep order" compact />
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
		color: var(--color-ink-100);
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-ink-300);
	}

	.prompt-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		margin-bottom: 0.7rem;
	}
	.prompt-row .lbl {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	.prompt-row code {
		font-size: 0.84rem;
		color: var(--color-ink-100);
		font-family: var(--font-mono);
	}

	.output {
		margin-top: 0.85rem;
		padding: 0.85rem 0.95rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
