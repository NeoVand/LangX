<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { z } from 'zod';
	import { MockChatModel } from '$lib/runtime/llm/mock';

	const bugReportSchema = z.object({
		title: z.string().describe('Short, action-oriented summary.'),
		severity: z.enum(['low', 'medium', 'high', 'critical']),
		component: z.string(),
		stepsToReproduce: z.array(z.string()).max(5),
		expected: z.string(),
		actual: z.string()
	});

	const sentimentSchema = z.object({
		sentiment: z.enum(['positive', 'neutral', 'negative']),
		confidence: z.number().min(0).max(1),
		summary: z.string()
	});

	let bugInput = $state(
		'Customers say the export button on /reports does nothing the first time they click it but works on the second click. Happened after Friday\'s deploy.'
	);
	let bugRun = $state(false);
	let bugResult = $state<z.infer<typeof bugReportSchema> | null>(null);

	async function runBug() {
		bugRun = true;
		bugResult = null;
		try {
			const model = new MockChatModel({
				responses: [
					{
						content: '',
						toolCalls: [
							{
								name: 'extract',
								args: {
									title: 'Export button needs two clicks to fire',
									severity: 'medium',
									component: '/reports',
									stepsToReproduce: [
										'Open /reports',
										'Click "Export"',
										'Observe nothing happens',
										'Click again — works'
									],
									expected: 'A single click triggers the export.',
									actual: 'The first click is a no-op.'
								}
							}
						]
					}
				]
			});
			const structured = model.withStructuredOutput(bugReportSchema, { name: 'extract' });
			bugResult = await structured.invoke([
				{ role: 'system', content: 'Extract a bug report from the user message.' },
				{ role: 'user', content: bugInput }
			]);
		} finally {
			bugRun = false;
		}
	}

	let sentInput = $state('I\'ve been using LangChain for two days and I\'m blown away.');
	let sentRun = $state(false);
	let sentResult = $state<z.infer<typeof sentimentSchema> | null>(null);

	async function runSent() {
		sentRun = true;
		sentResult = null;
		try {
			const isPositive = /good|love|great|blown|awesome|amazing|wonderful/i.test(sentInput);
			const isNegative = /bad|hate|terrible|broken|awful/i.test(sentInput);
			const sentiment = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';
			const model = new MockChatModel({
				responses: [
					{
						content: '',
						toolCalls: [
							{
								name: 'classify',
								args: {
									sentiment,
									confidence: sentiment === 'neutral' ? 0.55 : 0.92,
									summary: `Detected ${sentiment} tone in user input.`
								}
							}
						]
					}
				]
			});
			const structured = model.withStructuredOutput(sentimentSchema, { name: 'classify' });
			sentResult = await structured.invoke(sentInput);
		} finally {
			sentRun = false;
		}
	}

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

<Lesson title="Structured output" eyebrow="Phase 1 · Lesson 03">
	{#snippet intro()}
		<p>
			Free-form text is easy for the model and miserable for the rest of your code. Schema-driven
			structured output makes the model emit JSON that matches a Zod schema you define, so the
			downstream code stays typed and predictable.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The problem">
			<p>
				Without a schema, you write parsers, regexes, and apologies. Every model upgrade
				changes the formatting in some subtle way and breaks them.
			</p>
		</Slide>

		<Slide title="withStructuredOutput">
			<p>
				LangChain's <code>withStructuredOutput</code> wraps a chat model so it returns a typed
				value instead of an <code>AIMessage</code>. Under the hood it uses the provider's
				tool-calling API to force the model into your schema.
			</p>
			<CodeBlock code={code} caption="Define once, get a typed function." />
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 extracts a structured bug report from a free-form support message. Demo 2
				classifies sentiment with confidence. Both schemas live in this very file — see how the
				inspector shows the raw model tool call alongside the parsed object.
			</p>
		</Slide>

		<Slide title="In production">
			<p>
				Use schemas for: ticket extraction, classification, function arguments, evaluator
				rubrics, structured agent plans, and any handoff between an LLM and the rest of your
				system. Pair with retries (<code>withRetry</code>) for robustness.
			</p>
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
		color: var(--color-fg-faint);
	}
	textarea,
	input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
		font-family: var(--font-sans);
		resize: vertical;
	}
	textarea:focus,
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
</style>
