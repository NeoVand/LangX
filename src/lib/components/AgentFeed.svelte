<script lang="ts">
	import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import { displayContent } from '$lib/runtime/messages';
	import Markdown from '$lib/components/Markdown.svelte';

	interface Props {
		messages: BaseMessage[];
		/** Cap the feed height; it scrolls (and follows) the run. */
		maxHeight?: string;
	}
	let { messages, maxHeight = '26rem' }: Props = $props();

	interface ToolCallItem {
		kind: 'call';
		id: string;
		name: string;
		preview: string;
	}
	interface Item {
		kind: 'human' | 'assistant' | 'result';
		text: string;
		name?: string;
		calls?: ToolCallItem[];
		long?: boolean;
	}

	function callPreview(name: string, args: Record<string, unknown>): string {
		if (typeof args.path === 'string') return args.path;
		if (typeof args.pattern === 'string') return args.pattern;
		if (typeof args.subagent === 'string')
			return `${args.subagent} — ${String(args.description ?? '').slice(0, 60)}`;
		if (Array.isArray(args.todos)) {
			const done = (args.todos as { status?: string }[]).filter((t) => t.status === 'completed').length;
			return `${args.todos.length} steps · ${done} done`;
		}
		const s = JSON.stringify(args);
		return s === '{}' ? '' : s.slice(0, 64);
	}

	const items = $derived.by((): Item[] => {
		const out: Item[] = [];
		for (const m of messages) {
			if (m instanceof HumanMessage) {
				out.push({ kind: 'human', text: displayContent(m.content as never) ?? '' });
			} else if (m instanceof AIMessage) {
				const text = (displayContent(m.content as never) ?? '').trim();
				const calls: ToolCallItem[] = (m.tool_calls ?? []).map((tc) => ({
					kind: 'call',
					id: tc.id ?? '',
					name: tc.name,
					preview: callPreview(tc.name, (tc.args ?? {}) as Record<string, unknown>)
				}));
				if (text || calls.length) out.push({ kind: 'assistant', text, calls });
			} else if (m instanceof ToolMessage) {
				const text = (displayContent(m.content as never) ?? '').trim();
				out.push({ kind: 'result', text, name: (m.name as string) ?? 'tool', long: text.length > 180 });
			}
		}
		return out;
	});

	// Follow the run: keep the feed pinned to the newest entry.
	let box = $state<HTMLDivElement | null>(null);
	$effect(() => {
		items.length;
		if (box) box.scrollTop = box.scrollHeight;
	});
</script>

<div class="feed scrollbar-slim" bind:this={box} style="max-height:{maxHeight}">
	{#each items as it, i (i)}
		{#if it.kind === 'human'}
			<div class="row human"><span class="tag">you</span><p>{it.text}</p></div>
		{:else if it.kind === 'assistant'}
			<div class="row assistant">
				{#if it.text}<div class="md"><Markdown source={it.text} /></div>{/if}
				{#if it.calls?.length}
					<div class="calls">
						{#each it.calls as c (c.id)}
							<span class="chip"><code>{c.name}</code>{#if c.preview}<em>{c.preview}</em>{/if}</span>
						{/each}
					</div>
				{/if}
			</div>
		{:else if it.long}
			<details class="row result">
				<summary><code>{it.name}</code> {it.text.split('\n')[0].slice(0, 110)}…</summary>
				<pre>{it.text}</pre>
			</details>
		{:else}
			<div class="row result"><code>{it.name}</code><span>{it.text}</span></div>
		{/if}
	{/each}
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		overflow-y: auto;
		padding-right: 0.2rem;
	}
	.row {
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.row p {
		margin: 0;
		white-space: pre-wrap;
	}

	.human {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		background: color-mix(in oklch, var(--accent) 7%, transparent);
		border: 1px solid var(--accent-rule);
		border-radius: 0.55rem;
		padding: 0.45rem 0.6rem;
		color: var(--color-fg);
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.02rem 0.4rem;
		flex-shrink: 0;
	}

	.assistant {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		padding: 0.45rem 0.6rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
	}
	/* markdown inside a bubble — compact rhythm, no oversized headings */
	.md :global(p) {
		margin: 0 0 0.35rem;
	}
	.md :global(p:last-child) {
		margin-bottom: 0;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0 0 0.35rem;
		padding-left: 1.15rem;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3),
	.md :global(h4) {
		font-size: 0.84rem;
		margin: 0.4rem 0 0.25rem;
		color: var(--color-fg);
	}
	.md :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	.md :global(pre) {
		margin: 0.3rem 0;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-paper);
		overflow-x: auto;
		font-size: 0.7rem;
	}
	.md :global(strong) {
		color: var(--color-fg);
	}
	.calls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.35rem;
	}
	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		border: 1px solid var(--color-rule);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		background: var(--color-bg-elev);
		max-width: 100%;
	}
	.chip code {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
	}
	.chip em {
		font-style: normal;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-fg-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 16rem;
	}

	.result {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.1rem 0.6rem;
		color: var(--color-fg-faint);
		font-size: 0.72rem;
	}
	.result code {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-fg-muted);
		flex-shrink: 0;
	}
	.result span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	details.result {
		display: block;
	}
	details.result summary {
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	details.result pre {
		margin: 0.3rem 0 0.2rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background: var(--color-paper);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 14rem;
		overflow-y: auto;
	}
</style>
