<script lang="ts">
	export interface TodoItem {
		content: string;
		status: 'pending' | 'in_progress' | 'completed';
	}

	interface Props {
		todos: TodoItem[];
		title?: string;
	}

	let { todos, title = 'Todos' }: Props = $props();

	function symbol(s: TodoItem['status']) {
		if (s === 'completed') return '✓';
		if (s === 'in_progress') return '→';
		return '○';
	}
</script>

<div class="todos">
	<header>
		<h4>{title}</h4>
		<span class="count">{todos.filter((t) => t.status === 'completed').length}/{todos.length}</span>
	</header>
	{#if !todos.length}
		<p class="empty">No plan yet. The agent will populate this when it calls write_todos.</p>
	{:else}
		<ol>
			{#each todos as t, i (i)}
				<li data-status={t.status}>
					<span class="sym" aria-hidden="true">{symbol(t.status)}</span>
					<span class="content">{t.content}</span>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.todos {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-bg);
		overflow: hidden;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg-elev-2);
	}

	h4 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		margin: 0;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}

	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		font-style: italic;
		padding: 0.85rem 1rem;
		margin: 0;
	}

	ol {
		list-style: none;
		padding: 0.4rem 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	li {
		display: flex;
		gap: 0.55rem;
		padding: 0.4rem 0.85rem;
		font-size: 0.88rem;
		color: var(--color-fg-muted);
		border-bottom: 1px solid color-mix(in oklch, var(--color-border) 50%, transparent);
		transition: background 0.15s, color 0.15s;
	}

	li:last-child {
		border-bottom: none;
	}

	li[data-status='completed'] {
		color: var(--color-fg-faint);
		text-decoration: line-through;
		text-decoration-color: var(--color-fg-faint);
	}

	li[data-status='in_progress'] {
		color: var(--color-fg);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}

	.sym {
		font-family: var(--font-mono);
		font-weight: 600;
		width: 0.9rem;
	}

	li[data-status='completed'] .sym {
		color: var(--color-accent-success);
	}
	li[data-status='in_progress'] .sym {
		color: var(--accent);
	}
	li[data-status='pending'] .sym {
		color: var(--color-fg-faint);
	}

	.content {
		flex: 1;
		line-height: 1.5;
	}
</style>
