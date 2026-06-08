<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import SchemaForm from '$lib/components/SchemaForm.svelte';
	import TokenPills from '$lib/components/TokenPills.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		extractEvent,
		compareExtraction,
		eventFields,
		reviewFields
	} from '$lib/demos/structured-output';
	import structuredSrc from '$lib/demos/structured-output.ts?raw';
	import structuredSkill from '$lib/demos/skills/structured-output.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'structured-output',
		title: 'Structured output',
		summary:
			'Make a model return a validated, typed object with withStructuredOutput + a Zod schema — instead of asking for JSON and parsing it by hand.',
		entries: [{ path: 'lib/demos/structured-output.ts', code: structuredSrc }],
		runner: `import { extractEvent, compareExtraction } from './lib/demos/structured-output';

console.log('=== Prose → a typed event ===');
const ev = await extractEvent('Lunch with Sam and Priya on March 14 at 12:30 — about 90 minutes, at Café Roma.');
console.log(ev.value);
if (ev.tool) console.log('via tool call:', ev.tool.name);

console.log('\\n=== Ask for JSON vs withStructuredOutput ===');
const cmp = await compareExtraction("Battery life is incredible and it's gorgeous, but the app crashes constantly. Not sure I'd tell a friend to buy it.");
console.log('plain (a string you must parse):\\n' + cmp.plain.raw);
console.log('\\nstructured (a validated object):', cmp.structured);
`,
		skill: structuredSkill
	};

	// ── Demo 1 · prose → typed event ─────────────────────────────────────────
	type EventPayload = Awaited<ReturnType<typeof extractEvent>>;
	let eventInput = $state(
		'Lunch with Sam and Priya on March 14 at 12:30 — about 90 minutes, at Café Roma.'
	);
	let eventRun = $state(false);
	let eventResult = $state<EventPayload | null>(null);

	async function runEvent() {
		eventRun = true;
		eventResult = null;
		try {
			const input = eventInput;
			eventResult = await withRunCache<EventPayload>(
				{ demoId: 'l1-structured-event' },
				async () => await extractEvent(input)
			);
		} finally {
			eventRun = false;
		}
	}

	// ── Demo 2 · ask-for-JSON vs withStructuredOutput ────────────────────────
	type ComparePayload = Awaited<ReturnType<typeof compareExtraction>>;
	let reviewInput = $state(
		"Battery life is incredible and it's gorgeous, but the app crashes constantly. Honestly not sure I'd tell a friend to buy it."
	);
	let cmpRun = $state(false);
	let cmpResult = $state<ComparePayload | null>(null);

	async function runCompare() {
		cmpRun = true;
		cmpResult = null;
		try {
			const input = reviewInput;
			cmpResult = await withRunCache<ComparePayload>(
				{ demoId: 'l1-structured-compare' },
				async () => await compareExtraction(input)
			);
		} finally {
			cmpRun = false;
		}
	}

	onMount(async () => {
		const ce = await loadCachedRun<EventPayload>({ demoId: 'l1-structured-event' });
		if (ce) eventResult = ce.payload;
		const cc = await loadCachedRun<ComparePayload>({ demoId: 'l1-structured-compare' });
		if (cc) cmpResult = cc.payload;
	});

	const codeDefine = `import { z } from 'zod';

const Event = z.object({
  title: z.string(),
  date: z.string().describe('ISO date, YYYY-MM-DD'),
  startTime: z.string().describe('24-hour, e.g. 14:30'),
  durationMinutes: z.number(),
  attendees: z.array(z.string())
});

// Register the schema as a tool the model MUST fill, and get a typed value back.
const extractor = model.withStructuredOutput(Event, { name: 'save_event' });

const event = await extractor.invoke('Lunch with Sam on March 14 at 12:30…');
// event is typed as z.infer<typeof Event> — no JSON.parse, no guessing.`;

	const codePlain = `// The naive way — ask for JSON in the prompt:
const msg = await model.invoke('Reply with JSON: { sentiment, recommend, reason }');
const data = JSON.parse(msg.content); // 🙈 a string — maybe fenced in \\\`\\\`\\\`json,
                                      // maybe prefixed with prose, maybe missing a field`;

	// Schema building blocks, for the book-column reference.
	const schemaParts = [
		{
			title: 'z.string() · z.number()',
			meta: 'types + ranges',
			body: 'The basic field types. Add constraints like .min(0).max(1) on numbers, so a confidence score can never come back as 7 or "high".'
		},
		{
			title: 'z.enum([...])',
			meta: 'a closed set',
			body: 'The model must pick one of the listed values — it cannot invent a new label or misspell one. This single building block removes a whole class of bugs and is what makes structured output great for classification and routing.'
		},
		{
			title: 'z.array(...).max(n)',
			meta: 'bounded lists',
			body: 'A list of a known element type, optionally capped. "Up to five reproduction steps" becomes a guarantee, not a hope.'
		},
		{
			title: 'z.boolean()',
			meta: 'a real boolean',
			body: 'You get true/false, not the word "yes" or "Y" that you then have to normalise.'
		},
		{
			title: 'z.object({...})',
			meta: 'nesting · optional',
			body: 'Schemas nest, so you can extract a record of records. Mark maybe-absent fields with .optional() or .nullable() instead of inventing empty strings.'
		},
		{
			title: '.describe("…")',
			meta: 'guides the model',
			body: 'A short description on any field becomes part of the tool definition the model sees. One clarifying line ("ISO date, YYYY-MM-DD") markedly improves accuracy — the cheapest reliability win you have.'
		}
	];
