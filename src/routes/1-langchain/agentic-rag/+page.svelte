<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import { FileText, X, Plus, ArrowUp, Pencil } from '@lucide/svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Toolbox from '$lib/components/Toolbox.svelte';
	import AgentGraph from '$lib/components/AgentGraph.svelte';
	import AgentInspector from '$lib/components/AgentInspector.svelte';
	import Citations from '$lib/components/Citations.svelte';
	import EmbeddingMap from '$lib/components/EmbeddingMap.svelte';
	import EmbeddingExplorer from '$lib/components/EmbeddingExplorer.svelte';
	import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import { displayContent } from '$lib/runtime/messages';
	import { parseDocument } from '$lib/demos/document-loader';
	import {
		setCorpus,
		newChat,
		sendTurn,
		getCitations,
		corpusSummary,
		getChunkPoints,
		getSearchEvents,
		ragToolSpecs,
		DEFAULT_SYSTEM_PROMPT,
		type Citation,
		type ChunkPoint,
		type SearchEvent
	} from '$lib/demos/agentic-rag';
	import {
		EMBEDDINGS_PROVIDERS,
		defaultEmbeddingsProvider,
		type EmbeddingsProviderId
	} from '$lib/runtime/rag/registry';
	import agenticRagSrc from '$lib/demos/agentic-rag.ts?raw';
	import ragSkill from '$lib/demos/skills/agentic-rag.md?raw';
	import ragPipelineSrc from '$lib/demos/rag-pipeline.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'agentic-rag',
		title: 'Agentic RAG',
		summary:
			'A document agent built only with createAgent: a search tool, a checkpointer for memory, and middleware — it searches, re-queries, cites, and clarifies.',
		entries: [
			{ path: 'lib/demos/agentic-rag.ts', code: agenticRagSrc },
			{ path: 'lib/demos/rag-pipeline.ts', code: ragPipelineSrc }
		],
		env: ['OPENAI_API_KEY'],
		note: 'Embeddings run on OpenAI in Node (the browser app uses a local model). Set OPENAI_API_KEY alongside ANTHROPIC_API_KEY.',
		runner: `import { setCorpus, newChat, sendTurn } from './lib/demos/agentic-rag';

const SAMPLE = \`Aurora Returns & Warranty Policy
Returns: any item within 30 days for a full refund if in original condition.
Warranty: Aurora espresso machines carry a 2-year limited warranty for manufacturing defects.
It does not cover descaling neglect or non-Aurora parts. Grinders carry a 1-year warranty.\`;

await setCorpus([{ source: 'aurora-policy.txt', text: SAMPLE }]);
await newChat(''); // default system prompt

const { messages } = await sendTurn(
  'How long is the espresso machine warranty, and what is not covered?',
  () => {},
);
console.log(messages.at(-1)?.content);
`,
		skill: ragSkill
	};

	let systemPrompt = $state(DEFAULT_SYSTEM_PROMPT);
	// The full corpus (kept so we can add/remove docs and re-index).
	let loadedDocs = $state<{ source: string; text: string }[]>([]);
	let docs = $state<{ source: string; chunks: number }[]>([]);
	// Default to the embeddings that match the configured chat provider (OpenAI/Azure/…),
	// only falling back to the local model when no hosted key is set up.
	let ragProvider = $state<EmbeddingsProviderId>(defaultEmbeddingsProvider());
	let indexing = $state(false);
	let running = $state(false);
	let error = $state('');
	let question = $state('');
	// Composer refs/state (ChatGPT-style, mirrors the Overview chatbot).
	let taEl = $state<HTMLTextAreaElement>();
	let docInput = $state<HTMLInputElement>();
	let plusOpen = $state(false);
	let msgEl = $state<HTMLElement>();

	const ragProviders = $derived(EMBEDDINGS_PROVIDERS.filter((p) => p.available()));

	interface Turn {
		question: string;
		messages: BaseMessage[];
		answer: string;
		cited: Citation[];
	}
	let turns = $state<Turn[]>([]);
	let liveTurn = $state<{ question: string; messages: BaseMessage[] } | null>(null);
	// Embedding map: chunk positions (after indexing) + the latest turn's query traces.
	let chunkPoints = $state<ChunkPoint[]>([]);
	let searchEvents = $state<SearchEvent[]>([]);

	// ── Toolbox: pull each tool's real source from the module ──────────────────
	function toolSource(exportName: string): string {
		const start = agenticRagSrc.indexOf(`export const ${exportName} = tool(`);
		if (start === -1) return '';
		const rest = agenticRagSrc.slice(start);
		const end = rest.indexOf('\n);');
		return (end === -1 ? rest : rest.slice(0, end + 3)).trim();
	}
	const toolboxTools = ragToolSpecs.map((t) => ({
		name: t.name,
		description: t.description,
		params: t.params,
		code: toolSource(t.exportName)
	}));

	// ── Live graph: the createAgent loop (search = the tools node) ─────────────
	const graphNodes = [
		{ id: '__start__', label: 'START', cx: 110, cy: 30, w: 86, h: 30, shape: 'pill' as const },
		{
			id: 'model_request',
			label: 'Model',
			sub: 'reasons & cites',
			cx: 110,
			cy: 120,
			w: 132,
			h: 56,
			shape: 'box' as const
		},
		{
			id: 'tools',
			label: 'Search',
			sub: 'queries the docs',
			cx: 300,
			cy: 120,
			w: 132,
			h: 56,
			shape: 'box' as const
		},
		{ id: '__end__', label: 'ANSWER', cx: 110, cy: 226, w: 96, h: 30, shape: 'pill' as const }
	];
	const graphEdges = [
		{ from: '__start__', to: 'model_request' },
		{ from: 'model_request', to: 'tools', bow: -14, lift: -15, label: 'search', labelDy: -20 },
		{ from: 'tools', to: 'model_request', bow: -14, lift: 15, label: 'passages', labelDy: 20 },
		{ from: 'model_request', to: '__end__', label: 'grounded answer' }
	];

	const latest = $derived(liveTurn ?? turns.at(-1) ?? null);
	const latestMessages = $derived(latest?.messages ?? []);
	const graphPath = $derived.by(() => {
		const out: string[] = [];
		if (!latestMessages.length) return out;
		out.push('__start__');
		let i = 0;
		while (i < latestMessages.length) {
			const m = latestMessages[i];
			if (m instanceof ToolMessage) {
				let j = i;
				while (j < latestMessages.length && latestMessages[j] instanceof ToolMessage) j++;
				out.push('tools');
				i = j;
			} else if (m instanceof AIMessage) {
				out.push('model_request');
				if (!m.tool_calls?.length) out.push('__end__');
				i++;
			} else {
				i++;
			}
		}
		return out;
	});
	const graphActive = $derived(graphPath.at(-1));

	function finalAnswer(messages: BaseMessage[]): string {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m instanceof AIMessage && !m.tool_calls?.length) return displayContent(m.content);
		}
		return '';
	}
	function citedFrom(answer: string): Citation[] {
		const ids = (answer.match(/\[(S\d+)\]/g) ?? [])
			.map((s) => s.slice(1, -1))
			.filter((v, i, a) => a.indexOf(v) === i);
		const all = getCitations();
		return ids.map((id) => all.find((c) => c.id === id)).filter((c): c is Citation => !!c);
	}

	// Re-index the whole corpus (after add/remove or a model switch) and start a
	// fresh conversation so memory matches the documents on hand.
	async function reindex() {
		indexing = true;
		error = '';
		try {
			if (loadedDocs.length) {
				await setCorpus($state.snapshot(loadedDocs), ragProvider);
				docs = corpusSummary();
				chunkPoints = getChunkPoints();
				await newChat(systemPrompt);
			} else {
				docs = [];
				chunkPoints = [];
			}
			turns = [];
			searchEvents = [];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			indexing = false;
		}
	}

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files?.length) return;
		try {
			const loaded = await Promise.all([...input.files].map((f) => parseDocument(f)));
			// Accumulate; replace any same-named doc so re-adding updates in place.
			const names = loaded.map((d) => d.source);
			loadedDocs = [
				...loadedDocs.filter((d) => !names.includes(d.source)),
				...loaded.map((d) => ({ source: d.source, text: d.text }))
			];
			await reindex();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			input.value = '';
		}
	}

	async function removeDoc(source: string) {
		loadedDocs = loadedDocs.filter((d) => d.source !== source);
		await reindex();
	}

	function autoGrow() {
		if (!taEl) return;
		taEl.style.height = 'auto';
		taEl.style.height = Math.min(taEl.scrollHeight, 176) + 'px';
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			ask();
		}
	}
	function reset() {
		turns = [];
		searchEvents = [];
		if (loadedDocs.length) newChat(systemPrompt);
	}

	async function ask() {
		if (!question.trim() || running || !loadedDocs.length) return;
		const q = question.trim();
		question = '';
		if (taEl) taEl.style.height = 'auto';
		running = true;
		error = '';
		liveTurn = { question: q, messages: [] };
		searchEvents = [];
		try {
			const out = await sendTurn(q, (m) => {
				if (liveTurn) liveTurn = { ...liveTurn, messages: m };
				searchEvents = [...getSearchEvents()]; // live trace as each search lands
			});
			const answer = finalAnswer(out.messages);
			turns = [...turns, { question: q, messages: out.messages, answer, cited: citedFrom(answer) }];
			searchEvents = [...getSearchEvents()];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			liveTurn = null;
			running = false;
		}
	}

	// The answer forming during a live turn (updates streamMode pops it in whole).
	const liveAnswer = $derived(liveTurn ? finalAnswer(liveTurn.messages) : '');
	// Auto-scroll the message list as turns/streaming grow.
	$effect(() => {
		turns.length;
		liveTurn?.messages.length;
		if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
	});

	const codeTool = `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// A retriever, wrapped as a tool the agent can CHOOSE to call.
const searchDocuments = tool(
  async ({ query, k }) => {
    const hits = await store.similaritySearch(query, k ?? 4);
    return JSON.stringify(
      hits.map((h, i) => ({
        id: \`S\${i + 1}\`,                 // a citation id the model can reference
        source: h.doc.metadata.source,
        score: Number(h.score.toFixed(3)),
        snippet: h.doc.pageContent
      }))
    );
  },
  {
    name: 'search_documents',
    description:
      'Search the uploaded documents. Returns ranked, cited passages. ' +
      'Re-search with a reworded query if results are weak.',
    schema: z.object({ query: z.string(), k: z.number().optional() })
  }
);`;

	const codeAgent = `import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';

const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
  tools: [searchDocuments, listDocuments],
  systemPrompt,                       // "search first · judge results · cite [S#] · ask if unsure"
  middleware: [retrievalTracer],      // a custom createMiddleware that traces each search
  checkpointer: new MemorySaver()     // multi-turn memory: follow-ups build on the chat
});

// Each turn continues the same thread, so the agent remembers the conversation.
const config = { configurable: { thread_id: 'chat-1' } };
for await (const step of await agent.stream(
  { messages: [{ role: 'user', content: question }] },
  { ...config, streamMode: 'updates' }
)) { /* one chunk per node: model_request → tools(search) → model_request → … */ }`;

	const middlewareItems = [
		{
			title: 'retrieval tracer (custom)',
			meta: 'createMiddleware · wrapToolCall',
			body: 'A tiny custom middleware that observes every search the agent makes — the live demo runs this one. The same seam can authorize, cache, or rewrite a query before it hits the store.'
		},
		{
			title: 'toolCallLimitMiddleware',
			meta: 'loop guard',
			body: 'Cap how many searches one turn may make so an over-eager re-query loop always terminates: toolCallLimitMiddleware({ toolName: "search_documents", runLimit: 6 }).'
		},
		{
			title: 'summarizationMiddleware',
			meta: 'long-chat memory',
			body: 'When a long research conversation nears the token budget, condense older turns so the agent keeps its head without forgetting the thread.'
		},
		{
			title: 'piiMiddleware',
			meta: 'safety',
			body: 'Redact emails, cards, or ids from questions and answers — useful when the documents or users carry sensitive data.'
		}
	];
