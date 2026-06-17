<script lang="ts">
	import { tjsDownload } from '$lib/state/tjs.svelte';
	import { TJS_MODELS, app } from '$lib/state/app.svelte';
	import { Cpu } from '@lucide/svelte';

	const model = $derived(TJS_MODELS.find((m) => m.id === tjsDownload.modelId));
	const label = $derived(model?.label ?? tjsDownload.modelId ?? 'local model');
	const sizeGb = $derived(model ? (model.sizeMb / 1024).toFixed(1) : null);
	const pct = $derived(Math.max(0, Math.min(100, tjsDownload.percent)));

	// Already cached → this is a load-into-memory pass (reads from the browser cache,
	// no network), not a fresh download. Label it accordingly and show an indeterminate
	// bar rather than a download percentage.
	const cached = $derived(!!tjsDownload.modelId && app.downloadedModels.includes(tjsDownload.modelId));
</script>

{#if tjsDownload.active}
	<div class="dl-banner app-chrome" role="status" aria-live="polite">
		<Cpu size={15} strokeWidth={2} />
		<div class="dl-text">
			{#if cached}
				<span class="dl-title">Loading <strong>{label}</strong> into memory…</span>
			{:else}
				<span class="dl-title">
					Downloading <strong>{label}</strong>{#if sizeGb}
						· ~{sizeGb} GB{/if} — first run only, then cached
				</span>
			{/if}
			{#if tjsDownload.file}
				<span class="dl-file font-mono">{tjsDownload.file}</span>
			{/if}
		</div>
		{#if !cached}
			<span class="dl-pct font-mono tabular">{pct}%</span>
		{/if}
		<div class="dl-track" aria-hidden="true">
			{#if cached}
				<div class="dl-fill indeterminate"></div>
			{:else}
				<div class="dl-fill" style:width="{pct}%"></div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dl-banner {
		position: fixed;
		top: 60px; /* just under the sticky top nav */
		left: 0;
		right: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem 0.6rem;
		color: var(--color-cream-1);
		background: color-mix(in oklch, var(--color-bg) 78%, transparent);
		backdrop-filter: blur(16px) saturate(1.2);
		-webkit-backdrop-filter: blur(16px) saturate(1.2);
		border-bottom: 1px solid color-mix(in oklch, var(--accent) 30%, var(--color-border));
	}
	.dl-banner :global(svg) {
		color: var(--accent);
		flex-shrink: 0;
	}
	.dl-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
	}
	.dl-title {
		font-size: 0.82rem;
		line-height: 1.3;
	}
	.dl-title strong {
		color: var(--color-cream-0);
		font-weight: 600;
	}
	.dl-file {
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dl-pct {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent-ink);
		flex-shrink: 0;
	}
	.dl-track {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: transparent;
		overflow: hidden;
	}
	.dl-fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.25s ease;
	}
	.dl-fill.indeterminate {
		width: 35%;
		animation: dl-slide 1.1s ease-in-out infinite;
	}
	@keyframes dl-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(320%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dl-fill.indeterminate {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
</style>