</script>

<Lesson
	title="Structured output"
	eyebrow="Level 1 · Lesson 03"
	hero={{
		id: 'l1-structured-output',
		alt: "A printer's typecase with hand-set metal type"
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Model">model</Term> speaks prose; your code wants records.
		<Term t="Structured output">Structured output</Term> is the bridge — declare the shape you
		want as a <Term t="Schema">schema</Term> and the model must fill it, so you get a typed value
		instead of a paragraph to scrape apart.
	{/snippet}

	{#snippet intro()}
		<p>
			You can always <em>ask</em> a <Term t="Model">model</Term> for JSON — and then spend your
			afternoon stripping code fences and guessing field names. <Term t="Structured output"
				>Structured output</Term
			> replaces that with a guarantee: hand the model a <Term t="Zod" /> <Term t="Schema"
				>schema</Term
			> and <Term t="withStructuredOutput"><code>withStructuredOutput</code></Term> forces the reply
			into exactly that shape, returning a typed object your code can trust.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="From prose to type" variant="dropcap">
			<p>
				A <Term t="Model">model</Term> is happiest writing paragraphs; a program is happiest reading
				records. Between them sits a border crossing where data has to switch languages — and every
				brittle regex and <code>JSON.parse</code> you have ever babysat has lived along that border.
			</p>
			<p>
				The modern move is to skip the border. You hand the model a <Term t="Schema">schema</Term> —
				a precise description of the record you want — and the provider's
				<Term t="Tool calling">tool-calling</Term> API constrains the response to that shape. The model
				stops narrating a result and starts producing one.
			</p>
		</Slide>

		<Slide title="Don't just ask for JSON">
			<p>
				The tempting shortcut is to write <em>"reply with JSON"</em> in the prompt. It works often
				enough to lull you, then fails in production: the reply comes wrapped in <code>```json</code>
				fences, prefixed with "Here's the JSON:", missing a field, or with a number where you wanted
				a string. You're left writing defensive cleanup and validation by hand.
			</p>
			<CodeBlock code={codePlain} lang="ts" caption="The fragile way — Demo 2 runs this side by side." />
		</Slide>

		<Slide title="withStructuredOutput" variant="code-first">
			<p>
				<Term t="LangChain" />'s <Term t="withStructuredOutput"><code>withStructuredOutput</code></Term>
				wraps a <Term t="Model">model</Term> so it returns a typed value instead of an
				<Term t="AIMessage"><code>AIMessage</code></Term>. Field <code>.describe()</code> text guides
				the model; the result is <Term t="Validation">validated</Term> against your
				<Term t="Schema">schema</Term> before you ever touch it.
			</p>
			<CodeBlock code={codeDefine} lang="ts" caption="Define once, get a typed function — Demo 1." />
		</Slide>

		<figure class="poster">
			<HeroImage
				id="structured-output-poster"
				alt="A brass machine taking a ribbon of cursive prose and stamping it into a rigid labelled form with typed slots, sealed with a wax validation stamp"
			/>
			<figcaption>
				A <Term t="Schema">schema</Term> is a mould: pour prose in, get a typed record out.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A <Term t="Schema">schema</Term> is a contract the <Term t="Model">model</Term> signs before
				it speaks — written in your type system, not its.
			</p>
		</Slide>

		<Slide title="Under the hood: it's tool calling">
			<p>
				<Term t="withStructuredOutput" /> doesn't add a new model feature — it reuses
				<Term t="Tool calling">tool calling</Term>. Your <Term t="Schema">schema</Term> is registered
				as a single <Term t="tool">tool</Term>, the model is told to call it, and the call's arguments
				are parsed back into your typed object. Pass <Term t="includeRaw"><code>includeRaw: true</code></Term>
				and you can see both the parsed value and the raw tool call — Demo 1's inspector does exactly
				that.
			</p>
		</Slide>

		<Accordion items={schemaParts} heading="What a schema can enforce" />

		<Slide title="In production">
			<p>
				Reach for <Term t="Schema">schemas</Term> whenever an <Term t="LLM" /> hands data to code:
				field extraction, classification and routing, <Term t="tool">tool</Term> arguments, evaluator
				rubrics, structured <Term t="Agent">agent</Term> plans. Prefer narrow
				<Term t="Enum">enums</Term> over open strings, lean on <code>.describe()</code>, and pair with
				<Term t="withRetry"><code>withRetry</code></Term> on the <Term t="Runnable" /> for resilience.
			</p>
		</Slide>

		<Slide ornament>
			<p>Type the boundary. The model will meet you there.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Structured output — concepts',
					href: 'https://docs.langchain.com/oss/javascript/langchain/structured-output',
					kind: 'docs'
				},
				{
					label: 'How-to: return structured data',
					href: 'https://js.langchain.com/docs/how_to/structured_output/',
					kind: 'docs'
				},
				{
					label: 'API · withStructuredOutput',
					href: 'https://api.js.langchain.com/classes/_langchain_core.language_models_chat_models.BaseChatModel.html#withStructuredOutput',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Prose → a typed event" subtitle="one message becomes a validated record">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-structured-extract"
					alt="A casual sentence feeding into a brass schema mould, out comes a labelled form with title, date, time, attendees"
				/>
			</figure>
			<label class="row">
				<span>A casual message</span>
				<textarea bind:value={eventInput} rows="3"></textarea>
			</label>
			<RunButton onclick={runEvent} running={eventRun} label="Extract event" />

			{#if eventResult}
				<div class="inspect">
					<div class="inspect-label">Inspect · the filled schema</div>
					<SchemaForm fields={eventFields} value={eventResult.value} />
					{#if eventResult.usage}
						<div class="tok"><TokenPills usage={eventResult.usage} /></div>
					{/if}
					{#if eventResult.tool}
						<details class="raw">
							<summary>raw tool call · {eventResult.tool.name}</summary>
							<p class="raw-note">
								Structured output is tool calling underneath — the model emitted these arguments,
								which were parsed into the typed object above.
							</p>
							<StateInspector state={eventResult.tool.args} compact />
						</details>
					{/if}
				</div>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Ask for JSON vs withStructuredOutput" subtitle="the same review, two ways">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-json-vs-structured"
					alt="Two paths: a loose crumpled JSON note with code fences versus a clean stamped form with a validation seal"
				/>
			</figure>
			<label class="row">
				<span>A product review</span>
				<textarea bind:value={reviewInput} rows="3"></textarea>
			</label>
			<RunButton onclick={runCompare} running={cmpRun} label="Run both ways" />

			{#if cmpResult}
				<div class="compare">
					<div class="col">
						<div class="col-head">Ask for JSON</div>
						<div class="col-tag">a string you must parse</div>
						<pre class="raw-json">{cmpResult.plain.raw}</pre>
						{#if cmpResult.plain.error}
							<div class="status bad">JSON.parse failed · {cmpResult.plain.error}</div>
						{:else}
							<div class="status warn">parsed after stripping fences — but nothing validated the
								fields or types</div>
						{/if}
					</div>
					<div class="col">
						<div class="col-head">withStructuredOutput</div>
						<div class="col-tag accent">a validated, typed object</div>
						<SchemaForm fields={reviewFields} value={cmpResult.structured} />
						<div class="status good">typed + validated against the schema — use it directly</div>
					</div>
				</div>
				<p class="verdict">
					Both may even contain the same answer. The difference is the <strong>guarantee</strong>:
					one is a string you parse and pray over, the other is a record your types already trust.
				</p>
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
	}

	/* Per-demo diagram — natural aspect. */
	.demo-diagram {
		margin: 0 0 0.9rem;
	}
	.demo-diagram :global(.hero) {
		display: block;
		height: auto;
		border-radius: 0.55rem;
		overflow: hidden;
		background: var(--color-paper);
	}
	.demo-diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
	}

	/* Poster in the book column. */
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
	.tok {
		margin-top: 0.6rem;
	}

	/* Collapsible raw tool call. */
	.raw {
		margin-top: 0.85rem;
	}
	.raw summary {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		cursor: pointer;
		list-style: none;
	}
	.raw summary::-webkit-details-marker {
		display: none;
	}
	.raw summary::before {
		content: '▸ ';
		color: var(--accent);
	}
	.raw[open] summary::before {
		content: '▾ ';
	}
	.raw summary:hover {
		color: var(--accent);
	}
	.raw-note {
		margin: 0.5rem 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-ink-300);
	}

	/* Demo 2 comparison. */
	.compare {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.8rem;
		margin-top: 0.9rem;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.8rem;
		border-radius: 0.6rem;
		background: var(--color-paper);
	}
	.col-head {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--color-ink-100);
		font-weight: 600;
	}
	.col-tag {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-300);
	}
	.col-tag.accent {
		color: var(--accent);
	}
	.raw-json {
		margin: 0.2rem 0 0;
		padding: 0.6rem 0.7rem;
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		line-height: 1.5;
		color: var(--color-ink-200);
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 12rem;
		overflow-y: auto;
	}
	.status {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.45;
		padding: 0.3rem 0.45rem;
		border-radius: 0.35rem;
	}
	.status.bad {
		color: var(--color-accent-danger);
		background: color-mix(in oklch, var(--color-accent-danger) 12%, transparent);
	}
	.status.warn {
		color: var(--color-accent-warning, var(--color-ink-200));
		background: color-mix(in oklch, var(--color-accent-warning, var(--color-ink-300)) 12%, transparent);
	}
	.status.good {
		color: var(--color-accent-success, var(--accent));
		background: color-mix(in oklch, var(--color-accent-success, var(--accent)) 12%, transparent);
	}
	.verdict {
		margin: 0.85rem 0 0;
		font-size: 0.84rem;
		line-height: 1.55;
		color: var(--color-ink-200);
	}
	.verdict strong {
		color: var(--accent);
	}
</style>
