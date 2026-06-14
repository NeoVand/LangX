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
	import { ArrowUpRight, Cpu } from '@lucide/svelte';

	import Inspector from '$lib/components/model/Inspector.svelte';
	import TokenizeDemo from '$lib/components/model/TokenizeDemo.svelte';
	import WordEmbeddings from '$lib/components/model/WordEmbeddings.svelte';
	import SoftmaxLab from '$lib/components/model/SoftmaxLab.svelte';

	import { rawCall, chainCall, type RawResult } from '$lib/demos/model-basics';
	import { activeModelInfo } from '$lib/runtime/llm';

	const active = $derived(activeModelInfo());

	// Demo 1 — raw model.invoke: see the literal messages LangChain hides
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

	// Demo 2 — the model as a Runnable (prompt | model | parser), streamed
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

	const rawCode = `import { getModel } from '$lib/runtime/llm';

const model = await getModel();          // whatever provider you configured

// The rawest call there is: a list of messages in, ONE AIMessage out.
const reply = await model.invoke([
  { role: 'system', content: 'You are concise. Answer in one sentence.' },
  { role: 'user',   content: 'Why is the sky blue?' }
]);

reply.content;          // → the text
reply.usage_metadata;   // → { input_tokens, output_tokens, total_tokens }
reply.response_metadata // → finish reason, model name, …`;

	const chainCode = `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getModel } from '$lib/runtime/llm';

const model = await getModel();

// The model is just one Runnable. Pipe a prompt into it, and a parser after,
// and you have a tiny reusable program: prompt | model | parser.
const chain = ChatPromptTemplate
  .fromMessages([['human', 'Explain: {topic}']])
  .pipe(model)
  .pipe(new StringOutputParser());

await chain.invoke({ topic: 'embeddings' });   // → a plain string
// chain.stream({ topic }) streams the same answer token by token.`;
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
			<Term t="Transformer">transformer</Term> apart on the bench: tokens in on one side, the next
			word out the other. The windows below are the <em>actual</em> GPT-2 internals — click the
			replay arrow on any of them to watch the matrices light up. Then you'll call a real model
			yourself, on the right.
		</p>
	{/snippet}

	{#snippet narrative()}
		<a class="launch-card" href="/1-langchain/model/explorer">
			<span class="lc-icon"><Cpu size={30} /></span>
			<span class="lc-body">
				<span class="lc-title">Open the Transformer Workshop <ArrowUpRight size={18} /></span>
				<span class="lc-sub">
					A real GPT-2 running live in your browser — type a prompt and watch embeddings flow through
					all 12 attention blocks into next-token probabilities, with temperature and sampling on
					dials. The windows in this lesson are pieces of it; this is the whole machine.
				</span>
			</span>
		</a>

		<Slide variant="dropcap" title="One trick, over and over">
			<p>
				Strip away the mystique and a language model is a
				<Term t="Next-token prediction">next-token predictor</Term>: given the text so far, it
				produces a score for every possible next <Term t="Token">token</Term>, and one is chosen.
				Append it, feed the whole thing back in, predict again. That single
				<Term t="Autoregressive">autoregressive</Term> loop — left to right, one token at a time — is
				where sentences, code, and conversations all come from.
			</p>
			<p>
				So the whole job is: <em>turn a sequence of tokens into a good guess at the next one.</em>
				Everything below is the machinery that makes the guess sharp. The running example is a real
				GPT-2 finishing the line <em>"Data visualization empowers users to ___".</em>
			</p>
		</Slide>

		<Slide title="How does a model learn?">
			<p>
				Where do those billions of <Term t="Parameters">numbers</Term> come from? A language model is
				a <Term t="Neural network">neural network</Term> — layers of simple units whose connection
				weights are tuned by <Term t="Deep learning">deep learning</Term>. Training shows it text,
				measures how wrong its guess was with a <Term t="Loss function">loss</Term>, and uses
				<Term t="Gradient descent">gradient descent</Term> to nudge every weight a hair in the
				direction that lowers the loss — <Term t="Backpropagation">backpropagation</Term> works out
				which way that is. Repeat across the internet's worth of text and the weights settle into
				something that predicts language astonishingly well.
			</p>
			<p>The clearest way to feel it is to watch an optimizer actually roll downhill:</p>
		</Slide>

		<div class="demo-links">
			<span class="dl-head">Play with the machinery of learning</span>
			<a href="https://neovand.github.io/GradientDescent/" target="_blank" rel="noreferrer">
				Gradient Descent — watch an optimizer roll down a loss surface <ArrowUpRight size={14} />
			</a>
			<a href="https://playground.tensorflow.org/" target="_blank" rel="noreferrer">
				TensorFlow Playground — train a tiny neural network in your browser <ArrowUpRight size={14} />
			</a>
			<a href="https://deeperplayground.org/" target="_blank" rel="noreferrer">
				Deeper Playground — the same idea, deeper networks <ArrowUpRight size={14} />
			</a>
		</div>

		<figure class="poster">
			<HeroImage
				id="model-training-stages"
				alt="Three stages of training a chat model: self-supervised pre-training, supervised fine-tuning, and reinforcement learning from feedback"
			/>
			<figcaption>
				How a chat model is made: pre-train on raw text, fine-tune on instructions, then reinforce
				with feedback — but every stage rests on next-token prediction.
			</figcaption>
		</figure>

		<Slide title="Three stages of training">
			<p>
				Today's chat models are built in three stages. First, <Term t="Pre-training">pre-training</Term>:
				the model learns language from a vast pile of text with one self-supervised task — predict the
				next token — needing no human labels (the text is its own answer key). This is the longest,
				costliest stage, and where almost all of the model's raw knowledge comes from.
			</p>
			<p>
				A pretrained model only <em>continues</em> text, though.
				<Term t="Supervised fine-tuning">Supervised fine-tuning</Term> then teaches it to follow
				instructions, and reinforcement learning aligns it to what we actually want:
				<Term t="RLHF">RLHF</Term> tunes it toward answers people prefer, while
				<Term t="RLVR">RLVR</Term> rewards answers a program can verify as correct — the engine behind
				recent leaps in math and code. But underneath every stage is the same core skill from
				pre-training: <strong>predict the next token</strong>. That is what the rest of this lesson
				opens up.
			</p>
		</Slide>

		<Slide title="What is a token, really?">
			<p>
				The model never sees letters or words — it sees <Term t="Token">tokens</Term>.
				<Term t="Tokenization">Tokenization</Term> chops text into a fixed vocabulary of ~50,000
				pieces: common words stay whole, rarer ones split into fragments, and a leading space is part
				of the token. You pay per token, and the model predicts one token at a time. Type below and
				watch your text break apart exactly as GPT-2 sees it:
			</p>
		</Slide>

		<TokenizeDemo />

		<figure class="poster">
			<HeroImage
				id="model-embedding-space"
				alt="Words condensing into glowing points scattered across a dark coordinate grid"
			/>
			<figcaption>Words become coordinates: each token is mapped to a point in a high-dimensional space, where similar meanings sit close together.</figcaption>
		</figure>

		<Slide title="From a token to its meaning">
			<p>
				A token id is just a number — slot 1,234 in the vocabulary. The simplest way to hand it to a
				network is a <Term t="One-hot encoding">one-hot vector</Term>: all zeros except a single 1.
				But one-hot is meaningless — every two tokens are equally far apart. So the first thing a
				model does is replace it with a learned <Term t="Word embedding">dense embedding</Term>: a
				short list of numbers positioned so that words with similar meaning point the same way. Embed
				a few words below and measure the angle between them — meaning becomes geometry:
			</p>
		</Slide>

		<WordEmbeddings />

		<Slide title="The same word, in context">
			<p>
				There's a catch: a word's embedding is the same wherever it appears — but "bank" means
				something different beside "river" than beside "money". The transformer's whole job is to fix
				this: to keep rewriting each token's vector, layer by layer, folding in the surrounding words
				until it becomes a <Term t="Contextual embedding">context-aware</Term> summary rich enough to
				predict what comes next. That rewriting is what the rest of this lesson takes apart — here is
				the machine that does it:
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-block-tower"
				alt="A brass tower of twelve identical transformer blocks, embeddings entering at the base, logits crowning the top"
			/>
			<figcaption>
				The same block, stacked twelve times. A vector enters at the bottom and is nudged, layer by
				layer, up a central <Term t="Residual stream">residual stream</Term> until its top reads out
				as next-token scores.
			</figcaption>
		</figure>

		<Slide title="A tall stack of identical blocks">
			<p>
				The transformer (2017's <em>"Attention Is All You Need"</em>) is a tower of identical
				<strong>blocks</strong> — twelve in GPT-2, far more in today's models. Each block does two
				things to every token: an <Term t="Attention">attention</Term> step that lets tokens share
				information, and a <Term t="Multi-layer perceptron">feed-forward</Term> step that transforms
				each one. Every block <em>adds</em> its work back onto a running
				<Term t="Residual stream">residual stream</Term> rather than replacing it, and
				<Term t="Layer normalization">layer norm</Term> keeps the numbers stable. The model's
				"knowledge" is just its <Term t="Parameters">parameters</Term> — the billions of numbers
				training froze into those blocks.
			</p>
		</Slide>

		<figure class="poster">
			<HeroImage
				id="model-transformer-arch"
				alt="The transformer architecture — input embedding, a stack of blocks each with multi-head attention and a feed-forward network joined by residual connections and layer norm, ending in the output projection"
			/>
			<figcaption>
				The transformer architecture, end to end — embeddings in at the bottom, a stack of identical
				attention + feed-forward blocks, the output projection at the top.
			</figcaption>
		</figure>

		<Slide title="The transformer's input: embedding + position">
			<p>
				Inside the model, that dense <Term t="Token embedding">embedding</Term> is the token's
				starting vector (768 numbers in GPT-2). But <Term t="Attention">attention</Term> reads all
				tokens at once and has no built-in sense of order, so position must be added in. The original
				transformer added fixed sine waves; most 2026 models use
				<Term t="Rotary positional embedding">rotary embeddings (RoPE)</Term> instead, rotating each
				token's vector by an angle that grows with position — so attention depends on how
				<em>far apart</em> two tokens are.
			</p>
		</Slide>

		<Inspector
			which="embeddings"
			caption="Each token's learned embedding plus a position signal becomes the input vector that enters the stack."
		/>

		<Slide title="Attention: every word looks back">
			<p>
				This is the idea that made transformers work. For each token the model asks:
				<em>which earlier tokens matter to me, and how much?</em> It first projects every token into
				three roles — a <Term t="Query, Key, Value">Query</Term> (what I'm looking for), a
				<Term t="Query, Key, Value">Key</Term> (what I offer), and a
				<Term t="Query, Key, Value">Value</Term> (what I'd contribute). That projection is one matrix
				multiply — here it is on the real model:
			</p>
		</Slide>

		<Inspector
			which="qkv"
			caption="Q/K/V projection — one embedding × the learned weights (blue Query · copper Key · verdigris Value) → three vectors per token."
		/>

		<Slide>
			<p>
				Then comes <Term t="Scaled dot-product attention">scaled dot-product attention</Term>:
				<code>softmax(QKᵀ/√dₖ)·V</code>. Compare each query against every key to score relevance, a
				<Term t="Causal mask">causal mask</Term> blanks out the future so a token only sees the past,
				<Term t="Softmax">softmax</Term> turns the scores into weights that sum to 1, and those
				weights mix the values into each token's output. It runs as
				<Term t="Multi-head attention">multi-head attention</Term> — twelve heads in parallel, each
				watching for something different. Here are those three steps on the real model — pick a head
				and watch the scores form, get masked, and turn into weights:
			</p>
		</Slide>

		<Inspector
			which="attnScores"
			caption="Attention scores (one head) — Q·Kᵀ dot products → divide by √dₖ and mask the future (grey cells) → softmax each row into weights that sum to 1."
		/>

		<Slide>
			<p>
				Those weights then mix the <Term t="Query, Key, Value">Values</Term> together: each token's
				output is a blend of every earlier token's Value, weighted by how much it attended to them.
			</p>
		</Slide>

		<Inspector
			which="attention"
			caption="Attention × Value = Out — the softmaxed attention weights (one head) mix every token's Value into a new vector for each token."
		/>

		<Slide variant="pull-quote">
			<p>Attention moves information between tokens. The feed-forward layer decides what to make of it.</p>
		</Slide>

		<Slide title="The MLP: thinking it over">
			<p>
				After attention gathers context, each token is passed — on its own — through a small
				<Term t="Multi-layer perceptron">feed-forward network</Term>: expand to four times the width,
				apply the <Term t="GELU">GELU</Term> nonlinearity, then compress back. Much of a model's
				factual "knowledge" is thought to live here. Both halves are plain matrix multiplies:
			</p>
		</Slide>

		<Inspector
			which="mlpUp"
			caption="MLP expansion — each token's 768-vector is projected up to 3072 (≈4×), then passed through GELU."
		/>
		<Inspector
			which="mlpDown"
			caption="MLP compression — the 3072-wide hidden vector is projected back down to 768 and added to the residual stream."
		/>

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
				At the very top, the final token's vector is projected onto the whole
				<Term t="Vocabulary">vocabulary</Term> — one <Term t="Logits">logit</Term> per token (50,257
				of them in GPT-2). That last matrix multiply is the biggest in the model:
			</p>
		</Slide>

		<Inspector
			which="logits"
			caption="Logits — the final token's vector × the output-projection weights → a raw score for every one of the 50,257 vocabulary tokens."
		/>

		<Slide title="Softmax: scores into probabilities">
			<p>
				Those logits are raw scores, not probabilities — they can be negative and don't sum to
				anything tidy. <Term t="Softmax">Softmax</Term> fixes that: exponentiate each score and
				divide by the total, giving positive numbers that add to 1. The crucial dial is
				<Term t="Temperature">temperature</Term> (T): every score is divided by T <em>before</em>
				softmax. A low T exaggerates the gaps so the top score runs away with the probability; a high
				T shrinks the gaps so the field flattens toward uniform — more surprising, more "creative".
				Drag it and watch the very same scores reshape:
			</p>
		</Slide>

		<SoftmaxLab />

		<Slide title="Choosing one: greedy, top-k, top-p">
			<p>
				With a probability on every token, the model still has to commit to one. The blunt option is
				<Term t="Greedy decoding">greedy decoding</Term> — always take the most likely token;
				repeatable, but flat and prone to loops. Most generation instead <em>samples</em> from the
				distribution, after trimming the long tail of unlikely tokens one of two ways.
				<Term t="Top-k">Top-k</Term> keeps the <em>k</em> most likely candidates and renormalises — a
				fixed headcount. <Term t="Top-p sampling">Top-p</Term> (nucleus) instead keeps the smallest
				set whose probabilities add up past <em>p</em>, so the pool grows when the model is unsure
				and shrinks when it's confident. Temperature plus one of these cutoffs is where a model's
				"personality" is tuned — here they are on the real GPT-2 distribution:
			</p>
		</Slide>

		<Inspector
			which="probabilities"
			caption="The real GPT-2 next-word distribution. Drag temperature and switch top-k / top-p — the kept set and the bars reshape live."
		/>

		<a class="workshop-link" href="/1-langchain/model/explorer">
			Open the full live workshop — type your own prompt, run all 12 blocks, tune the sampling
			<ArrowUpRight size={16} />
		</a>

		<Slide title="So what is a model, really?">
			<p>
				A frozen pile of <Term t="Parameters">numbers</Term> that, run forward, turns a list of
				tokens into a probability distribution over the next one — wrapped in a loop. That's it.
				Everything else in this course is about feeding that loop well: composing it into
				<Term t="Chain">chains</Term>, streaming its tokens, constraining its output, handing it
				<Term t="tool">tools</Term>, and surrounding it with a whole
				<Term t="Deep Agent">harness</Term>. So the next move is simple — actually call one, on the
				right.
			</p>
		</Slide>

		<Slide variant="ornament">
			<p>Tokens in · one good guess out · repeat</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Gradient Descent — an interactive optimizer',
					href: 'https://neovand.github.io/GradientDescent/',
					kind: 'docs'
				},
				{
					label: 'TensorFlow Playground — train a neural net in the browser',
					href: 'https://playground.tensorflow.org/',
					kind: 'docs'
				},
				{
					label: '3Blue1Brown — Neural networks & transformers',
					href: 'https://www.3blue1brown.com/topics/neural-networks',
					kind: 'docs'
				},
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
					label: 'Transformer Explainer (Polo Club) — the source of these windows',
					href: 'https://poloclub.github.io/transformer-explainer/',
					kind: 'docs'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<div class="demo-intro">
			<p>
				The windows on the left are GPT-2 frozen mid-thought. Here you call the model you've
				configured — <span class="active">{active.provider} · {active.id}</span> — two ways.
			</p>
		</div>

		<Panel title="Demo 1 · the raw call" subtitle="what LangChain hides">
			<p class="demo-lede">
				Underneath every chain is this: a list of <Term t="Message">messages</Term> in, one
				<code>AIMessage</code> out. LangChain's prompt templates and parsers exist to hide these
				message objects — but it's worth seeing them once.
			</p>
			<input
				class="mini-input"
				bind:value={rawInput}
				placeholder="Ask anything…"
				onkeydown={(e) => e.key === 'Enter' && !rawRunning && runRaw()}
			/>
			<RunButton onclick={runRaw} running={rawRunning} label="model.invoke()" />
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
			<CodeBlock code={rawCode} lang="ts" caption="The exact call this demo runs." dense />
		</Panel>

		<Panel title="Demo 2 · the model as a Runnable" subtitle="prompt | model | parser">
			<p class="demo-lede">
				The same model, used the LangChain way: one <Term t="Runnable">Runnable</Term> in a tiny
				chain. The prompt fills in <code>{'{topic}'}</code>, the model answers, the parser pulls out
				a plain string. Streamed, so you watch it generate.
			</p>
			<input
				class="mini-input"
				bind:value={topic}
				placeholder="A topic to explain…"
				onkeydown={(e) => e.key === 'Enter' && !chainRunning && runChain()}
			/>
			<RunButton onclick={runChain} running={chainRunning} label="chain.stream()" variant="ghost" />
			{#if chainOut}
				<div class="chain-out">
					{#if chainDone}<Markdown source={chainOut} />{:else}{chainOut}{/if}
				</div>
			{/if}
			<CodeBlock code={chainCode} lang="ts" caption="The exact chain this demo runs." dense />
		</Panel>
	{/snippet}
</Lesson>

<style>
	/* Prominent workshop launch card at the top of the lesson. */
	.launch-card {
		display: flex;
		gap: 1.1rem;
		align-items: flex-start;
		padding: 1.4rem 1.5rem;
		margin: 0 0 2.5rem;
		border-radius: 1rem;
		text-decoration: none;
		border: 1px solid var(--accent-rule);
		background:
			radial-gradient(
				130% 150% at 0% 0%,
				color-mix(in oklch, var(--accent) 16%, transparent),
				transparent 60%
			),
			var(--color-bg-elev);
		transition:
			border-color 0.2s ease,
			transform 0.2s ease;
	}
	.launch-card:hover {
		border-color: var(--accent-ink);
		transform: translateY(-1px);
	}
	.lc-icon {
		flex-shrink: 0;
		color: var(--accent-ink);
		margin-top: 0.15rem;
	}
	.lc-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lc-title {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1.18rem;
		font-weight: 600;
		color: var(--color-fg);
	}
	.lc-sub {
		font-size: 0.92rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
	}

	/* "Play with the machinery" external-demo callout. */
	.demo-links {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 1.5rem 0;
		padding: 1rem 1.1rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		background: var(--color-paper);
	}
	.dl-head {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-ink-300);
		margin-bottom: 0.15rem;
	}
	.demo-links a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.92rem;
		color: var(--accent-ink);
		text-decoration: none;
		width: fit-content;
	}
	.demo-links a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* Posters: show at natural aspect. */
	.poster {
		margin: 2.25rem 0;
	}
	.poster :global(.hero) {
		display: block;
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
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

	.workshop-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 1.5rem 0;
		padding: 0.7rem 1rem;
		border-radius: 0.6rem;
		border: 1px solid var(--accent-rule);
		background: var(--accent-soft);
		color: var(--accent-ink);
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 500;
		line-height: 1.4;
	}
	.workshop-link:hover {
		border-color: var(--accent-ink);
	}

	/* Demo side. */
	.demo-intro p {
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
	.demo-lede {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-fg-muted);
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
