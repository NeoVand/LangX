<script lang="ts">
	import { highlight } from '$lib/runtime/highlight';

	interface Props {
		state: unknown;
		title?: string;
		compact?: boolean;
	}

	let { state: value, title, compact = false }: Props = $props();

	function safeStringify(v: unknown) {
		try {
			return JSON.stringify(v, replacer, 2);
		} catch {
			return String(v);
		}
	}

	function replacer(_key: string, value: unknown) {
		if (value && typeof value === 'object' && 'lc_kwargs' in (value as object)) {
			const v = value as { lc_kwargs?: Record<string, unknown>; constructor: { name: string } };
			return { __type: v.constructor.name, ...(v.lc_kwargs ?? {}) };
		}
		return value;
	}

	const json = $derived(safeStringify(value));
	let html = $state('');

	$effect(() => {
		const src = json;
		highlight(src, 'json').then((h) => {
			html = h;
		});
	});

	function escape(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
</script>

<div class="inspector code-surface" class:compact>
	{#if title}
		<div class="title code-surface-footer">{title}</div>
	{/if}
	<div class="hl scrollbar-slim">
		{#if html}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		{:else}
			<pre class="shiki"><code>{@html escape(json)}</code></pre>
		{/if}
	</div>
</div>

<style>
	.inspector {
		min-width: 0;
		max-width: 100%;
	}

	.title {
		position: relative;
		z-index: 1;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		padding: 0.55rem 1.3rem 0;
		background: transparent;
		box-shadow: none;
		border: none;
	}

	.hl {
		position: relative;
		z-index: 1;
		max-height: 22rem;
		overflow: auto;
		min-width: 0;
		max-width: 100%;
	}

	.hl :global(pre.shiki) {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		margin: 0;
		padding: 0.65rem 1.3rem 1.15rem;
		border: none;
		border-radius: 0;
		overflow-x: hidden;
		max-width: 100%;
	}

	.inspector:has(.title) .hl :global(pre.shiki) {
		padding-top: 0.45rem;
	}

	.compact .hl {
		max-height: 12rem;
	}

	.compact .hl :global(pre.shiki) {
		font-size: 0.72rem;
	}
</style>
