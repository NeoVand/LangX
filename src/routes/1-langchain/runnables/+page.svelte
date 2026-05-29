<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { lcelPipeline } from '$lib/diagrams';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { runPipeDemo, type PipeStep } from '$lib/demos/runnables-pipe';
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

	let topic = $state('the reactor pattern');

	let demoARun = $state(false);
	let demoAResult = $state('');
	let demoASteps = $state<PipeStep[]>([]);

	type DemoAPayload = { finalText: string; steps: PipeStep[] };

	async function runDemoA() {
		demoARun = true;
		demoAResult = '';
		demoASteps = [];
		try {
			const topicForRun = topic;
			const out = await withRunCache<DemoAPayload>(
				{ demoId: 'l1-runnables-pipe' },
				async () => await runPipeDemo(topicForRun)
			);
			demoAResult = out.finalText;
			demoASteps = out.steps;
		} finally {
			demoARun = false;
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
				{ demoId: 'l1-runnables-fanout' },
				async () => await runFanoutDemo(topicForRun)
			);
		} finally {
			demoBRun = false;
		}
	}

	onMount(async () => {
		const cachedA = await loadCachedRun<DemoAPayload>({ demoId: 'l1-runnables-pipe' });
		if (cachedA) {
			demoAResult = cachedA.payload.finalText;
			demoASteps = cachedA.payload.steps;
		}
		const cachedB = await loadCachedRun<FanoutResult>({ demoId: 'l1-runnables-fanout' });
		if (cachedB) demoBResult = cachedB.payload;
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
</script>

<Lesson
	title="Runnables and LCEL"
	eyebrow="Phase 1 · Lesson 01"
	hero={{
		id: 'l1-runnables',
		alt: 'A factory line of brass machines passing a glowing token hand to hand'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Before you can build an <Term t="Agent">agent</Term> you need a way to compose work.
		<Term t="LangChain" />'s answer is a tiny <Term t="Runnable" /> protocol: every step speaks
		the same four methods, so the <Term t="pipe">pipe</Term> between them is real.
	{/snippet}
	{#snippet intro()}
		<p>
			Everything in LangChain is a <Term t="Runnable" />. A <Term t="Prompt template" />, a
			<Term t="Model" />, a <Term t="Parser" />, a <Term t="Retriever" /> — they all implement
			the same four methods, and they compose using a <Term t="Chain" /> (the pipe).
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
				A <Term t="Runnable" /> is anything that exposes <Term t="invoke" />,
				<Term t="batch" />, <Term t="stream" />, and their async cousins (<Term
					t="ainvoke"
				/>, <Term t="abatch" />, <Term t="astream" />). Once your component speaks that
				protocol, it can be composed with everything else in the ecosystem.
			</p>
			<p>The four core methods:</p>
			<ul>
				<li><Term t="invoke"><code>invoke(input)</code></Term> — single run.</li>
				<li><Term t="batch"><code>batch([...])</code></Term> — many inputs in parallel.</li>
				<li><Term t="stream"><code>stream(input)</code></Term> — yield chunks as they're produced.</li>
				<li>
					<Term t="streamEvents"><code>streamEvents(input)</code></Term> — fine-grained event log.
				</li>
			</ul>
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

		<Diagram spec={lcelPipeline} />

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

		<Slide title="Why this matters" ornament>
			<p>
				The pipe is more than syntactic sugar. Because every step is a <Term t="Runnable" />, you
				also get batched execution, <Term t="stream">streaming</Term>, <Term t="withRetry">retries</Term>,
				<Term t="fallbacks">fallbacks</Term>, and observable <Term t="callbacks">callbacks</Term> for
				free. When LangChain v1 says “every <Term t="Agent">agent</Term> is a Runnable,” this is what
				they mean.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Sequential pipe" subtitle="prompt → model → parser">
			<label class="row">
				<span>Topic</span>
				<input type="text" bind:value={topic} />
			</label>
			<RunButton onclick={runDemoA} running={demoARun} />
			{#if demoAResult}
				<div class="output">{demoAResult}</div>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Parallel fan-out" subtitle="RunnableParallel.from(...)">
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
			{/if}
		</Panel>
	{/snippet}

	{#snippet inspect()}
		<Panel title="Inspect · Demo 1 step types">
			<StateInspector state={demoASteps} compact />
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
</style>
