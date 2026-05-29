<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		subtitle?: string;
		children?: Snippet;
		actions?: Snippet;
	}

	let { title, subtitle, children, actions }: Props = $props();
</script>

<section class="panel">
	{#if title || actions}
		<header class="panel-head">
			<div class="panel-titles">
				{#if title}<h3>{title}</h3>{/if}
				{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
			</div>
			{#if actions}
				<div class="panel-actions">{@render actions()}</div>
			{/if}
		</header>
	{/if}
	<div class="panel-body">
		{@render children?.()}
	</div>
</section>

<style>
	.panel {
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		background: var(--color-bg-elev);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem 0.55rem;
		background: transparent;
	}

	.panel-titles {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	h3 {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg);
		margin: 0;
	}

	.subtitle {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin: 0;
	}

	.panel-actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.panel-body {
		padding: 0.85rem 1rem 1rem;
		font-size: 0.88rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
</style>
