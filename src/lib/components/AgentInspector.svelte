<script lang="ts">
	import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import { displayContent, serializeMessages } from '$lib/runtime/messages';
	import Markdown from './Markdown.svelte';
	import StateInspector from './StateInspector.svelte';

	interface ToolSpec {
		name: string;
		description: string;
		params: string[];
	}
	let { messages, tools = [] }: { messages: BaseMessage[]; tools?: ToolSpec[] } = $props();

	// The final answer: the last AI message that isn't asking for more tools.
	const finalAnswer = $derived.by(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m instanceof AIMessage && !m.tool_calls?.length) return displayContent(m.content);
		}
		return '';
	});

	const resultById = $derived(
		new Map(
			messages
				.filter((m): m is ToolMessage => m instanceof ToolMessage)
				.map((m) => [m.tool_call_id, displayContent(m.content)])
		)
	);

	// One step per tool call, in order, each paired with the result it returned.
	// The model's reasoning text (if any) rides along on the first call of its turn.
	const steps = $derived.by(() => {
		const out: {
			n: number;
			thought: string;
			name: string;
			args: Record<string, unknown>;
			result: string;
		}[] = [];
		let n = 0;
		for (const m of messages) {
			if (m instanceof AIMessage && m.tool_calls?.length) {
				const thought = displayContent(m.content);
				m.tool_calls.forEach((tc, idx) => {
					out.push({
						n: ++n,
						thought: idx === 0 ? thought : '',
						name: tc.name,
						args: (tc.args ?? {}) as Record<string, unknown>,
						result: resultById.get(tc.id ?? '') ?? ''
					});
				});
			}
		}
		return out;
	});

	const raw = $derived(serializeMessages(messages));

	// Decide how to render a tool result: a JSON array → table; a JSON object →
	// the highlighted inspector; anything else → markdown text.
	function parsed(result: string): unknown {
		try {
			return JSON.parse(result);
		} catch {
			return undefined;
		}
	}
	function asRows(v: unknown): Record<string, unknown>[] | null {
		return Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null
			? (v as Record<string, unknown>[])
			: null;
	}
	function columns(rows: Record<string, unknown>[]): string[] {
		const cols: string[] = [];
		for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
		return cols;
	}
	function cell(v: unknown): string {
		if (v === null || v === undefined) return '';
		return typeof v === 'object' ? JSON.stringify(v) : String(v);
	}
	function argValue(v: unknown): string {
		return typeof v === 'object' ? JSON.stringify(v) : String(v);
	}
</script>

<div class="agent-inspect">
	{#if finalAnswer}
		<div class="answer">
			<div class="answer-eyebrow">Answer</div>
			<Markdown source={finalAnswer} />
		</div>
	{/if}

	{#if steps.length}
		<div class="steps-label">How it got there · {steps.length} {steps.length === 1 ? 'step' : 'steps'}</div>
		<ol class="steps">
			{#each steps as s (s.n)}
				{@const v = parsed(s.result)}
				{@const rows = asRows(v)}
				<li class="step">
					<span class="rail"><span class="n">{s.n}</span></span>
					<div class="body">
						{#if s.thought}
							<div class="thought"><Markdown source={s.thought} /></div>
						{/if}
						<div class="call">
							<span class="cn">{s.name}</span>
							<span class="args">
								{#each Object.entries(s.args) as [k, val] (k)}
									<span class="arg"><span class="ak">{k}</span><span class="av">{argValue(val)}</span></span>
								{/each}
							</span>
						</div>
						{#if rows}
							<div class="table-wrap">
								<table>
									<thead>
										<tr>{#each columns(rows) as c (c)}<th>{c}</th>{/each}</tr>
									</thead>
									<tbody>
										{#each rows as row, ri (ri)}
											<tr>{#each columns(rows) as c (c)}<td>{cell(row[c])}</td>{/each}</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else if v !== undefined && typeof v === 'object'}
							<StateInspector state={v} compact />
						{:else}
							<div class="text-result"><Markdown source={s.result} /></div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if tools.length}
		<details class="more">
			<summary>the toolbox · {tools.length} tools available</summary>
			<div class="tools">
				{#each tools as t (t.name)}
					<div class="tool">
						<div class="tool-head">
							<span class="tn">{t.name}</span>
							<code class="tp">({t.params.join(', ')})</code>
						</div>
						<div class="td">{t.description}</div>
					</div>
				{/each}
			</div>
		</details>
	{/if}

	<details class="more">
		<summary>raw messages · {raw.length}</summary>
		<StateInspector state={raw} compact />
	</details>
</div>

<style>
	.agent-inspect {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* The result, first and unmistakable. */
	.answer {
		padding: 0.85rem 1rem;
		border-radius: 0.6rem;
		background: color-mix(in oklch, var(--accent) 7%, var(--color-paper));
		border: 1px solid var(--accent-rule);
	}
	.answer-eyebrow {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--accent);
		margin-bottom: 0.35rem;
	}
	.answer :global(.markdown) {
		font-size: 0.92rem;
		line-height: 1.55;
	}
	.answer :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.answer :global(.markdown > :last-child) {
		margin-bottom: 0;
	}

	.steps-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-ink-300);
		margin-top: 0.6rem;
	}

	/* The loop as a clean numbered stepper with a connecting rail. */
	.steps {
		list-style: none;
		margin: 0.2rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.step {
		display: grid;
		grid-template-columns: 1.5rem 1fr;
		gap: 0.6rem;
	}
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: color-mix(in oklch, var(--accent) 16%, transparent);
		color: var(--accent);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		font-weight: 600;
		flex-shrink: 0;
	}
	/* connector line under every step except the last */
	.step:not(:last-child) .rail::after {
		content: '';
		flex: 1;
		width: 1px;
		margin-top: 0.3rem;
		background: var(--color-rule);
	}
	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-bottom: 0.2rem;
	}
	.thought {
		font-size: 0.84rem;
		color: var(--color-ink-200);
	}
	.thought :global(.markdown) {
		font-size: 0.84rem;
		line-height: 1.5;
	}
	.thought :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.thought :global(.markdown > :last-child) {
		margin-bottom: 0;
	}
	.call {
		display: flex;
		align-items: baseline;
		gap: 0.4rem 0.5rem;
		flex-wrap: wrap;
	}
	.cn {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-ink-100);
	}
	.args {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.arg {
		display: inline-flex;
		align-items: baseline;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		padding: 0.08rem 0.4rem;
		border-radius: 0.35rem;
		background: var(--color-paper);
	}
	.ak {
		color: var(--color-ink-300);
	}
	.av {
		color: var(--accent);
	}
	.text-result {
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-200);
	}
	.text-result :global(.markdown) {
		font-size: 0.86rem;
		line-height: 1.5;
	}
	.text-result :global(.markdown > :first-child) {
		margin-top: 0;
	}
	.text-result :global(.markdown > :last-child) {
		margin-bottom: 0;
	}

	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 0.72rem;
		width: 100%;
	}
	th,
	td {
		border: 1px solid var(--color-rule);
		padding: 0.25rem 0.5rem;
		text-align: left;
		white-space: nowrap;
	}
	th {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-ink-300);
		background: var(--color-bg);
	}
	td {
		font-family: var(--font-mono);
		color: var(--color-ink-100);
	}

	.more {
		margin-top: 0.3rem;
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
	.tools {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.tool {
		padding: 0.45rem 0.6rem;
		border-radius: 0.45rem;
		background: var(--color-paper);
	}
	.tool-head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.tn {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--accent);
	}
	.tp {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-300);
	}
	.td {
		margin-top: 0.2rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--color-ink-200);
	}
</style>
