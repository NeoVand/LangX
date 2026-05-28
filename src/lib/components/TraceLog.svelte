<script lang="ts">
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface Props {
		events: TraceEvent[];
		compact?: boolean;
		max?: number;
	}

	let { events, compact = false, max = 200 }: Props = $props();

	const visible = $derived(events.slice(-max));

	const labels: Record<TraceEvent['kind'], string> = {
		run_start: 'run',
		run_end: 'run',
		node_start: 'node',
		node_end: 'node',
		edge: 'edge',
		message: 'msg',
		token: 'tok',
		tool_call: 'tool',
		tool_result: 'tool',
		state_update: 'state',
		subagent_spawn: 'sub',
		subagent_return: 'sub',
		todo_update: 'todo',
		fs_op: 'fs',
		eviction: 'evict',
		summarization: 'summ',
		interrupt: 'pause',
		resume: 'resume',
		note: 'note',
		error: 'err'
	};
</script>

<div class="log scrollbar-slim" class:compact>
	{#each visible as ev (ev.id)}
		<div class="row" data-kind={ev.kind}>
			<span class="t">+{(ev.t - visible[0].t).toString().padStart(4, '0')}</span>
			<span class="kind">{labels[ev.kind]}</span>
			<span class="depth" style:padding-left="{(ev.depth ?? 0) * 8}px"></span>
			<span class="lbl">{ev.label}</span>
			{#if ev.data}
				<span class="data">
					{#each Object.entries(ev.data) as [k, v] (k)}
						<span class="kv"><b>{k}</b>={typeof v === 'string' ? v : JSON.stringify(v)}</span>
					{/each}
				</span>
			{/if}
		</div>
	{/each}
	{#if !visible.length}
		<p class="empty">No events yet.</p>
	{/if}
</div>

<style>
	.log {
		display: flex;
		flex-direction: column;
		gap: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		max-height: 22rem;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		padding: 0.4rem 0.5rem;
	}

	.compact {
		font-size: 0.74rem;
		max-height: 12rem;
	}

	.row {
		display: grid;
		grid-template-columns: 4ch 5ch 0 1fr auto;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0.15rem 0;
		color: var(--color-fg-muted);
	}

	.row[data-kind='error'] {
		color: var(--color-accent-danger);
	}
	.row[data-kind='tool_call'],
	.row[data-kind='tool_result'] {
		color: var(--color-fg);
	}
	.row[data-kind='node_start'],
	.row[data-kind='node_end'] {
		color: var(--accent);
	}

	.t {
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
	}

	.kind {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.7em;
		color: var(--color-fg-faint);
	}

	.lbl {
		color: var(--color-fg);
	}

	.data {
		color: var(--color-fg-muted);
		font-size: 0.85em;
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		justify-self: end;
	}

	.kv b {
		color: var(--color-fg-faint);
		font-weight: 500;
	}

	.empty {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		font-style: italic;
		text-align: center;
		padding: 0.75rem 0;
		margin: 0;
	}
</style>
