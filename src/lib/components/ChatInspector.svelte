<script lang="ts">
	import { highlight } from '$lib/runtime/highlight';
	import TokenPills from './TokenPills.svelte';
	import MessageList from './MessageList.svelte';
	import type { PayloadMessage, TurnUsage, RetrievedBit } from '$lib/demos/overview-chatbot';

	interface DocInfo {
		name: string;
		chars: number;
		chunks: string[];
	}

	interface Props {
		payload: PayloadMessage[];
		memory: PayloadMessage[];
		usage?: TurnUsage;
		reasoning?: string;
		query?: string;
		queryVec?: number[];
		retrieved?: RetrievedBit[];
		doc?: DocInfo | null;
	}

	let {
		payload = [],
		memory = [],
		usage,
		reasoning,
		query = '',
		queryVec = [],
		retrieved = [],
		doc = null
	}: Props = $props();

	type Tab = 'payload' | 'memory' | 'retrieval' | 'document' | 'reasoning';
	let tab = $state<Tab>('payload');

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'payload', label: 'Payload' },
		{ id: 'memory', label: 'Memory' },
		{ id: 'retrieval', label: 'Retrieval' },
		{ id: 'document', label: 'Document' },
		{ id: 'reasoning', label: 'Reasoning' }
	];

	let rawView = $state(false);

	// Downsample the 384-d query vector into a compact fingerprint that fits one row.
	const heatCells = $derived.by(() => {
		if (!queryVec.length) return [];
		const group = Math.ceil(queryVec.length / 64);
		const out: number[] = [];
		for (let i = 0; i < queryVec.length; i += group) {
			const slice = queryVec.slice(i, i + group);
			out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
		}
		return out;
	});
	const heatMax = $derived(heatCells.length ? Math.max(...heatCells.map((v) => Math.abs(v))) : 1);
	function cellStyle(v: number): string {
		const t = heatMax ? Math.min(1, Math.abs(v) / heatMax) : 0;
		const pct = Math.round(t * 100);
		const base = v >= 0 ? 'var(--accent)' : 'oklch(0.72 0.13 210)';
		return `background: color-mix(in oklch, ${base} ${pct}%, transparent);`;
	}

	// The literal payload, as close to the API JSON as the demo sends it.
	const rawJson = $derived(
		JSON.stringify(
			payload.map((m) => ({
				role: m.role,
				content: m.hasImage
					? [
							{ type: 'text', text: m.text },
							{ type: 'image_url', image_url: { url: '…(data URL omitted)' } }
						]
					: m.text
			})),
			null,
			2
		)
	);

	let rawHtml = $state('');
	$effect(() => {
		if (tab === 'payload' && rawView && payload.length) {
			highlight(rawJson, 'json').then((h) => (rawHtml = h));
		}
	});
</script>

