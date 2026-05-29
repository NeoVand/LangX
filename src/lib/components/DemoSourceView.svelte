<script lang="ts">
	import CodeBlock from './CodeBlock.svelte';
	import { sourceFiles, type DemoManifest } from '$lib/demos/download';

	interface Props {
		manifest: DemoManifest;
	}

	let { manifest }: Props = $props();

	const files = $derived(sourceFiles(manifest));
	let active = $state(0);
	const current = $derived(files[Math.min(active, files.length - 1)]);
</script>

<div class="source-view">
	<p class="lede">
		This is the <strong>exact code the demo runs</strong> — the same modules the app imports.
		Download the whole thing as a standalone project you can run with <code>npm start</code>.
	</p>

	{#if files.length > 1}
		<div class="filetabs" role="tablist">
			{#each files as f, i (f.path)}
				<button
					role="tab"
					aria-selected={active === i}
					class="filetab"
					class:active={active === i}
					onclick={() => (active = i)}
				>
					{f.path}
				</button>
			{/each}
		</div>
	{/if}

	{#if current}
		<CodeBlock code={current.code} lang={current.lang ?? 'ts'} caption={current.path} dense />
	{/if}
</div>

<style>
	.source-view {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.lede {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.55;
		color: var(--color-ink-200);
		font-family: var(--font-prose);
	}
	.lede code {
		font-family: var(--font-mono);
		font-size: 0.8em;
		background: var(--accent-soft);
		padding: 0.05em 0.35em;
		border-radius: 0.3rem;
	}
	.filetabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem;
	}
	.filetab {
		appearance: none;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.35rem 0.6rem;
		font-size: 0.72rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
		cursor: pointer;
		transition: color 0.15s ease;
	}
	.filetab:hover {
		color: var(--color-fg-muted);
	}
	.filetab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
</style>
