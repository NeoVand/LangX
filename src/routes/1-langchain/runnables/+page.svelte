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
	motivation="Before you can build an agent you need a way to compose work. LangChain's answer is a tiny protocol: every step speaks the same four methods, so the pipe between them is real."
	hero={{
		id: 'l1-runnables',
		alt: 'A factory line of brass machines passing a glowing token hand to hand'
	}}
	source={demoSource}
>
	{#snippet intro()}
		<p>
			Everything in LangChain is a <Term t="Runnable" />. A prompt template, a chat model, a
			parser, a retriever — they all implement the same four methods, and they compose using a
			pipe.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Composition first, model second" variant="dropcap">
			<p>
				LangChain's earliest designs hard-coded "chain types" — a SummarizationChain, a
				QuestionAnsweringChain. That made every new use case a new class. The Runnable protocol
				inverted the design: <strong>shape the pieces alike, and composition does the work</strong>.
			</p>
			<p>
				A senior engineer can read a Runnable diagram the way a plumber reads pipes. Knobs
				(prompts) feed into chambers (models), get filtered (parsers), and drain into the next
				system. You don't memorise twenty chain classes; you learn one verb and use it
				everywhere.
			</p>
		</Slide>

		<Slide title="The Runnable protocol">
			<p>
				A <Term t="Runnable" /> is anything that exposes <code>invoke</code>,
				<code>batch</code>, <code>stream</code>, and their async cousins. Once your component
				speaks that protocol, it can be composed with everything else in the ecosystem.
			</p>
			<p>The four core methods:</p>
			<ul>
				<li><code>invoke(input)</code> — single run.</li>
				<li><code>batch([...])</code> — many inputs in parallel.</li>
				<li><code>stream(input)</code> — yield chunks as they're produced.</li>
				<li><code>streamEvents(input)</code> — fine-grained event log.</li>
			</ul>
		</Slide>

		<Slide title="LCEL — the pipe operator" variant="code-first">
			<p>
				<Term t="LCEL" /> uses the pipe (<code>.pipe(...)</code> in TypeScript) to chain
				Runnables. The output of the left side becomes the input of the right side. The chain is
				lazy — nothing runs until you call <code>invoke</code>.
			</p>
			<CodeBlock code={codeA} lang="ts" caption="A prompt → model → parser chain (Demo 1)." />
			<p>
				Run Demo 1 on the right and watch the value's shape change at each stop:
				<code>{'{ topic }'}</code> → <code>ChatPromptValue</code> → <code>AIMessage</code> →
				<code>string</code>.
			</p>
		</Slide>

		<Diagram spec={lcelPipeline} />

		<Slide variant="pull-quote">
			<p>
				The pipe is the smallest interface that lets every other LangChain primitive — retries,
				batching, callbacks, streaming — apply uniformly to everything you compose.
			</p>
		</Slide>

		<Slide title="Branching: RunnableParallel" variant="code-first">
			<p>
				Sometimes you want one input to fan out to several Runnables, gather their outputs into
				a single object, and continue. That's <code>RunnableParallel</code>. Pair it with
				<code>RunnablePassthrough</code> when you want to keep the original input alongside
				derived values.
			</p>
			<CodeBlock code={codeB} lang="ts" caption="A 3-way fan-out (Demo 2)." />
		</Slide>

		<Slide title="Why this matters" ornament>
			<p>
				The pipe is more than syntactic sugar. Because every step is a Runnable, you also get
				batched execution, streaming, retries, fallbacks, and observable callbacks for free.
				When LangChain v1 says “every agent is a Runnable,” this is what they mean.
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
		margin-top: 0.85rem;
		padding: 0.85rem 0.95rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
		margin-top: 0.85rem;
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
		padding: 0.55rem 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		font-size: 0.9rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
