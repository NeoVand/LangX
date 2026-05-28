<script lang="ts">
	import { page } from '$app/state';
	import { app, togglePresentation } from '$lib/state/app.svelte';
	import { chapters } from '$lib/curriculum';
	import ParrotMark from './ParrotMark.svelte';

	const path = $derived(page.url.pathname);
	const hasKey = $derived(
		!!(app.keys.openai || app.keys.anthropic || app.keys.groq)
	);
</script>

<nav class="topnav app-chrome">
	<a href="/" class="brand" aria-label="LangX home">
		<span class="mark">
			<ParrotMark size={26} title="LangX" />
		</span>
		<span class="brand-name font-display">LangX</span>
	</a>

	<div class="links">
		{#each chapters as ch (ch.id)}
			<a
				class="chapter-link"
				class:active={path.startsWith(ch.base)}
				href={ch.base}
				data-chapter={ch.id}
			>
				<span class="num font-mono">{String(ch.number).padStart(2, '0')}</span>
				<span class="label">{ch.title}</span>
			</a>
		{/each}
	</div>

	<div class="actions">
		<a class="action" class:active={path === '/glossary'} href="/glossary">Glossary</a>
		<a class="action" class:active={path === '/setup'} href="/setup">
			<span>Setup</span>
			{#if hasKey}
				<span class="dot-on" aria-label="model configured"></span>
			{:else}
				<span class="dot-off" aria-label="no key set"></span>
			{/if}
		</a>
		<button class="present" onclick={togglePresentation} title="Toggle presentation (P)">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
		height: 60px;
		padding: 0 1.4rem;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in oklch, var(--color-bg) 90%, transparent);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 20;
		gap: 1.75rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--color-cream-0);
	}

	.mark {
		color: var(--color-accent-langchain);
		display: inline-flex;
	}

	.brand-name {
		font-family: var(--font-display);
		font-variation-settings: 'opsz' 64, 'SOFT' 30, 'WONK' 0;
		font-weight: 600;
		font-size: 1.05rem;
		letter-spacing: -0.02em;
	}

	.links {
		display: flex;
		gap: 0.4rem;
		flex: 1;
	}

	.chapter-link {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		font-size: 0.84rem;
		font-weight: 500;
		color: var(--color-cream-3);
		text-decoration: none;
		transition: background 0.18s ease, color 0.18s ease;
		border: 1px solid transparent;
	}

	.chapter-link:hover {
		color: var(--color-cream-0);
	}

	.chapter-link[data-chapter='langchain'].active {
		color: color-mix(in oklch, var(--color-accent-langchain) 90%, var(--color-cream-0));
		background: color-mix(in oklch, var(--color-accent-langchain) 16%, transparent);
		border-color: color-mix(in oklch, var(--color-accent-langchain) 28%, transparent);
	}
	.chapter-link[data-chapter='langgraph'].active {
		color: color-mix(in oklch, var(--color-accent-langgraph) 90%, var(--color-cream-0));
		background: color-mix(in oklch, var(--color-accent-langgraph) 16%, transparent);
		border-color: color-mix(in oklch, var(--color-accent-langgraph) 28%, transparent);
	}
	.chapter-link[data-chapter='deepagents'].active {
		color: color-mix(in oklch, var(--color-accent-deepagents) 90%, var(--color-cream-0));
		background: color-mix(in oklch, var(--color-accent-deepagents) 16%, transparent);
		border-color: color-mix(in oklch, var(--color-accent-deepagents) 28%, transparent);
	}

	.num {
		font-variant-numeric: tabular-nums;
		color: var(--color-cream-4);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
	}

	.chapter-link.active .num {
		color: currentColor;
		opacity: 0.7;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.action {
		font-size: 0.82rem;
		padding: 0.45rem 0.75rem;
		border-radius: 0.45rem;
		color: var(--color-cream-3);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.action:hover,
	.action.active {
		background: var(--color-bg-elev);
		color: var(--color-cream-0);
	}

	.dot-on,
	.dot-off {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.dot-on {
		background: var(--color-accent-success);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-accent-success) 25%, transparent);
	}
	.dot-off {
		background: var(--color-accent-warning);
	}

	.present {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.85rem;
		font-size: 0.82rem;
		background: transparent;
		color: var(--color-cream-2);
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
	}

	.present:hover {
		color: var(--color-cream-0);
		background: var(--color-bg-elev);
		border-color: var(--color-border-strong);
	}

	@media (max-width: 720px) {
		.topnav {
			gap: 0.5rem;
			padding: 0 0.75rem;
		}
		.chapter-link .label {
			display: none;
		}
		.chapter-link {
			padding: 0.45rem 0.65rem;
		}
		.present span:last-child {
			display: none;
		}
		.present {
			padding: 0.45rem 0.55rem;
		}
		.action {
			padding: 0.4rem 0.55rem;
			font-size: 0.78rem;
		}
	}

	@media (max-width: 520px) {
		.actions .action {
			display: none;
		}
		.brand-name {
			display: none;
		}
	}
</style>
