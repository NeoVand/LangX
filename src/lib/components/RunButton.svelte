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
			<svg class="play" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
				<path d="M8 5.5v13l11-6.5z" fill="currentColor" />
			</svg>
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
		gap: 0.5rem;
		font-size: 0.86rem;
		font-weight: 600;
		padding: 0.5rem 1rem 0.5rem 0.85rem;
		border-radius: 0.55rem;
		border: 1px solid transparent;
		cursor: pointer;
		/* Match the box the gradient paints so the 1px border edge stays clean. */
		background-origin: border-box;
		background-clip: border-box;
		transition:
			border-color 0.16s ease,
			filter 0.16s ease;
	}

	/* Primary = polished brass: a bright top-left sheen over a gold→deep-gold fill. */
	.run[data-variant='primary'] {
		background:
			radial-gradient(
				120% 130% at 16% 8%,
				color-mix(in oklch, var(--accent) 72%, #fff),
				transparent 55%
			),
			linear-gradient(155deg, var(--accent), color-mix(in oklch, var(--accent) 70%, #000));
		color: #1a1206;
		border-color: color-mix(in oklch, var(--accent) 60%, #000);
	}
	.run[data-variant='primary']:hover:not(:disabled) {
		border-color: color-mix(in oklch, var(--accent) 70%, #fff);
		filter: brightness(1.07);
	}

	/* Ghost = elevated surface with a faint corner glow; hover warms to accent. */
	.run[data-variant='ghost'] {
		background:
			radial-gradient(
				120% 130% at 0% 0%,
				color-mix(in oklch, var(--accent) 13%, transparent),
				transparent 55%
			),
			var(--color-bg-elev);
		color: var(--color-fg);
		border-color: var(--color-border);
	}
	.run[data-variant='ghost']:hover:not(:disabled) {
		border-color: var(--accent-rule);
		color: var(--accent);
	}

	.run:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.play {
		flex-shrink: 0;
		/* Optical centering — a triangle reads slightly left of its bounding box. */
		margin-left: 0.05rem;
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
