<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import DemoFrame from '$lib/components/DemoFrame.svelte';
	import Diagram from '$lib/components/Diagram.svelte';
	import { ragFlow } from '$lib/diagrams';
	import { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';
	import {
		EMBEDDINGS_PROVIDERS,
		activeEmbeddingModelLabel,
		type EmbeddingsProviderId
	} from '$lib/runtime/rag/registry';
	import {
		chunkDocuments,
		buildStore,
		answerWithRag,
		type Chunk,
		type RetrievedChunk
	} from '$lib/demos/rag-pipeline';
	import ragSrc from '$lib/demos/rag-pipeline.ts?raw';
	import type { DemoStep } from '$lib/demos/types';
	import type { DemoManifest } from '$lib/demos/download';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'rag',
		title: 'RAG pipeline',
		summary: 'Chunk → embed → retrieve → answer with citations over your own documents.',
		entries: [{ path: 'lib/demos/rag-pipeline.ts', code: ragSrc }],
		env: ['OPENAI_API_KEY'],
		note: 'The in-browser demo can embed with a bundled local MiniLM model; standalone uses OpenAI embeddings (set OPENAI_API_KEY).',
		runner: `import { chunkDocuments, buildStore, answerWithRag } from './lib/demos/rag-pipeline';

const docs = [
	{ source: 'lcel.md', text: 'LangChain Expression Language (LCEL) composes Runnables with the pipe operator. It is lazy: nothing runs until invoke or stream is called.' },
	{ source: 'rag.md', text: 'Retrieval-augmented generation embeds a query, retrieves the nearest chunks from a vector store, and asks the model to answer using only those chunks.' }
];

const chunks = await chunkDocuments(docs);
const store = await buildStore(chunks, 'openai');
const { hits, answer } = await answerWithRag(store, 'What is LCEL?', 3, (s) =>
	console.log('  ·', s.label, s.detail ? '— ' + s.detail : '')
);
console.log('\\nTop chunk:', hits[0]?.source, '(cos', hits[0]?.score.toFixed(3) + ')');
console.log('Answer:', answer);
`
	};

	const defaultDocs = [
		{
			source: 'LCEL',
			text: `LangChain Expression Language (LCEL) is a declarative way to compose Runnables. The pipe operator feeds the output of one Runnable into the next. LCEL is lazy: nothing runs until invoke or stream is called. Because every step is a Runnable, LCEL chains get batching, streaming, retries, fallbacks, and observable callbacks for free, without you writing any of that plumbing yourself.`
		},
		{
			source: 'LangGraph',
			text: `LangGraph models applications as directed, stateful, cyclic graphs. Each node is a function from the current state to a partial state update, and a reducer decides how updates merge. Edges can be unconditional or conditional on the state. Checkpointers persist the graph state after every superstep, which is what enables resuming after a crash, time travel to an earlier state, and human-in-the-loop interrupts that pause the graph and wait for input.`
		},
		{
			source: 'Deep Agents',
			text: `Deep Agents bundle planning, a virtual filesystem, subagent delegation, context summarization, and human-in-the-loop review into an opinionated harness. The agent reads, writes, and edits files using ls, read_file, write_file, edit_file, glob, and grep tools. When a tool returns a very long result, the harness evicts it to a file on the virtual filesystem and replaces it inline with a short path and preview, keeping the model's context small.`
		}
	];

	let docs = $state(defaultDocs.map((d) => ({ ...d })));
	let chunks = $state<Chunk[]>([]);
	let store: InMemoryVectorStore | null = $state(null);
	let provider = $state<EmbeddingsProviderId>('local');
	let warming = $state(false);
	let warmStatus = $state('Not indexed yet.');
	let expandedDoc = $state<number | null>(null);

	let question = $state('How do I resume a graph after a crash?');
	let topK = $state(3);
	let running = $state(false);
	let steps = $state<DemoStep[]>([]);
	let hits = $state<RetrievedChunk[]>([]);
	let answer = $state('');
	let expandedHit = $state<number | null>(null);

	const providerAvailable = (id: EmbeddingsProviderId) =>
		EMBEDDINGS_PROVIDERS.find((p) => p.id === id)?.available() ?? false;

	async function buildIndex() {
		warming = true;
		store = null;
		warmStatus =
			provider === 'local'
				? 'Embedding chunks with bundled MiniLM (no network)…'
				: 'Embedding chunks with the cloud provider…';
		try {
			chunks = await chunkDocuments(docs);
			store = await buildStore(chunks, provider);
			warmStatus = `Indexed ${chunks.length} chunks from ${docs.length} documents.`;
		} catch (err) {
			warmStatus = `Failed to index: ${(err as Error).message}`;
		} finally {
			warming = false;
		}
	}

	async function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const text = await file.text();
		docs = [...docs, { source: file.name, text }];
		store = null;
		warmStatus = `Added "${file.name}". Re-index to search it.`;
	}

	async function runQuery() {
		running = true;
		steps = [];
		hits = [];
		answer = '';
		try {
			if (!store) await buildIndex();
			if (!store) return;
			const collected: DemoStep[] = [];
			const out = await answerWithRag(store, question, topK, (s) => {
				collected.push(s);
				steps = [...collected];
			});
			hits = out.hits;
			answer = out.answer;
		} finally {
			running = false;
		}
	}

	onMount(() => {
		// Index lazily on first run to avoid burning embeddings on page load.
	});

	const code = ragSrc;