<div class="inspector">
	<div class="tabs" role="tablist">
		{#each tabs as t (t.id)}
			<button
				class="tab"
				class:active={tab === t.id}
				role="tab"
				aria-selected={tab === t.id}
				onclick={() => (tab = t.id)}
			>
				{t.label}
				{#if t.id === 'reasoning' && reasoning}<span class="dot"></span>{/if}
			</button>
		{/each}
	</div>

	<div class="panel">
		<!-- ── Payload ─────────────────────────────────────────────────────── -->
		{#if tab === 'payload'}
			{#if payload.length === 0}
				<p class="empty">Send a message to see the exact array sent to the model.</p>
			{:else}
				<div class="lead">
					<span>The exact message array the model received this turn.</span>
					<span class="lead-right">
						<TokenPills {usage} />
						<button class="raw-toggle" onclick={() => (rawView = !rawView)}>
							{rawView ? 'readable' : 'raw JSON'}
						</button>
					</span>
				</div>
				{#if rawView}
					<div class="raw">
						{#if rawHtml}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html rawHtml}
						{:else}
							<pre>{rawJson}</pre>
						{/if}
					</div>
				{:else}
					<MessageList messages={payload} />
				{/if}
			{/if}

			<!-- ── Memory ──────────────────────────────────────────────────────── -->
		{:else if tab === 'memory'}
			<div class="lead">
				<span>The running message list — passed back in full on every turn.</span>
				<span class="pill">{memory.length} messages</span>
			</div>
			{#if memory.length === 0}
				<p class="empty">No messages yet. (The greeting is UI-only and isn't part of memory.)</p>
			{:else}
				<MessageList messages={memory} compact />
			{/if}

			<!-- ── Retrieval ───────────────────────────────────────────────────── -->
		{:else if tab === 'retrieval'}
			{#if !doc}
				<p class="empty">
					No document indexed. The chatbot answers from memory and general knowledge. Upload a
					document to turn on retrieval.
				</p>
			{:else if !query}
				<p class="empty">Ask a question to see retrieval in action.</p>
			{:else}
				<div class="kv"><span class="k">query</span><span class="v">{query}</span></div>
				{#if heatCells.length}
					<div class="vizhead">
						query fingerprint · {queryVec.length}-d, downsampled
						<span class="legend"><i class="pos"></i>+ <i class="neg"></i>−</span>
					</div>
					<div class="heatmap">
						{#each heatCells as v, i (i)}
							<span class="cell" style={cellStyle(v)} title={v.toFixed(3)}></span>
						{/each}
					</div>
				{/if}
				<div class="vizhead">nearest chunks · cosine similarity · pasted verbatim into the prompt</div>
				<div class="hits">
					{#each retrieved as h, i (i)}
						<div class="hit">
							<div class="hit-bar">
								<div class="hit-fill" style="width: {Math.max(0, Math.min(1, h.score)) * 100}%"></div>
								<span class="hit-idx">[{i + 1}]</span>
								<span class="hit-score">{(h.score * 100).toFixed(1)}%</span>
							</div>
							<p class="hit-text">{h.text}</p>
						</div>
					{/each}
				</div>
			{/if}

			<!-- ── Document ────────────────────────────────────────────────────── -->
		{:else if tab === 'document'}
			{#if !doc}
				<p class="empty">No document indexed. Use the + menu in the chat to add a PDF or Markdown file.</p>
			{:else}
				<div class="docstat">
					<div><span class="k">file</span><span class="v">{doc.name}</span></div>
					<div><span class="k">characters</span><span class="v">{doc.chars.toLocaleString()}</span></div>
					<div><span class="k">chunks</span><span class="v">{doc.chunks.length}</span></div>
				</div>
				<div class="vizhead">chunks (the unit the retriever searches)</div>
				<div class="chunks">
					{#each doc.chunks as c, i (i)}
						<div class="chunk">
							<span class="cidx">{i + 1}</span>
							<p>{c}</p>
						</div>
					{/each}
				</div>
			{/if}

			<!-- ── Reasoning ───────────────────────────────────────────────────── -->
		{:else if tab === 'reasoning'}
			{#if reasoning}
				<div class="lead"><span>The model's exposed thinking for the last turn.</span></div>
				<pre class="reasoning">{reasoning}</pre>
			{:else}
				<p class="empty">
					No thinking yet. Turn on <strong>Extended thinking</strong> (the brain icon above the
					chat) with a Claude or Gemini model, and its reasoning will stream here turn by turn.
					OpenAI's GPT-5.x models reason internally and don't expose the tokens.
				</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.inspector {
		border: 1px solid var(--color-rule);
		border-radius: 0.75rem;
		background: var(--color-bg);
		overflow: hidden;
	}

	.tabs {
		display: flex;
		gap: 0.1rem;
		padding: 0.35rem 0.4rem 0;
		background: var(--color-paper);
		overflow-x: auto;
	}
	.tab {
		position: relative;
		flex: 0 0 auto;
		padding: 0.5rem 0.8rem;
		border: none;
		background: transparent;
		color: var(--color-ink-300);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.tab:hover {
		color: var(--color-ink-100);
	}
	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
	.tab .dot {
		position: absolute;
		top: 0.45rem;
		right: 0.35rem;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
	}

	.panel {
		padding: 0.9rem 1rem 1.1rem;
		max-height: 24rem;
		overflow-y: auto;
	}

	.empty {
		margin: 0.5rem 0;
		color: var(--color-ink-300);
		font-size: 0.85rem;
		line-height: 1.55;
	}

	.lead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.82rem;
		color: var(--color-ink-200);
		margin-bottom: 0.7rem;
	}
	.pill {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 28%, var(--color-rule));
		white-space: nowrap;
	}
	.lead-right {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.raw-toggle {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.18rem 0.5rem;
		border-radius: 0.35rem;
		border: 1px solid var(--color-rule);
		background: transparent;
		color: var(--color-ink-200);
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}
	.raw-toggle:hover {
		color: var(--accent);
		border-color: var(--accent-rule);
	}
	.raw {
		border-radius: 0.45rem;
		background: var(--color-paper);
		overflow: hidden;
	}
	.raw :global(pre.shiki),
	.raw > pre {
		margin: 0;
		padding: 0.7rem 0.8rem;
		background: transparent !important;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Retrieval */
	.kv {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
		font-size: 0.85rem;
	}
	.kv .k,
	.docstat .k {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
	}
	.kv .v {
		color: var(--color-ink-100);
	}
	.vizhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		margin: 0.9rem 0 0.45rem;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		text-transform: none;
		letter-spacing: 0;
	}
	.legend i {
		width: 9px;
		height: 9px;
		border-radius: 2px;
		display: inline-block;
	}
	.legend .pos {
		background: var(--accent);
	}
	.legend .neg {
		background: oklch(0.72 0.13 210);
	}
	.heatmap {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 0.5rem;
		border-radius: 0.45rem;
		background: var(--color-paper);
	}
	.cell {
		width: 6px;
		height: 6px;
		border-radius: 1px;
	}

	.hits {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.hit-bar {
		position: relative;
		height: 1.25rem;
		border-radius: 0.3rem;
		background: var(--color-paper);
		overflow: hidden;
	}
	.hit-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.hit-idx {
		position: absolute;
		left: 0.45rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent);
	}
	.hit-score {
		position: absolute;
		right: 0.45rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-100);
	}
	.hit-text {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-ink-200);
		white-space: pre-wrap;
	}

	/* Document */
	.docstat {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.docstat .v {
		display: block;
		margin-top: 0.15rem;
		font-family: var(--font-mono);
		font-size: 0.88rem;
		color: var(--accent);
	}
	.chunks {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.chunk {
		display: grid;
		grid-template-columns: 1.4rem 1fr;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		border-radius: 0.45rem;
		background: var(--color-paper);
	}
	.cidx {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent);
	}
	.chunk p {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--color-ink-200);
	}

	/* Reasoning */
	.reasoning {
		margin: 0;
		padding: 0.7rem 0.8rem;
		border-radius: 0.45rem;
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
