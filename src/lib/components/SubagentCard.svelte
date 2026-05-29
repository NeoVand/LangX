<script lang="ts">
	export type SubagentStatus = 'idle' | 'running' | 'done' | 'failed';

	interface Props {
		name: string;
		status?: SubagentStatus;
		prompt?: string;
		report?: string;
		durationMs?: number;
	}

	let { name, status = 'idle', prompt, report, durationMs }: Props = $props();
	let open = $state(false);

	const label: Record<SubagentStatus, string> = {
		idle: 'idle',
		running: 'running',
		done: 'done',
		failed: 'failed'
	};
</script>

<article class="subagent" data-status={status}>
	<button class="head" onclick={() => (open = !open)}>
		<span class="status-dot" class:pulse-soft={status === 'running'}></span>
		<span class="name">{name}</span>
		<span class="badge">{label[status]}</span>
		{#if durationMs}<span class="dur">{(durationMs / 1000).toFixed(1)}s</span>{/if}
		<span class="chev" class:open>›</span>
	</button>
	{#if open}
		<div class="detail">
			{#if prompt}
				<div class="block">
					<div class="block-label">Prompt sent</div>
					<p>{prompt}</p>
				</div>
			{/if}
			{#if report}
				<div class="block">
					<div class="block-label">Returned report</div>
					<p>{report}</p>
				</div>
			{:else if status === 'running'}
				<p class="muted">Working…</p>
			{:else}
				<p class="muted">No report yet.</p>
			{/if}
		</div>
	{/if}
</article>

<style>
	.subagent {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-bg);
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0.5rem 0.7rem;
		cursor: pointer;
		color: var(--color-fg);
		font-size: 0.83rem;
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-border-strong);
		flex-shrink: 0;
	}
	[data-status='running'] .status-dot {
		background: var(--accent);
	}
	[data-status='done'] .status-dot {
		background: #4caf7d;
	}
	[data-status='failed'] .status-dot {
		background: #e07a72;
	}
	.name {
		font-weight: 600;
		font-family: var(--font-mono);
	}
	.badge {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
	}
	.dur {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg-faint);
	}
	.chev {
		margin-left: auto;
		color: var(--color-fg-faint);
		transition: transform 0.15s ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.detail {
		padding: 0 0.7rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.block-label {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		margin-bottom: 0.25rem;
		font-family: var(--font-mono);
	}
	.block p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--color-fg);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.muted {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
	}
</style>
