<script lang="ts">
	interface Props {
		state: unknown;
		title?: string;
		compact?: boolean;
	}

	let { state, title, compact = false }: Props = $props();

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
</script>

<div class="inspector" class:compact>
	{#if title}
		<div class="title">{title}</div>
	{/if}
	<pre class="scrollbar-slim">{safeStringify(state)}</pre>
</div>

<style>
	.inspector {
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		overflow: hidden;
		background: var(--color-bg);
	}

	.title {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg-elev-2);
	}

	pre {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		margin: 0;
		padding: 0.7rem 0.85rem;
		max-height: 22rem;
		overflow: auto;
	}

	.compact pre {
		font-size: 0.72rem;
		max-height: 12rem;
	}
</style>
