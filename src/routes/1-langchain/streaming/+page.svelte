<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import TimingBars from '$lib/components/TimingBars.svelte';
	import EventTimeline from '$lib/components/EventTimeline.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { runRace, runRevealDemo, type ChainEvent } from '$lib/demos/streaming';
	import streamingSrc from '$lib/demos/streaming.ts?raw';
	import eventsSrc from '$lib/demos/stream-events.ts?raw';
	import streamingSkill from '$lib/demos/skills/streaming.md?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'streaming',
		title: 'Streaming',
		summary:
			'Consume one chain three ways: invoke (final value), stream (token chunks), and streamEvents v2 (one typed event per Runnable boundary).',
		entries: [
			{ path: 'lib/demos/streaming.ts', code: streamingSrc },
			{ path: 'lib/demos/stream-events.ts', code: eventsSrc }
		],
		runner: `import { runRace, runRevealDemo } from './lib/demos/streaming';

// Levels 1 & 2 — race invoke vs stream on one deterministic task (count to ten),
// started on a shared clock so the totals compare fairly and the output is identical.
console.log('=== invoke vs stream ===');
const r = await runRace((text) => process.stdout.write('\\r' + text));
console.log('\\n  invoke done at', r.invokeMs, 'ms · stream first token at', r.streamTtftMs, 'ms · stream done at', r.streamTotalMs, 'ms');
console.log('  same output:', JSON.stringify(r.text), '\\n');

// Level 3 — streamEvents sees INSIDE a two-step (plan → write) chain. stream()
// would show only the final paragraph; events let us watch the hidden plan too.
console.log('=== streamEvents v2 — plan then write ===');
const r2 = await runRevealDemo('the trade-offs of remote work');
console.log('① plan (hidden from stream):\\n' + r2.plan);
console.log('\\n② answer (what stream shows):\\n' + r2.answer);
console.log('\\n  ' + r2.events.length + ' events across 2 model calls');
`,
		skill: streamingSkill
	};

	let topic = $state('the trade-offs of remote work');

	// ── Demo 1 · invoke vs stream (one click, raced side by side) ────────────
	type RacePayload = Awaited<ReturnType<typeof runRace>>;

	let racing = $state(false);
	let invokeText = $state('');
	let streamText = $state('');
	let invokeMs = $state(0);
	let streamTtft = $state(0);
	let streamTotal = $state(0);
	let chunkCount = $state(0);

	const bothRan = $derived(invokeMs > 0 && streamTotal > 0);
	const speedFactor = $derived(invokeMs && streamTtft ? invokeMs / streamTtft : 0);

	async function runBoth() {
		racing = true;
		invokeText = '';
		streamText = '';
		invokeMs = 0;
		streamTtft = 0;
		streamTotal = 0;
		chunkCount = 0;
		try {
			const out = await withRunCache<RacePayload>(
				{ demoId: 'l1-streaming-race' },
				async () =>
					await runRace(
						(text) => (streamText = text),
						(text) => (invokeText = text)
					)
			);
			invokeText = out.text;
			streamText = out.text;
			invokeMs = out.invokeMs;
			streamTtft = out.streamTtftMs;
			streamTotal = out.streamTotalMs;
			chunkCount = out.chunks;
		} finally {
			racing = false;
		}
	}

	// ── Demo 2 · streamEvents — watch the step stream() hides ────────────────
	type RevealPayload = Awaited<ReturnType<typeof runRevealDemo>>;
	let revealRun = $state(false);
	let planText = $state('');
	let answerText = $state('');
	let planMs = $state(0);
	let writeMs = $state(0);
	let revealEvents = $state<ChainEvent[]>([]);
	const ran = $derived(planText !== '' || answerText !== '' || revealEvents.length > 0);
	// While a step is still streaming, show plain text — rendering markdown mid-stream
	// makes an unclosed ** bold everything after it. Render Markdown once it's settled.
	const planStreaming = $derived(revealRun && planText !== '' && answerText === '');
	const writeStreaming = $derived(revealRun && answerText !== '');

	async function runReveal() {
		revealRun = true;
		planText = '';
		answerText = '';
		planMs = 0;
		writeMs = 0;
		revealEvents = [];
		try {
			const t = topic;
			const out = await withRunCache<RevealPayload>(
				{ demoId: 'l1-streaming-reveal-6' },
				async () =>
					await runRevealDemo(t, (plan, answer) => {
						planText = plan;
						answerText = answer;
					})
			);
			planText = out.plan;
			answerText = out.answer;
			planMs = out.planMs;
			writeMs = out.writeMs;
			revealEvents = out.events;
		} finally {
			revealRun = false;
		}
	}

	onMount(async () => {
		const cr = await loadCachedRun<RacePayload>({ demoId: 'l1-streaming-race' });
		if (cr) {
			invokeText = cr.payload.text;
			streamText = cr.payload.text;
			invokeMs = cr.payload.invokeMs;
			streamTtft = cr.payload.streamTtftMs;
			streamTotal = cr.payload.streamTotalMs;
			chunkCount = cr.payload.chunks;
		}
		const cv = await loadCachedRun<RevealPayload>({ demoId: 'l1-streaming-reveal-6' });
		if (cv) {
			planText = cv.payload.plan;
			answerText = cv.payload.answer;
			planMs = cv.payload.planMs;
			writeMs = cv.payload.writeMs;
			revealEvents = cv.payload.events;
		}
	});

	const codeStream = `const chain = prompt.pipe(model).pipe(new StringOutputParser());

// Level 1 — wait for the whole answer:
const text = await chain.invoke({ topic });

// Level 2 — render chunks as they arrive:
for await (const chunk of await chain.stream({ topic })) {
  process.stdout.write(chunk); // string chunks, because the parser streams
}`;

	const codeEvents = `// A two-step chain: PLAN (list facts) → WRITE (a paragraph from them).
const chain = RunnableSequence.from([
  RunnablePassthrough.assign({ facts: planChain }), // step ① — a model call
  writeChain                                        // step ② — a model call
]);

// stream() would yield only step ②'s paragraph. streamEvents() sees both —
// tell the two model calls apart by their runName ('plan' vs 'write'):
for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
  if (ev.event === 'on_chat_model_stream') {
    if (ev.name === 'plan')  showPlan(ev.data.chunk);   // the hidden step
    if (ev.name === 'write') showAnswer(ev.data.chunk); // the final answer
  }
}`;

	// streamEvents event-type reference (rendered as an accordion).
	const eventTypes = [
		{
			title: 'on_chain_start / end',
			meta: 'brackets a Runnable',
			body: 'A Runnable — the whole sequence or a sub-chain — began or finished. These bracket every run, so the log always opens with on_chain_start and closes with on_chain_end.'
		},
		{
			title: 'on_prompt_start / end',
			meta: 'formats messages',
			body: 'The prompt template started and finished turning your variables into a list of messages. Fast and cheap — it happens before the model is ever called.'
		},
		{
			title: 'on_chat_model_start',
			meta: 'once',
			body: 'The model began generating, after the prompt is ready. Fires once per model call; data.input holds the messages the model received.'
		},
		{
			title: 'on_chat_model_stream',
			meta: 'data.chunk · per token',
			body: 'One token (or small chunk) arrived from the model. This is the high-frequency event — one per token — and data.chunk holds the text. It is what powers a live typing effect.'
		},
		{
			title: 'on_chat_model_end',
			meta: 'data.output',
			body: 'The model finished. data.output carries the full AIMessage, including usage_metadata (token counts) and any tool calls.'
		},
		{
			title: 'on_parser_start / stream / end',
			meta: 'transforms output',
			body: 'The output parser started, emitted transformed chunks, and produced the final value. A StringOutputParser re-streams the model tokens as plain strings.'
		},
		{
			title: 'on_tool_start / end',
			meta: 'agent tools',
			body: 'A tool was invoked and returned. You will see these once chains call tools (Level 1 Tools, and every agent) — the backbone of an auditable agent trace.'
		},
		{
			title: 'on_retriever_start / end',
			meta: 'RAG',
			body: 'A retriever began a search and returned documents. These appear in RAG chains and make it visible exactly what context was pulled into the prompt.'
		}
	];
