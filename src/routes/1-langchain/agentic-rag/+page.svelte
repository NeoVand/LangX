<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import Accordion from '$lib/components/Accordion.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Toolbox from '$lib/components/Toolbox.svelte';
	import AgentGraph from '$lib/components/AgentGraph.svelte';
	import AgentInspector from '$lib/components/AgentInspector.svelte';
	import Citations from '$lib/components/Citations.svelte';
	import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import { displayContent } from '$lib/runtime/messages';
	import { parseDocument } from '$lib/demos/document-loader';
	import {
		setCorpus,
		newChat,
		sendTurn,
		getCitations,
		corpusSummary,
		ragToolSpecs,
		DEFAULT_SYSTEM_PROMPT,
		type Citation
	} from '$lib/demos/agentic-rag';
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
	let docs = $state<{ source: string; chunks: number }[]>([]);
	let indexing = $state(false);
	let running = $state(false);
	let error = $state('');
	let question = $state('');

	interface Turn {
		question: string;
		messages: BaseMessage[];
		answer: string;
		cited: Citation[];
	}
	let turns = $state<Turn[]>([]);
	let liveTurn = $state<{ question: string; messages: BaseMessage[] } | null>(null);

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

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files?.length) return;
		indexing = true;
		error = '';
		try {
			const loaded = await Promise.all([...input.files].map((f) => parseDocument(f)));
			await setCorpus(loaded.map((d) => ({ source: d.source, text: d.text })));
			docs = corpusSummary();
			await newChat(systemPrompt);
			turns = [];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			indexing = false;
			input.value = '';
		}
	}

	async function ask() {
		if (!question.trim() || running || !docs.length) return;
		const q = question.trim();
		question = '';
		running = true;
		error = '';
		liveTurn = { question: q, messages: [] };
		try {
			const out = await sendTurn(q, (m) => {
				if (liveTurn) liveTurn = { ...liveTurn, messages: m };
			});
			const answer = finalAnswer(out.messages);
			turns = [...turns, { question: q, messages: out.messages, answer, cited: citedFrom(answer) }];
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			liveTurn = null;
			running = false;
		}
	}

	// The answer forming during a live turn (updates streamMode pops it in whole).
	const liveAnswer = $derived(liveTurn ? finalAnswer(liveTurn.messages) : '');

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
				Classic <Term t="RAG" /> is a one-shot pipeline: <Term t="embedding model">embed</Term> the
				question, <Term t="Retriever">retrieve</Term> the nearest <Term t="Chunk">chunks</Term>, paste
				them into the prompt, and hope they were the right ones. It can't recover from a bad query or
				an ambiguous question.
			</p>
			<p>
				An <strong>agentic</strong> RAG gives the <Term t="Model">model</Term> a search
				<Term t="tool">tool</Term> and lets it run the show: search, look at what came back, and decide
				whether to answer, search again with better words, or ask you to clarify. Same retrieval
				machinery — but now there's a brain steering it.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage id="dgm-rag" alt="A query flows into a retriever, which pulls chunks that feed the generator" />
			<figcaption>
				Naive <Term t="RAG" />: retrieve once, then generate. The agent turns this into a loop it
				controls.
			</figcaption>
		</figure>

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

		<Slide variant="pull-quote">
			<p>Naive RAG retrieves and hopes. An agent retrieves, reads, and decides what to do next.</p>
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
		<Panel title="Your documents" subtitle="upload one or more — everything stays in your browser">
			<label class="upload" class:busy={indexing}>
				<input type="file" multiple accept=".txt,.md,.pdf" onchange={onFiles} disabled={indexing} />
				<span class="up-icon" aria-hidden="true">⬆</span>
				<span class="up-text">
					{#if indexing}Indexing…{:else}Drop or choose .txt, .md, or .pdf files{/if}
				</span>
			</label>
			{#if docs.length}
				<ul class="doclist">
					{#each docs as d (d.source)}
						<li><span class="dn">{d.source}</span><span class="dc">{d.chunks} chunks</span></li>
					{/each}
				</ul>
			{/if}

			<details class="more">
				<summary>system prompt — the agent's standing instructions</summary>
				<textarea bind:value={systemPrompt} rows="6" spellcheck="false" disabled={running}></textarea>
				<p class="hint-sm">Edit, then upload (or re-upload) to start a fresh chat with these instructions.</p>
			</details>

			<Toolbox tools={toolboxTools} label="Toolbox" />
		</Panel>

		<Panel title="Chat" subtitle="ask across your documents — answers cite their sources">
			{#if !docs.length}
				<p class="hint">Upload a document above to begin.</p>
			{:else}
				<div class="thread">
					{#each turns as t, i (i)}
						<div class="bubble user"><p>{t.question}</p></div>
						<div class="bubble bot">
							{#if t.answer}<Markdown source={t.answer} />{/if}
							<Citations citations={t.cited} />
						</div>
					{/each}
					{#if liveTurn}
						<div class="bubble user"><p>{liveTurn.question}</p></div>
						<div class="bubble bot">
							{#if liveAnswer}<Markdown source={liveAnswer} />{:else}<span class="working">Searching your documents…</span>{/if}
						</div>
					{/if}
				</div>
			{/if}

			<div class="composer">
				<input
					type="text"
					bind:value={question}
					placeholder={docs.length ? 'Ask about your documents…' : 'Upload a document first'}
					onkeydown={(e) => e.key === 'Enter' && ask()}
					disabled={running || !docs.length}
				/>
				<RunButton onclick={ask} {running} label="Ask" disabled={!docs.length} />
			</div>
			{#if error}
				<p class="err">{error} — set a model in <a href="/setup">Setup</a>.</p>
			{/if}
		</Panel>

		<Panel title="Under the hood" subtitle="what the agent did on the latest turn">
			{#if latestMessages.length}
				<div class="graph-wrap">
					<AgentGraph nodes={graphNodes} edges={graphEdges} activeNode={graphActive} path={graphPath} />
				</div>
				<AgentInspector messages={latestMessages} />
			{:else}
				<p class="hint">Ask a question to watch the search loop and inspect the retrieved passages.</p>
			{/if}
		</Panel>
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 2rem 0;
	}
	.diagram :global(.hero) {
		aspect-ratio: 4 / 3;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
		max-width: 26rem;
		margin: 0 auto;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
		text-align: center;
	}

	/* Upload dropzone */
	.upload {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		border: 1px dashed var(--color-rule);
		border-radius: 0.6rem;
		cursor: pointer;
		color: var(--color-ink-200);
		transition: border-color 0.15s ease;
	}
	.upload:hover {
		border-color: var(--accent-rule);
	}
	.upload.busy {
		opacity: 0.7;
		cursor: default;
	}
	.upload input {
		display: none;
	}
	.up-icon {
		color: var(--accent);
		font-size: 1rem;
	}
	.up-text {
		font-size: 0.86rem;
	}
	.doclist {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.doclist li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.35rem;
		background: var(--color-paper);
	}
	.doclist .dn {
		font-family: var(--font-mono);
		color: var(--color-ink-100);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.doclist .dc {
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		flex-shrink: 0;
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

	/* Chat thread */
	.thread {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.85rem;
	}
	.bubble {
		padding: 0.6rem 0.8rem;
		border-radius: 0.6rem;
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.bubble.user {
		align-self: flex-end;
		max-width: 85%;
		background: color-mix(in oklch, var(--accent) 14%, var(--color-paper));
		border: 1px solid var(--accent-rule);
	}
	.bubble.user p {
		margin: 0;
	}
	.bubble.bot {
		align-self: flex-start;
		max-width: 95%;
		background: var(--color-bg-elev-2, #1c1814);
		border: 1px solid var(--color-rule);
	}
	.bubble.bot :global(.markdown) {
		font-size: 0.9rem;
	}
	.bubble.bot :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.bubble.bot :global(.markdown > :last-child) {
		margin-bottom: 0;
	}
	.working {
		color: var(--color-ink-300);
		font-style: italic;
	}

	.composer {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.composer input {
		flex: 1;
	}

	.graph-wrap {
		margin-bottom: 0.9rem;
	}
	.err {
		color: var(--color-accent-warning);
		font-size: 0.84rem;
		margin: 0.6rem 0 0;
	}
	.hint {
		font-size: 0.86rem;
		color: var(--color-ink-300);
		margin: 0;
	}
</style>
