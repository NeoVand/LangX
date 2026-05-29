<script lang="ts">
	interface Props {
		onclick: () => void | Promise<void>;
		running?: boolean;
		disabled?: boolean;
		label?: string;
		variant?: 'primary' | 'ghost';
	}

	let {
		onclick,
		running = false,
		disabled = false,
		label = 'Run',
		variant = 'primary'
	}: Props = $props();

	let error = $state<string | null>(null);

	async function handle() {
		error = null;
		try {
			await onclick();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
</script>

<div class="run-control">
	<button class="run" data-variant={variant} {disabled} onclick={handle} aria-busy={running}>
		{#if running}
			<span class="spinner" aria-hidden="true"></span>
			<span>Running…</span>
		{:else}
			<span>{label}</span>
		{/if}
	</button>

	{#if error}
		<div class="err" role="alert">
			<strong>Run failed.</strong>
			<span>{error}</span>
			<button class="dismiss" type="button" onclick={() => (error = null)} aria-label="Dismiss">×</button>
		</div>
	{/if}
</div>

<style>
	.run-control {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.run {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.86rem;
		font-weight: 500;
		padding: 0.5rem 0.95rem;
		border-radius: 0.45rem;
		border: 1px solid transparent;
		transition: opacity 0.15s, transform 0.15s;
	}

	.run[data-variant='primary'] {
		background: var(--accent);
		color: var(--color-bg);
	}

	.run[data-variant='ghost'] {
		background: transparent;
		color: var(--color-fg);
		border-color: var(--color-border);
	}

	.run:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.run:disabled {
		opacity: 0.55;
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.err {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.4rem;
		background: color-mix(in oklch, var(--color-accent-danger) 14%, transparent);
		border: 1px solid color-mix(in oklch, var(--color-accent-danger) 50%, transparent);
		color: var(--color-fg);
		font-size: 0.82rem;
		line-height: 1.4;
	}
	.err strong {
		color: var(--color-accent-danger);
		font-weight: 600;
	}
	.err span {
		flex: 1;
		overflow-wrap: anywhere;
	}
	.dismiss {
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 0.2rem;
	}
</style>
