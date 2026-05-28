<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · LangX</title>
</svelte:head>

<main class="error-page">
	<div class="status">{page.status}</div>
	<h1>
		{#if page.status === 404}
			Lost the trail
		{:else}
			Something fell over
		{/if}
	</h1>
	<p>
		{#if page.status === 404}
			This route isn't part of the curriculum (yet). Use the top nav or jump to one of the
			chapters.
		{:else if page.error}
			{page.error.message}
		{:else}
			Try refreshing the page or returning to the start.
		{/if}
	</p>
	<div class="actions">
		<a class="btn" href="/">← Back to landing</a>
		<a class="btn primary" href="/1-langchain">Start Phase 1</a>
	</div>
</main>

<style>
	.error-page {
		max-width: 36rem;
		margin: 6rem auto 4rem;
		padding: 2rem;
		text-align: center;
	}
	.status {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
	}
	h1 {
		font-family: var(--font-serif);
		font-size: 2.5rem;
		font-weight: 600;
		margin: 1rem 0 1rem;
	}
	p {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		color: var(--color-fg-muted);
		line-height: 1.6;
	}
	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 2rem;
	}
	.btn {
		text-decoration: none;
		font-size: 0.9rem;
		padding: 0.65rem 1rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		color: var(--color-fg);
		background: var(--color-bg-elev);
	}
	.btn.primary {
		background: var(--color-fg);
		color: var(--color-bg);
		border-color: var(--color-fg);
	}
</style>
