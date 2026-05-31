<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ChatInspector from '$lib/components/ChatInspector.svelte';
	import {
		Paperclip,
		ImagePlus,
		ArrowUp,
		X,
		FileText,
		Eraser,
		Plus,
		Brain,
		ChevronDown
	} from '@lucide/svelte';
	import { AIMessage, type BaseMessage } from '@langchain/core/messages';
	import { app } from '$lib/state/app.svelte';
	import { findHostedModel, thinkingMode, type HostedProvider } from '$lib/models/catalog';
	import {
		indexDocuments,
		retrieve,
		buildHumanMessage,
		respondStream,
		toPayload,
		serializeMessages,
		embedQueryLocal,
		type RetrievedBit,
		type PayloadMessage,
		type TurnUsage
	} from '$lib/demos/overview-chatbot';
	import { parseDocument } from '$lib/demos/document-loader';
	import chatbotSrc from '$lib/demos/overview-chatbot.ts?raw';
	import loaderSrc from '$lib/demos/document-loader.ts?raw';
	import ragSrc from '$lib/demos/rag-pipeline.ts?raw';
	import type { DemoManifest } from '$lib/demos/download';
	import type { InMemoryVectorStore } from '$lib/runtime/rag/in-memory-vector-store';

	const demoSource: DemoManifest = {
		id: 'overview-chatbot',
		title: 'Hand-wired chatbot',
		summary:
			'A chatbot from raw LangChain parts: a document-loader Runnable, RAG retrieval, conversation memory, a multimodal image turn, and a streamed reply with optional extended thinking — no createAgent.',
		entries: [
			{ path: 'lib/demos/overview-chatbot.ts', code: chatbotSrc },
			{ path: 'lib/demos/document-loader.ts', code: loaderSrc },
			{ path: 'lib/demos/rag-pipeline.ts', code: ragSrc }
		],
		runner: `import { indexDocuments, retrieve, buildHumanMessage, respondStream, appendTurn } from './lib/demos/overview-chatbot';

// memory is just the running message list — passed back to the model every turn.
const memory = [];

// In the browser, parseDocument(file) turns an uploaded PDF/Markdown into this text.
const { store } = await indexDocuments([
  { source: 'notes.md', text: '# LangX\\nTeaches LangChain, LangGraph, and Deep Agents.' }
]);

const q = 'What does LangX teach?';
const hits = await retrieve(store, q, 3);          // RAG: nearest chunks
const human = buildHumanMessage(q, hits);          // stitch context + question

// Stream the reply token-by-token. Pass thinking=true (4th arg) on a Claude/Gemini
// model to also stream its reasoning through onReasoning.
const { answer } = await respondStream(
  memory,
  human,
  {
    onToken: (delta) => process.stdout.write(delta),
    onReasoning: (delta) => process.stdout.write(delta)
  },
  /* thinking */ false
);

appendTurn(memory, human, answer);                 // grow memory for the next turn
`
	};

	type Turn = {
		role: 'user' | 'assistant';
		text: string;
		image?: string;
		thinking?: string;
		thinkingOpen?: boolean;
	};
	const GREETING =
		'Hey! How can I help? Feel free to upload a document or a picture with the + button and ask me about it. Use the eraser icon at the top to clear our chat and start fresh.';

	// ── Chatbot state ─────────────────────────────────────────────────────────
	let store = $state<InMemoryVectorStore | null>(null);
	let docName = $state('');
	let docChunks = $state(0);
	let docChars = $state(0);
	let docChunkTexts = $state<string[]>([]);
	let docLoading = $state(false);
	let pendingDocName = $state('');

	// Inspector data — exactly what the model saw on the last turn.
	let lastPayload = $state<PayloadMessage[]>([]);
	let usage = $state<TurnUsage | undefined>(undefined);
	let reasoning = $state<string | undefined>(undefined);
	let lastQuery = $state('');
	let queryVec = $state<number[]>([]);

	let imageDataUrl = $state<string | null>(null);
	let imageName = $state('');

	let question = $state('');
	let sending = $state(false);
	let error = $state('');

	let turns = $state<Turn[]>([{ role: 'assistant', text: GREETING }]);
	let lastRetrieved = $state<RetrievedBit[]>([]);
	// The running message list sent to the model — this IS the conversation memory.
	// (The greeting is UI-only and deliberately not part of it.)
	let memory = $state<BaseMessage[]>([]);
	const memoryView = $derived(serializeMessages(memory));

	let msgEl: HTMLElement | undefined = $state();
	let taEl: HTMLTextAreaElement | undefined = $state();
	let imgInput: HTMLInputElement | undefined = $state();
	let docInput: HTMLInputElement | undefined = $state();
	let plusOpen = $state(false);

	// Extended-thinking toggle — only offered for models that expose their reasoning.
	const thinkingCap = $derived.by(() => {
		const p = app.preferredProvider;
		if (p === 'transformers-js') return 'none';
		return thinkingMode(findHostedModel(app.models[p as HostedProvider]));
	});
	let thinkingOn = $state(false);

	$effect(() => {
		turns.length;
		turns.at(-1)?.text; // re-run as streamed tokens grow the last bubble
		sending;
		if (msgEl) msgEl.scrollTop = msgEl.scrollHeight;
	});

	function autoGrow() {
		if (!taEl) return;
		taEl.style.height = 'auto';
		taEl.style.height = Math.min(taEl.scrollHeight, 160) + 'px';
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	async function onDoc(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		docLoading = true;
		pendingDocName = file.name;
		error = '';
		try {
			const loaded = await parseDocument(file); // PDF via pdf.js, else read as text
			if (!loaded.text.trim()) throw new Error('No extractable text in that file.');
			const out = await indexDocuments([loaded]);
			store = out.store;
			docChunks = out.chunkCount;
			docName = loaded.source;
			docChars = loaded.text.length;
			docChunkTexts = out.chunks.map((c) => c.text);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			docLoading = false;
			pendingDocName = '';
		}
	}

	function removeDoc() {
		store = null;
		docName = '';
		docChunks = 0;
		docChars = 0;
		docChunkTexts = [];
	}

	function onImage(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		imageName = file.name;
		const reader = new FileReader();
		reader.onload = () => (imageDataUrl = reader.result as string);
		reader.readAsDataURL(file);
	}

	function clearImage() {
		imageDataUrl = null;
		imageName = '';
	}

	async function send() {
		const q = question.trim();
		if ((!q && !imageDataUrl) || sending) return;
		sending = true;
		error = '';
		const imgForTurn = imageDataUrl;
		turns = [...turns, { role: 'user', text: q, image: imgForTurn ?? undefined }];
		// placeholder assistant turn we stream tokens into
		turns = [...turns, { role: 'assistant', text: '' }];
		const aIdx = turns.length - 1;
		question = '';
		clearImage();
		if (taEl) taEl.style.height = 'auto';
		try {
			lastQuery = q;
			reasoning = undefined;
			const effectiveQuery = q || 'describe the attached image';
			let hits: RetrievedBit[] = [];
			if (store) {
				hits = await retrieve(store, effectiveQuery, 3);
				queryVec = await embedQueryLocal(effectiveQuery);
			}
			lastRetrieved = hits;
			const human = buildHumanMessage(q, hits, imgForTurn);
			lastPayload = toPayload(memory, human); // show the payload immediately
			const useThinking = thinkingOn && thinkingCap === 'optional';
			const v = await respondStream(
				memory,
				human,
				{
					onToken: (_d, full) => (turns[aIdx].text = full),
					onReasoning: (_d, full) => {
						reasoning = full;
						turns[aIdx].thinking = full;
						turns[aIdx].thinkingOpen = true;
					}
				},
				useThinking
			);
			usage = v.usage;
			// Prefer what streamed (matches the in-chat disclosure); fall back to the final.
			reasoning = reasoning || v.reasoning;
			turns[aIdx].text = v.answer;
			if (turns[aIdx].thinking) turns[aIdx].thinkingOpen = false; // collapse once answered
			memory = [...memory, human, new AIMessage(v.answer)];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			turns = turns.slice(0, -2); // drop the optimistic user + assistant turns
		} finally {
			sending = false;
		}
	}

	function reset() {
		turns = [{ role: 'assistant', text: GREETING }];
		memory = [];
		lastRetrieved = [];
		lastPayload = [];
		usage = undefined;
		reasoning = undefined;
		lastQuery = '';
		queryVec = [];
	}

	const coreCode = `// The whole loop, by hand — no createAgent.
const text   = await parseDocument(file);                  // a loader Runnable
const hits   = store ? await retrieve(store, q, 3) : [];   // RAG
const human  = buildHumanMessage(q, hits, imageDataUrl);   // + image = multimodal
const answer = await respond(memory, human);               // system + memory + turn
memory.push(human, new AIMessage(answer));                 // memory = the message list`;
</script>

<Lesson
	title="The whole picture"
	eyebrow="Level 1 · Overview"
	hero={{
		id: 'lc-overview-hero',
		alt: 'A single brass steampunk machine — a chatbot engine assembled from parts'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Before we take the parts apart, let's see them working together. On the right is a real
		chatbot — drop in a PDF or Markdown file, attach an image, and talk to it. It remembers the
		conversation and answers from your document, built from nothing but raw <Term t="LangChain" />
		pieces.
	{/snippet}
	{#snippet intro()}
		<p>
			Every capable assistant is really a handful of small pieces wired in a loop: a
			<Term t="Model" /> to think, <Term t="Conversation memory">memory</Term> so it remembers,
			a <Term t="Retriever">retriever</Term> for your own documents (<Term t="RAG" />), and a
			<Term t="Multimodal">multimodal</Term> turn so it can see an image. This lesson shows the
			whole machine; the rest of Level 1 takes each part apart.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The shape" title="A chatbot is a loop over a message list" variant="dropcap">
			<p>
				A <Term t="Model" /> is <strong>stateless</strong> — each call only knows what you send
				it. So a chatbot is just a loop: keep a running list of messages
				(<Term t="Conversation memory">memory</Term>), add the user's new turn, send the whole
				list to the model, append its reply, repeat. Nothing more magical is happening.
			</p>
			<CodeBlock code={coreCode} lang="ts" caption="The entire chatbot, with the guts showing." />
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="diagram-chatbot-loop"
				alt="The basic chatbot loop: the message list feeds the model, the reply comes out and is appended back onto the list, repeat"
			/>
			<figcaption>The whole loop: messages in, reply out, append, repeat.</figcaption>
		</figure>

		<Slide title="…but real chatbots do a bit more">
			<p>
				In reality, most chatbots are more than a bare loop. The one on the right is still simple,
				but it can also pull from a document you give it (<Term t="RAG">retrieval</Term>) and read
				an image. That's the pipeline its answers actually flow through — we'll take retrieval apart
				properly in the <a href="/1-langchain/rag">RAG</a> lesson.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="diagram-chatbot-anatomy"
				alt="Anatomy of the chatbot: input with document and image, memory, retriever and vectors, prompt, model, answer"
			/>
			<figcaption>This demo's pipeline: memory, retrieval, and a multimodal model.</figcaption>
		</figure>

		<Slide title="Documents — loaded, then retrieved">
			<p>
				The model wasn't trained on your files, so we feed them in. Loading a document is just
				another <Term t="Runnable" />: we wrap <code>pdf.js</code> (for PDFs) and plain text reads
				(for Markdown) so "load a file" pipes like everything else. Then it's
				<Term t="RAG" /> — split into chunks, <Term t="embedding model">embed</Term> each, and at
				question time pull back the closest few. Add a document with the paperclip option
				(<span class="inl-icon"><Paperclip size={14} /></span>) and watch the chunk count appear.
			</p>
		</Slide>

		<Slide title="Images — a multimodal turn">
			<p>
				<Term t="Multimodal">Multimodal</Term> models (Claude, GPT, Gemini) accept a picture
				alongside text in the same message. Attach an image
				(<span class="inl-icon"><ImagePlus size={14} /></span>) and the question turn carries both
				— the model reasons over the words and the picture together. Under the hood it's the same
				<code>HumanMessage</code>, just with an image part added to its content.
			</p>
		</Slide>

		<Slide title="Thinking — watch it reason">
			<p>
				Many models can take an <Term t="Extended thinking">extended-thinking</Term> pass before
				they answer — working through the problem first, then replying. Flip the brain icon
				(<span class="inl-icon"><Brain size={14} /></span>) above the chat on a Claude or Gemini
				<Term t="Model" /> and the reasoning <strong>streams live</strong> into a collapsible
				<em>Thought</em> panel, and again in the Reasoning tab of the inspector. It costs extra
				output tokens but pays off on harder questions. OpenAI's GPT-5.x models reason internally
				and don't expose those tokens, so the toggle only appears when a model can actually show
				its work.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="diagram-chain-types"
				alt="Three kinds of chains: sequential, parallel, and router"
			/>
			<figcaption>
				Pieces connect into <Term t="Chain">chains</Term> — straight, parallel, or routed.
			</figcaption>
		</figure>

		<Slide title="Where this goes next" ornament>
			<p>
				This whole thing is hand-wired on purpose, so you can see every moving part. The rest of
				Level 1 zooms into each one — <a href="/1-langchain/runnables"
					><Term t="Runnable">Runnables</Term></a
				>, <a href="/1-langchain/streaming">streaming</a>,
				<a href="/1-langchain/structured-output">structured output</a>,
				<a href="/1-langchain/tools"><Term t="tool">tools</Term></a>, and
				<a href="/1-langchain/rag"><Term t="RAG" /></a>. When the loop itself needs to grow —
				branching, persistence, pausing for a human — that's <Term t="LangGraph" /> in
				<a href="/2-langgraph">Level 2</a>, which modern LangChain agents are built on.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<div class="chat">
			<div class="chat-head">
				<div class="chat-head-left">
					<span class="status-dot" class:busy={sending || docLoading}></span>
					<span class="chat-title">LangChain chatbot</span>
				</div>
				<div class="head-actions">
					{#if thinkingCap === 'optional'}
						<button
							class="head-btn"
							class:on={thinkingOn}
							onclick={() => (thinkingOn = !thinkingOn)}
							title="Extended thinking — stream the model's reasoning"
							aria-pressed={thinkingOn}
						>
							<Brain size={16} />
						</button>
					{/if}
					<button
						class="head-btn"
						onclick={reset}
						disabled={memory.length === 0}
						title="Clear chat"
						aria-label="Clear chat"
					>
						<Eraser size={16} />
					</button>
				</div>
			</div>

			{#if docName}
				<div class="chips">
					<span class="chip">
						<FileText size={13} />
						{docName}
						<em>· {docChunks} chunks</em>
						<button class="chip-x" onclick={removeDoc} aria-label="Remove document"><X size={12} /></button>
					</span>
				</div>
			{/if}

			<div class="messages" bind:this={msgEl}>
				{#each turns as turn, i (i)}
					<div class="msg {turn.role}">
						{#if turn.image}
							<img class="thumb" src={turn.image} alt="attached" />
						{/if}
						{#if turn.thinking}
							<button
								class="think"
								onclick={() => (turn.thinkingOpen = !turn.thinkingOpen)}
								aria-expanded={turn.thinkingOpen}
							>
								<Brain size={12} />
								<span>{turn.text ? 'Thought' : 'Thinking…'}</span>
								<span class="chev" class:open={turn.thinkingOpen}><ChevronDown size={12} /></span>
							</button>
							{#if turn.thinkingOpen}
								<div class="think-body">{turn.thinking}</div>
							{/if}
						{/if}
						{#if turn.text}
							<div class="bubble">{turn.text}</div>
						{:else if turn.role === 'assistant' && sending && !turn.thinking}
							<div class="bubble typing"><span></span><span></span><span></span></div>
						{/if}
					</div>
				{/each}
			</div>

			{#if error}
				<div class="err">{error} — set a model in <a href="/setup">Setup</a>.</div>
			{/if}
			{#if docLoading}
				<div class="loading">Parsing &amp; indexing {pendingDocName}…</div>
			{/if}

			<!-- One unified input: a label so clicking anywhere focuses the field; the
			     + and send float in the bottom corners over the same surface. -->
			<label class="composer">
				{#if imageDataUrl}
					<div class="attach-row">
						<div class="img-preview">
							<img src={imageDataUrl} alt={imageName} />
							<button class="img-x" type="button" onclick={clearImage} aria-label="Remove image"
								><X size={11} /></button
							>
						</div>
					</div>
				{/if}

				<textarea
					class="text-in"
					bind:this={taEl}
					bind:value={question}
					rows="1"
					placeholder="Message the chatbot…"
					oninput={autoGrow}
					onkeydown={onKey}
				></textarea>

				<div class="plus-wrap">
					<button
						class="round-btn"
						type="button"
						onclick={() => (plusOpen = !plusOpen)}
						aria-label="Add a photo or document"
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
									imgInput?.click();
								}}
							>
								<ImagePlus size={16} /> <span>Add a photo</span>
							</button>
							<button
								class="pm-item"
								type="button"
								role="menuitem"
								onclick={() => {
									plusOpen = false;
									docInput?.click();
								}}
							>
								<FileText size={16} /> <span>Add a document</span>
							</button>
						</div>
					{/if}
				</div>

				<button
					class="send"
					type="button"
					onclick={send}
					disabled={sending || (!question.trim() && !imageDataUrl)}
					aria-label="Send"
				>
					<ArrowUp size={18} strokeWidth={2.5} />
				</button>

				<input type="file" accept="image/*" hidden bind:this={imgInput} onchange={onImage} />
				<input
					type="file"
					accept=".pdf,.md,.markdown,.txt,text/markdown,text/plain,application/pdf"
					hidden
					bind:this={docInput}
					onchange={onDoc}
				/>
			</label>
		</div>
	{/snippet}

	{#snippet inspect()}
		<ChatInspector
			payload={lastPayload}
			memory={memoryView}
			{usage}
			{reasoning}
			query={lastQuery}
			{queryVec}
			retrieved={lastRetrieved}
			doc={store ? { name: docName, chars: docChars, chunks: docChunkTexts } : null}
		/>
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 2rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.7rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-ink-300);
		font-style: italic;
		text-align: center;
	}

	/* Inline icon used inside prose when referring to a button. */
	.inl-icon {
		display: inline-flex;
		vertical-align: -0.18em;
		color: var(--accent);
		margin: 0 0.05em;
	}

	/* ── Chat widget ───────────────────────────────────────────────────────── */
	.chat {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-rule);
		border-radius: 0.85rem;
		background: var(--color-bg);
		overflow: hidden;
	}

	.chat-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.65rem 0.7rem 0.65rem 1rem;
		background: var(--color-paper);
	}
	.chat-head-left {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.status-dot {
		flex: 0 0 auto;
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
	.head-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 0.45rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-ink-300);
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.head-btn:hover:not(:disabled) {
		color: var(--accent);
		background: var(--color-bg);
	}
	.head-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.head-btn.on {
		color: var(--accent);
		background: color-mix(in oklch, var(--accent) 14%, transparent);
	}
	.head-actions {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.6rem 1rem 0;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.76rem;
		font-family: var(--font-mono);
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--color-rule));
	}
	.chip em {
		color: var(--color-ink-300);
		font-style: normal;
	}
	.chip-x {
		display: inline-flex;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		padding: 0;
		opacity: 0.7;
	}
	.chip-x:hover {
		opacity: 1;
	}

	.messages {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.85rem 1rem;
		min-height: 11rem;
		max-height: 23rem;
		overflow-y: auto;
	}

	.msg {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-width: 85%;
	}
	.msg.user {
		align-self: flex-end;
		align-items: flex-end;
	}
	.msg.assistant {
		align-self: flex-start;
	}
	.bubble {
		padding: 0.45rem 0.7rem;
		border-radius: 0.9rem;
		font-size: 0.84rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.msg.user .bubble {
		background: var(--accent);
		color: #1a1206;
		border-bottom-right-radius: 0.3rem;
	}
	.msg.assistant .bubble {
		background: var(--color-bg-elev-2);
		color: var(--color-ink-100);
		border-bottom-left-radius: 0.3rem;
	}
	.thumb {
		max-width: 11rem;
		border-radius: 0.6rem;
		border: 1px solid var(--color-rule);
	}

	/* Extended-thinking disclosure above an assistant turn. */
	.think {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		align-self: flex-start;
		padding: 0.2rem 0.5rem 0.2rem 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.think:hover {
		color: var(--accent);
		border-color: var(--accent-rule);
	}
	.chev {
		display: inline-flex;
		transition: transform 0.15s ease;
	}
	.chev.open {
		transform: rotate(180deg);
	}
	.think-body {
		align-self: flex-start;
		max-width: 92%;
		padding: 0.5rem 0.7rem;
		border-left: 2px solid color-mix(in oklch, var(--accent) 45%, transparent);
		border-radius: 0.4rem;
		background: var(--color-paper);
		color: var(--color-ink-200);
		font-size: 0.78rem;
		font-style: italic;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
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

	.err {
		margin: 0 1rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.82rem;
		color: var(--color-accent-warning);
	}
	.loading {
		margin: 0 1rem;
		font-size: 0.82rem;
		color: var(--color-ink-200);
		font-family: var(--font-mono);
	}

	/* ── Composer (ChatGPT-style) ──────────────────────────────────────────── */
	.composer {
		position: relative;
		display: block;
		margin: 0.7rem;
		border: 1px solid var(--color-rule);
		border-radius: 1.3rem;
		background: var(--color-bg-elev);
		/* extra bottom space reserves the row the +/send float in */
		padding: 0.7rem 0.85rem 2.5rem;
		cursor: text;
		transition: border-color 0.15s ease;
	}
	.composer:focus-within {
		border-color: var(--accent-rule);
	}
	.attach-row {
		display: flex;
		gap: 0.4rem;
		padding: 0 0.1rem 0.55rem;
	}
	.img-preview {
		position: relative;
	}
	.img-preview img {
		width: 3.2rem;
		height: 3.2rem;
		object-fit: cover;
		border-radius: 0.5rem;
		border: 1px solid var(--color-rule);
		display: block;
	}
	.img-x {
		position: absolute;
		top: -0.4rem;
		right: -0.4rem;
		width: 1.15rem;
		height: 1.15rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: none;
		background: var(--color-bg-elev-2);
		color: var(--color-ink-100);
		cursor: pointer;
	}

	/* Seamless field: the global .demo-pane textarea rule has high specificity (its :is()
	   inherits an attribute-selector score), so we scope under .composer to win and strip
	   its surface (background, radius, shadow) — just text on the composer, no inner box. */
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
		color: var(--color-ink-300);
	}

	.plus-wrap {
		position: absolute;
		left: 0.7rem;
		bottom: 0.5rem;
	}
	.round-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 50%;
		border: 1px solid var(--color-rule);
		background: var(--color-bg);
		color: var(--color-ink-200);
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.round-btn:hover {
		color: var(--accent);
		border-color: var(--accent-rule);
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
		animation: pm-in 0.13s ease;
	}
	@keyframes pm-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
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

</style>
