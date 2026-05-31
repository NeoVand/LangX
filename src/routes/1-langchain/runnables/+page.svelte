<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import ShapeFlow from '$lib/components/ShapeFlow.svelte';
	import TokenPills from '$lib/components/TokenPills.svelte';
	import Speedup from '$lib/components/Speedup.svelte';
	import EventTimeline from '$lib/components/EventTimeline.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		runPipeDemo,
		runBatchDemo,
		runEventsDemo,
		type PipeStep,
		type ChainEvent
	} from '$lib/demos/runnables-pipe';
	import pipeSrc from '$lib/demos/runnables-pipe.ts?raw';
	import { runFanoutDemo, type FanoutResult } from '$lib/demos/runnables-fanout';
	import fanoutSrc from '$lib/demos/runnables-fanout.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'runnables',
		title: 'Runnables and LCEL',
		summary: 'Compose prompt → model → parser with LCEL, then fan one input out with RunnableParallel.',
		entries: [
			{ path: 'lib/demos/runnables-pipe.ts', code: pipeSrc },
			{ path: 'lib/demos/runnables-fanout.ts', code: fanoutSrc }
		],
		runner: `import { runPipeDemo } from './lib/demos/runnables-pipe';
import { runFanoutDemo } from './lib/demos/runnables-fanout';

console.log('=== Sequential pipe ===');
const pipe = await runPipeDemo('the reactor pattern', (s) => console.log('  ·', s.step));
console.log('Final:', pipe.finalText, '\\n');

console.log('=== Parallel fan-out ===');
const fan = await runFanoutDemo('the reactor pattern');
console.log(fan);
`
	};

	let topic = $state('why the sky is blue');

	let demoARun = $state(false);
	let demoAResult = $state('');
	let demoASteps = $state<PipeStep[]>([]);
	let demoAUsage = $state<{ input?: number; output?: number; total?: number } | undefined>();

	type DemoAPayload = Awaited<ReturnType<typeof runPipeDemo>>;

	// The data's type at each hop: { topic } → ChatPromptValue → AIMessage → string.
	// The step label encodes the output type after the arrow; we peek the value too.
	const demoAShapes = $derived([
		{ type: '{ topic }', value: { topic } },
		...demoASteps
			.filter((s) => s.step !== 'summary')
			.map((s) => ({ type: s.step.split('→')[1]?.trim() ?? s.step, value: s.data }))
	]);

	async function runDemoA() {
		demoARun = true;
		demoAResult = '';
		demoASteps = [];
		demoAUsage = undefined;
		try {
			const topicForRun = topic;
			const out = await withRunCache<DemoAPayload>(
				{ demoId: 'l1-runnables-pipe-2' },
				async () => await runPipeDemo(topicForRun)
			);
			demoAResult = out.finalText;
			demoASteps = out.steps;
			demoAUsage = out.usage;
		} finally {
			demoARun = false;
		}
	}

	// Demo 1b · streamEvents — the SAME pipe, surfaced as its lifecycle stream.
	let demoEvRun = $state(false);
	let demoEvents = $state<ChainEvent[]>([]);

	async function runEvents() {
		demoEvRun = true;
		demoEvents = [];
		try {
			const topicForRun = topic;
			demoEvents = await withRunCache<ChainEvent[]>(
				{ demoId: 'l1-runnables-events' },
				// Live the first time (onEvent streams the timeline), instant from cache after.
				async () => await runEventsDemo(topicForRun, (e) => (demoEvents = [...demoEvents, e]))
			);
		} finally {
			demoEvRun = false;
		}
	}

	let demoBRun = $state(false);
	let demoBResult = $state<FanoutResult | null>(null);

	async function runDemoB() {
		demoBRun = true;
		demoBResult = null;
		try {
			const topicForRun = topic;
			demoBResult = await withRunCache<FanoutResult>(
				{ demoId: 'l1-runnables-fanout-2' },
				async () => await runFanoutDemo(topicForRun)
			);
		} finally {
			demoBRun = false;
		}
	}

	// Demo 3 · batch — the same chain over several fixed inputs at once.
	const batchTopics = ['why the sky is blue', 'how vaccines work', 'what causes ocean tides'];
	type BatchPayload = Awaited<ReturnType<typeof runBatchDemo>>;
	let demoCRun = $state(false);
	let demoCResult = $state<BatchPayload | null>(null);

	async function runDemoC() {
		demoCRun = true;
		demoCResult = null;
		try {
			demoCResult = await withRunCache<BatchPayload>(
				{ demoId: 'l1-runnables-batch-2' },
				async () => await runBatchDemo(batchTopics)
			);
		} finally {
			demoCRun = false;
		}
	}

	onMount(async () => {
		const cachedA = await loadCachedRun<DemoAPayload>({ demoId: 'l1-runnables-pipe-2' });
		if (cachedA) {
			demoAResult = cachedA.payload.finalText;
			demoASteps = cachedA.payload.steps;
			demoAUsage = cachedA.payload.usage;
		}
		const cachedB = await loadCachedRun<FanoutResult>({ demoId: 'l1-runnables-fanout-2' });
		if (cachedB) demoBResult = cachedB.payload;
		const cachedC = await loadCachedRun<BatchPayload>({ demoId: 'l1-runnables-batch-2' });
		if (cachedC) demoCResult = cachedC.payload;
		const cachedEv = await loadCachedRun<ChainEvent[]>({ demoId: 'l1-runnables-events' });
		if (cachedEv) demoEvents = cachedEv.payload;
	});

	const codeA = `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatAnthropic } from '@langchain/anthropic';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise tutor.'],
  ['human', 'Explain {topic} in one paragraph.']
]);

const model = new ChatAnthropic({ model: 'claude-haiku-4-5' });
const parser = new StringOutputParser();

// LCEL: pipe operator composes Runnables left-to-right.
const chain = prompt.pipe(model).pipe(parser);

const text = await chain.invoke({ topic: 'the reactor pattern' });`;

	const codeB = `import { RunnableParallel, RunnablePassthrough } from '@langchain/core/runnables';

const fanout = RunnableParallel.from({
  short: shortChain,    // 1-sentence summary
  bullets: bulletChain, // 3 bullet facts
  passthrough: RunnablePassthrough.assign({})
});

const { short, bullets, passthrough } = await fanout.invoke({ topic });`;

	const codeC = `// The composed chain is itself a Runnable — so .batch() runs many inputs at once.
const chain = prompt.pipe(model).pipe(parser);

const answers = await chain.batch([
  { topic: 'why the sky is blue' },
  { topic: 'how vaccines work' },
  { topic: 'what causes ocean tides' }
]); // → string[], one per input, resolved in parallel`;
</script>

