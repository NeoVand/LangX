<script lang="ts">
	interface Usage {
		input?: number;
		output?: number;
		total?: number;
	}
	let { usage }: { usage?: Usage } = $props();
</script>

{#if usage}
	<span class="tokens">
		<span class="pill">in {usage.input ?? '—'}</span>
		<span class="pill">out {usage.output ?? '—'}</span>
		<span class="pill">total {usage.total ?? '—'} tok</span>
	</span>
{/if}

<style>
	.tokens {
		display: inline-flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.pill {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 28%, var(--color-rule));
		white-space: nowrap;
	}
</style>
