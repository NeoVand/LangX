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
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		HumanMessage,
		AIMessage,
		ToolMessage,
		SystemMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import { runStateGraphDemo } from '$lib/demos/lg-stategraph';
	import lgStateGraphSrc from '$lib/demos/lg-stategraph.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'stategraph',
		title: 'StateGraph',
		summary: 'Hand-build the ReAct loop: an agent node, a tools node, and a conditional edge.',
		entries: [{ path: 'lib/demos/lg-stategraph.ts', code: lgStateGraphSrc }],
		runner: `import { runStateGraphDemo } from './lib/demos/lg-stategraph';

const userInput = "What's the weather in Tokyo right now? Reply in one sentence.";
const { messages, path } = await runStateGraphDemo(userInput, 'simple', {
	onPath: (p) => console.log('  path:', p.join(' -> '))
});

console.log('\\nFinal path:', path.join(' -> '));
console.log('Final answer:', messages.at(-1)?.content);
`
	};

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
			const out = await withRunCache<DemoPayload>(
				{ demoId: `l2-stategraph-${mode}` },
				async () => {
					const { messages: collected, path: finalPath } = await runStateGraphDemo(
						userInput,
						mode,
						{
							onPath: (p) => (path = p),
							onActive: (n) => (activeNode = n),
							onMessages: (m) => (messages = m)
						}
					);
					const last = collected[collected.length - 1];
					const final = typeof last?.content === 'string' ? last.content : '';
					return {
						question: userInput,
						mode,
						messages: serialize(collected),
						path: finalPath,
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
	hero={{
		id: 'l2-stategraph',
		alt: 'A garden-maze with gazebos as nodes and a glass jar of state at the center'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		When the loop has shape — explicit <Term t="Node">nodes</Term>, explicit
		<Term t="Edge">edges</Term>, explicit <Term t="State">state</Term> — agents stop being mystery
		boxes and become inspectable systems.
	{/snippet}
	{#snippet intro()}
		<p>
			Phase 2 starts here: instead of declaring a chain, you declare a state machine. A
			<Term t="StateGraph" /> is built from three primitives — a <Term t="State schema" />, named
			<Term t="Node" />s that produce <Term t="Partial state update" />s, and <Term t="Edge" />s
			that route between them.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From pipe to plan" variant="dropcap">
			<p>
				<Term t="LCEL" /> chains are linear: A → B → C. That's enough for a tutor or a translator, but it
				falls apart the moment your agent needs to <em>loop</em> — call a tool, read the
				result, decide whether to call another tool, and only then answer. A
				<Term t="StateGraph" /> is the smallest abstraction that cleanly describes that loop.
			</p>
			<p>
				The trick is splitting the run into two things you can read separately: <Term t="State"
					><strong>state</strong></Term
				>
				(what's known) and <Term t="Node"><strong>nodes</strong></Term> (work to do next). Once those
				are explicit, the runtime can <Term t="Checkpoint">checkpoint</Term>, resume, branch, and
				<Term t="stream">stream</Term> the same machine with no extra API surface. The graph is the
				spec; everything else is bookkeeping.
			</p>
		</Slide>

		<Slide title="The three primitives">
			<ul>
				<li>
					<strong><Term t="State" /> schema</strong> — a typed object that flows through every
					<Term t="Node" />. We'll use the prebuilt
					<Term t="MessagesAnnotation"><code>MessagesAnnotation</code></Term> here, which is a
					state with a single <code>messages</code> field and an
					<Term t="add_messages"><code>add_messages</code></Term>
					<Term t="Reducer">reducer</Term>.
				</li>
				<li>
					<strong><Term t="Node">Nodes</Term></strong> — async functions
					<code>(state) → partialState</code>. Anything you return is merged into the next state
					via the schema's <Term t="Reducer">reducer</Term>.
				</li>
				<li>
					<strong><Term t="Edge">Edges</Term></strong> — <Term t="addEdge"
						><code>addEdge('a', 'b')</code></Term
					> for a fixed transition, <Term t="addConditionalEdges"
						><code>addConditionalEdges('a', router)</code></Term
					> when the next node depends on state.
				</li>
			</ul>
		</Slide>

		<Diagram spec={stateGraphTriad} />

		<Slide variant="pull-quote">
			<p>
				A <Term t="LangGraph" /> isn't a clever way to call an <Term t="LLM" />. It's a
				<Term t="StateGraph" /> where one of the <Term t="Node">nodes</Term> happens to call an
				LLM — and that reframing is the whole point of the chapter.
			</p>
		</Slide>

		<Slide title="Building the chat–tool loop" variant="code-first">
			<p>
				Here's the smallest interesting graph: an <code>agent</code> <Term t="Node" /> that calls the
				model and a <code>tools</code> <Term t="Node" /> that runs whatever the model asked for. A
				<Term t="Conditional edge">conditional edge</Term> after <code>agent</code> decides whether to
				keep looping or finish.
			</p>
			<CodeBlock code={code} caption="The classic ReAct loop, hand-built from primitives." />
			<p>
				Phase 1's <Term t="create_agent"><code>create_agent</code></Term> compiles to almost exactly
				this. Now you own the wiring — the same wiring you'll keep extending in every later lesson.
			</p>
		</Slide>

		<Slide title="Stream the values">
			<p>
				When you <Term t="compile">compile</Term> a graph you get back a <Term t="Runnable" />.
				Calling <Term t="stream">stream</Term> with
				<Term t="streamMode: values"><code>streamMode: 'values'</code></Term> yields the
				<em>full state after every <Term t="Superstep">superstep</Term></em> — that's how the right
				pane keeps the message log and the highlighted graph in sync as the agent loops.
			</p>
		</Slide>

		<Slide title="Why this matters" ornament>
			<p>
				Every later lesson — <Term t="Conditional edge">conditional routing</Term>,
				<Term t="Reducer">reducers</Term>, <Term t="Checkpointer">checkpointers</Term>,
				<Term t="Interrupt">interrupts</Term>, <Term t="streamMode">streaming modes</Term>,
				<Term t="Fan-out">fan-out</Term>, <Term t="Subgraph">subgraphs</Term> — is a property of
				<em>this</em> shape. Once you see the graph, the rest of Phase 2 reads as a series of
				features bolted onto the same skeleton.
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
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