<Lesson
	title="Runnables and LCEL"
	eyebrow="Level 1 · Lesson 01"
	hero={{
		id: 'l1-runnables',
		alt: 'A factory line of brass machines passing a glowing token hand to hand'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Before you can build an <Term t="Agent">agent</Term> you need a way to compose work.
		<Term t="LangChain" />'s answer is a tiny <Term t="Runnable" /> protocol: every step speaks
		the same core methods, so the <Term t="pipe">pipe</Term> between them is real.
	{/snippet}
	{#snippet intro()}
		<p>
			Everything in LangChain is a <Term t="Runnable" />. A <Term t="Prompt template" />, a
			<Term t="Model" />, a <Term t="Parser" />, a <Term t="Retriever" /> — they all implement
			the same core methods, and they compose using a <Term t="Chain" /> (the pipe).
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Composition first, model second" variant="dropcap">
			<p>
				LangChain's earliest designs hard-coded "chain types" — a SummarizationChain, a
				QuestionAnsweringChain. That made every new use case a new class. The
				<Term t="Runnable" /> protocol inverted the design:
				<strong>shape the pieces alike, and composition does the work</strong>.
			</p>
			<p>
				A senior engineer can read a <Term t="Runnable" /> diagram the way a plumber reads
				pipes. Knobs (<Term t="Prompt">prompts</Term>) feed into chambers (<Term
					t="Model">models</Term
				>), get filtered (<Term t="Parser">parsers</Term>), and drain into the next system. You
				don't memorise twenty chain classes; you learn one verb and use it everywhere.
			</p>
		</Slide>

		<Slide title="The Runnable protocol">
			<p>
				A <Term t="Runnable" /> is anything that speaks one small interface. The moment your
				component implements it, it composes with everything else in the ecosystem — no adapters,
				no special cases. You'll exercise each of these methods in the demos on the right:
			</p>
			<ul>
				<li><Term t="invoke"><code>invoke(input)</code></Term> — one input, one output. <em>(Demo 1)</em></li>
				<li>
					<Term t="batch"><code>batch([...])</code></Term> — many inputs at once, run in parallel.
					<em>(Demo 3)</em>
				</li>
				<li><Term t="stream"><code>stream(input)</code></Term> — the same call, yielding chunks as they're produced.</li>
				<li>
					<Term t="streamEvents"><code>streamEvents(input)</code></Term> — a play-by-play of every
					step starting, emitting, and finishing. <em>(the streamEvents inspector)</em>
				</li>
			</ul>
			<p>
				Each has an async cousin (<Term t="ainvoke"><code>ainvoke</code></Term>, <Term
					t="abatch"><code>abatch</code></Term>, <Term t="astream"><code>astream</code></Term>), and
				<Term t="pipe"><code>.pipe()</code></Term> plus
				<Term t="RunnableParallel"><code>RunnableParallel</code></Term> wire many Runnables into one.
				Everything else in LangChain is built from exactly this.
			</p>
		</Slide>

		<Slide title="LCEL — the pipe operator" variant="code-first">
			<p>
				<Term t="LCEL" /> uses the <Term t="pipe"><code>.pipe(...)</code></Term> operator to chain
				Runnables into a <Term t="RunnableSequence">RunnableSequence</Term>. The output of the left
				side becomes the input of the right side. The chain obeys
				<Term t="Lazy evaluation">lazy evaluation</Term> — nothing runs until you call
				<Term t="invoke">invoke</Term>.
			</p>
			<CodeBlock code={codeA} lang="ts" caption="A prompt → model → parser chain (Demo 1)." />
			<p>
				Run Demo 1 on the right and watch the value's shape change at each stop:
				<code>{'{ topic }'}</code> → <Term t="ChatPromptValue"><code>ChatPromptValue</code></Term> → <Term t="AIMessage"><code>AIMessage</code></Term> →
				<Term t="StringOutputParser"><code>string</code></Term>.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="runnables-poster"
				alt="A catalogue of sixteen brass Runnable machines — sequence, parallel, branch, retry, fallback, lambda, prompt, model, parser, retriever and more"
			/>
			<figcaption>
				One protocol, many shapes. Every machine above is a <Term t="Runnable" /> — so they all
				<code>.pipe()</code> into each other.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				The <Term t="pipe">pipe</Term> is the smallest interface that lets every other
				<Term t="LangChain" /> primitive — retries, batching,
				<Term t="callbacks">callbacks</Term>, streaming, <Term t="fallbacks">fallbacks</Term> — apply
				uniformly to everything you compose.
			</p>
		</Slide>

		<Slide title="Branching: RunnableParallel" variant="code-first">
			<p>
				Sometimes you want one input to fan out to several Runnables, gather their outputs into
				a single object, and continue. That's <Term t="RunnableParallel"><code>RunnableParallel</code></Term>. Pair it with
				<Term t="RunnablePassthrough"><code>RunnablePassthrough</code></Term> when you want to keep the original input alongside
				derived values.
			</p>
			<CodeBlock code={codeB} lang="ts" caption="A 3-way fan-out (Demo 2)." />
		</Slide>

		<Slide title="Run many at once: .batch()" variant="code-first">
			<p>
				The same chain, many inputs, in parallel — no <code>for</code> loop. Because the composed
				chain is itself a <Term t="Runnable" />, <Term t="batch"><code>.batch()</code></Term> comes
				for free (and there's an async <Term t="abatch"><code>abatch</code></Term> too). Run Demo 3
				to fire three questions through one chain.
			</p>
			<CodeBlock code={codeC} lang="ts" caption="Batch one chain over inputs (Demo 3)." />
		</Slide>

		<Slide title="Why this matters" ornament>
			<p>
				The pipe is more than syntactic sugar. Because every step is a <Term t="Runnable" />, you
				also get batched execution, <Term t="stream">streaming</Term>, <Term t="withRetry">retries</Term>,
				<Term t="fallbacks">fallbacks</Term>, and observable <Term t="callbacks">callbacks</Term> for
				free. When LangChain v1 says “every <Term t="Agent">agent</Term> is a Runnable,” this is what
				they mean.
			</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Runnables & LCEL — concepts',
					href: 'https://js.langchain.com/docs/concepts/runnables/',
					kind: 'docs'
				},
				{
					label: 'How-to: chain with .pipe()',
					href: 'https://js.langchain.com/docs/how_to/sequence/',
					kind: 'docs'
				},
				{
					label: 'API · RunnableSequence',
					href: 'https://api.js.langchain.com/classes/_langchain_core.runnables.RunnableSequence.html',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Sequential pipe" subtitle="prompt → model → parser">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-pipe-sequential"
					alt="A straight pipe — prompt to model to parser — with the data's shape changing at each step"
				/>
			</figure>
			<label class="row">
				<span>Topic</span>
				<input type="text" bind:value={topic} />
			</label>
			<RunButton onclick={runDemoA} running={demoARun} />
			{#if demoAResult}
				<div class="output">{demoAResult}</div>
				<div class="inspect">
					<div class="inspect-label">Inspect · how the value changes shape</div>
					<ShapeFlow nodes={demoAShapes} />
					{#if demoAUsage}
						<div class="tok"><TokenPills usage={demoAUsage} /></div>
					{/if}
				</div>
			{/if}

			<div class="events">
				<RunButton onclick={runEvents} running={demoEvRun} label="Watch streamEvents" />
				{#if demoEvents.length}
					<div class="inspect">
						<div class="inspect-label">Inspect · streamEvents timeline</div>
						<EventTimeline events={demoEvents} />
					</div>
				{/if}
			</div>
		</Panel>

		<Panel title="Demo 2 · Parallel fan-out" subtitle="RunnableParallel.from(...)">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-fanout"
					alt="One input fanning out into short, bullets, and passthrough, merged into one object"
				/>
			</figure>
			<RunButton onclick={runDemoB} running={demoBRun} />
			{#if demoBResult}
				<div class="grid">
					<div>
						<div class="lbl">short</div>
						<p>{demoBResult.short}</p>
					</div>
					<div>
						<div class="lbl">bullets</div>
						<pre>{demoBResult.bullets}</pre>
					</div>
					<div>
						<div class="lbl">passthrough</div>
						<p>{demoBResult.passthrough}</p>
					</div>
				</div>
				<div class="inspect">
					<div class="inspect-label">Inspect · concurrent vs one-by-one</div>
					<Speedup
						totalMs={demoBResult.totalMs}
						partsMs={demoBResult.bars.map((b) => b.ms)}
						note="RunnableParallel fires every branch at once, so the wall-clock is the slowest branch — not their sum."
					/>
					<details class="raw">
						<summary>raw keyed result</summary>
						<StateInspector state={demoBResult} compact />
					</details>
				</div>
			{/if}
		</Panel>

		<Panel title="Demo 3 · Batch" subtitle="chain.batch([...]) — many inputs at once">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-batch"
					alt="One chain run over three inputs in parallel, producing three outputs"
				/>
			</figure>
			<div class="topics">
				{#each batchTopics as t (t)}<span class="topic-chip">{t}</span>{/each}
			</div>
			<RunButton onclick={runDemoC} running={demoCRun} label="Run 3 in parallel" />
			{#if demoCResult}
				<div class="batch">
					{#each demoCResult.rows as r (r.topic)}
						<div class="batch-row">
							<div class="bt">{r.topic}</div>
							<p>{r.text}</p>
						</div>
					{/each}
				</div>
				<div class="inspect">
					<div class="inspect-label">Inspect · concurrent vs one-by-one</div>
					<Speedup
						totalMs={demoCResult.totalMs}
						partsMs={demoCResult.rows.map((r) => r.ms)}
						note="One .batch() call runs all inputs at once — a for loop would cost roughly their sum."
					/>
					<details class="raw">
						<summary>raw outputs</summary>
						<StateInspector state={demoCResult.rows} compact />
					</details>
				</div>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	input {
		flex: 1;
	}

	.output {
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
	}

	.grid .lbl {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		margin-bottom: 0.25rem;
	}

	.grid p,
	.grid pre {
		margin: 0;
		font-size: 0.9rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Poster of the Runnable family — replaces the old animated SVG. */
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
	.poster figcaption code {
		color: var(--color-ink-100);
	}

	/* Per-demo diagram (placeholder until the image is saved). */
	.demo-diagram {
		margin: 0 0 0.9rem;
	}
	/* Natural aspect ratio — never crop the diagram, whatever its proportions. */
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

	.topics {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
	}
	.topic-chip {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: var(--color-paper);
		color: var(--color-ink-200);
	}
	.batch {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.85rem;
	}
	.batch-row .bt {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--accent);
		margin-bottom: 0.15rem;
	}
	.batch-row p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	/* Per-demo inline inspector — sits right under each demo's output. */
	.inspect {
		margin-top: 0.9rem;
	}
	.inspect-label {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		margin-bottom: 0.4rem;
	}
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
	.raw > :global(*:not(summary)) {
		margin-top: 0.5rem;
	}
	.events {
		margin-top: 1.4rem;
	}
	.tok {
		margin-top: 0.6rem;
	}
</style>