</script>

<Lesson
	title="Streaming"
	eyebrow="Level 1 · Lesson 02"
	hero={{
		id: 'l1-streaming',
		alt: 'A copper-basin water clock with cascading droplets'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		A <Term t="Model">model</Term> doesn't think all at once — it produces one
		<Term t="Token">token</Term> at a time. <Term t="stream">Streaming</Term> just lets you
		watch that happen, which changes how a chat feels, how you debug, and how you build everything
		downstream.
	{/snippet}

	{#snippet intro()}
		<p>
			Streaming isn't a separate API bolted onto <Term t="LangChain" /> — it's built into the
			<Term t="Runnable" /> protocol. The very same <Term t="Chain">chain</Term> can be consumed at
			three levels: wait for the final value (<Term t="invoke" />), receive the answer in
			<Term t="Token">token</Term> chunks (<Term t="stream" />), or get a typed event for every
			internal step (<Term t="streamEvents" />). Same chain, three zoom levels.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Latency is part of the model" variant="dropcap">
			<p>
				Early <Term t="LLM">LLM</Term> apps treated the <Term t="Model">model</Term> as a function:
				send a <Term t="Prompt">prompt</Term>, wait, get a string back. That framing hides the most
				interesting second of the whole interaction — the gap between the first
				<Term t="Token">token</Term> and the last. To the user, that gap is just a frozen screen.
			</p>
			<p>
				The better mental model: the <Term t="Model" /> is a <em>process</em> that emits
				<Term t="Chunk">chunks</Term>, and your job is to render them as they appear. Accept that,
				and the same machinery becomes a typing effect, a progress bar, a debugger, and the
				substrate for every <Term t="Agent">agent</Term> visualisation later in the course.
			</p>
		</Slide>

		<Slide title="Three levels of streaming">
			<p>The chain is the same each time — you just choose how closely to watch:</p>
			<ul>
				<li>
					<Term t="invoke"><code>invoke</code></Term> — wait for the final value. Simplest, but the
					user sees nothing until the whole answer is ready.
				</li>
				<li>
					<Term t="stream"><code>stream</code></Term> — yield <Term t="Chunk">chunks</Term> of the
					output as they arrive. The first text lands in a few hundred milliseconds; perfect for chat
					UIs.
				</li>
				<li>
					<Term t="streamEvents"><code>streamEvents</code></Term> — yield a typed event for every
					internal step (<Term t="on_chain_start">chain</Term>, <Term t="Model">model</Term>,
					<Term t="tool">tool</Term>, <Term t="Parser">parser</Term>). The substrate for inspectors
					and audit trails.
				</li>
			</ul>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="streaming-levels-poster"
				alt="The three levels of streaming — invoke (one full bucket at the end), stream (a steady drip of tokens), and streamEvents (taps along the pipe emitting typed events)"
			/>
			<figcaption>
				Same chain, three zoom levels: <code>invoke</code> → <code>stream</code> →
				<code>streamEvents</code>.
			</figcaption>
		</figure>

		<Slide title="Levels 1 & 2: invoke vs stream" variant="code-first">
			<p>
				The difference that matters to a user isn't total time — it's
				<strong>time to first text</strong>. <Term t="invoke" /> shows nothing until it's all done;
				<Term t="stream" /> paints the first <Term t="Chunk">chunk</Term> almost immediately. Demo 1
				races them side by side on one click.
			</p>
			<CodeBlock code={codeStream} lang="ts" caption="One chain, invoked then streamed — Demo 1." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A <Term t="stream">stream</Term> is the smallest interface that lets you tell a user the
				<Term t="Model">model</Term> is alive before it is finished thinking.
			</p>
		</Slide>

		<Slide title="Level 3: seeing inside the chain" variant="code-first">
			<p>
				<Term t="stream" /> only shows a chain's <em>final</em> output. But real chains have steps in
				the middle — and you often want to see them. <Term t="streamEvents">streamEvents</Term> emits
				one typed event every time a <Term t="Runnable" /> starts, produces a
				<Term t="Token">token</Term>, or finishes — so you can watch each step run and even time it.
			</p>
			<p>
				Demo 2's chain answers in two passes: it first <strong>plans</strong> (a model lists key
				facts), then <strong>writes</strong> a paragraph from them. <Term t="stream" /> would give you
				only the paragraph; <Term t="streamEvents" /> lets you watch the hidden planning step too — we
				tell the two model calls apart by their <Term t="runName">runName</Term> (set with <Term
					t="withConfig"><code>withConfig</code></Term
				>).
			</p>
			<CodeBlock code={codeEvents} lang="ts" caption="One streamEvents loop, watching both steps (Demo 2)." />
		</Slide>

		<Accordion items={eventTypes} heading="The events you'll see" />

		<Slide title="What you do with this">
			<p>
				<Term t="Token">Token</Term> streaming makes a chat UI feel alive. Event streaming makes an
				<Term t="Agent">agent</Term> <em>auditable</em> — every <Term t="tool_calls">tool call</Term
				>, every <Term t="Retriever">retrieval</Term>, every <Term t="Parser">parse</Term> becomes a
				visible boundary you can replay, log, or test against via <Term t="callbacks">callbacks</Term>
				and <Term t="LangSmith" /> traces.
			</p>
			<p>
				When you reach <a href="/2-langgraph"><Term t="LangGraph" /></a>, agents add
				<Term t="streamMode"><code>streamMode</code></Term> (<code>values</code>, <code>updates</code
				>, <code>messages</code>) to stream graph state and per-node tokens — the same idea, one
				level up.
			</p>
		</Slide>

		<Slide ornament>
			<p>The model is a process. Render the process.</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Streaming — concepts',
					href: 'https://docs.langchain.com/oss/javascript/langchain/streaming',
					kind: 'docs'
				},
				{
					label: 'How-to: stream runnables',
					href: 'https://js.langchain.com/docs/how_to/streaming/',
					kind: 'docs'
				},
				{
					label: 'API · Runnable.streamEvents',
					href: 'https://api.js.langchain.com/classes/_langchain_core.runnables.Runnable.html#streamEvents',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="invoke vs stream · then see inside the chain">
			<ol class="howto">
				<li><strong>Race the two.</strong> Hit <em>Race invoke vs stream</em> on Demo 1 — both run the same count-to-ten task on one clock. The <code>invoke</code> lane stays blank until it's done; the <code>stream</code> lane paints token by token. The timing bars then show identical total time but a much earlier first word.</li>
				<li><strong>Look inside.</strong> Demo 2's chain answers in two passes — it <strong>plans</strong>, then <strong>writes</strong>. Type a topic and hit <em>Run the chain</em> to watch both step cards stream and time themselves, while plain <code>stream()</code> would only ever show the second.</li>
				<li><strong>Read the trace.</strong> Open <em>full event log</em> under Demo 2 to see every typed <code>streamEvents</code> boundary — start, per-token chunk, and end — for both model calls.</li>
			</ol>
		</Panel>

		<Panel title="Demo 1 · invoke vs stream" subtitle="a fair race — same task, two ways">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-stream-vs-invoke"
					alt="Two pipes: invoke dumps one full bucket at the end; stream drips tokens continuously"
				/>
			</figure>
			<div class="task">
				Task · <code>count from one to ten, in words</code>
				<span class="task-why">deterministic — both run on one clock and produce identical output</span>
			</div>
			<RunButton onclick={runBoth} running={racing} label="Race invoke vs stream" />

			{#if invokeText || streamText || racing}
				<div class="race">
					<div class="lane">
						<div class="lane-head">invoke</div>
						<div class="lane-body">
							{#if invokeText}{invokeText}{:else}<span class="muted"
									>— blank until <code>invoke()</code> returns —</span
								>{/if}
						</div>
						{#if invokeMs}<div class="lane-ms">done · {invokeMs} ms</div>{/if}
					</div>
					<div class="lane">
						<div class="lane-head">stream</div>
						<div class="lane-body">
							{streamText}{#if racing && !streamTotal}<span class="caret">▋</span>{/if}
						</div>
						{#if streamTotal}<div class="lane-ms">first {streamTtft} ms · done {streamTotal} ms</div>{/if}
					</div>
				</div>
			{/if}

			{#if bothRan}
				<div class="inspect">
					<div class="inspect-label">Inspect · total time</div>
					<TimingBars
						bars={[
							{ label: 'invoke', ms: invokeMs },
							{ label: 'stream', ms: streamTotal }
						]}
					/>
					<p class="note">
						Both ran on one clock and produced the same ten words, so it's the same work — invoke
						{invokeMs} ms vs stream {streamTotal} ms. Streaming adds <strong>no overhead</strong>; any
						small gap is ordinary latency variance.
					</p>

					<div class="inspect-label more">time to first text</div>
					<TimingBars
						bars={[
							{ label: 'invoke', ms: invokeMs },
							{ label: 'stream', ms: streamTtft }
						]}
					/>
					<p class="note">
						The win: <code>invoke</code> shows nothing until it's done, while <code>stream</code>
						paints the first words <strong>{speedFactor.toFixed(1)}× sooner</strong> — {streamTtft} ms
						vs {invokeMs} ms.
					</p>
					{#if chunkCount}
						<div class="meta">{chunkCount} chunks · identical output both ways</div>
					{/if}
				</div>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Inside the chain" subtitle="watch every step, as it happens">
			<figure class="demo-diagram">
				<HeroImage
					id="diagram-stream-events"
					alt="A pipe with taps at each junction emitting labelled event tags as data flows through"
				/>
			</figure>
			<p class="lead">
				This chain answers in <strong>two steps</strong>: first it <strong>plans</strong> (picks the
				key points to cover), then it <strong>writes</strong> a balanced paragraph from them. Plain
				<code>stream()</code> would hand you only the paragraph — <code>streamEvents</code> reports
				each step as it runs, so you can watch (and time) the planning the answer never shows.
			</p>
			<label class="row">
				<span>Topic</span>
				<input type="text" bind:value={topic} />
			</label>
			<RunButton onclick={runReveal} running={revealRun} label="Run the chain" />

			{#if ran}
				<ol class="steps">
					<li class="step-card">
						<div class="step-top">
							<span class="step-n">1</span>
							<span class="step-name">Plan</span>
							<span class="step-role">internal step</span>
							{#if planMs}<span class="step-time">{planMs} ms</span>{/if}
						</div>
						<p class="step-desc">the model picks the points the answer should cover</p>
						<div class="step-out">
							{#if planStreaming}<span class="raw-stream">{planText}<span class="caret">▋</span></span
								>{:else if planText}<Markdown source={planText} />{/if}
						</div>
					</li>
					<li class="step-card">
						<div class="step-top">
							<span class="step-n">2</span>
							<span class="step-name">Write</span>
							<span class="step-role accent">final answer</span>
							{#if writeMs}<span class="step-time">{writeMs} ms</span>{/if}
						</div>
						<p class="step-desc">the only part plain <code>stream()</code> would give you</p>
						<div class="step-out">
							{#if writeStreaming}<span class="raw-stream">{answerText}<span class="caret">▋</span></span
								>{:else if answerText}<Markdown source={answerText} />{/if}
						</div>
					</li>
				</ol>

				<p class="note">
					One <code>streamEvents</code> call surfaced both steps — their tokens
					<em>and</em> their timing. <code>stream()</code> alone would have shown only step 2.
				</p>

				{#if revealEvents.length}
					<details class="raw">
						<summary>full event log · {revealEvents.length} events</summary>
						<EventTimeline events={revealEvents} />
					</details>
				{/if}
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
	.task {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink-200);
	}
	.task code {
		color: var(--accent);
	}
	.task-why {
		font-size: 0.68rem;
		color: var(--color-ink-300);
	}

	/* Two lanes racing the same task side by side. */
	.race {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
		margin-top: 0.9rem;
	}
	.lane {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.7rem 0.8rem;
		border-radius: 0.55rem;
		background: var(--color-paper);
	}
	.lane-head {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--accent);
	}
	.lane-body {
		font-family: var(--font-prose);
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		min-height: 2.6rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.lane-body .muted {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink-300);
	}
	.lane-body .muted code {
		color: var(--color-ink-200);
	}
	.lane-ms {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-300);
	}
	.caret {
		color: var(--accent);
		animation: blink 1s steps(1) infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	/* Per-demo diagram — natural aspect, never cropped. */
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

	/* Three-levels poster in the book column. */
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
	.poster figcaption code {
		color: var(--color-ink-100);
	}

	/* Inline inspector. */
	.inspect {
		margin-top: 0.95rem;
	}
	.inspect-label {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		margin-bottom: 0.4rem;
	}
	.inspect-label.more {
		margin-top: 1rem;
	}
	.note code {
		font-family: var(--font-mono);
		color: var(--color-ink-100);
	}
	.note {
		margin: 0.55rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-ink-200);
	}
	.note strong {
		color: var(--accent);
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-300);
		margin-top: 0.5rem;
	}

	/* Demo 2 — the in-demo explanation + the two pipeline steps. */
	.lead {
		margin: 0 0 0.85rem;
		font-size: 0.86rem;
		line-height: 1.55;
		color: var(--color-ink-200);
	}
	.lead code {
		font-family: var(--font-mono);
		font-size: 0.82em;
		color: var(--color-ink-100);
	}
	.steps {
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	/* Both step cards share one style — no asymmetry. */
	.step-card {
		padding: 0.7rem 0.8rem;
		border-radius: 0.55rem;
		background: var(--color-paper);
	}
	.step-top {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.step-n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 50%;
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		flex-shrink: 0;
	}
	.step-name {
		font-family: var(--font-display);
		font-size: 0.98rem;
		color: var(--color-ink-100);
	}
	.step-role {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 0.12rem 0.4rem;
		border-radius: 999px;
		background: var(--color-bg-elev);
		color: var(--color-ink-300);
	}
	.step-role.accent {
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.step-time {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-300);
	}
	.step-desc {
		margin: 0.35rem 0 0.45rem;
		font-size: 0.76rem;
		color: var(--color-ink-300);
	}
	.step-desc code {
		font-family: var(--font-mono);
		color: var(--color-ink-200);
	}
	.step-out {
		min-height: 1.4rem;
	}
	/* Plain text shown while a step is still streaming (no mid-stream markdown). */
	.raw-stream {
		display: block;
		font-family: var(--font-prose);
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		white-space: pre-wrap;
		word-break: break-word;
	}
	/* Settled output, rendered by the shared Markdown component — match card size. */
	.step-out :global(.markdown) {
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.step-out :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.step-out :global(.markdown > :last-child) {
		margin-bottom: 0;
	}

	/* Collapsible raw event log. */
	.raw {
		margin-top: 0.95rem;
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
	.raw :global(.timeline) {
		margin-top: 0.6rem;
	}
</style>