</script>

<Lesson
	title="Agentic RAG"
	eyebrow="Level 1 · Capstone"
	hero={{
		id: 'l1-rag',
		alt: 'A scholar at a desk consulting several open books, thin threads connecting passages to a single written answer'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		You've built <Term t="Chain">chains</Term>, <Term t="tool">tools</Term>, the
		<Term t="create_agent"><code>createAgent</code></Term> loop, and
		<Term t="Middleware">middleware</Term>. Here they come together into something you'd actually
		ship: a document agent that doesn't just dump search results into a prompt, but <em>decides</em>
		what to search, judges what it finds, grounds every claim, and asks you when it's unsure.
	{/snippet}

	{#snippet intro()}
		<p>
			<Term t="RAG" /> usually means a fixed pipeline: retrieve once, stuff the chunks into a prompt,
			generate. <Term t="Agentic RAG"><strong>Agentic RAG</strong></Term> hands retrieval to the
			<Term t="Agent">agent</Term> as a <Term t="tool">tool</Term> — so it can search, read, rewrite a
			weak query and search again, and cite its sources — all on a plain
			<Term t="create_agent"><code>createAgent</code></Term>. Upload a few documents on the right and
			ask away.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The shift" title="From a pipeline to an agent" variant="dropcap">
			<p>
				Naive <Term t="RAG" /> is a one-shot pipeline: <Term t="embedding model">embed</Term> the
				question, <Term t="Retriever">retrieve</Term> the nearest <Term t="Chunk">chunks</Term>, paste
				them into the prompt, and hope they were the right ones.
			</p>
			<p>
				That “hope” is the whole problem. Here's the pipeline end to end — and to see exactly where it
				strains, it helps to first understand what makes two pieces of text “similar.”
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="dgm-rag"
				alt="A query flows once into a retriever, which pulls chunks straight into a generator — a one-shot pipeline"
			/>
			<figcaption>
				<strong>Naive <Term t="RAG" />:</strong> embed the question, retrieve once, generate. A straight
				line — if that single search grabs the wrong passages, the answer is wrong with no way back.
			</figcaption>
		</figure>

		<Slide title="First, what is “similar”?">
			<p>
				Retrieval rests on two ideas. An <Term t="embedding model">embedding</Term> turns a piece of
				text into a long list of numbers (384 of them here) that captures its <em>meaning</em> — so
				“espresso” and “coffee” land close together, “invoice” far away.
				<Term t="Cosine similarity">Cosine similarity</Term> measures how close two of those vectors
				point: it's literally the cosine of the <strong>angle</strong> between them — 1 when they point
				the same way, ~0 when they're unrelated. Try it: type two phrases and watch the angle.
			</p>
			<EmbeddingExplorer />
		</Slide>

		<Slide title="Where naive RAG breaks">
			<p>A one-shot pipeline is only as good as its single search — and that's a lot to pin on one query:</p>
			<ul>
				<li>
					<strong>A weak query sinks the whole answer.</strong> A vague or oddly worded question
					<Term t="Retriever">retrieves</Term> the wrong <Term t="Chunk">chunks</Term>, and the pipeline
					never notices or recovers.
				</li>
				<li>
					<strong>Compound questions need more than one search.</strong> “What's the warranty,
					<em>and</em> the return window?” is two lookups — a pipeline does one and half-answers.
				</li>
				<li>
					<strong>Ambiguity becomes a confident guess.</strong> There's no step where it can stop and
					ask what you meant.
				</li>
				<li>
					<strong>No memory.</strong> Every turn starts cold — a follow-up like “and the grinder?” means
					nothing on its own.
				</li>
				<li>
					<strong>No provenance.</strong> The chunks vanish into the prompt; you can't see which passage
					justified which sentence.
				</li>
			</ul>
		</Slide>

		<Slide variant="pull-quote">
			<p>Naive RAG retrieves and hopes. An agent retrieves, reads, and decides what to do next.</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="dgm-agentic-rag"
				alt="A user query enters a central agent engine that loops through a search tool and vector store, with a memory tank, a query-rewrite valve, a branch back to the user to clarify, and a cited answer"
			/>
			<figcaption>
				<strong><Term t="Agentic RAG">Agentic RAG</Term>:</strong> the same retriever becomes a
				<Term t="tool">tool</Term> the <Term t="Agent">agent</Term> calls inside a <Term t="ReAct" />
				loop — searching, reading the scores, rewriting weak queries, remembering past turns, and
				<Term t="Grounding">citing</Term> every passage it used. Retrieval, with a brain steering it.
			</figcaption>
		</figure>

		<Slide title="Why the agent wins: createAgent, a tool, and the ReAct loop">
			<p>
				The fix isn't a smarter retriever — it's giving the <Term t="Model">model</Term> <em>control</em>
				over retrieval. Wrap the <Term t="Vector store">vector search</Term> in a <code>tool()</code> and
				hand it to <Term t="create_agent"><code>createAgent</code></Term>. Now the model decides
				<em>when</em> to search and <em>what</em> to search for — in its own words, not a fixed template.
			</p>
			<p>
				<code>createAgent</code> wraps that tool in a <Term t="ReAct" /> loop —
				<code>model_request → tools → model_request</code> — so it can search, look at what came back, and
				go again. You never hand-code retry or query expansion; the behaviour <em>emerges</em>: reword and
				re-search when the scores are low, run two searches for a compound question, or ask a clarifying
				question instead of guessing. Add a <Term t="Checkpointer">checkpointer</Term> for memory and have
				the tool hand back <strong>citation ids</strong> for provenance — and every weakness above turns
				into something the agent simply recovers from.
			</p>
		</Slide>

		<Slide title="Retrieval is just a tool" variant="code-first">
			<p>
				The whole trick: wrap a <Term t="Vector store">vector store</Term>
				<Term t="Cosine similarity">similarity search</Term> in a <code>tool()</code> and hand it to
				<code>createAgent</code>. Return each passage with a small <strong>citation id</strong> and its
				score, so the model can reference exactly what it used.
			</p>
			<CodeBlock code={codeTool} lang="ts" caption="A retriever the agent can call — ranked, cited passages." />
		</Slide>

		<Slide title="The loop does the hard part">
			<p>
				You don't hand-code query expansion or retry logic — they <em>emerge</em> from the
				<Term t="ReAct" /> loop plus a good <Term t="systemPrompt">system prompt</Term>. Tell the agent
				to search first, judge the scores, reword and retry when results are weak, and ask a clarifying
				question rather than guess. The <code>model_request → tools → model_request</code> cycle gives
				it as many retrieval passes as it needs.
			</p>
			<CodeBlock code={codeAgent} lang="ts" caption="A search tool, a checkpointer for memory, a middleware — that's the whole agent." />
		</Slide>

		<Slide title="Grounding & citations">
			<p>
				Because the search <Term t="tool">tool</Term> returns each passage with an id like
				<code>S1</code>, the agent can cite inline — <code>[S1]</code>, <code>[S2]</code> — and the UI
				resolves each marker back to the exact <Term t="Chunk">chunk</Term>, its document, and its
				similarity score. Every claim is checkable. The system prompt forbids answering from outside the
				retrieved passages — that's <Term t="Grounding">grounding</Term>, and it's what keeps a RAG agent
				honest.
			</p>
		</Slide>

		<Slide title="Memory turns it into a conversation">
			<p>
				A <Term t="Checkpointer">checkpointer</Term> (<Term t="MemorySaver" />) plus a
				<Term t="thread_id">thread id</Term> makes every turn continue the same conversation. So
				follow-ups work — ask “and the grinder?” and it knows you still mean warranties — and when it
				asks you to clarify, your reply flows straight back into the next search. That's the
				“keep the user in the loop” you wanted, with no extra machinery.
			</p>
		</Slide>

		<Accordion items={middlewareItems} heading="Middleware that hardens it" />

		<Slide title="This is the whole chapter, working together" ornament>
			<p>
				A <Term t="Chain">chain</Term> of <Term t="Runnable">runnables</Term>, a
				<Term t="stream">streamed</Term> loop, <Term t="tool">tools</Term> the
				<Term t="Model">model</Term> chooses, <Term t="Middleware">middleware</Term> around the edges,
				and <Term t="Conversation memory">memory</Term> across turns — that's a real product. Next door,
				<a href="/2-langgraph"><Term t="LangGraph" /></a> hands you the graph itself when the loop needs
				to branch or persist; <a href="/3-deepagents"><Term t="Deep Agent">Deep Agents</Term></a> stack
				these middleware into autonomous research harnesses.
			</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'RAG with createAgent',
					href: 'https://docs.langchain.com/oss/javascript/langchain/rag',
					kind: 'docs'
				},
				{
					label: 'Retrieval — concepts',
					href: 'https://docs.langchain.com/oss/javascript/langchain/retrieval',
					kind: 'docs'
				},
				{
					label: 'API · createAgent',
					href: 'https://reference.langchain.com/javascript/functions/langchain.index.createAgent.html',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="drop in docs, ask, watch it search and cite">
			<ol class="howto">
				<li>
					<strong>Feed it documents.</strong> Use the <strong>+</strong> button under the chat to add a
					PDF, Markdown, or text file — each is chunked and indexed in your browser. Tune the
					<em>Configure</em> panel's embedding model or system prompt first if you like.
				</li>
				<li>
					<strong>Ask something compound.</strong> Try a two-part or vaguely worded question — the
					agent searches, judges the scores, rewords and re-searches when results are weak, and cites
					each passage inline as <code>[S1]</code>, <code>[S2]</code>.
				</li>
				<li>
					<strong>Look under the hood.</strong> The <em>Under the hood</em> panel plots your query on
					the embedding map beside the passages it retrieved, lights up the
					<code>model → search → model</code> loop, and lays out the full trail. Then ask a follow-up —
					it remembers.
				</li>
			</ol>
		</Panel>

		<Panel title="Configure" subtitle="the agent's embedding model, instructions, and tools">
			<label class="cfg-row">
				<span class="cfg-label">
					<span>Embedding model</span>
					<small>indexes &amp; searches your documents</small>
				</span>
				<select bind:value={ragProvider} onchange={reindex} disabled={indexing || running}>
					{#each ragProviders as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
				</select>
			</label>
			<details class="more">
				<summary>system prompt — the agent's standing instructions</summary>
				<textarea bind:value={systemPrompt} rows="6" spellcheck="false" disabled={running}></textarea>
				<p class="hint-sm">Edit, then add (or re-add) a document to start a fresh chat with these instructions.</p>
			</details>
			<Toolbox tools={toolboxTools} label="Toolbox" />
		</Panel>

		<div class="chat">
			<div class="chat-head">
				<div class="chat-head-left">
					<span class="status-dot" class:busy={running || indexing}></span>
					<span class="chat-title">RAG agent</span>
				</div>
				<div class="head-actions">
					<button
						class="head-btn new-chat-btn"
						onclick={reset}
						disabled={!turns.length}
						title="New chat"
						aria-label="New chat"
					>
						<Pencil size={14} /><span>New</span>
					</button>
				</div>
			</div>

			<div class="messages" bind:this={msgEl}>
				{#if !loadedDocs.length && !turns.length}
					<p class="empty">
						Add one or more documents with the <span class="plus-inline"><Plus size={12} /></span> button
						below, then ask away — answers cite the exact passages they used. Everything stays in your
						browser.
					</p>
				{/if}
				{#each turns as t, i (i)}
					<div class="msg user"><div class="bubble">{t.question}</div></div>
					<div class="msg assistant">
						<div class="bubble">
							{#if t.answer}<Markdown source={t.answer} />{/if}
							<Citations citations={t.cited} />
						</div>
					</div>
				{/each}
				{#if liveTurn}
					<div class="msg user"><div class="bubble">{liveTurn.question}</div></div>
					<div class="msg assistant">
						{#if liveAnswer}
							<div class="bubble"><Markdown source={liveAnswer} /></div>
						{:else}
							<div class="bubble typing"><span></span><span></span><span></span></div>
						{/if}
					</div>
				{/if}
			</div>

			{#if error}<div class="err">{error} — set a model in <a href="/setup">Setup</a>.</div>{/if}
			{#if indexing}<div class="loading">Indexing documents…</div>{/if}

			<label class="composer">
				{#if docs.length}
					<div class="attach-row">
						{#each docs as d (d.source)}
							<div class="doc-attach">
								<FileText size={14} />
								<div class="doc-attach-info">
									<span class="doc-attach-name">{d.source}</span>
									<span class="doc-attach-meta">{d.chunks} {d.chunks === 1 ? 'chunk' : 'chunks'}</span>
								</div>
								<button
									class="attach-x"
									type="button"
									onclick={() => removeDoc(d.source)}
									aria-label="Remove {d.source}"><X size={12} /></button
								>
							</div>
						{/each}
					</div>
				{/if}

				<textarea
					class="text-in"
					bind:this={taEl}
					bind:value={question}
					rows="1"
					placeholder={loadedDocs.length ? 'Ask about your documents…' : 'Add a document to begin…'}
					oninput={autoGrow}
					onkeydown={onKey}
					disabled={running}
				></textarea>

				<div class="plus-wrap">
					<button
						class="plus-btn"
						class:open={plusOpen}
						type="button"
						onclick={() => (plusOpen = !plusOpen)}
						aria-label="Add documents"
						aria-expanded={plusOpen}
					>
						<Plus size={18} />
					</button>
					{#if plusOpen}
						<button
							class="pm-backdrop"
							type="button"
							aria-label="Close menu"
							onclick={() => (plusOpen = false)}
						></button>
						<div class="plus-menu" role="menu">
							<button
								class="pm-item"
								type="button"
								role="menuitem"
								onclick={() => {
									plusOpen = false;
									docInput?.click();
								}}
							>
								<FileText size={16} /> <span>Add documents</span>
							</button>
						</div>
					{/if}
				</div>

				<button
					class="send"
					type="button"
					onclick={ask}
					disabled={running || !question.trim() || !loadedDocs.length}
					aria-label="Send"
				>
					<ArrowUp size={18} strokeWidth={2.5} />
				</button>

				<input
					type="file"
					accept=".pdf,.md,.markdown,.txt"
					multiple
					hidden
					bind:this={docInput}
					onchange={onFiles}
				/>
			</label>
		</div>

		<Panel title="Under the hood" subtitle="the search loop, the passages, and the embedding space">
			{#if chunkPoints.length}
				<div class="uth-section">
					<span class="uth-label">Embedding map</span>
					<EmbeddingMap {chunkPoints} {searchEvents} />
				</div>
			{/if}
			{#if latestMessages.length}
				<div class="uth-section">
					<span class="uth-label">The loop</span>
					<div class="graph-wrap">
						<AgentGraph nodes={graphNodes} edges={graphEdges} activeNode={graphActive} path={graphPath} />
					</div>
				</div>
				<AgentInspector messages={latestMessages} />
			{:else if chunkPoints.length}
				<p class="hint">Ask a question — its query will land on the map beside the passages it retrieves.</p>
			{:else}
				<p class="hint">Add a document, then ask a question to watch the search loop and the embedding space.</p>
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

	.diagram {
		margin: 2rem 0;
	}
	.diagram :global(.hero) {
		display: block;
		width: 100%;
		border-radius: 0;
		overflow: hidden;
	}
	.diagram :global(.hero .placeholder) {
		display: none;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		object-fit: initial;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin: 0.7rem auto 0;
		max-width: 40rem;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		font-style: italic;
		text-align: center;
	}

	/* Configure panel */
	.cfg-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.cfg-label {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.cfg-label span {
		font-size: 0.86rem;
		color: var(--color-ink-100);
	}
	.cfg-label small {
		font-size: 0.72rem;
		color: var(--color-ink-300);
	}
	.cfg-row select {
		appearance: none;
		-webkit-appearance: none;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--color-fg);
		padding: 0.32rem 1.6rem 0.32rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		box-shadow: none;
		background:
			var(--color-paper)
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23a99a86' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
			no-repeat right 0.55rem center;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}
	.cfg-row select:hover {
		border-color: var(--accent-rule);
	}
	.cfg-row select:focus-visible {
		outline: none;
		border-color: var(--accent);
	}

	.more {
		margin-top: 0.85rem;
	}
	.more summary {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		cursor: pointer;
		list-style: none;
	}
	.more summary::-webkit-details-marker {
		display: none;
	}
	.more summary::before {
		content: '▸ ';
		color: var(--accent);
	}
	.more[open] summary::before {
		content: '▾ ';
	}
	.more summary:hover {
		color: var(--accent);
	}
	.more textarea {
		width: 100%;
		box-sizing: border-box;
		margin-top: 0.5rem;
	}
	.hint-sm {
		font-size: 0.72rem;
		color: var(--color-ink-300);
		margin: 0.35rem 0 0;
	}

	/* ── Chat widget (mirrors the Overview chatbot) ────────────────────────── */
	.chat {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-rule);
		border-radius: 0.85rem;
		background: var(--color-bg);
		overflow: hidden;
		margin-bottom: 1.4rem;
	}
	.chat-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.6rem 0.7rem 0.6rem 1rem;
		background: var(--color-paper);
	}
	.chat-head-left {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
	}
	.status-dot.busy {
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	.chat-title {
		font-family: var(--font-display);
		font-size: 0.98rem;
		color: var(--color-ink-100);
	}
	.head-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.head-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		height: 1.9rem;
		padding: 0 0.55rem;
		border-radius: 0.45rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-ink-300);
		font-size: 0.75rem;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.head-btn span {
		font-family: var(--font-mono);
	}
	.head-btn:hover:not(:disabled) {
		color: var(--accent);
		background: var(--color-bg);
	}
	.head-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.messages {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.85rem 1rem;
		min-height: 9rem;
		max-height: 24rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.3s ease;
	}
	.messages:hover {
		scrollbar-color: color-mix(in oklch, var(--color-fg) 20%, transparent) transparent;
	}
	.empty {
		font-size: 0.86rem;
		line-height: 1.55;
		color: var(--color-ink-300);
		margin: 0.4rem 0;
	}
	.plus-inline {
		display: inline-flex;
		vertical-align: middle;
		color: var(--accent);
	}
	.msg {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-width: 88%;
	}
	.msg.user {
		align-self: flex-end;
		align-items: flex-end;
	}
	.msg.assistant {
		align-self: flex-start;
		max-width: 95%;
	}
	.bubble {
		padding: 0.45rem 0.7rem;
		border-radius: 0.9rem;
		font-size: 0.84rem;
		line-height: 1.5;
		word-break: break-word;
	}
	.msg.user .bubble {
		background: var(--accent);
		color: #1a1206;
		border-bottom-right-radius: 0.3rem;
		white-space: pre-wrap;
	}
	.msg.assistant .bubble {
		background: var(--color-bg-elev-2);
		color: var(--color-ink-100);
		border-bottom-left-radius: 0.3rem;
	}
	.msg.assistant .bubble :global(.markdown) {
		font-size: 0.84rem;
		line-height: 1.55;
	}
	.msg.assistant .bubble :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.msg.assistant .bubble :global(.markdown > :last-child) {
		margin-bottom: 0;
	}
	.bubble.typing {
		display: inline-flex;
		gap: 0.25rem;
		align-items: center;
	}
	.bubble.typing span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-ink-300);
		animation: blink 1.2s infinite ease-in-out;
	}
	.bubble.typing span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.bubble.typing span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes blink {
		0%,
		80%,
		100% {
			opacity: 0.25;
		}
		40% {
			opacity: 1;
		}
	}
	.loading {
		margin: 0 1rem;
		font-size: 0.82rem;
		color: var(--color-ink-200);
		font-family: var(--font-mono);
	}

	/* Composer (ChatGPT-style) */
	.composer {
		position: relative;
		display: block;
		margin: 0;
		border: none;
		border-top: 1px solid var(--color-rule);
		border-radius: 0;
		background: var(--color-bg-elev);
		padding: 0.7rem 0.85rem 2.5rem;
		cursor: text;
	}
	.attach-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0 0.1rem 0.55rem;
	}
	.doc-attach {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-fg-muted);
		min-width: 0;
		max-width: 13rem;
	}
	.doc-attach > :first-child {
		flex-shrink: 0;
		color: var(--accent);
		opacity: 0.7;
	}
	.doc-attach-info {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}
	.doc-attach-name {
		font-size: 0.74rem;
		font-family: var(--font-mono);
		color: var(--color-fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.doc-attach-meta {
		font-size: 0.62rem;
		color: var(--color-fg-faint);
	}
	.attach-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		padding: 0;
		margin-left: auto;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.attach-x:hover {
		color: var(--color-fg);
		background: var(--color-bg-elev-2);
	}
	.composer .text-in,
	.composer .text-in:focus {
		display: block;
		width: 100%;
		border: none;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		resize: none;
		outline: none;
		font-family: var(--font-sans);
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		padding: 0 0.15rem;
		min-height: 2.3rem;
		max-height: 11rem;
	}
	.composer .text-in::placeholder {
		color: var(--color-fg-faint, oklch(0.45 0.01 75));
		opacity: 0.5;
	}
	.plus-wrap {
		position: absolute;
		left: 0.7rem;
		bottom: 0.5rem;
	}
	.plus-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: var(--color-ink-200);
		cursor: pointer;
		transition:
			color 0.2s ease,
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.plus-btn:hover {
		color: var(--accent);
	}
	.plus-btn.open {
		color: var(--accent);
		transform: rotate(45deg);
	}
	.pm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}
	.plus-menu {
		position: absolute;
		bottom: calc(100% + 0.45rem);
		left: 0;
		z-index: 21;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 11rem;
		padding: 0.35rem;
		background: var(--color-bg-elev-2);
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		box-shadow: 0 14px 36px -16px rgba(0, 0, 0, 0.7);
	}
	.pm-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
		border-radius: 0.5rem;
		border: none;
		background: transparent;
		color: var(--color-ink-100);
		font-size: 0.88rem;
		cursor: pointer;
		text-align: left;
	}
	.pm-item:hover {
		background: var(--color-bg);
		color: var(--accent);
	}
	.send {
		position: absolute;
		right: 0.7rem;
		bottom: 0.5rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: #1a1206;
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}
	.send:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.send:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.graph-wrap {
		margin-bottom: 0.9rem;
	}
	.uth-section {
		margin-bottom: 1.1rem;
	}
	.uth-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-ink-300);
		margin-bottom: 0.5rem;
	}
	.err {
		margin: 0 1rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.82rem;
		color: var(--color-accent-warning);
	}
	.hint {
		font-size: 0.86rem;
		color: var(--color-ink-300);
		margin: 0;
	}
</style>
