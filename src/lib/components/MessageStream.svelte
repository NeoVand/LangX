<script lang="ts">
	import type { BaseMessage } from '@langchain/core/messages';
	import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
	import { displayContent } from '$lib/runtime/messages';

	interface Props {
		messages: BaseMessage[];
		streaming?: string;
		compact?: boolean;
	}

	let { messages, streaming = '', compact = false }: Props = $props();

	function roleOf(m: BaseMessage): 'user' | 'assistant' | 'system' | 'tool' {
		if (m instanceof HumanMessage) return 'user';
		if (m instanceof SystemMessage) return 'system';
		if (m instanceof ToolMessage) return 'tool';
		if (m instanceof AIMessage) return 'assistant';
		return 'assistant';
	}

	function display(m: BaseMessage) {
		return displayContent(m.content);
	}
</script>

<div class="msgs" class:compact>
	{#each messages as m, i (i)}
		{@const role = roleOf(m)}
		<article class="msg" data-role={role}>
			<header>
				<span class="role">{role}</span>
				{#if m instanceof ToolMessage && m.tool_call_id}
					<span class="meta">↳ {m.tool_call_id}</span>
				{/if}
			</header>
			<div class="body">{display(m)}</div>
			{#if m instanceof AIMessage && m.tool_calls && m.tool_calls.length}
				<div class="toolcalls">
					{#each m.tool_calls as tc, ti (ti)}
						<div class="toolcall">
							<span class="tc-name">{tc.name}</span>
							<code class="tc-args">{JSON.stringify(tc.args)}</code>
						</div>
					{/each}
				</div>
			{/if}
		</article>
	{/each}
	{#if streaming}
		<article class="msg streaming" data-role="assistant">
			<header>
				<span class="role">assistant</span>
				<span class="meta pulse-soft">streaming</span>
			</header>
			<div class="body">{streaming}<span class="caret">▋</span></div>
		</article>
	{/if}
	{#if !messages.length && !streaming}
		<p class="empty">No messages yet. Run the demo to see the conversation appear here.</p>
	{/if}
</div>

<style>
	.msgs {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.empty {
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		font-style: italic;
		text-align: center;
		padding: 1rem 0;
		margin: 0;
	}

	.msg {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg-elev);
		padding: 0.55rem 0.8rem;
	}

	.compact .msg {
		font-size: 0.82rem;
	}

	.msg[data-role='system'] {
		background: color-mix(in oklch, var(--color-bg-elev-2) 92%, var(--accent) 8%);
	}

	.msg[data-role='user'] {
		border-color: color-mix(in oklch, var(--color-border) 60%, var(--accent) 40%);
	}

	.msg[data-role='tool'] {
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.35rem;
	}

	.role {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
		color: var(--color-fg-muted);
	}

	.msg[data-role='assistant'] .role {
		color: var(--accent);
	}

	.meta {
		font-size: 0.7rem;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}

	.body {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--font-sans);
		line-height: 1.55;
		color: var(--color-fg);
		font-size: 0.92rem;
	}

	.compact .body {
		font-size: 0.85rem;
	}

	.toolcalls {
		margin-top: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.toolcall {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.25rem 0.5rem;
		background: var(--color-bg-elev-2);
		border-radius: 0.3rem;
		border: 1px dashed var(--color-border-strong);
	}

	.tc-name {
		color: var(--accent);
		font-weight: 600;
	}

	.tc-args {
		color: var(--color-fg-muted);
		word-break: break-all;
	}

	.caret {
		color: var(--accent);
		display: inline-block;
		animation: blink 1s steps(1) infinite;
		font-weight: 600;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