</script>

<Lesson
	title="RAG"
	eyebrow="Phase 1 · Lesson 05"
	hero={{
		id: 'l1-rag',
		alt: 'A library reading room with index cards floating between books'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		<Term t="RAG" /> is not magic; it is careful <Term t="Retriever">retrieval</Term> married to careful
		<Term t="Prompt">prompting</Term>. Done in the browser, the entire pipeline becomes legible.
	{/snippet}

	{#snippet intro()}
		<p>
			Instead of training a <Term t="Model">model</Term> on your data, <Term t="Embedding">embed</Term>
			your data into vectors at write time, <Term t="similaritySearch">search</Term> the closest matches
			at read time, and stuff them into the <Term t="Prompt">prompt</Term>. Everything in this lesson
			runs in your browser — <Term t="embedding model">embeddings</Term> included.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The librarian inside the prompt" variant="dropcap">
			<p>
				A <Term t="LLM">language model</Term> has a long memory of the public internet and almost no
				memory of you. <Term t="RAG">Retrieval-augmented generation</Term> closes that gap, not by
				fine-tuning the model but by changing what is on its desk when it speaks. The
				<Term t="Model">model</Term> stays general; the librarian — a tiny
				<Term t="embedding model">encoder</Term> plus a <Term t="Vector store">vector index</Term> —
				gets specific.
			</p>
			<p>
				Once you see <Term t="RAG" /> as two halves, it becomes manageable. The
				<Term t="Retriever">retrieval</Term> half is deterministic, testable, and where most failures
				live. The generation half is the <Term t="LLM" /> you already know. The interesting work is
				at the seam — <Term t="grounding">grounding</Term> and <Term t="citation">citations</Term>.
			</p>
		</Slide>

		<Slide title="The RAG sketch">
			<ul>
				<li>
					<strong>Chunk</strong> documents with <Term t="RecursiveCharacterTextSplitter"
						>RecursiveCharacterTextSplitter</Term
					> (<Term t="chunkSize">chunkSize</Term>, <Term t="chunkOverlap">chunkOverlap</Term>), then
					<strong>embed</strong> each <Term t="Chunk">chunk</Term> into a fixed-length vector. We use
					<Term t="MiniLM"><code>Xenova/all-MiniLM-L6-v2</code></Term> (384-dim, ~25 MB) or
					<Term t="OpenAIEmbeddings">OpenAI</Term> / <Term t="Voyage">Voyage</Term> via
					<Term t="makeEmbeddings">makeEmbeddings</Term>.
				</li>
				<li>
					<strong>Index</strong> vectors in a <Term t="Vector store">vector store</Term>. LangX uses
					<Term t="InMemoryVectorStore">InMemoryVectorStore</Term>; production uses
					<Term t="pgvector">pgvector</Term>, <Term t="Pinecone">Pinecone</Term>, or
					<Term t="Chroma">Chroma</Term>.
				</li>
				<li>
					<strong>Search</strong> with <Term t="similaritySearch">similaritySearch</Term> — embed the
					query, return <Term t="Top-k">top-k</Term> neighbours by
					<Term t="Cosine similarity">cosine similarity</Term>.
				</li>
				<li>
					<strong>Generate</strong> with <Term t="grounding">grounded</Term>
					<Term t="Prompt">prompting</Term>: pass hits to an <Term t="LLM" /> as context only.
				</li>
			</ul>
		</Slide>

		<Slide title="In your browser, on WebGPU" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="Indexing and searching three documents." />
			<p>
				The first run downloads the <Term t="embedding model">embedding model</Term> (small,
				cacheable) via <Term t="WebGPU" /> or <Term t="WebAssembly">WASM</Term>. After that,
				<Term t="Embedding">embedding</Term> is fast — run the demo on the right.
			</p>
		</Slide>

		<Diagram spec={ragFlow} />

		<Slide variant="pull-quote">
			<p>
				<Term t="RAG" /> is a contract between <Term t="Retriever">retrieval</Term> and
				<Term t="Prompt">prompting</Term>. Inspect each half on its own, or you will be debugging the
				wrong layer.
			</p>
		</Slide>

		<Slide title="Why the demo focuses on retrieval">
			<p>
				The <Term t="Retriever">retrieval</Term> half is what we inspect here — the
				<Term t="Model">model</Term> is just a final <Term t="Runnable">Runnable</Term> step that
				consumes whatever context retrieval returns. The demo does
				<Term t="similaritySearch">similarity search</Term> honestly with real
				<Term t="Cosine similarity">cosine</Term> scores over real <Term t="Embedding">embeddings</Term>
				so you can argue with the ranker before blaming the <Term t="LLM" />.
			</p>
		</Slide>

		<Slide title="Caveats">
			<p>
				In a real system: <Term t="Chunk">chunk</Term> before you embed, deduplicate, store
				<Term t="Document">Document</Term> metadata for <Term t="citation">citations</Term>, watch for
				<Term t="Context window">context-window</Term> inflation, and consider
				<Term t="hybrid search">hybrid search</Term> (<Term t="BM25">BM25</Term> + vectors). The
				machinery is small but the operational details determine whether
				<Term t="RAG" /> is actually useful.
			</p>
		</Slide>

		<Slide ornament>
			<p>Embed. Index. Search. Speak.</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<section class="corpus">
			<header class="corpus-head">
				<h3>Corpus</h3>
				<span class="muted">{docs.length} docs · {chunks.length || '—'} chunks</span>
			</header>
			<ul class="doclist">
				{#each docs as doc, i (i)}
					<li>
						<button class="doc-head" onclick={() => (expandedDoc = expandedDoc === i ? null : i)}>
							<span class="src">{doc.source}</span>
							<span class="muted">{doc.text.length} chars</span>
							<span class="chev" class:open={expandedDoc === i}>›</span>
						</button>
						{#if expandedDoc === i}
							<p class="doc-body">{doc.text}</p>
						{/if}
					</li>
				{/each}
			</ul>
			<label class="upload">
				<input type="file" accept=".md,.txt,text/plain,text/markdown" onchange={onUpload} />
				<span>+ Add your own .md / .txt</span>
			</label>
		</section>

		<DemoFrame
			title="RAG · retrieve then generate"
			subtitle="embed query → cosine search → grounded answer"
			code={code}
			codeCaption="src/lib/demos/rag-pipeline.ts — exactly what runs"
			steps={steps}
		>
			{#snippet run()}
				<div class="controls">
					<label class="field">
						<span>Embeddings provider</span>
						<select bind:value={provider} onchange={() => (store = null)}>
							{#each EMBEDDINGS_PROVIDERS as p (p.id)}
								<option value={p.id} disabled={!providerAvailable(p.id)}>
									{p.label} · {activeEmbeddingModelLabel(p.id)}{providerAvailable(p.id) ? '' : ' (key needed)'}
								</option>
							{/each}
						</select>
					</label>
					<label class="field topk">
						<span>Top-k</span>
						<input type="number" min="1" max="6" bind:value={topK} />
					</label>
				</div>
				<label class="row">
					<span>Question</span>
					<input type="text" bind:value={question} />
				</label>
				<div class="status">
					{#if warming}<span class="dot pulse-soft"></span>{:else}<span
							class="dot"
							class:on={!!store}
						></span>{/if}{warmStatus}
				</div>
				<RunButton onclick={runQuery} running={running} label={browser ? 'Index & answer' : 'Run'} />

				{#if answer}
					<div class="answer">
						<div class="answer-label">Grounded answer</div>
						<p>{answer}</p>
					</div>
				{/if}

				{#if hits.length}
					<ol class="hits">
						{#each hits as hit, i (i)}
							{@const pct = Math.max(0, hit.score) * 100}
							<li>
								<header>
									<span class="src">{hit.source} · chunk {hit.index}</span>
									<span
										class="score"
										class:weak={hit.score < 0.15}
										title="Cosine similarity ranges −1 to 1. Higher means the chunk's embedding points in the same direction as the query; values near 0 or below mean it is unrelated."
									>
										cos {hit.score.toFixed(3)}
									</span>
								</header>
								<div class="bar"><span style={`width:${pct}%`}></span></div>
								<p class:clamped={expandedHit !== i}>{hit.text}</p>
								<button class="more" onclick={() => (expandedHit = expandedHit === i ? null : i)}>
									{expandedHit === i ? 'show less' : 'show full chunk'}
								</button>
							</li>
						{/each}
					</ol>
				{/if}
			{/snippet}
		</DemoFrame>
	{/snippet}
</Lesson>

<style>
	.status {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.86rem;
		color: var(--color-ink-200);
		margin-bottom: 0.6rem;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-rule);
	}
	.dot.on {
		background: var(--color-accent-success);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	input {
		width: 100%;
	}

	.hits {
		list-style: none;
		padding: 0;
		margin: 0.85rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hits li {
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.6rem 0.75rem;
		background: var(--color-bg);
	}

	.hits header {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		margin-bottom: 0.4rem;
	}

	.src {
		color: var(--accent-ink);
		font-weight: 600;
	}

	.score {
		color: var(--accent-ink);
		cursor: help;
	}
	.score.weak {
		color: var(--color-ink-300);
	}

	.hits p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		font-family: var(--font-prose);
	}

	.hits p.clamped {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.bar {
		height: 5px;
		border-radius: 999px;
		background: var(--color-rule);
		overflow: hidden;
		margin: 0 0 0.5rem;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent-ink);
	}
	.more {
		margin-top: 0.4rem;
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-ink);
		cursor: pointer;
	}

	.corpus {
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		background: var(--color-bg);
		padding: 0.85rem 1rem;
	}
	.corpus-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.6rem;
	}
	.corpus-head h3 {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0;
		color: var(--color-ink-100);
	}
	.muted {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-ink-300);
	}
	.doclist {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.doc-head {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		width: 100%;
		background: none;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.4rem 0.6rem;
		cursor: pointer;
		color: var(--color-ink-100);
	}
	.doc-head .src {
		font-weight: 600;
	}
	.doc-head .chev {
		margin-left: auto;
		color: var(--color-ink-300);
		transition: transform 0.15s ease;
	}
	.doc-head .chev.open {
		transform: rotate(90deg);
	}
	.doc-body {
		margin: 0.4rem 0 0;
		padding: 0.5rem 0.6rem;
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--color-ink-200);
		font-family: var(--font-prose);
		background: var(--color-paper);
		border-radius: 0.4rem;
	}
	.upload input {
		display: none;
	}
	.upload {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--accent-ink);
		cursor: pointer;
	}

	.controls {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1;
	}
	.field.topk {
		flex: 0 0 4.5rem;
	}
	.field span {
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-ink-300);
	}
	select {
		width: 100%;
	}

	.answer {
		margin-top: 0.85rem;
	}
	.answer-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--accent-ink);
		margin-bottom: 0.35rem;
		font-family: var(--font-mono);
	}
	.answer p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
