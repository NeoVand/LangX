<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import StateInspector from '$lib/components/StateInspector.svelte';
	import { ChatPromptTemplate } from '@langchain/core/prompts';
	import { StringOutputParser } from '@langchain/core/output_parsers';
	import { RunnableLambda, RunnableParallel, RunnablePassthrough } from '@langchain/core/runnables';
	import { MockChatModel } from '$lib/runtime/llm/mock';

	let topic = $state('the reactor pattern');

	let demoARun = $state(false);
	let demoAResult = $state('');
	let demoASteps = $state<{ step: string; data: unknown }[]>([]);

	async function runDemoA() {
		demoARun = true;
		demoAResult = '';
		demoASteps = [];
		try {
			const prompt = ChatPromptTemplate.fromMessages([
				['system', 'You are a concise tutor. Answer in 1 short paragraph.'],
				['human', 'Explain {topic} like the reader is a senior engineer who just hasn\'t met it.']
			]);
			const model = new MockChatModel({
				responses: [
					{
						content: `${topic.replace(/^the /, '').toUpperCase()} — A senior-engineer one-paragraph summary that pretends to be from a real model. In production you would swap MockChatModel for any provider.`
					}
				]
			});
			const parser = new StringOutputParser();
			const chain = prompt.pipe(model).pipe(parser);

			const promptValue = await prompt.invoke({ topic });
			demoASteps.push({ step: 'prompt → ChatPromptValue', data: promptValue.toChatMessages() });

			const response = await model.invoke(promptValue);
			demoASteps.push({ step: 'model → AIMessage', data: { content: response.content } });

			const finalText = await parser.invoke(response);
			demoASteps.push({ step: 'parser → string', data: finalText });

			demoAResult = await chain.invoke({ topic });
		} finally {
			demoARun = false;
		}
	}

	let demoBRun = $state(false);
	let demoBResult = $state<{ short: string; bullets: string; passthrough: string } | null>(null);

	async function runDemoB() {
		demoBRun = true;
		demoBResult = null;
		try {
			const shortModel = new MockChatModel({
				responder: ({ }, _t) => ({
					content: `One-sentence summary of "${topic}": it is the named pattern engineers reach for when they want non-blocking I/O on a single thread.`
				})
			});
			const bulletModel = new MockChatModel({
				responder: () => ({
					content: `• Demultiplexes events on one thread.\n• Reactors dispatch to handlers.\n• Common in Node.js, Netty, libuv.`
				})
			});

			const shortChain = ChatPromptTemplate.fromMessages([
				['human', 'In one sentence, what is {topic}?']
			])
				.pipe(shortModel)
				.pipe(new StringOutputParser());
			const bulletChain = ChatPromptTemplate.fromMessages([
				['human', 'List 3 bullet facts about {topic}.']
			])
				.pipe(bulletModel)
				.pipe(new StringOutputParser());

			const fanout = RunnableParallel.from({
				short: shortChain,
				bullets: bulletChain,
				passthrough: RunnablePassthrough.assign({}).pipe(new RunnableLambda({ func: (x: { topic: string }) => `(input echoed: ${x.topic})` }))
			});

			const result = (await fanout.invoke({ topic })) as {
				short: string;
				bullets: string;
				passthrough: string;
			};
			demoBResult = result;
		} finally {
			demoBRun = false;
		}
	}

	const codeA = `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise tutor.'],
  ['human', 'Explain {topic} in one paragraph.']
]);

const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
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

<Lesson title="Runnables and LCEL" eyebrow="Phase 1 · Lesson 01">
	{#snippet intro()}
		<p>
			Everything in LangChain is a <Term t="Runnable" />. A prompt template, a chat model, a
			parser, a retriever — they all implement the same four methods, and they compose using a
			pipe.
		</p>
	{/snippet}

	{#snippet narrative()}
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

		<Slide title="LCEL — the pipe operator">
			<p>
				<Term t="LCEL" /> uses the pipe (<code>.pipe(...)</code> in TypeScript) to chain
				Runnables. The output of the left side becomes the input of the right side. The chain is
				lazy — nothing runs until you call <code>invoke</code>.
			</p>
			<CodeBlock code={codeA} caption="A prompt → model → parser chain (Demo 1)." />
			<p>
				Run Demo 1 on the right and watch the value's shape change at each stop:
				<code>{'{ topic }'}</code> → <code>ChatPromptValue</code> → <code>AIMessage</code> →
				<code>string</code>.
			</p>
		</Slide>

		<Slide title="Branching: RunnableParallel">
			<p>
				Sometimes you want one input to fan out to several Runnables, gather their outputs into
				a single object, and continue. That's <code>RunnableParallel</code>. Pair it with{' '}
				<code>RunnablePassthrough</code> when you want to keep the original input alongside
				derived values.
			</p>
			<CodeBlock code={codeB} caption="A 3-way fan-out (Demo 2)." />
		</Slide>

		<Slide title="Why this matters">
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
		color: var(--color-fg-faint);
	}
	input {
		flex: 1;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.4rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.output {
		margin-top: 0.85rem;
		padding: 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.7rem;
		margin-top: 0.85rem;
	}

	.grid .lbl {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
		margin-bottom: 0.2rem;
	}

	.grid p,
	.grid pre {
		margin: 0;
		padding: 0.5rem 0.7rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.35rem;
		font-size: 0.86rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
