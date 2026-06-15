<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentInspector from '$lib/components/AgentInspector.svelte';
	import AgentGraph from '$lib/components/AgentGraph.svelte';
	import Toolbox from '$lib/components/Toolbox.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import {
		serializeMessages,
		deserializeMessages,
		type SerializedMessage
	} from '$lib/runtime/messages';
	import {
		runAgentScenario,
		agentToolSpecs,
		DEFAULT_SYSTEM_PROMPT,
		DEFAULT_USER_PROMPTS
	} from '$lib/demos/agent-react';
	import agentSrc from '$lib/demos/agent-react.ts?raw';
	import toolsSrc from '$lib/runtime/tools/index.ts?raw';
	import createAgentSkill from '$lib/demos/skills/create-agent.md?raw';
	import type { DemoStep } from '$lib/demos/types';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'agent',
		title: 'createAgent',
		summary:
			'A real createAgent ReAct loop, streamed node-by-node, over two scenarios — with a live graph of the loop.',
		entries: [{ path: 'lib/demos/agent-react.ts', code: agentSrc }],
		runner: `import {
  runAgentScenario,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPTS
} from './lib/demos/agent-react';

const log = (s) => console.log('  ·', s.label, s.detail ? '— ' + s.detail : '');

const { messages, path } = await runAgentScenario(
  DEFAULT_SYSTEM_PROMPT,      // the agent's standing instructions — edit to steer it
  DEFAULT_USER_PROMPTS.multi, // the question you ask — try your own
  () => {},
  (p, active) => console.log('  → path:', p.join(' → '), '(active: ' + active + ')'),
  log
);
console.log('\\nNode path:', path.join(' → '));
console.log('Final:', messages.at(-1)?.content);
`,
		skill: createAgentSkill
	};

	type ScenarioPayload = {
		mode: 'weather' | 'multi';
		messages: SerializedMessage[];
		path: string[];
		steps: DemoStep[];
	};

	let mode = $state<'weather' | 'multi'>('multi');
	let systemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
	// Each mode keeps its own editable question, seeded from the defaults.
	let userPrompts = $state({ ...DEFAULT_USER_PROMPTS });
	const userPrompt = $derived(userPrompts[mode]);
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);

	// Cache key varies with the prompts so editing either triggers a fresh run; the
	// untouched defaults keep the original key (their cached runs still load on mount).
	function hashStr(s: string): string {
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
		return (h >>> 0).toString(36);
	}
	const demoId = $derived.by(() => {
		const sysDefault = systemPrompt.trim() === DEFAULT_SYSTEM_PROMPT.trim();
		const userDefault = userPrompt.trim() === DEFAULT_USER_PROMPTS[mode].trim();
		if (sysDefault && userDefault) return `l1-agent-${mode}`;
		return `l1-agent-${mode}-${hashStr(systemPrompt.trim() + ' ' + userPrompt.trim())}`;
	});

	// Pull each tool's real `tool(...)` definition out of the source verbatim, so the
	// toolbox can reveal exactly how it's implemented (the same file the demo bundles).
	function toolSource(exportName: string): string {
		const start = toolsSrc.indexOf(`export const ${exportName} = tool(`);
		if (start === -1) return '';
		const rest = toolsSrc.slice(start);
		const end = rest.indexOf('\n);');
		return (end === -1 ? rest : rest.slice(0, end + 3)).trim();
	}
	const toolboxTools = agentToolSpecs.map((t) => ({
		name: t.name,
		description: t.description,
		params: t.params,
		code: toolSource(t.exportName)
	}));

	// The createAgent loop, laid out for the live graph. ids match the real node
	// names the agent streams (model_request, tools) so the path lights them up.
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 110, cy: 30, w: 86, h: 30, shape: 'pill' as const },
		{
			id: 'model_request',
			label: 'Model',
			sub: 'calls the LLM',
			cx: 110,
			cy: 120,
			w: 132,
			h: 56,
			shape: 'box' as const
		},
		{
			id: 'tools',
			label: 'Tools',
			sub: 'runs tool calls',
			cx: 300,
			cy: 120,
			w: 132,
			h: 56,
			shape: 'box' as const
		},
		{ id: '__end__', label: 'END', cx: 110, cy: 226, w: 86, h: 30, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'model_request' },
		// The two loop arrows: lifted apart (top up, bottom down) so they don't share endpoints.
		{ from: 'model_request', to: 'tools', bow: -14, lift: -15, label: 'tool calls', labelDy: -20 },
		{ from: 'tools', to: 'model_request', bow: -14, lift: 15, label: 'observation', labelDy: 20 },
		{ from: 'model_request', to: '__end__', label: 'answer' }
	];
	const nodeLabel: Record<string, string> = {
		__start__: 'Start',
		model_request: 'Model',
		tools: 'Tools',
		__end__: 'End'
	};

	// ── Playback: split the finished run into frames you can step through ──────
	// Each frame = one node firing, tagged with how many messages exist by then.
	const frames = $derived.by(() => {
		const out: { node: string; msgEnd: number }[] = [];
		if (!messages.length) return out;
		out.push({ node: '__start__', msgEnd: 1 }); // the human turn
		let i = 1;
		while (i < messages.length) {
			const m = messages[i];
			if (m instanceof ToolMessage) {
				let j = i;
				while (j < messages.length && messages[j] instanceof ToolMessage) j++;
				out.push({ node: 'tools', msgEnd: j });
				i = j;
			} else if (m instanceof AIMessage) {
				if (m.tool_calls?.length) {
					// A tool-calling turn — show the model's decision at this step.
					out.push({ node: 'model_request', msgEnd: i + 1 });
				} else {
					// The final answer: an "observation" model step that does NOT yet
					// reveal the answer, then the END step where the answer appears.
					out.push({ node: 'model_request', msgEnd: i });
					out.push({ node: '__end__', msgEnd: i + 1 });
				}
				i++;
			} else {
				i++;
			}
		}
		return out;
	});

	// Follow the latest frame as a run streams; Prev/Next can override it (a
	// writable $derived keeps the manual value until `frames` next changes).
	let frame = $derived(Math.max(0, frames.length - 1));

	const curFrame = $derived(frames[Math.min(frame, frames.length - 1)]);
	const displayMessages = $derived(curFrame ? messages.slice(0, curFrame.msgEnd) : []);
	const graphActive = $derived(curFrame?.node);
	const graphPath = $derived(frames.slice(0, frame + 1).map((f) => f.node));
	const stepLabel = $derived(
		frames.length ? `Step ${frame + 1} / ${frames.length} · ${nodeLabel[curFrame?.node ?? ''] ?? ''}` : ''
	);

	async function runScenario() {
		running = true;
		messages = [];
		const modeForRun = mode;
		const sysForRun = systemPrompt;
		const userForRun = userPrompt;
		const idForRun = demoId;
		try {
			const out = await withRunCache<ScenarioPayload>(
				{ demoId: idForRun },
				async () => {
					const collected: DemoStep[] = [];
					const res = await runAgentScenario(
						sysForRun,
						userForRun,
						(m) => (messages = m),
						() => {},
						(s) => collected.push(s)
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
		} finally {
			running = false;
		}
	}

	onMount(async () => {
		const cached = await loadCachedRun<ScenarioPayload>({ demoId });
		if (cached) messages = deserializeMessages(cached.payload.messages);
	});

	const codeBasic = `import { createAgent } from 'langchain';

// The standard v1 agent: a model, some tools, and instructions. It compiles a
// ReAct loop onto a LangGraph and is ready to invoke or stream.
const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',  // a "provider:model" string, or a model instance
  tools: [getWeather, calculator],
  systemPrompt: 'You are a concise assistant. Use tools when they help.'
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }]
});
result.messages.at(-1)?.content; // the final answer`;

	const codeStream = `// Stream node-by-node — each chunk is one node firing in the loop.
for await (const step of await agent.stream(
  { messages: [{ role: 'user', content: 'Compare Tokyo and London.' }] },
  { streamMode: 'updates' }
)) {
  console.log(Object.keys(step)); // ['model_request'] → ['tools'] → ['model_request'] → …
}`;

	const configItems = [
		{
			title: 'model',
			meta: 'string or instance',
			body: 'A "provider:model" string like "anthropic:claude-haiku-4-5" (createAgent builds the client), or a chat-model instance you configured yourself.'
		},
		{
			title: 'tools',
			meta: 'the toolbox',
			body: 'The array of tool()s the agent may call. Their names + descriptions are how the model decides what to reach for — write them well (see the Tools lesson).'
		},
		{
			title: 'systemPrompt',
			meta: 'standing instructions',
			body: "The agent's persistent instructions — its role, its rules, when to use which tool. The single highest-leverage thing you control."
		},
		{
			title: 'responseFormat',
			meta: 'typed output',
			body: 'Pass a Zod schema and the agent returns validated structured output instead of free text — the structured-output lesson, applied to a whole agent.'
		},
		{
			title: 'middleware',
			meta: 'hooks · next lesson',
			body: 'Functions that run before/around/after the model and tool steps — approval gates, logging, retries, summarising long histories. The main lever for production agents, and the subject of the next lesson.'
		},
		{
			title: 'checkpointer',
			meta: 'memory · Level 2',
			body: 'Persistence so the agent can pause and resume a conversation across turns. You wire this up properly in LangGraph (Level 2).'
		}
	];
</script>

<Lesson
	title="createAgent"
	eyebrow="Level 1 · Lesson 05"
	hero={{
		id: 'l1-agent',
		alt: 'A brass automaton at a desk, deciding among a row of tools, wired into a loop'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="create_agent"><code>createAgent</code></Term> is how most people actually use
		<Term t="LangChain" /> today: hand it a <Term t="Model">model</Term>, some
		<Term t="tool">tools</Term>, and instructions, and it compiles the
		<Term t="ReAct">ReAct</Term> loop for you — the model reasons, calls tools, reads the
		results, and keeps going until it can answer.
	{/snippet}

	{#snippet intro()}
		<p>
			You've built the pieces — <Term t="Chain">chains</Term>, <Term t="stream">streaming</Term>,
			<Term t="Structured output">structured output</Term>, and the <Term t="Agent loop">tool loop</Term>
			by hand. <Term t="create_agent"><code>createAgent</code></Term> packages that loop into one call:
			the standard, production-ready <Term t="Agent">agent</Term> in <Term t="LangChain" /> v1. It runs
			on <Term t="LangGraph" />, which is exactly what the next level opens up.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="A loop with a brain in it" variant="dropcap">
			<p>
				Every earlier lesson gave the <Term t="Model">model</Term> a single turn: prompt in, response
				out. Real assistants don't work that way. They look at what they have, take a small action,
				look again, and decide whether to continue or stop. The <Term t="ReAct" /> loop — reason, then
				act — is the smallest control flow that makes that posture possible.
			</p>
			<p>
				What's striking is how little it takes: a <Term t="Model">model</Term>, a list of
				<Term t="tool">tools</Term>, and a loop that runs the tools the model asks for and feeds the
				results back. You wrote that loop by hand last lesson; <code>createAgent</code> is the same
				loop, compiled and battle-tested, in one function.
			</p>
		</Slide>

		<Slide title="The smallest real agent" variant="code-first">
			<p>
				Give <Term t="create_agent"><code>createAgent</code></Term> a model, tools, and a
				<Term t="systemPrompt">system prompt</Term>. You get back something you can
				<Term t="invoke">invoke</Term> (run the whole loop, get the final answer) or
				<Term t="stream">stream</Term> (watch it think).
			</p>
			<CodeBlock code={codeBasic} lang="ts" caption="A model, some tools, instructions — that's an agent." />
		</Slide>

		<figure class="poster">
			<HeroImage
				id="react-loop-poster"
				alt="The ReAct loop: the model reasons and emits tool calls, the tools run, results feed back, repeat until the model answers"
			/>
			<figcaption>
				The <Term t="ReAct" /> loop: <strong>reason</strong> → <strong>act</strong> → read the result →
				reason again, until the answer is ready.
			</figcaption>
		</figure>

		<Slide title="Watch it think: streaming the loop" variant="code-first">
			<p>
				Stream the agent and each chunk is one <Term t="Node">node</Term> firing. <Term t="streamMode"
					><code>streamMode</code></Term
				> picks the granularity: <code>'updates'</code> (one chunk per node — best for seeing the loop),
				<code>'messages'</code> (token-by-token), or <code>'values'</code> (the whole state each step).
				The demo streams with <code>'updates'</code>, which is what drives the live graph.
			</p>
			<CodeBlock code={codeStream} lang="ts" caption="streamMode: 'updates' — one chunk per node." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				An <Term t="Agent">agent</Term> is not a smarter <Term t="LLM" />. It's the smallest loop that
				lets a <Term t="Model">model</Term> use the world between turns.
			</p>
		</Slide>

		<Slide title="It's already a graph">
			<p>
				<code>createAgent</code> compiles to a <Term t="LangGraph" />
				<Term t="StateGraph">StateGraph</Term> with two <Term t="Node">nodes</Term> —
				<code>model_request</code> (calls the model) and <code>tools</code> (runs the tool calls) —
				joined by a <Term t="Conditional edge">conditional edge</Term>: if the model asked for tools,
				go run them and loop back; otherwise, end. That's why the live graph cycles
				<code>model_request → tools → model_request → __end__</code>. Owning that graph yourself is all
				of <a href="/2-langgraph">Level 2</a>.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="create-agent-anatomy"
				alt="createAgent takes a model, tools, and a system prompt and compiles them into a two-node LangGraph: model_request and tools, with a conditional loop"
			/>
			<figcaption>
				<code>createAgent(&#123; model, tools, systemPrompt &#125;)</code> compiles down to this graph.
			</figcaption>
		</figure>

		<Accordion items={configItems} heading="What you can configure" />

		<Slide title="Where this goes next">
			<p>
				Two doors open from here. <strong>Middleware</strong> (the next lesson) lets you slot behavior
				into the loop — before the model, around a tool call, after the answer — for approval gates,
				logging, and trimming long histories. And <a href="/2-langgraph"><Term t="LangGraph" /></a> lets
				you build the graph by hand when the loop needs to branch, persist, or pause for a human. Most
				real <Term t="LangChain" /> work today is a <code>createAgent</code> with a few well-chosen
				tools and a middleware or two.
			</p>
		</Slide>

		<Slide ornament>
			<p>Model · Tools · Loop. The rest is detail.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Agents — concepts',
					href: 'https://docs.langchain.com/oss/javascript/langchain/agents',
					kind: 'docs'
				},
				{
					label: 'How-to: createAgent',
					href: 'https://docs.langchain.com/oss/javascript/langchain/quickstart',
					kind: 'docs'
				},
				{
					label: 'API · createAgent',
					href: 'https://api.js.langchain.com/functions/langchain.createAgent.html',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="a real ReAct loop, run then replayed">
			<ol class="howto">
				<li>
					<strong>Pick a scenario.</strong> Choose <em>Single tool</em> (one weather lookup) or
					<em>Parallel + follow-up</em> (two lookups, then a calculation), tweak the
					<code>systemPrompt</code> or user message, and hit <strong>Run the agent</strong>.
				</li>
				<li>
					<strong>Watch the graph cycle.</strong> The live graph lights up
					<code>model_request → tools → model_request → __end__</code> as the loop runs — the same two
					nodes <code>createAgent</code> compiles for you.
				</li>
				<li>
					<strong>Step through it.</strong> Use <strong>‹ Prev</strong> / <strong>Next ›</strong> to
					replay node by node; <em>What happened</em> reveals exactly what the model saw and decided at
					each step.
				</li>
			</ol>
		</Panel>

		<Panel title="The loop, live" subtitle="run it, then step through node by node">
			<Toolbox tools={toolboxTools} />
			<label class="prompt-field">
				<span class="pf-label">
					<code>systemPrompt</code>
					<small>the agent's standing instructions — edit and re-run</small>
				</span>
				<textarea
					bind:value={systemPrompt}
					rows="3"
					spellcheck="false"
					disabled={running}
				></textarea>
			</label>
			<div class="modes">
				<label class:selected={mode === 'weather'}>
					<input type="radio" bind:group={mode} value="weather" />
					<span>Single tool</span>
					<small>One weather lookup, one answer.</small>
				</label>
				<label class:selected={mode === 'multi'}>
					<input type="radio" bind:group={mode} value="multi" />
					<span>Parallel + follow-up</span>
					<small>Two weather calls, then a calculation.</small>
				</label>
			</div>
			<label class="prompt-field">
				<span class="pf-label">
					<code>user message</code>
					<small>the question you ask — edit it, then run</small>
				</span>
				<textarea
					bind:value={userPrompts[mode]}
					rows="2"
					spellcheck="false"
					disabled={running}
				></textarea>
			</label>
			<RunButton onclick={runScenario} running={running} label="Run the agent" />

			<div class="graph-wrap">
				<AgentGraph nodes={graphNodes} edges={graphEdges} activeNode={graphActive} path={graphPath} />
			</div>

			{#if frames.length > 1}
				<div class="playback">
					<button
						class="pb"
						onclick={() => (frame = Math.max(0, frame - 1))}
						disabled={frame <= 0}
						aria-label="Previous step">‹ Prev</button
					>
					<span class="pb-label">{stepLabel}</span>
					<button
						class="pb"
						onclick={() => (frame = Math.min(frames.length - 1, frame + 1))}
						disabled={frame >= frames.length - 1}
						aria-label="Next step">Next ›</button
					>
				</div>
			{/if}
		</Panel>

		<Panel title="What happened" subtitle="the answer, and how it got there">
			{#if displayMessages.length}
				<AgentInspector messages={displayMessages} />
			{:else}
				<p class="hint">Run the agent to watch the loop, then step through it.</p>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.howto {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.howto strong {
		color: var(--color-fg);
	}

	/* Editable prompts that actually feed the agent. The textareas inherit the
	   demo-pane's gradient surface — we only style the label and full width here. */
	.prompt-field {
		display: block;
		margin-bottom: 0.85rem;
	}
	.pf-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		flex-wrap: wrap;
	}
	.pf-label code {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--accent);
	}
	.pf-label small {
		font-size: 0.74rem;
		color: var(--color-ink-300);
	}
	.prompt-field textarea {
		width: 100%;
		box-sizing: border-box;
	}
	.prompt-field textarea:disabled {
		opacity: 0.55;
		cursor: not-allowed;
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
		border-radius: 0.5rem;
		background: var(--color-paper);
		cursor: pointer;
		color: var(--color-ink-100);
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.modes label:hover {
		border-color: var(--accent-rule);
	}
	.modes label.selected {
		border-color: var(--accent);
		color: var(--accent);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-weight: 500;
		font-size: 0.88rem;
	}
	.modes small {
		font-size: 0.76rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}

	.graph-wrap {
		margin-top: 0.9rem;
	}

	/* Playback scrubber for stepping through a finished run. */
	.playback {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		margin-top: 0.6rem;
	}
	.pb {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.3rem 0.7rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-ink-100);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.pb:hover:not(:disabled) {
		border-color: var(--accent-rule);
		color: var(--accent);
	}
	.pb:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.pb-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-200);
		min-width: 10rem;
		text-align: center;
	}
	.hint {
		font-size: 0.86rem;
		color: var(--color-ink-300);
	}

	/* Posters in the book column. */
	.poster {
		margin: 2rem 0;
	}
	.poster :global(.hero) {
		display: block;
		height: auto;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
	}
	.poster :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
	}
	.poster figcaption {
		margin-top: 0.7rem;
		text-align: center;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-ink-300);
	}
	.poster figcaption :global(code) {
		font-family: var(--font-mono);
		font-size: 0.92em;
		color: var(--color-ink-100);
	}
</style>
