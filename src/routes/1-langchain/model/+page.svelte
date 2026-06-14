<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { ArrowUpRight } from '@lucide/svelte';

	import EmbeddingStage from '$lib/components/model/EmbeddingStage.svelte';
	import QkvStage from '$lib/components/model/QkvStage.svelte';
	import AttentionStage from '$lib/components/model/AttentionStage.svelte';
	import MlpStage from '$lib/components/model/MlpStage.svelte';
	import SamplingStage from '$lib/components/model/SamplingStage.svelte';

	import { rawCall, chainCall, type RawResult } from '$lib/demos/model-basics';
	import { activeModelInfo } from '$lib/runtime/llm';

	const active = $derived(activeModelInfo());

	// Demo 1 — raw model.invoke
	let rawInput = $state('Why is the sky blue?');
	let rawRunning = $state(false);
	let raw = $state<RawResult | null>(null);
	async function runRaw() {
		rawRunning = true;
		try {
			raw = await rawCall(rawInput);
		} finally {
			rawRunning = false;
		}
	}

	// Demo 2 — the LangChain way (prompt | model | parser), streamed
	let topic = $state('what a vector embedding is');
	let chainRunning = $state(false);
	let chainOut = $state('');
	let chainDone = $state(false);
	async function runChain() {
		chainRunning = true;
		chainDone = false;
		chainOut = '';
		try {
			const r = await chainCall(topic, (b) => (chainOut = b));
			chainOut = r.output;
			chainDone = true;
		} finally {
			chainRunning = false;
		}
	}

	const code = `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

const model = await getModel();          // whatever provider you configured

// ① raw — a list of messages in, one AIMessage out
const reply = await model.invoke([
  { role: 'system', content: 'You are concise.' },
  { role: 'user', content: 'Why is the sky blue?' }
]);
reply.content;          // the text
reply.usage_metadata;   // { input_tokens, output_tokens, ... }

// ② the LangChain way — the model is one Runnable in a chain
const chain = ChatPromptTemplate
  .fromMessages([['human', 'Explain: {topic}']])
  .pipe(model)
  .pipe(new StringOutputParser());

await chain.invoke({ topic: 'embeddings' });   // → a plain string`;
</script>

<Lesson
	title="The Model"
	eyebrow="Level 1 · Lesson 02"
	hero={{ id: 'l1-model', alt: 'An engraved brass thinking-engine turning words into a next word' }}
