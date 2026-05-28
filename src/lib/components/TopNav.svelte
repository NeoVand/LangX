<script lang="ts">
	import { page } from '$app/state';
	import { app, togglePresentation } from '$lib/state/app.svelte';
	import { chapters } from '$lib/curriculum';

	const path = $derived(page.url.pathname);
</script>

<nav class="topnav app-chrome">
	<a href="/" class="brand" aria-label="LangX home">
		<span class="dot" aria-hidden="true"></span>
		<span class="brand-name">LangX</span>
	</a>

	<div class="links">
		{#each chapters as ch (ch.id)}
			<a
				class="chapter-link"
				class:active={path.startsWith(ch.base)}
				href={ch.base}
				data-chapter={ch.id}
			>
				<span class="num">{ch.number}</span>
				<span class="label">{ch.title}</span>
			</a>
		{/each}
	</div>

	<div class="actions">
		<a class="action" class:active={path === '/glossary'} href="/glossary">Glossary</a>
		<a class="action" class:active={path === '/setup'} href="/setup">
			<span>Setup</span>
			{#if app.preferredProvider !== 'mock'}
				<span class="dot-on" aria-label="model configured"></span>
			{/if}
		</a>
		<button class="present" onclick={togglePresentation} title="Toggle presentation (P)">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="2" y="4" width="20" height="14" rx="2" />
				<path d="M12 18v3" />
				<path d="M8 21h8" />
			</svg>
			<span>Present</span>
		</button>
	</div>
</nav>

<style>
	.topnav {
		display: flex;
		align-items: center;
		height: 56px;
		padding: 0 1.25rem;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in oklch, var(--color-bg) 90%, transparent);
		backdrop-filter: blur(8px);
		position: sticky;
		top: 0;
		z-index: 20;
		gap: 1.5rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		text-decoration: none;
		color: var(--color-fg);
	}

	.brand-name {
		font-weight: 600;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: linear-gradient(
			135deg,
			var(--color-accent-langchain),
			var(--color-accent-langgraph),
			var(--color-accent-deepagents)
		);
	}

	.links {
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}

	.chapter-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.75rem;
		border-radius: 0.45rem;
		font-size: 0.85rem;
		color: var(--color-fg-muted);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}

	.chapter-link:hover {
		color: var(--color-fg);
		background: var(--color-bg-elev);
	}

	.chapter-link.active {
		color: var(--color-fg);
		background: var(--color-bg-elev);
		--accent-l: var(--color-accent-langchain);
	}

	.chapter-link[data-chapter='langchain'].active {
		box-shadow: inset 0 -2px 0 var(--color-accent-langchain);
	}
	.chapter-link[data-chapter='langgraph'].active {
		box-shadow: inset 0 -2px 0 var(--color-accent-langgraph);
	}
	.chapter-link[data-chapter='deepagents'].active {
		box-shadow: inset 0 -2px 0 var(--color-accent-deepagents);
	}

	.num {
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-faint);
		font-size: 0.75rem;
		font-weight: 500;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.action {
		font-size: 0.82rem;
		padding: 0.4rem 0.65rem;
		border-radius: 0.4rem;
		color: var(--color-fg-muted);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.action:hover,
	.action.active {
		background: var(--color-bg-elev);
		color: var(--color-fg);
	}

	.dot-on {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-accent-success);
	}

	.present {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.7rem;
		font-size: 0.82rem;
		background: transparent;
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
	}

	.present:hover {
		color: var(--color-fg);
		background: var(--color-bg-elev);
	}

	@media (max-width: 720px) {
		.topnav {
			gap: 0.5rem;
			padding: 0 0.75rem;
		}
		.chapter-link .label {
			display: none;
		}
		.present span:last-child {
			display: none;
		}
		.present {
			padding: 0.45rem 0.55rem;
		}
		.action {
			padding: 0.4rem 0.5rem;
			font-size: 0.78rem;
		}
	}

	@media (max-width: 520px) {
		.actions .action {
			display: none;
		}
	}
</style>
