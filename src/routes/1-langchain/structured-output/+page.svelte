<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		extractBugReport,
		classifySentiment,
		type BugReport,
		type Sentiment
	} from '$lib/demos/structured-output';
	import structuredSrc from '$lib/demos/structured-output.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'structured-output',
		title: 'Structured output',
		summary: 'Force a chat model to return JSON that matches a Zod schema with withStructuredOutput.',
		entries: [{ path: 'lib/demos/structured-output.ts', code: structuredSrc }],
		runner: `import { extractBugReport, classifySentiment } from './lib/demos/structured-output';

console.log('=== Bug report extraction ===');
const bug = await extractBugReport(
	"The export button on /reports does nothing the first click but works the second."
);
console.log(bug, '\\n');

console.log('=== Sentiment classifier ===');
const sentiment = await classifySentiment("I've been using LangChain for two days and I'm blown away.");
console.log(sentiment);
`
	};

	let bugInput = $state(
		"Customers say the export button on /reports does nothing the first time they click it but works on the second click. Happened after Friday's deploy."
	);
	let bugRun = $state(false);
	let bugResult = $state<BugReport | null>(null);

	async function runBug() {
		bugRun = true;
		bugResult = null;
		try {
			const inputForRun = bugInput;
			bugResult = await withRunCache<BugReport>(
				{ demoId: 'l1-structured-bug' },
				async () => await extractBugReport(inputForRun)
			);
		} finally {
			bugRun = false;
		}
	}

	let sentInput = $state("I've been using LangChain for two days and I'm blown away.");
	let sentRun = $state(false);
	let sentResult = $state<Sentiment | null>(null);

	async function runSent() {
		sentRun = true;
		sentResult = null;
		try {
			const inputForRun = sentInput;
			sentResult = await withRunCache<Sentiment>(
				{ demoId: 'l1-structured-sentiment' },
				async () => await classifySentiment(inputForRun)
			);
		} finally {
			sentRun = false;
		}
	}

	onMount(async () => {
		const cb = await loadCachedRun<BugReport>({ demoId: 'l1-structured-bug' });
		if (cb) bugResult = cb.payload;
		const cs = await loadCachedRun<Sentiment>({ demoId: 'l1-structured-sentiment' });
		if (cs) sentResult = cs.payload;
	});

	const code = `import { z } from 'zod';

const BugReport = z.object({
  title: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  component: z.string(),
  stepsToReproduce: z.array(z.string()).max(5),
  expected: z.string(),
  actual: z.string()
});

// withStructuredOutput uses tool calling under the hood
// to force the model into the schema's shape.
const extractor = model.withStructuredOutput(BugReport, { name: 'extract' });

const report = await extractor.invoke([
  { role: 'system', content: 'Extract a bug report.' },
  { role: 'user', content: rawText }
]);

// report is fully typed as z.infer<typeof BugReport>.`;
</script>

<Lesson
	title="Structured output"
	eyebrow="Phase 1 · Lesson 03"
	motivation="Models speak prose; software speaks types. Structured output is the bridge — and Zod gives you guarantees the model alone cannot."
	hero={{
		id: 'l1-structured-output',
		alt: "A printer's typecase with hand-set metal type"
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			Free-form text is easy for the model and miserable for the rest of your code.
			Schema-driven structured output makes the model emit JSON that matches a Zod schema you
			define, so the downstream code stays typed and predictable.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From prose to type" variant="dropcap">
			<p>
				A model is most natural when it writes paragraphs; a program is most natural when it
				reads records. Between them is a thin border crossing where data has to switch
				languages, and every shaky regex you have ever written has lived along that border.
			</p>
			<p>
				The newer idea is to skip the border altogether. You hand the model a <Term
					t="schema"
				/> — a precise description of the record you want — and the provider's tool-calling
				API forces the response into that shape. The model no longer narrates a result; it
				produces one.
			</p>
		</Slide>

		<Slide title="withStructuredOutput" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="Define once, get a typed function." />
			<p>
				LangChain's <code>withStructuredOutput</code> wraps a chat model so it returns a typed
				value instead of an <code>AIMessage</code>. Under the hood it registers your Zod
				schema as a tool and asks the model to fill it.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A schema is a contract the model has to sign before it speaks — and the contract is
				written in your type system, not its.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 extracts a structured bug report from a free-form support message. Demo 2
				classifies sentiment with a confidence number. Both schemas live in this very file
				— the inspector shows you the parsed object as the model returns it.
			</p>
		</Slide>

		<Slide title="In production">
			<p>
				Use schemas for: ticket extraction, classification, function arguments, evaluator
				rubrics, structured agent plans, and any handoff between an LLM and the rest of your
				system. Pair with retries (<code>withRetry</code>) for robustness, and prefer narrow
				enums over open strings whenever you can.
			</p>
		</Slide>

		<Slide ornament>
			<p>Type the boundary. The model will meet you there.</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Bug report extraction" subtitle="enum + array + max(5) constraints">
			<label class="row">
				<span>Free-form input</span>
				<textarea bind:value={bugInput} rows="3"></textarea>
			</label>
			<RunButton onclick={runBug} running={bugRun} />
			{#if bugResult}
				<StateInspector state={bugResult} title="Parsed BugReport" />
			{/if}
		</Panel>

		<Panel title="Demo 2 · Sentiment classifier" subtitle="enum + confidence number">
			<label class="row">
				<span>Comment</span>
				<input type="text" bind:value={sentInput} />
			</label>
			<RunButton onclick={runSent} running={sentRun} />
			{#if sentResult}
				<StateInspector state={sentResult} title="Parsed Sentiment" />
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
	textarea,
	input {
		font-family: var(--font-sans);
		resize: vertical;
	}
</style>
