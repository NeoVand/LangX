<script lang="ts">
	import { BookOpen, Code2, ArrowUpRight } from '@lucide/svelte';

	interface Link {
		label: string;
		href: string;
		/** 'docs' shows a book icon, 'api' a code icon. */
		kind?: 'docs' | 'api';
	}
	interface Props {
		title?: string;
		links: Link[];
	}
	let { title = 'Go deeper', links }: Props = $props();
</script>

<aside class="read-more">
	<div class="rm-head font-mono">{title}</div>
	<div class="rm-links">
		{#each links as l (l.href)}
			<a class="rm-link" href={l.href} target="_blank" rel="noopener noreferrer">
				{#if l.kind === 'api'}<Code2 size={15} />{:else}<BookOpen size={15} />{/if}
				<span class="rm-label">{l.label}</span>
				<span class="rm-arrow"><ArrowUpRight size={14} /></span>
			</a>
		{/each}
	</div>
</aside>

<style>
	.read-more {
		margin: 2.75rem 0 0.5rem;
	}
	.rm-head {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--color-ink-300);
		margin-bottom: 0.7rem;
	}
	.rm-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.rm-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.8rem;
		border-radius: 0.6rem;
		background: var(--color-paper);
		color: var(--color-ink-100);
		text-decoration: none;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		border: 1px solid transparent;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.rm-link:hover {
		border-color: var(--accent-rule);
		color: var(--accent);
	}
	.rm-label {
		font-weight: 500;
	}
	.rm-arrow {
		display: inline-flex;
		color: var(--color-ink-300);
	}
	.rm-link:hover .rm-arrow {
		color: var(--accent);
	}
</style>
