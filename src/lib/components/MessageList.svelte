<script lang="ts">
	interface Msg {
		role: string;
		text: string;
		imageUrl?: string;
		hasImage?: boolean;
	}
	interface Props {
		messages: Msg[];
		/** Compact = single clamped line per message (for a memory timeline). */
		compact?: boolean;
	}
	let { messages, compact = false }: Props = $props();

	const roleLabel: Record<string, string> = {
		system: 'system',
		human: 'user',
		user: 'user',
		ai: 'assistant',
		assistant: 'assistant',
		tool: 'tool'
	};
</script>

<div class="msglist" class:compact>
	{#each messages as m, i (i)}
		<div class="pmsg">
			<span class="role role-{m.role}">{roleLabel[m.role] ?? m.role}</span>
			{#if compact}
				<span class="tline" title={m.text}>{m.text}{#if m.hasImage} · [image]{/if}</span>
			{:else}
				<div class="pbody">
					<pre>{m.text}</pre>
					{#if m.imageUrl}
						<img class="pimg" src={m.imageUrl} alt="attachment" />
					{:else if m.hasImage}
						<span class="imgflag">+ image part</span>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.msglist {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.msglist.compact {
		gap: 0.4rem;
	}
	.pmsg {
		display: grid;
		grid-template-columns: 4.5rem 1fr;
		gap: 0.6rem;
		align-items: start;
	}
	.msglist.compact .pmsg {
		align-items: baseline;
	}
	.role {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.18rem 0.4rem;
		border-radius: 0.35rem;
		text-align: center;
		border: 1px solid var(--color-rule);
		color: var(--color-ink-200);
	}
	.role-system {
		color: var(--color-ink-300);
	}
	.role-human {
		color: var(--accent);
		border-color: color-mix(in oklch, var(--accent) 30%, var(--color-rule));
	}
	.role-ai {
		color: oklch(0.72 0.13 210);
		border-color: color-mix(in oklch, oklch(0.72 0.13 210) 30%, var(--color-rule));
	}
	.pbody {
		min-width: 0;
	}
	.pbody pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.pimg {
		margin-top: 0.4rem;
		max-width: 7rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
	}
	.imgflag {
		display: inline-block;
		margin-top: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: oklch(0.72 0.13 210);
	}
	.tline {
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--color-ink-200);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
