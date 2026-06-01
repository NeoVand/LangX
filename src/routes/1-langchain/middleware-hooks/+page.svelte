<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import Toolbox from '$lib/components/Toolbox.svelte';
	import AgentGraph from '$lib/components/AgentGraph.svelte';
	import AgentInspector from '$lib/components/AgentInspector.svelte';
	import ApprovalGate from '$lib/components/ApprovalGate.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import {
		serializeMessages,
		deserializeMessages,
		type SerializedMessage
	} from '$lib/runtime/messages';
	import {
		startSupportAgent,
		resolveDecision,
		hitlToolSpecs,
		DEFAULT_SYSTEM_PROMPT,
		DEFAULT_USER_PROMPT,
		type PendingAction,
		type ReviewDecision
	} from '$lib/demos/middleware-hitl';
	import hitlSrc from '$lib/demos/middleware-hitl.ts?raw';
	import middlewareSkill from '$lib/demos/skills/middleware-hooks.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'middleware-hooks',
		title: 'Middleware & hooks',
		summary:
			'A real createAgent that pauses on a money-moving tool with humanInTheLoopMiddleware — approve, edit, or reject before it runs.',
		entries: [{ path: 'lib/demos/middleware-hitl.ts', code: hitlSrc }],
		runner: `import {
  startSupportAgent,
  resolveDecision,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT
} from './lib/demos/middleware-hitl';

// Run until the agent answers OR pauses on the gated refund tool.
const { messages, pending } = await startSupportAgent(DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT);

if (pending) {
  const action = pending[0];
  console.log('⏸ Agent wants to:', action.name, JSON.stringify(action.args));
  // A human decides — try { type: 'approve' }, an edit, or a reject:
  const done = await resolveDecision({ type: 'approve' });
  console.log('Final:', done.messages.at(-1)?.content);
} else {
  console.log('Final:', messages.at(-1)?.content);
}
`,
		skill: middlewareSkill
	};

	type Payload = { messages: SerializedMessage[] };

	let systemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
	let userPrompt = $state(DEFAULT_USER_PROMPT);
	let running = $state(false);
	let messages = $state<BaseMessage[]>([]);
	let pending = $state<PendingAction[] | null>(null);
	let error = $state('');

	// Extract each tool's real source from the demo module for the toolbox.
	function toolSource(exportName: string): string {
		const start = hitlSrc.indexOf(`export const ${exportName} = tool(`);
		if (start === -1) return '';
		const rest = hitlSrc.slice(start);
		const end = rest.indexOf('\n);');
		return (end === -1 ? rest : rest.slice(0, end + 3)).trim();
	}
	const toolboxTools = hitlToolSpecs.map((t) => ({
		name: t.name,
		description: t.description,
		params: t.params,
		gated: t.gated,
		code: toolSource(t.exportName)
	}));

	// ── Live graph: the same createAgent loop, paused at the gate ──────────────
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
			sub: 'gated by approval',
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
		{ from: 'model_request', to: 'tools', bow: -14, lift: -15, label: 'tool calls', labelDy: -20 },
		{ from: 'tools', to: 'model_request', bow: -14, lift: 15, label: 'observation', labelDy: 20 },
		{ from: 'model_request', to: '__end__', label: 'answer' }
	];

	// Visited nodes, derived from the message trail (start → model → tools → …).
	const graphPath = $derived.by(() => {
		const out: string[] = [];
		if (!messages.length) return out;
		out.push('__start__');
		let i = 1;
		while (i < messages.length) {
			const m = messages[i];
			if (m instanceof ToolMessage) {
				let j = i;
				while (j < messages.length && messages[j] instanceof ToolMessage) j++;
				out.push('tools');
				i = j;
			} else if (m instanceof AIMessage) {
				out.push('model_request');
				if (!m.tool_calls?.length) out.push('__end__');
				i++;
			} else {
				i++;
			}
		}
		return out;
	});
	const pausedNode = $derived(pending ? 'tools' : undefined);
	const graphActive = $derived(pending ? undefined : graphPath.at(-1));

	async function run() {
		running = true;
		error = '';
		messages = [];
		pending = null;
		try {
			const out = await startSupportAgent(systemPrompt, userPrompt);
			messages = out.messages;
			pending = out.pending;
			if (!pending) await save();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	async function decide(d: ReviewDecision) {
		running = true;
		error = '';
		try {
			const out = await resolveDecision(d);
			messages = out.messages;
			pending = out.pending;
			if (!pending) await save();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	// Persist the finished transcript so a returning learner sees the last run.
	async function save() {
		await withRunCache<Payload>({ demoId: 'l1-middleware-hitl' }, async () => ({
			messages: serializeMessages(messages)
		}));
	}

	onMount(async () => {
		const cached = await loadCachedRun<Payload>({ demoId: 'l1-middleware-hitl' });
		if (cached) messages = deserializeMessages(cached.payload.messages);
	});

	// ── Narrative code samples (accurate to LangChain v1) ──────────────────────
	const codeWrap = `import { createAgent, humanInTheLoopMiddleware } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';

const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
  tools: [lookupOrder, issueRefund],
  middleware: [
    humanInTheLoopMiddleware({
      // Pause before this tool; let the human approve / edit / reject.
      interruptOn: { issue_refund: { allowedDecisions: ['approve', 'edit', 'reject'] } }
    })
  ],
  checkpointer: new MemorySaver()   // holds the paused state between turns
});`;

	const codeHook = `import { createMiddleware } from 'langchain';

// Your own middleware is just a name + the hooks you care about.
const logging = createMiddleware({
  name: 'logging',
  beforeModel: (state) => console.log('→ model,', state.messages.length, 'messages'),
  afterModel:  (state) => console.log('← model,', state.messages.at(-1)?.content),
  wrapToolCall: async (request, handler) => {
    console.log('tool:', request.toolCall.name);
    return handler(request);   // call through — or short-circuit and return your own result
  }
});`;

	const codeResume = `import { Command } from '@langchain/langgraph';

const config = { configurable: { thread_id: 'support-42' } };
let result = await agent.invoke({ messages: [{ role: 'user', content }] }, config);

// A gated tool pauses the run — the result carries an interrupt instead of an answer.
if (result.__interrupt__) {
  const [action] = result.__interrupt__[0].value.actionRequests;
  showToHuman(action.name, action.args);          // e.g. issue_refund { amount: 149 }

  // Resume the SAME thread with the human's decision:
  result = await agent.invoke(
    new Command({ resume: { decisions: [{ type: 'approve' }] } }),
    config
  );
}`;

	const hookItems = [
		{
			title: 'beforeAgent',
			meta: 'once, at the start',
			body: 'Runs a single time before the loop begins — seed state, load a profile, set up a budget. Returns state updates or nothing.'
		},
		{
			title: 'beforeModel',
			meta: 'before each model call',
			body: 'Inspect or rewrite state right before the model runs. Can short-circuit the loop with jumpTo: "end" | "tools" | "model" — the basis of guardrails and early exits.'
		},
		{
			title: 'wrapModelCall',
			meta: 'around the model call',
			body: 'A wrapper that gets the request and a handler. Call handler(request) to proceed — or retry, cache, swap the model/tools/system prompt, or fall back to a backup. The basis of reliability middleware.'
		},
		{
			title: 'afterModel',
			meta: 'after each model reply',
			body: "Inspect or update state once the model has answered — log the reply, count tokens, flag content. Runs every loop iteration."
		},
		{
			title: 'wrapToolCall',
			meta: 'around each tool call',
			body: 'A wrapper around tool execution — authorize, monitor, intercept, or replace the result. Human-in-the-loop lives here: it pauses before the tool runs.'
		},
		{
			title: 'afterAgent',
			meta: 'once, at the end',
			body: 'Runs a single time after the loop finishes — final logging, cleanup, or a closing summary. Returns state updates or nothing.'
		}
	];

	const builtinItems = [
		{
			title: 'humanInTheLoopMiddleware',
			meta: 'approval gates',
			body: 'Pause before chosen tools and wait for an approve / edit / reject. The demo on the right. The backbone of any agent that can spend money or change data.'
		},
		{
			title: 'summarizationMiddleware',
			meta: 'context management',
			body: 'When the conversation nears the token budget, condense older turns into a summary so a long-running agent keeps its head. A core Deep Agents move.'
		},
		{
			title: 'piiMiddleware',
			meta: 'safety / compliance',
			body: 'Detect and redact / mask / block / hash sensitive data (email, credit card, IP…) on the way in or out — before the model or your logs ever see it.'
		},
		{
			title: 'modelFallbackMiddleware · toolRetryMiddleware',
			meta: 'reliability',
			body: 'Fall back to a backup model when the primary fails; retry flaky tools with exponential backoff. Production resilience as configuration.'
		},
		{
			title: 'modelCallLimitMiddleware · toolCallLimitMiddleware',
			meta: 'cost & loop guards',
			body: 'Cap how many model or tool calls a run (or a whole thread) may make — graceful stop or hard error. Cheap insurance against runaway loops.'
		},
		{
			title: 'llmToolSelectorMiddleware',
			meta: 'tool sprawl',
			body: 'Pre-filter a large toolbox down to the few tools relevant to the request before the main model sees them — fewer tokens, sharper choices.'
		},
		{
			title: 'todoListMiddleware',
			meta: 'planning · Deep Agents',
			body: 'Gives the agent a write_todos tool and a planning prompt so it can track a multi-step task. One of the pieces a Deep Agent is built from.'
		}
	];
</script>

<Lesson
	title="Middleware & hooks"
	eyebrow="Level 1 · Lesson 06"
	hero={{
		id: 'l1-middleware',
		alt: 'A brass pipeline carrying glowing fluid, with modular valve-units and before/after tap-spigots along it'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Once you have the <Term t="create_agent"><code>createAgent</code></Term> loop, you rarely want to
		fork it every time you need to log a call, redact a secret, cap the cost, or get a human's
		sign-off before something irreversible. <Term t="Middleware" /> lets you slot that behavior
		<em>into</em> the loop — as configuration, not a rewrite.
	{/snippet}

	{#snippet intro()}
		<p>
			A <Term t="Middleware" /> is a layer you wrap around the loop; a <Term t="Hooks">hook</Term> is
			a single point inside it where your code runs. Together they let you shape what the
			<Term t="Model" /> sees and what it's allowed to do without touching the core — the same mechanism
			Level 2's <Term t="LangGraph" /> and Level 3's <Term t="Deep Agent">Deep Agents</Term> are
			assembled from.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The idea" title="Wrap the loop, don't rewrite it" variant="dropcap">
			<p>
				Last lesson, <code>createAgent</code> compiled a <Term t="ReAct" /> loop for you: the
				<Term t="Model" /> reasons, calls <Term t="tool">tools</Term>, reads the results, repeats.
				<Term t="Middleware" /> is how you change what happens at each step of that loop without
				editing it — you pass a list of layers and the agent threads every model and tool call
				through them.
			</p>
			<CodeBlock
				code={codeWrap}
				lang="ts"
				caption="One config field — middleware — and the loop gains an approval gate."
			/>
		</Slide>

		<Slide title="Six places to tap in">
			<p>
				Each middleware can implement up to six <Term t="Hooks">hooks</Term> — handles onto the
				moments of the loop. Two kinds: <strong>node hooks</strong>
				(<code>beforeModel</code>, <code>afterModel</code>, …) read and update
				<Term t="State">state</Term>; <strong>wrap hooks</strong>
				(<code>wrapModelCall</code>, <code>wrapToolCall</code>) sit <em>around</em> a step and decide
				whether — and how — it runs. They compose like layers of an onion: the first middleware is the
				outermost wrapper.
			</p>
			<CodeBlock code={codeHook} lang="ts" caption="createMiddleware — a name plus the hooks you need." />
		</Slide>

		<Accordion items={hookItems} heading="The six hooks, in order" />

		<figure class="diagram">
			<HeroImage
				id="diagram-middleware-hooks"
				alt="A pipe from input to model to output with inline middleware valves and before/after hook taps"
			/>
			<figcaption>
				Middleware sits on the pipe; <Term t="Hooks">hooks</Term> are the taps before and after each step.
			</figcaption>
		</figure>

		<Slide eyebrow="The pattern that matters most" title="Put a human in the loop" variant="code-first">
			<p>
				Some actions you never want an <Term t="Agent">agent</Term> to take on its own — spend money,
				send mail, delete a record. <Term t="HITL">Human-in-the-loop</Term> middleware
				<Term t="interruptOn">gates</Term> those tools: when the model tries to call one, the
				<Term t="wrapToolCall"><code>wrapToolCall</code></Term> hook fires an
				<Term t="Interrupt">interrupt</Term> — the run <em>pauses</em>, its state saved by the
				<Term t="Checkpointer">checkpointer</Term>, and waits for a person.
			</p>
			<CodeBlock
				code={codeResume}
				lang="ts"
				caption="The run pauses, surfaces the proposed call, and resumes with the human's decision."
			/>
		</Slide>

		<Slide title="Approve, edit, or reject">
			<p>
				When the agent pauses, the human gets three moves. <strong>Approve</strong> runs the tool as
				proposed. <strong>Edit</strong> changes the arguments first — turn a full refund into a partial
				one. <strong>Reject</strong> skips the tool and sends a message back to the model instead, so
				it can change course. Each maps to one entry in the
				<Term t="Command"><code>Command({'{ resume }'})</code></Term> you send back. Try all three on
				the right.
			</p>
			<p class="aside">
				The live demo wires this gate as an explicit graph — a <code>model</code> step and a
				<code>tools</code> step that calls <Term t="Interrupt"><code>interrupt()</code></Term> before the
				gated tool — which is exactly what <code>humanInTheLoopMiddleware</code> builds for you. We run
				it directly here so the pause happens right in your browser.
			</p>
		</Slide>

		<Accordion items={builtinItems} heading="Middleware you don't have to write" />

		<Slide variant="pull-quote">
			<p>
				Middleware is where an agent stops being a clever demo and becomes something you'd let near a
				database.
			</p>
		</Slide>

		<Slide title="Where this goes: Deep Agents">
			<p>
				This is the seam the rest of the framework is built on. In <a href="/2-langgraph"
					><Term t="LangGraph" /></a
				> middleware becomes nodes around the model; a <Term t="Deep Agent" /> is little more than
				<code>createAgent</code> plus a stack of these — <Term t="todoListMiddleware">planning</Term>,
				a <Term t="Virtual filesystem">filesystem</Term>,
				<Term t="Summarization">summarization</Term>, <Term t="Subagent">subagents</Term>, and the
				same <Term t="HITL">approval gate</Term> you're about to use. Learn the shape here and those
				chapters read as "more of the same."
			</p>
		</Slide>

		<Slide ornament>
			<p>Wrap the loop. Tap the steps. Keep a human on the irreversible ones.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Middleware — overview',
					href: 'https://docs.langchain.com/oss/javascript/langchain/middleware',
					kind: 'docs'
				},
				{
					label: 'Custom middleware',
					href: 'https://docs.langchain.com/oss/javascript/langchain/middleware/custom',
					kind: 'docs'
				},
				{
					label: 'Prebuilt middleware',
					href: 'https://docs.langchain.com/oss/javascript/langchain/middleware/built-in',
					kind: 'docs'
				},
				{
					label: 'API · humanInTheLoopMiddleware',
					href: 'https://reference.langchain.com/javascript/langchain/index/humanInTheLoopMiddleware',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Approval gate, live" subtitle="the agent proposes; you decide">
			<Toolbox tools={toolboxTools} label="Toolbox" />
			<label class="prompt-field">
				<span class="pf-label">
					<code>systemPrompt</code>
					<small>the support agent's standing instructions</small>
				</span>
				<textarea bind:value={systemPrompt} rows="3" spellcheck="false" disabled={running}></textarea>
			</label>
			<label class="prompt-field">
				<span class="pf-label">
					<code>customer message</code>
					<small>what the customer asks — edit it, then run</small>
				</span>
				<textarea bind:value={userPrompt} rows="2" spellcheck="false" disabled={running}></textarea>
			</label>
			<RunButton onclick={run} {running} label="Run the agent" />

			{#if error}
				<p class="err">{error} — set a model in <a href="/setup">Setup</a>.</p>
			{/if}

			<div class="graph-wrap">
				<AgentGraph
					nodes={graphNodes}
					edges={graphEdges}
					activeNode={graphActive}
					{pausedNode}
					path={graphPath}
				/>
			</div>

			{#if pending}
				{#key pending}
					<ApprovalGate pending={pending[0]} busy={running} onDecision={decide} />
				{/key}
			{/if}
		</Panel>

		<Panel title="What happened" subtitle="the trail, and the decision you made">
			{#if messages.length}
				<AgentInspector {messages} />
			{:else}
				<p class="hint">Run the agent — it'll look up the order, then pause for your approval.</p>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 2rem 0;
	}
	.diagram :global(.hero) {
		aspect-ratio: 16 / 9;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
		text-align: center;
	}

	/* Editable prompts — inherit the demo-pane gradient surface. */
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

	.graph-wrap {
		margin-top: 0.9rem;
	}

	/* A quiet implementation note inside the narrative. */
	.aside {
		font-size: 0.86rem;
		color: var(--color-ink-300);
		border-left: 2px solid var(--accent-rule);
		padding-left: 0.8rem;
		margin-top: 0.9rem;
	}
	.aside :global(code) {
		font-family: var(--font-mono);
		font-size: 0.92em;
		color: var(--color-ink-200);
	}

	.err {
		color: var(--color-accent-warning);
		font-size: 0.84rem;
		margin: 0.6rem 0 0;
	}
	.hint {
		font-size: 0.86rem;
		color: var(--color-ink-300);
		margin: 0;
	}
</style>
