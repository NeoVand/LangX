<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import LiveGraph, { type NodeMeta, type StepInfo, type EdgeDetail } from '$lib/components/LiveGraph.svelte';
	import {
		buildStateGraph,
		runStateGraphTurn,
		type SGSnapshot,
		type StateGraphMode
	} from '$lib/demos/lg-stategraph';
	import { AIMessage, HumanMessage, ToolMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
	import lgStateGraphSrc from '$lib/demos/lg-stategraph.ts?raw';
	import graphRunSrc from '$lib/demos/graph-run.ts?raw';
	import stateGraphSkill from '$lib/demos/skills/langgraph-stategraph.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'stategraph',
		title: 'StateGraph — the agent⇄tools loop',
		summary: 'Hand-build the ReAct loop from StateGraph primitives: an agent node, a tools node, and a conditional edge that loops until the model answers.',
		entries: [
			{ path: 'lib/demos/graph-run.ts', code: graphRunSrc },
			{ path: 'lib/demos/lg-stategraph.ts', code: lgStateGraphSrc }
		],
		runner: `import { buildStateGraph, runStateGraphTurn } from './lib/demos/lg-stategraph';

const graph = await buildStateGraph('simple');
const config = { configurable: { thread_id: 'sg-1' } };
const r = await runStateGraphTurn(graph, "What's the weather in Tokyo? One sentence.", config,
  (node) => console.log('  ·', node));
console.log('\\n' + r.snapshot.messages.at(-1)?.content);`,
		skill: stateGraphSkill
	};

	// ── Hand-wired layout of the agent ⇄ tools loop ───────────────────────────
	const R1 = 56;
	const BW = 110, BH = 48;
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 54, cy: R1, w: 52, h: 26, shape: 'pill' as const },
		{ id: 'agent', label: 'Agent', sub: 'model node', cx: 200, cy: R1, w: BW, h: BH, shape: 'box' as const, variant: 'llm' as const },
		{ id: 'tools', label: 'Tools', sub: 'runs tool calls', cx: 404, cy: R1, w: BW, h: BH, shape: 'box' as const, variant: 'code' as const },
		{ id: '__end__', label: 'END', cx: 200, cy: 168, w: 52, h: 26, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'agent' },
		{ from: 'agent', to: 'tools', label: 'tool call', bow: -22, lift: -14, labelDy: -9 },
		{ from: 'tools', to: 'agent', label: 'result', bow: -22, lift: 14, labelDy: 11 },
		{ from: 'agent', to: '__end__', label: 'done' }
	];

	const nodeMeta: Record<string, NodeMeta> = {
		__start__: {
			desc: 'The run begins; state = { messages: [your question] }.',
			explain: {
				lead: 'Press play.',
				body: 'The run begins with your question added to the message list. That list IS the graph’s state — every node reads it and appends to it.'
			}
		},
		agent: {
			label: 'Agent (model node)',
			desc: 'Calls the model on the full message list and appends its reply.',
			explain: {
				lead: 'The brain of the loop.',
				body: 'This node hands the whole conversation so far to the language model and asks what to do next. The model either calls a tool (because it needs information it doesn’t have) or just writes the final answer. Either way, its reply is appended to the shared message list.'
			},
			code: `// MODEL node
const ai = await model.bindTools(tools).invoke(state.messages);
return { messages: [ai] };   // appended by the reducer`
		},
		tools: {
			label: 'Tools (code node)',
			desc: 'A prebuilt ToolNode runs every tool call in the last AI message.',
			explain: {
				lead: 'Do what the model asked.',
				body: 'When the model requests a tool — say, “get the weather in Tokyo” — this node actually runs that function and appends the result back into the conversation as a tool message. It’s plain code: no AI here, just executing the calls the model made. Then control loops back so the model can read the results.'
			},
			code: `// CODE node — no model
// ToolNode runs every tool_call in the last AI message:
return await new ToolNode(tools).invoke(state);`
		},
		__end__: {
			desc: 'The graph reached END — the last message is the answer.',
			explain: {
				lead: 'Done.',
				body: 'The model answered without asking for another tool, so the conditional edge sent the run to END. The last message in the list is your answer.'
			}
		}
	};

	const condEdgeCode = `.addConditionalEdges('agent', (state) => {
  const last = state.messages.at(-1);
  return last.tool_calls?.length ? 'tools' : END;
})`;
	const EDGE_DETAIL: Record<string, EdgeDetail> = {
		'agent|tools': {
			title: 'Conditional edge · tool call',
			variant: 'router',
			desc: 'After the agent runs, this function reads the last message. If the model asked for one or more tools, it routes to the tools node.',
			code: condEdgeCode
		},
		'agent|__end__': {
			title: 'Conditional edge · done',
			variant: 'router',
			desc: 'The other branch of the same conditional edge: if the model answered without asking for a tool, the run goes to END.',
			code: condEdgeCode
		},
		'tools|agent': {
			title: 'Loop back',
			variant: '',
			desc: 'A plain, unconditional edge. After the tools run, control always returns to the agent so it can read the results and decide again — this back-edge is what turns a line into a loop.',
			code: `.addEdge('tools', 'agent')`
		}
	};

	// ── Run state + live frames ─────────────────────────────────────────────────
	let mode = $state<StateGraphMode>('simple');
	let frames = $state<{ node: string; snap: SGSnapshot }[]>([]);
	let frameIdx = $state(0);
	let running = $state(false);
	let error = $state('');
	let threadCounter = 0;

	const userInput = $derived(
		mode === 'simple'
			? "What's the weather in Tokyo right now? Reply in one sentence."
			: 'How much warmer is Tokyo than Berlin today? Use the weather tool then the calculator. Reply in one sentence.'
	);
	const final = $derived<SGSnapshot | null>(frames.length ? frames[frames.length - 1].snap : null);

	const STEP_MS = 520;
	async function pushFrame(node: string, s: SGSnapshot) {
		frames = [...frames, { node, snap: s }];
		frameIdx = frames.length - 1;
		await new Promise((r) => setTimeout(r, STEP_MS));
	}
	function reset() {
		frames = [];
		frameIdx = 0;
		error = '';
	}
	async function runDemo() {
		if (running) return;
		reset();
		running = true;
		try {
			const graph = await buildStateGraph(mode);
			await runStateGraphTurn(graph, userInput, { configurable: { thread_id: `sg-${threadCounter++}` } }, pushFrame);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	// ── What <LiveGraph> needs: per-step "what happened" + the State-tab object ──
	const roleOf = (m: BaseMessage) =>
		m instanceof HumanMessage ? 'human' : m instanceof ToolMessage ? 'tool' : m instanceof SystemMessage ? 'system' : 'ai';
	const textOf = (m: BaseMessage) => {
		const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
		return c.length > 90 ? c.slice(0, 90) + '…' : c;
	};
	function trailingToolMsgs(msgs: BaseMessage[]): ToolMessage[] {
		const out: ToolMessage[] = [];
		for (let i = msgs.length - 1; i >= 0; i--) {
			if (msgs[i] instanceof ToolMessage) out.unshift(msgs[i] as ToolMessage);
			else break;
		}
		return out;
	}

	function describe(node: string, s: SGSnapshot, _prev: unknown, _count: number): StepInfo | null {
		switch (node) {
			case '__start__':
				return { summary: 'Your question is added to the message list — the graph’s state' };
			case 'agent': {
				const last = s.messages[s.messages.length - 1] as AIMessage;
				const tc = last?.tool_calls ?? [];
				if (tc.length)
					return {
						summary: `Model asked for ${tc.length} tool call${tc.length > 1 ? 's' : ''}`,
						items: tc.map((t) => ({ icon: '→', text: t.name, detail: JSON.stringify(t.args).slice(0, 60) })),
						stateChange: `messages += AIMessage with ${tc.length} tool_call${tc.length > 1 ? 's' : ''}`,
						insight: 'The model can’t fetch data itself — it asks, and the tools node answers.'
					};
				return {
					summary: 'Model wrote the final answer',
					items: [{ icon: '✓', text: textOf(last), status: 'supported' }],
					stateChange: 'messages += AIMessage (no tool calls)'
				};
			}
			case 'tools': {
				const recent = trailingToolMsgs(s.messages);
				return {
					summary: `Ran ${recent.length} tool${recent.length > 1 ? 's' : ''}, appended the result${recent.length > 1 ? 's' : ''}`,
					items: recent.map((m) => ({ icon: '⚙', text: m.name ?? 'tool', detail: textOf(m) })),
					stateChange: `messages += ${recent.length} ToolMessage${recent.length > 1 ? 's' : ''}`,
					insight: 'Plain code — no model here. Then control loops back to the agent.'
				};
			}
			case '__end__':
				return { summary: 'The model answered without asking for a tool → the run ends' };
			default:
				return null;
		}
	}
	function toState(s: SGSnapshot): Record<string, unknown> {
		return {
			messages: s.messages.map((m) => {
				const o: Record<string, unknown> = { role: roleOf(m), content: textOf(m) };
				const tc = (m as AIMessage).tool_calls;
				if (tc?.length) o.tool_calls = tc.map((t) => ({ name: t.name, args: t.args }));
				if (m instanceof ToolMessage && m.name) o.name = m.name;
				return o;
			})
		};
	}

	// ── Narrative code excerpt ──────────────────────────────────────────────────
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
	eyebrow="Level 2 · Lesson 01"
	hero={{
		id: 'l2-stategraph',
		alt: 'A brass machine with a glowing cyan state reservoir wired to a thinking-engine and a tool-arm in a loop'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		When the loop has shape — explicit <Term t="Node">nodes</Term>, explicit
		<Term t="Edge">edges</Term>, explicit <Term t="State">state</Term> — agents stop being mystery
		boxes and become machines you can read, pause, and replay.
	{/snippet}
	{#snippet intro()}
		<p>
			Level 2 starts here. Instead of declaring a <Term t="chain">chain</Term>, you declare a state
			machine. A <Term t="StateGraph" /> is built from three primitives — a typed
			<Term t="State">state</Term>, named <Term t="Node">nodes</Term> that return
			<Term t="Partial state update">partial updates</Term>, and <Term t="Edge">edges</Term> that
			decide what runs next. The demo on the right builds the smallest interesting one: the
			<strong>agent&nbsp;⇄&nbsp;tools</strong> loop, live.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From a pipe to a plan" variant="dropcap">
			<p>
				<Term t="LCEL" /> chains are linear: A&nbsp;→&nbsp;B&nbsp;→&nbsp;C. That's perfect for a tutor or a
				translator, but it falls apart the moment your agent needs to <em>loop</em> — call a tool,
				read the result, decide whether to call another, and only then answer. A
				<Term t="StateGraph" /> is the smallest abstraction that describes that loop cleanly.
			</p>
			<p>
				The trick is splitting the run into two things you can read separately:
				<Term t="State"><strong>state</strong></Term> (what's known so far) and
				<Term t="Node"><strong>nodes</strong></Term> (work to do next). Once those are explicit, the
				runtime can <Term t="Checkpoint">checkpoint</Term>, resume, branch, and
				<Term t="stream">stream</Term> the same machine with no extra API surface. The graph is the
				spec; everything else is bookkeeping.
			</p>
		</Slide>

		<Slide title="The three primitives">
			<ul>
				<li>
					<strong><Term t="State" /></strong> — a typed object that flows through every
					<Term t="Node" />. We use the prebuilt
					<Term t="MessagesAnnotation"><code>MessagesAnnotation</code></Term>: a state with one
					<code>messages</code> field and an append <Term t="Reducer">reducer</Term>, so each node's
					reply is added to the list rather than overwriting it.
				</li>
				<li>
					<strong><Term t="Node">Nodes</Term></strong> — async functions
					<code>(state) → partial&nbsp;state</code>. Whatever you return is merged into the next state
					through the schema's reducer. Some nodes call a model; some are plain code.
				</li>
				<li>
					<strong><Term t="Edge">Edges</Term></strong> — <Term t="addEdge"><code>addEdge('a', 'b')</code></Term>
					for a fixed hop, <Term t="addConditionalEdges"><code>addConditionalEdges('a', router)</code></Term>
					when the next node depends on the state.
				</li>
			</ul>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="stategraph-anatomy"
				alt="Three engraved brass nameplates — NODES (function boxes), EDGES (a connecting pipe with an arrow), and STATE (a cyan reservoir every node taps into)."
			/>
			<figcaption>Nodes do the work, edges wire them in order, and one shared state flows through all of them.</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A <Term t="LangGraph" /> isn't a clever way to call an <Term t="LLM" />. It's a
				<Term t="StateGraph" /> where one of the <Term t="Node">nodes</Term> happens to call a model —
				and that reframing is the whole point of the chapter.
			</p>
		</Slide>

		<Slide title="Building the chat–tool loop" variant="code-first">
			<p>
				Here's the smallest interesting graph: an <code>agent</code> node that calls the model and a
				<code>tools</code> node that runs whatever the model asked for. A
				<Term t="Conditional edge">conditional edge</Term> after <code>agent</code> decides whether to
				keep looping or finish.
			</p>
			<CodeBlock code={code} caption="The classic ReAct loop, hand-built from primitives." />
			<p>
				Level 1's <Term t="create_agent"><code>createAgent</code></Term> compiles to almost exactly
				this. Now you own the wiring — the same wiring you'll keep extending in every later lesson.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="stategraph-loop"
				alt="The AGENT and TOOLS modules wired in a loop, with a brass railway-switch (the conditional edge) choosing between looping for more tool calls or exiting to DONE."
			/>
			<figcaption>The back-edge from tools to agent is what turns a line into a loop; the switch decides when to leave it.</figcaption>
		</figure>

		<Slide title="Watch one super-step at a time">
			<p>
				Compiling a graph gives you back a <Term t="Runnable" />. As it
				<Term t="stream">streams</Term>, each <Term t="Superstep">super-step</Term> appends to the
				<code>messages</code> state — and the live graph on the right lights up the node that ran.
				<strong>Hover any node or edge</strong> to see, in plain language, what it does, the exact
				state it wrote, and the source behind it. Step back and forth, or click a node to jump there.
			</p>
		</Slide>

		<Slide title="Why this matters" ornament>
			<p>
				Every later lesson — <Term t="Conditional edge">conditional routing</Term>,
				<Term t="Reducer">reducers</Term>, <Term t="Checkpointer">checkpointers</Term>,
				<Term t="Interrupt">interrupts</Term>, <Term t="streamMode">streaming modes</Term>,
				<Term t="Fan-out">fan-out</Term>, <Term t="Subgraph">subgraphs</Term> — is a property of
				<em>this</em> shape. Once you can read the graph, the rest of Level 2 is a series of features
				bolted onto the same skeleton.
			</p>
		</Slide>

		<ReadMore
			links={[
				{ label: 'StateGraph — low-level concepts', href: 'https://langchain-ai.github.io/langgraphjs/concepts/low_level/', kind: 'docs' },
				{ label: 'MessagesAnnotation & the messages reducer', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/define-state/', kind: 'docs' },
				{ label: 'Prebuilt ToolNode', href: 'https://langchain-ai.github.io/langgraphjs/how-tos/tool-calling/', kind: 'api' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="The question to answer" subtitle="real model, real tool calls — pick a scenario and run the loop">
			<div class="modes" role="radiogroup" aria-label="Scenario">
				<label class:selected={mode === 'simple'}>
					<input type="radio" bind:group={mode} value="simple" disabled={running} />
					<span>Single tool, single hop</span>
					<small>One weather call, one final sentence.</small>
				</label>
				<label class:selected={mode === 'multi'}>
					<input type="radio" bind:group={mode} value="multi" disabled={running} />
					<span>Two hops</span>
					<small>Weather, then a calculator — the loop runs twice.</small>
				</label>
			</div>
			<div class="prompt-row">
				<span class="lbl">Prompt</span>
				<code>{userInput}</code>
			</div>
			<RunButton onclick={runDemo} {running} label="Run graph" />
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if frames.length}
			<Panel title="The graph, live" subtitle="hover any node or labelled edge to inspect what it does">
				<LiveGraph
					nodes={graphNodes}
					edges={graphEdges}
					{frames}
					bind:frameIdx
					meta={nodeMeta}
					edgeDetails={EDGE_DETAIL}
					{describe}
					{toState}
				/>
			</Panel>

			{#if final}
				<Panel title="Messages" subtitle="the shared state — every step appended a message">
					<MessageStream messages={final.messages} compact />
				</Panel>
			{/if}
		{/if}
	{/snippet}
</Lesson>

<style>
	/* In-narrative diagrams: frameless, full column width. */
	.diagram {
		margin: 1.8rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}

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
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-weight: 500;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-fg-muted);
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
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}
	.prompt-row code {
		font-size: 0.84rem;
		color: var(--color-fg);
		font-family: var(--font-mono);
	}
	.err {
		margin-top: 0.6rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}
</style>
