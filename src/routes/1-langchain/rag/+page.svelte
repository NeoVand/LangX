<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import { Document } from '@langchain/core/documents';
	import { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';
	import { MiniLmEmbeddings } from '$lib/runtime/rag/embeddings';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	const sourceA = `LangChain Expression Language (LCEL) is a declarative way to compose Runnables. The pipe operator feeds the output of one Runnable into the next. LCEL is lazy: nothing runs until invoke or stream is called. It supports batching, streaming, retries, fallbacks, and observable callbacks for free.`;

	const sourceB = `LangGraph models applications as directed stateful cyclic graphs. Each node is a function from state to a partial state update. Edges can be unconditional or conditional. Checkpointers persist the graph state after every step, enabling resume, time travel, and human-in-the-loop interrupts.`;

	const sourceC = `Deep Agents bundle planning, a virtual filesystem, subagent delegation, summarization, and human-in-the-loop into an opinionated harness. The agent reads, writes, and edits files using ls, read_file, write_file, edit_file, glob, and grep tools. Long tool outputs are evicted to disk and replaced with a path and short preview.`;

	let store: InMemoryVectorStore | null = $state(null);
	let warming = $state(false);
	let warmStatus = $state<string>('Embedding model not yet downloaded.');

	type Hit = { source: string; pageContent: string; score: number };
	type HitPayload = { question: string; hits: Hit[] };

	let q1 = $state('What does the pipe operator actually do?');
	let q1Run = $state(false);
	let q1Hits = $state<Hit[]>([]);

	let q2 = $state('How do I resume a graph after a crash?');
	let q2Run = $state(false);
	let q2Hits = $state<Hit[]>([]);

	async function ensureStore() {
		if (store) return store;
		warming = true;
		warmStatus = 'Loading MiniLM embeddings (~25 MB the first time)…';
		try {
			const embeddings = new MiniLmEmbeddings();
			const s = new InMemoryVectorStore(embeddings);
			await s.addDocuments([
				new Document({ pageContent: sourceA, metadata: { source: 'LCEL', chapter: 1 } }),
				new Document({ pageContent: sourceB, metadata: { source: 'LangGraph', chapter: 2 } }),
				new Document({
					pageContent: sourceC,
					metadata: { source: 'Deep Agents', chapter: 3 }
				})
			]);
			store = s;
			warmStatus = `Indexed ${s.entries.length} documents · 384-dim vectors.`;
		} catch (err) {
			warmStatus = `Failed to load embeddings: ${(err as Error).message}`;
		} finally {
			warming = false;
		}
	}

	function toHits(rows: { doc: Document; score: number }[]): Hit[] {
		return rows.map((h) => ({
			source: String(h.doc.metadata?.source ?? ''),
			pageContent: h.doc.pageContent,
			score: h.score
		}));
	}

	async function runQ1() {
		q1Run = true;
		q1Hits = [];
		try {
			const out = await withRunCache<HitPayload>({ demoId: 'l1-rag-single' }, async () => {
				const s = await ensureStore();
				if (!s) return { question: q1, hits: [] };
				const rows = await s.similaritySearch(q1, 3);
				return { question: q1, hits: toHits(rows) };
			});
			q1Hits = out.hits;
		} finally {
			q1Run = false;
		}
	}

	async function runQ2() {
		q2Run = true;
		q2Hits = [];
		try {
			const out = await withRunCache<HitPayload>({ demoId: 'l1-rag-cross' }, async () => {
				const s = await ensureStore();
				if (!s) return { question: q2, hits: [] };
				const rows = await s.similaritySearch(q2, 3);
				return { question: q2, hits: toHits(rows) };
			});
			q2Hits = out.hits;
		} finally {
			q2Run = false;
		}
	}

	onMount(async () => {
		const c1 = await loadCachedRun<HitPayload>({ demoId: 'l1-rag-single' });
		if (c1) q1Hits = c1.payload.hits;
		const c2 = await loadCachedRun<HitPayload>({ demoId: 'l1-rag-cross' });
		if (c2) q2Hits = c2.payload.hits;
	});

	const code = `import { Document } from '@langchain/core/documents';
import { MiniLmEmbeddings } from '$lib/runtime/rag/embeddings';
import { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';

const store = new InMemoryVectorStore(new MiniLmEmbeddings());

await store.addDocuments([
  new Document({ pageContent: sourceA, metadata: { source: 'LCEL' } }),
  new Document({ pageContent: sourceB, metadata: { source: 'LangGraph' } }),
  new Document({ pageContent: sourceC, metadata: { source: 'Deep Agents' } })
]);

const hits = await store.similaritySearch('How do I resume a crashed graph?', 3);
// hits[0].doc.pageContent → the LangGraph passage`;
</script>

<Lesson
	title="RAG"
	eyebrow="Phase 1 · Lesson 05"
	motivation="Retrieval-augmented generation is not magic; it is careful retrieval married to careful prompting. Done in the browser, the entire pipeline becomes legible."
	hero={{
		id: 'l1-rag',
		alt: 'A library reading room with index cards floating between books'
	}}
>
	{#snippet intro()}
		<p>
			Instead of training a model on your data, embed your data into vectors at write time,
			find the closest matches at read time, and stuff them into the prompt. Everything in
			this lesson runs in your browser — embeddings included.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="The librarian inside the prompt" variant="dropcap">
			<p>
				A language model has a long memory of the public internet and almost no memory of
				you. Retrieval-augmented generation closes that gap, not by fine-tuning the model
				but by changing what is on its desk when it speaks. The model stays general; the
				librarian — a tiny encoder plus a vector index — gets specific.
			</p>
			<p>
				Once you see RAG as two halves, it becomes manageable. The retrieval half is
				deterministic, testable, and where most failures live. The generation half is the
				LLM you already know. The interesting work is at the seam between them.
			</p>
		</Slide>

		<Slide title="The RAG sketch">
			<ul>
				<li>
					<strong>Embed</strong> each document chunk into a fixed-length vector with a
					small encoder model. We use <code>Xenova/all-MiniLM-L6-v2</code>, 384-dim, ~25 MB.
				</li>
				<li>
					<strong>Index</strong> those vectors. For tiny corpora a plain array works; in
					production you would reach for pgvector, Pinecone, or Chroma.
				</li>
				<li>
					<strong>Search</strong> by embedding the query and returning the nearest
					neighbours by cosine similarity.
				</li>
				<li>
					<strong>Generate</strong> by passing the top hits to an LLM as context.
				</li>
			</ul>
		</Slide>

		<Slide title="In your browser, on WebGPU" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="Indexing and searching three documents." />
			<p>
				The first run downloads the embedding model (small, cacheable). After that,
				embedding is fast — try the two demos on the right.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				RAG is a contract between retrieval and prompting. Inspect each half on its own, or
				you will be debugging the wrong layer.
			</p>
		</Slide>

		<Slide title="Why the demo focuses on retrieval">
			<p>
				The retrieval half is what we are inspecting here — the model is just a final step
				that consumes whatever context retrieval returns. The two demos below do the
				retrieval honestly with real cosine similarity over real embeddings, and the
				similarity scores are surfaced so you can argue with the ranker.
			</p>
		</Slide>

		<Slide title="Caveats">
			<p>
				In a real system: chunk before you embed, deduplicate, store metadata for
				citations, watch for context-window inflation, and consider hybrid search (BM25 +
				vectors). The machinery is small but the operational details determine whether it
				is actually useful.
			</p>
		</Slide>

		<Slide ornament>
			<p>Embed. Index. Search. Speak.</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Embedding status">
			<div class="status">
				{#if warming}
					<span class="dot pulse-soft"></span>{warmStatus}
				{:else}
					<span class="dot" class:on={!!store}></span>{warmStatus}
				{/if}
			</div>
			{#if browser && !store}
				<RunButton
					onclick={async () => {
						await ensureStore();
					}}
					running={warming}
					variant="ghost"
					label="Download model & index 3 docs"
				/>
			{/if}
		</Panel>

		<Panel title="Demo 1 · Single-source query">
			<label class="row">
				<span>Question</span>
				<input type="text" bind:value={q1} />
			</label>
			<RunButton onclick={runQ1} running={q1Run} />
			{#if q1Hits.length}
				<ol class="hits">
					{#each q1Hits as hit, i (i)}
						<li>
							<header>
								<span class="src">{hit.source}</span>
								<span class="score">{(hit.score * 100).toFixed(1)}%</span>
							</header>
							<p>{hit.pageContent}</p>
						</li>
					{/each}
				</ol>
			{/if}
		</Panel>

		<Panel title="Demo 2 · Cross-document query">
			<label class="row">
				<span>Question</span>
				<input type="text" bind:value={q2} />
			</label>
			<RunButton onclick={runQ2} running={q2Run} />
			{#if q2Hits.length}
				<ol class="hits">
					{#each q2Hits as hit, i (i)}
						<li>
							<header>
								<span class="src">{hit.source}</span>
								<span class="score">{(hit.score * 100).toFixed(1)}%</span>
							</header>
							<p>{hit.pageContent}</p>
						</li>
					{/each}
				</ol>
			{/if}
		</Panel>
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
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
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
		color: var(--color-ink-300);
	}

	.hits p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		font-family: var(--font-prose);
	}
</style>
