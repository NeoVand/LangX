<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentInspector from '$lib/components/AgentInspector.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { type BaseMessage } from '@langchain/core/messages';
	import {
		serializeMessages,
		deserializeMessages,
		type SerializedMessage
	} from '$lib/runtime/messages';
	import { runDatabaseDemo, databaseToolSpecs } from '$lib/demos/tools-database';
	import databaseSrc from '$lib/demos/tools-database.ts?raw';
	import { runActionDemo, actionToolSpecs } from '$lib/demos/tools-actions';
	import actionsSrc from '$lib/demos/tools-actions.ts?raw';
	import loopSrc from '$lib/demos/tool-loop.ts?raw';
	import toolsSkill from '$lib/demos/skills/tools.md?raw';
	import type { DemoStep } from '$lib/demos/types';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'tools',
		title: 'Tools',
		summary:
			'Give a chat model typed tools and run the agent loop — model → tool_calls → ToolMessage → model — over a small database and a task list.',
		entries: [
			{ path: 'lib/demos/tool-loop.ts', code: loopSrc },
			{ path: 'lib/demos/tools-database.ts', code: databaseSrc },
			{ path: 'lib/demos/tools-actions.ts', code: actionsSrc }
		],
		runner: `import { runDatabaseDemo } from './lib/demos/tools-database';
import { runActionDemo } from './lib/demos/tools-actions';

const log = (s) => console.log('  ·', s.label, s.detail ? '— ' + s.detail : '');

console.log('=== Query a database ===');
const a = await runDatabaseDemo('How much has Ada Lovelace paid so far, and on what?', () => {}, log);
console.log('Final:', a.at(-1)?.content, '\\n');

console.log('=== Take an action ===');
const b = await runActionDemo('Add a high-priority task for Grace to fix the login bug by Friday, then show me Grace\\'s tasks.', () => {}, log);
console.log('Final:', b.at(-1)?.content);
`,
		skill: toolsSkill
	};

	type ConvoPayload = { messages: SerializedMessage[]; steps: DemoStep[] };

	// ── Demo 1 · query a database ────────────────────────────────────────────
	let dbQuestion = $state('How much has Ada Lovelace paid so far, and on what?');
	let dbRun = $state(false);
	let dbMessages = $state<BaseMessage[]>([]);

	async function runDb() {
		dbRun = true;
		dbMessages = [];
		try {
			const q = dbQuestion;
			const out = await withRunCache<ConvoPayload>({ demoId: 'l1-tools-database-2' }, async () => {
				const steps: DemoStep[] = [];
				const messages = await runDatabaseDemo(
					q,
					(m) => (dbMessages = m),
					(s) => steps.push(s)
				);
				return { messages: serializeMessages(messages), steps };
			});
			dbMessages = deserializeMessages(out.messages);
		} finally {
			dbRun = false;
		}
	}

	// ── Demo 2 · take an action ──────────────────────────────────────────────
	let actionRequest = $state(
		"Add a high-priority task for Grace to fix the login bug by Friday, then show me everything on Grace's plate."
	);
	let actionRun = $state(false);
	let actionMessages = $state<BaseMessage[]>([]);

	async function runAction() {
		actionRun = true;
		actionMessages = [];
		try {
			const r = actionRequest;
			const out = await withRunCache<ConvoPayload>({ demoId: 'l1-tools-actions-2' }, async () => {
				const steps: DemoStep[] = [];
				const messages = await runActionDemo(
					r,
					(m) => (actionMessages = m),
					(s) => steps.push(s)
				);
				return { messages: serializeMessages(messages), steps };
			});
			actionMessages = deserializeMessages(out.messages);
		} finally {
			actionRun = false;
		}
	}

	onMount(async () => {
		const cd = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-database-2' });
		if (cd) dbMessages = deserializeMessages(cd.payload.messages);
		const ca = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-actions-2' });
		if (ca) actionMessages = deserializeMessages(ca.payload.messages);
	});

	const codeTool = `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getOrders = tool(
  async ({ customerId, status }) => {
    const rows = db.orders.filter(
      o => o.customerId === customerId && (!status || o.status === status)
    );
    return JSON.stringify(rows);          // return text or an object to read
  },
  {
    name: 'get_orders',                   // snake_case — most reliable
    description: "Get a customer's orders by id, optionally filtered by status.",
    schema: z.object({
      customerId: z.number().describe('The id from find_customers.'),
      status: z.enum(['paid', 'pending', 'refunded']).optional()
    })
  }
);`;

	const codeLoop = `const model = (await getModel()).bindTools([findCustomers, getOrders]);

const messages = [systemMessage, humanMessage];
while (true) {
  const ai = await model.invoke(messages);        // 1. the model thinks
  messages.push(ai);
  if (!ai.tool_calls?.length) break;              // 2. no calls → it answered

  for (const tc of ai.tool_calls) {               // 3. run what it asked for
    const result = await byName[tc.name].invoke(tc.args);
    messages.push(new ToolMessage({               // 4. feed each result back,
      tool_call_id: tc.id, content: result        //    linked by tool_call_id
    }));
  }                                               // 5. loop — it sees the results
}`;

	const designTips = [
		{
			title: 'snake_case names',
			meta: 'get_weather',
			body: 'Name tools like get_weather, not "Get Weather" — snake_case is the most reliably parsed across providers, and a verb-noun name tells the model what it does at a glance.'
		},
		{
			title: 'The description is the manual',
			meta: 'how it picks',
			body: 'The model chooses a tool almost entirely from its description. Write it like docs for a new teammate: what it does, when to use it, what it returns. Vague descriptions are the #1 cause of a model ignoring or misusing a tool.'
		},
		{
			title: 'Narrow schemas + enums',
			meta: 'fewer bad calls',
			body: 'A z.enum closes the set of valid values so the model cannot invent one; a .describe() on each ambiguous field steers it. Tight schemas turn "the model sometimes gets it wrong" into "the call is valid or it does not happen".'
		},
		{
			title: 'Purpose-built beats raw SQL',
			meta: 'safer + easier',
			body: 'Two narrow tools (find_customers, get_orders) are safer and easier for the model than a free-form run_sql tool — you keep control of what it can touch, and the model just supplies arguments. Let it do the arithmetic from the rows you return.'
		},
		{
			title: 'Return only what it needs',
			meta: 'tokens + focus',
			body: 'Return concise JSON with just the fields the model will use. Trimming the rest saves tokens and keeps the model focused on the relevant data.'
		},
		{
			title: 'The system prompt sets the rules',
			meta: 'no inventing',
			body: 'Tell the model what data exists and to use the tools rather than guess — "never invent customers or numbers". A good system prompt is the difference between a reliable tool-user and a confident fabricator.'
		},
		{
			title: 'Cap the loop',
			meta: 'maxTurns',
			body: 'A maxTurns guard stops a runaway loop if the model keeps calling tools without converging. Six turns is plenty for most tasks.'
		}
	];
