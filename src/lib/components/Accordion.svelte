<script lang="ts">
	interface Item {
		title: string;
		/** Optional right-aligned mono label (a signature, type, etc.). */
		meta?: string;
		body: string;
	}
	interface Props {
		items: Item[];
		/** Optional small uppercase heading above the list. */
		heading?: string;
		/** Width cap; matches the poster column by default. */
		maxWidth?: string;
	}
	let { items, heading, maxWidth = '30rem' }: Props = $props();

	let open = $state(-1);
</script>

<div class="accordion" style:max-width={maxWidth}>
	{#if heading}<div class="ac-head font-mono">{heading}</div>{/if}
	{#each items as it, i (it.title)}
		<details open={open === i}>
			<summary
				onclick={(ev) => {
					ev.preventDefault();
					open = open === i ? -1 : i;
				}}
			>
				<span class="num">{i + 1}</span>
				<span class="nm">{it.title}</span>
				{#if it.meta}<code class="sig">{it.meta}</code>{/if}
			</summary>
			<p class="body">{it.body}</p>
		</details>
	{/each}
</div>

<style>
	.accordion {
		margin: 0 auto 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.ac-head {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-ink-300);
		margin-bottom: 0.4rem;
	}
	details {
		border-radius: 0.5rem;
		background: var(--color-paper);
		border: 1px solid transparent;
		transition: border-color 0.15s ease;
	}
	details[open] {
		border-color: var(--accent-rule);
	}
	summary {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
		padding: 0.55rem 0.7rem;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.num {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-300);
		min-width: 1.1rem;
	}
	.nm {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--color-ink-100);
		font-weight: 500;
	}
	details[open] .nm {
		color: var(--accent);
	}
	.sig {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-300);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 14rem;
	}
	.body {
		margin: 0;
		padding: 0 0.7rem 0.65rem 2.35rem;
		font-size: 0.84rem;
		line-height: 1.55;
		color: var(--color-ink-200);
	}
</style>
