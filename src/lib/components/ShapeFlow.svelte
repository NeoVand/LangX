<script lang="ts">
	import StateInspector from './StateInspector.svelte';
	import MessageList from './MessageList.svelte';

	interface FlowNode {
		/** The value's type at this hop, e.g. ChatPromptValue. */
		type: string;
		/** The actual runtime value, peekable on click. */
		value?: unknown;
	}
	let { nodes }: { nodes: FlowNode[] } = $props();

	// Which hop's value is expanded; -1 = none (stay compact by default).
	let open = $state(-1);

	// A value is a message list (e.g. a ChatPromptValue) if it's an array of
	// { role, content } — render it with the shared MessageList for consistency.
	function asMessages(v: unknown): { role: string; text: string }[] | null {
		if (!Array.isArray(v) || v.length === 0) return null;
		if (!v.every((x) => x && typeof x === 'object' && 'role' in x)) return null;
		return v.map((x) => {
			const o = x as { role: unknown; content: unknown };
			return {
				role: String(o.role),
				text: typeof o.content === 'string' ? o.content : JSON.stringify(o.content, null, 2)
			};
		});
	}
</script>

<div class="flow">
	{#each nodes as n, i (i)}
		{#if i > 0}<span class="arrow">→</span>{/if}
		<button
			type="button"
			class="node"
			class:active={open === i}
			onclick={() => (open = open === i ? -1 : i)}
		>
			{n.type}
		</button>
	{/each}
</div>

{#if open >= 0 && nodes[open]}
	{@const v = nodes[open].value}
	{@const msgs = asMessages(v)}
	<div class="peek">
		{#if typeof v === 'string'}
			<div class="peek-str">{v}</div>
		{:else if msgs}
			<MessageList messages={msgs} />
		{:else}
			<StateInspector state={v} compact />
		{/if}
	</div>
{/if}

<p class="contract">
	Each arrow is a <code>.pipe()</code>. The type after every arrow is exactly the input the next
	Runnable expects — line the shapes up and composition just works. Click a hop to see its value.
</p>

<style>
	.flow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.node {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.25rem 0.6rem;
		border-radius: 0.4rem;
		background: var(--color-paper);
		color: var(--color-ink-100);
		border: 1px solid var(--color-rule);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.node:hover {
		border-color: var(--accent-rule);
		color: var(--accent);
	}
	.node.active {
		border-color: var(--accent);
		color: var(--accent);
	}
	.arrow {
		color: var(--accent);
		font-size: 0.8rem;
	}
	.peek {
		margin-top: 0.6rem;
	}
	.peek-str {
		font-family: var(--font-prose);
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--color-ink-200);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.contract {
		margin: 0.7rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-ink-300);
	}
	.contract code {
		color: var(--color-ink-100);
	}
</style>