</script>

<Lesson
	title="Tools"
	eyebrow="Level 1 · Lesson 04"
	hero={{
		id: 'l1-tools',
		alt: 'A scholar reaches for a wall of pegboard tools'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Model">model</Term> that can call functions stops being a chat partner and becomes a
		<Term t="participant">participant</Term> in your system — it can look things up, query your
		data, and take actions. Every <Term t="Agent">agent</Term> in this course starts here, with
		<Term t="Tool calling">tool calling</Term>.
	{/snippet}

	{#snippet intro()}
		<p>
			A <Term t="tool" /> is a typed function you let the <Term t="Model">model</Term> call. You
			describe it with a <Term t="Zod" /> <Term t="Schema">schema</Term>; the model decides when to
			call it and with what arguments; your code runs it and hands the result back. Repeat that
			round-trip and you have the <Term t="Agent loop">agent loop</Term> — the engine under every
			agent you'll build.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From oracle to participant" variant="dropcap">
			<p>
				Early <Term t="LLM">language models</Term> were <Term t="oracle">oracles</Term>: you asked,
				they answered, and every real-world action happened elsewhere — written by you, plumbed by
				you, debugged by you. The model never touched anything.
			</p>
			<p>
				<Term t="Tool calling">Tool calling</Term> changes the relationship. You hand the model a
				small, typed toolbox and it decides, turn by turn, which tool to reach for. The oracle
				becomes a <Term t="participant">participant</Term>. This one capability is what turns "a
				thing that writes text" into "a thing that gets work done".
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="tools-poster"
				alt="A brass automaton at a workbench reaching for labelled tools on a pegboard — a database drawer, a calculator, a bell"
			/>
			<figcaption>
				Hand the <Term t="Model">model</Term> a small, typed toolbox and it stops describing work —
				it does it.
			</figcaption>
		</figure>

		<Slide title="Anatomy of a tool" variant="code-first">
			<p>
				The <Term t="tool"><code>tool()</code></Term> helper takes a function plus a name,
				description, and a <Term t="Schema">schema</Term>. The schema becomes the
				<Term t="JSON schema">JSON schema</Term> the model sees, and the name + description are how
				it decides to use the tool — so write them like documentation, not an afterthought.
			</p>
			<CodeBlock code={codeTool} lang="ts" caption="A typed, read-only database tool." />
		</Slide>

		<Slide title="The loop">
			<p>
				Bind tools with <Term t="bindTools"><code>model.bindTools([...])</code></Term> and the model
				can reply with <Term t="tool_calls"><code>tool_calls</code></Term> instead of an answer. You
				run each call, return its result as a <Term t="ToolMessage"><code>ToolMessage</code></Term>
				(matched by <Term t="tool_call_id">tool_call_id</Term>), and invoke again. The model sees the
				results and continues — until it has what it needs to answer.
			</p>
			<CodeBlock code={codeLoop} lang="ts" caption="The agent loop, in full — nothing hidden." />
		</Slide>

		<figure class="poster">
			<HeroImage
				id="tool-chaining"
				alt="An automaton looks up a customer by email to get a customer id, then uses that id to look up their orders — one tool's result feeding the next"
			/>
			<figcaption>
				The loop's real power: one <Term t="tool">tool</Term>'s result becomes the next call's
				input — chaining lookups until the answer falls out. (Demo 1 does exactly this.)
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A <Term t="tool">tool</Term>'s description is the smallest user manual you'll ever write —
				and the model reads it every single time it decides what to do.
			</p>
		</Slide>

		<Accordion items={designTips} heading="Designing tools that work" />

		<Slide title="Where this goes next">
			<p>
				The loop above is the whole mechanism — no magic. When you want retries, streaming, memory,
				or human approval, you graduate to <Term t="createAgent"><code>createAgent</code></Term>,
				which runs this exact loop for you, and in <a href="/2-langgraph"><Term t="LangGraph" /></a>
				you'll build it as a graph you can pause, branch, and inspect. Deep Agents layer planning and
				sub-agents on top. It's tool calling all the way down.
			</p>
		</Slide>

		<Slide ornament>
			<p>Typed in, typed out. The loop does the rest.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Tools — concepts',
					href: 'https://docs.langchain.com/oss/javascript/langchain/tools',
					kind: 'docs'
				},
				{
					label: 'How-to: tool calling',
					href: 'https://js.langchain.com/docs/how_to/tool_calling/',
					kind: 'docs'
				},
				{
					label: 'API · tool()',
					href: 'https://api.js.langchain.com/functions/_langchain_core.tools.tool-1.html',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Query a database" subtitle="two tables, two tools, one question">
			<label class="row">
				<span>Ask about the store (customers + orders)</span>
				<textarea bind:value={dbQuestion} rows="2"></textarea>
			</label>
			<RunButton onclick={runDb} running={dbRun} label="Ask the database" />
			{#if dbMessages.length}
				<div class="inspect">
					<div class="inspect-label">Inspect · the agent loop</div>
					<AgentInspector messages={dbMessages} tools={databaseToolSpecs} />
				</div>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Take an action" subtitle="tools that change state, not just read it">
			<label class="row">
				<span>Tell the team assistant what to do</span>
				<textarea bind:value={actionRequest} rows="2"></textarea>
			</label>
			<RunButton onclick={runAction} running={actionRun} label="Run the assistant" />
			{#if actionMessages.length}
				<div class="inspect">
					<div class="inspect-label">Inspect · the agent loop</div>
					<AgentInspector messages={actionMessages} tools={actionToolSpecs} />
				</div>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	textarea {
		font-family: var(--font-sans);
		resize: vertical;
		width: 100%;
	}

	/* Poster in the book column. */
	.poster {
		margin: 2rem auto;
		max-width: 30rem;
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

	.inspect {
		margin-top: 0.95rem;
	}
	.inspect-label {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		margin-bottom: 0.45rem;
	}
</style>