>
	{#snippet motivation()}
		Everything in this course — every <Term t="Chain">chain</Term>, <Term t="Agent">agent</Term>,
		and <Term t="Deep Agent">harness</Term> — ultimately calls one thing: a language model. Before
		we wrap it, let's open one up.
	{/snippet}

	{#snippet intro()}
		<p>
			A modern language model can feel like magic — until you see that it does exactly one small
			thing, very well, very fast, a few hundred billion times. This lesson takes a real
			<Term t="Transformer">transformer</Term> apart on the bench beside you: tokens in on one side, the
			next word out the other, every gear visible. Then you'll call a real model yourself.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide variant="dropcap" title="One trick, over and over">
			<p>
				Strip away the mystique and a language model is a
				<Term t="Next-token prediction">next-token predictor</Term>: given the text so far, it
				produces a score for every possible next <Term t="Token">token</Term>, and one is chosen.
				Append it, feed the whole thing back in, and predict again. That single
				<Term t="Autoregressive">autoregressive</Term> loop — running left to right, one token at a time
				— is where sentences, code, and conversations all come from.
			</p>
			<p>
				So the entire job is: <em>turn a sequence of tokens into a good guess at the next one.</em>
				Everything below is the machinery that makes that guess sharp. Play with the cached run on
				the right as you read — it's a real GPT-2 mid-thought, finishing the line
				<em>"Data visualization empowers users to ___".</em>
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-block-tower"
				alt="A brass tower of twelve identical transformer blocks, embeddings entering at the base, logits crowning the top"
			/>
			<figcaption>
				The same block, stacked twelve times. A vector enters at the bottom and is nudged, layer by
				layer, up a central <Term t="Residual stream">residual stream</Term> until its top reads out as
				next-token scores.
			</figcaption>
		</figure>

		<Slide title="A tall stack of identical blocks">
			<p>
				The transformer architecture (2017's <em>"Attention Is All You Need"</em>) is a tower of
				identical <strong>blocks</strong> — twelve in GPT-2, far more in today's models. Each block
				does two things to every token: an <Term t="Attention">attention</Term> step that lets tokens
				share information, and a <Term t="Multi-layer perceptron">feed-forward</Term> step that
				transforms each one. Crucially, every block <em>adds</em> its work back onto a running
				<Term t="Residual stream">residual stream</Term> rather than replacing it, and
				<Term t="Layer normalization">layer norm</Term> keeps the numbers stable along the way.
			</p>
			<p>
				The model's "knowledge" is just its <Term t="Parameters">parameters</Term> — the billions of
				numbers training froze into those blocks. Inference simply runs your tokens through them.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-embedding-space"
				alt="Words condensing into glowing points scattered across a dark coordinate grid"
			/>
			<figcaption>Words become coordinates: each token is mapped to a point in a high-dimensional space.</figcaption>
		</figure>

		<Slide title="Words become vectors">
			<p>
				The model can't do arithmetic on the word "cat", so the first step is a lookup: each token
				id becomes a <Term t="Token embedding">vector</Term> of 768 numbers — its starting meaning.
				But <Term t="Attention">attention</Term> reads all tokens at once and has no built-in sense
				of order, so position must be added in. The original transformer added fixed sine waves;
				most 2026 models instead use <Term t="Rotary positional embedding">rotary embeddings (RoPE)</Term>,
				which rotate each token's vector by an angle that grows with position — so attention ends up
				depending on how <em>far apart</em> two tokens are. Flip between the two on the right.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-attention-glance"
				alt="A row of pillars with glowing sight-lines arcing backward, forming a triangular lattice"
			/>
			<figcaption>
				Attention as a glance backward — each token weighs the tokens before it, never the ones
				ahead.
			</figcaption>
		</figure>

		<Slide title="Attention: every word looks back">
			<p>
				This is the idea that made transformers work. For each token the model asks:
				<em>which earlier tokens matter to me, and how much?</em> It builds three projections of
				every token — a <Term t="Query, Key, Value">Query</Term> (what I'm looking for), a
				<Term t="Query, Key, Value">Key</Term> (what I offer), and a
				<Term t="Query, Key, Value">Value</Term> (what I'd contribute). Compare one query against
				every key and you get a relevance score for each pair; those scores become weights that mix
				the values together.
			</p>
			<p>
				The exact recipe is <Term t="Scaled dot-product attention">scaled dot-product attention</Term>:
				<code>softmax(QKᵀ/√dₖ)·V</code>. Two details matter. A
				<Term t="Causal mask">causal mask</Term> blanks out the future, so a token can only attend to
				itself and earlier tokens — that's what keeps generation honest. And it's run as
				<Term t="Multi-head attention">multi-head attention</Term>: twelve heads in parallel, each
				watching for something different. Step through dot-product → scale → mask → softmax on the
				right, on the real model's numbers.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>Attention moves information between tokens. The feed-forward layer decides what to make of it.</p>
		</Slide>

		<Slide title="The MLP: thinking it over">
			<p>
				After attention has gathered context, each token is passed — on its own — through a small
				<Term t="Multi-layer perceptron">feed-forward network</Term>: expand to about four times the
				width, apply the <Term t="GELU">GELU</Term> nonlinearity, then compress back. Without that
				curve in the middle, the two linear steps would collapse into one and the model couldn't
				learn anything interesting. A good deal of a model's factual "knowledge" is thought to live
				in these layers.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-sampling-dice"
				alt="Probability bars feeding a glowing brass die, a flame for temperature beneath it"
			/>
			<figcaption>
				At the top of the tower: a score for every word, a little controlled randomness, and one
				token falls out.
			</figcaption>
		</figure>

		<Slide title="From scores to a word">
			<p>
				At the very top, the model emits one <Term t="Logits">logit</Term> per
				<Term t="Vocabulary">vocabulary</Term> token — raw scores, not yet probabilities.
				<Term t="Softmax">Softmax</Term> turns them into a distribution, and a few dials decide
				which token to draw. <Term t="Temperature">Temperature</Term> sharpens or flattens the
				field; <Term t="Top-k">top-k</Term> keeps a fixed number of candidates while
				<Term t="Top-p sampling">top-p</Term> keeps just enough to cover a probability mass; taking
				the single best every time is <Term t="Greedy decoding">greedy decoding</Term>. Turn the
				dials on the right and roll the dice — this is where a model's "personality" is tuned.
			</p>
		</Slide>

		<Slide title="So what is a model, really?">
			<p>
				A frozen pile of numbers that, run forward, turns a list of tokens into a probability
				distribution over the next one — wrapped in a loop. That's it. Everything else in this
				course is about feeding that loop well: composing it into <Term t="Chain">chains</Term>,
				streaming its tokens, constraining its output, handing it <Term t="tool">tools</Term>, and
				eventually surrounding it with a whole <Term t="Deep Agent">harness</Term>.
			</p>
			<p>
				Which means the next move is simple: actually call one. On the right, the same model — under
				the hood as a bare <code>invoke</code>, then the LangChain way, as a composable
				<Term t="Runnable">Runnable</Term>.
			</p>
		</Slide>

		<Slide variant="ornament">
			<p>Tokens in · one good guess out · repeat</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Sebastian Raschka — Self-attention from scratch',
					href: 'https://sebastianraschka.com/blog/2023/self-attention-from-scratch.html',
					kind: 'docs'
				},
				{
					label: 'Build a Large Language Model (From Scratch)',
					href: 'https://www.manning.com/books/build-a-large-language-model-from-scratch',
					kind: 'docs'
				},
				{
					label: 'Jay Alammar — The Illustrated Transformer',
					href: 'https://jalammar.github.io/illustrated-transformer/',
					kind: 'docs'
				},
				{
					label: 'Attention Is All You Need (2017)',
					href: 'https://arxiv.org/abs/1706.03762',
					kind: 'api'
				},
				{
					label: 'Transformer Explainer — the live workshop',
					href: 'https://poloclub.github.io/transformer-explainer/',
					kind: 'docs'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<div class="workshop-intro">
			<p>
				<span class="wi-kicker">The transformer, disassembled.</span> Below is one real GPT-2 forward
				pass for <span class="wi-prompt">"Data visualization empowers users to ___"</span>, taken
				apart stage by stage. Every number is from the actual model.
			</p>
			<a class="wi-link" href="/1-langchain/model/explorer">
				Open the full live workshop <ArrowUpRight size={15} />
			</a>
		</div>

		<EmbeddingStage />
		<QkvStage />
		<AttentionStage />
		<MlpStage />
		<SamplingStage />

		<Panel title="Call a model" subtitle="the same model, in code">
			<p class="demo-lede">
				The workshop above is GPT-2 frozen mid-thought. Here you call whatever model you've
				configured — <span class="active">{active.provider} · {active.id}</span> — first raw, then
				the LangChain way.
			</p>

			<div class="mini">
				<div class="mini-head">① raw — <code>model.invoke(messages)</code></div>
				<input
					class="mini-input"
					bind:value={rawInput}
					placeholder="Ask anything…"
					onkeydown={(e) => e.key === 'Enter' && !rawRunning && runRaw()}
				/>
				<RunButton onclick={runRaw} running={rawRunning} label="Invoke" />
				{#if raw}
					<div class="msgs">
						{#each raw.input as m (m.role)}
							<div class="msg"><span class="role {m.role}">{m.role}</span><span>{m.content}</span></div>
						{/each}
						<div class="msg out">
							<span class="role assistant">assistant</span><span>{raw.content}</span>
						</div>
					</div>
					<div class="meta">
						<span>AIMessage</span>
						{#if raw.usage}<span>· {raw.usage.input} in / {raw.usage.output} out tokens</span>{/if}
						{#if raw.finishReason}<span>· {raw.finishReason}</span>{/if}
						<span>· {raw.model}</span>
					</div>
				{/if}
			</div>

			<div class="mini">
				<div class="mini-head">② LangChain — <code>prompt | model | parser</code></div>
				<input
					class="mini-input"
					bind:value={topic}
					placeholder="A topic to explain…"
					onkeydown={(e) => e.key === 'Enter' && !chainRunning && runChain()}
				/>
				<RunButton onclick={runChain} running={chainRunning} label="Run chain" variant="ghost" />
				{#if chainOut}
					<div class="chain-out">
						{#if chainDone}<Markdown source={chainOut} />{:else}{chainOut}{/if}
					</div>
				{/if}
			</div>

			<CodeBlock {code} lang="ts" caption="The whole of using a model — raw, then composed." dense />
		</Panel>
	{/snippet}
</Lesson>

<style>
	/* Posters: show at natural aspect (HeroImage normally fills a fixed-aspect box). */
	.poster {
		margin: 2.25rem 0;
	}
	.poster :global(.hero) {
		display: block;
		height: auto;
		border-radius: 0.7rem;
		overflow: hidden;
		border: 1px solid var(--color-rule);
	}
	.poster :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
	}
	.poster figcaption {
		margin-top: 0.6rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-300);
		font-style: italic;
	}

	/* Workshop intro card at the top of the demo pane. */
	.workshop-intro {
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		padding: 0.85rem 1rem;
		background: var(--color-paper);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.workshop-intro p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-ink-200);
	}
	.wi-kicker {
		color: var(--color-ink-100);
		font-weight: 600;
	}
	.wi-prompt {
		font-family: var(--font-mono);
		font-size: 0.84rem;
		color: var(--accent-ink);
	}
	.wi-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--accent-ink);
		text-decoration: none;
		width: fit-content;
	}
	.wi-link:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* "Call a model" demo. */
	.demo-lede {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
	}
	.active {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--accent-ink);
	}
	.mini {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding-top: 0.4rem;
	}
	.mini-head {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--color-fg);
	}
	.mini-head code {
		color: var(--accent-ink);
	}
	.mini-input {
		width: 100%;
		font-family: var(--font-prose);
		font-size: 0.88rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-fg);
	}
	.mini-input:focus {
		outline: none;
		border-color: var(--accent-rule);
	}
	.msgs {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.msg {
		display: flex;
		gap: 0.55rem;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-fg);
		padding: 0.45rem 0.55rem;
		border-radius: 0.45rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
	}
	.msg.out {
		background: color-mix(in oklch, var(--accent-soft) 40%, transparent);
		border-color: var(--accent-rule);
	}
	.role {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
		width: 4.5rem;
		color: var(--color-fg-faint);
	}
	.role.assistant {
		color: var(--accent-ink);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg-faint);
	}
	.chain-out {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-fg);
		padding: 0.6rem 0.7rem;
		border-radius: 0.5rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
	}
</style>
