<script lang="ts">
	import { page } from '$app/state';
	import { app } from '$lib/state/app.svelte';
	import { chapters } from '$lib/curriculum';
	import ParrotMark from './ParrotMark.svelte';
	import Icon from './Icon.svelte';
	import { Link2, VectorSquare, Bot, Menu, X } from '@lucide/svelte';

	const navIcon: Record<string, typeof Bot> = {
		langchain: Link2,
		langgraph: VectorSquare,
		deepagents: Bot
	};

	const path = $derived(page.url.pathname);
	const hasKey = $derived(
		!!(app.keys.openai || app.keys.anthropic || app.keys.google)
	);

	// Compact-screen dropdown menu (chapter nav + actions collapse into it).
	let menuOpen = $state(false);
	$effect(() => {
		// Close the menu whenever the route changes.
		path;
		menuOpen = false;
	});
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') menuOpen = false; }} />

<nav class="topnav app-chrome">
	<a href="/" class="brand" aria-label="LangX home">
		<span class="mark">
			<ParrotMark size={26} title="LangX" />
		</span>
		<span class="brand-name">LangX</span>
	</a>

	<div class="links">
		{#each chapters as ch (ch.id)}
			{@const Cmp = navIcon[ch.id]}
			<a
				class="chapter-link"
				class:active={path.startsWith(ch.base)}
				href={ch.base}
				data-chapter={ch.id}
			>
				<Cmp size={16} strokeWidth={2} />
				<span class="label">{ch.title}</span>
			</a>
		{/each}
	</div>

	<div class="actions">
		<a class="action" class:active={path === '/glossary'} href="/glossary">
			<Icon name="list" size={15} />
			<span>Glossary</span>
		</a>
		<a class="action" class:active={path === '/setup'} href="/setup">
			<Icon name="gauge" size={15} />
			<span>Setup</span>
			{#if hasKey}
				<span class="dot-on" aria-label="model configured"></span>
			{:else}
				<span class="dot-off" aria-label="no key set"></span>
			{/if}
		</a>
		<a
			class="action ghub"
			href="https://github.com/NeoVand/LangX"
			target="_blank"
			rel="noopener noreferrer"
			aria-label="LangX source on GitHub"
			title="Source on GitHub"
		>
			<Icon name="github" size={16} />
		</a>
		<button
			class="hamburger"
			aria-label="Menu"
			aria-expanded={menuOpen}
			onclick={() => (menuOpen = !menuOpen)}
		>
			{#if menuOpen}<X size={18} strokeWidth={2} />{:else}<Menu size={18} strokeWidth={2} />{/if}
		</button>
	</div>
</nav>

{#if menuOpen}
	<button class="menu-backdrop" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
	<div class="nav-menu" role="menu">
		{#each chapters as ch (ch.id)}
			{@const Cmp = navIcon[ch.id]}
			<a
				class="menu-item"
				class:active={path.startsWith(ch.base)}
				href={ch.base}
				data-chapter={ch.id}
				role="menuitem"
			>
				<Cmp size={18} strokeWidth={2} />
				<span>{ch.title}</span>
			</a>
		{/each}
		<a class="menu-item" class:active={path === '/glossary'} href="/glossary" role="menuitem">
			<Icon name="list" size={16} />
			<span>Glossary</span>
		</a>
		<a class="menu-item" class:active={path === '/setup'} href="/setup" role="menuitem">
			<Icon name="gauge" size={16} />
			<span>Setup</span>
			{#if hasKey}<span class="dot-on"></span>{:else}<span class="dot-off"></span>{/if}
		</a>
		<a
			class="menu-item"
			href="https://github.com/NeoVand/LangX"
			target="_blank"
			rel="noopener noreferrer"
			role="menuitem"
		>
			<Icon name="github" size={16} />
			<span>GitHub</span>
		</a>
	</div>
{/if}

<style>
	.topnav {
		display: flex;
		align-items: center;
		height: 60px;
		padding: 0 1.4rem;
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

	/* Flap the parrot's wing when hovering anywhere on the brand (icon OR "LangX" text),
	   not just the SVG. The wing path lives inside ParrotMark, hence :global; the keyframe
	   is -global- so this reference resolves across the component boundary. */
	.brand:hover :global(.wing) {
		animation: langx-flap 0.42s ease-in-out infinite;
	}

	@keyframes -global-langx-flap {
		0%,
		100% {
			transform: rotate(0deg);
		}
		50% {
			transform: rotate(-42deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.brand:hover :global(.wing) {
			animation: none;
		}
	}

	.mark {
		color: var(--color-accent-langchain);
		display: inline-flex;
	}

	.brand-name {
		font-family: var(--font-brand);
		font-weight: 600;
		font-size: 1.2rem;
		letter-spacing: 0.005em;
		/* Warm metallic gold gradient, clipped to the text. */
		background: linear-gradient(
			135deg,
			color-mix(in oklch, var(--color-accent-langchain) 42%, var(--color-cream-0)) 0%,
			var(--color-accent-langchain) 55%,
			color-mix(in oklch, var(--color-accent-langchain) 78%, #000) 100%
		);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
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

	.chapter-link.active {
		color: color-mix(in oklch, var(--color-accent-langchain) 90%, var(--color-cream-0));
		background: color-mix(in oklch, var(--color-accent-langchain) 16%, transparent);
		border-color: color-mix(in oklch, var(--color-accent-langchain) 28%, transparent);
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

	/* ── Compact dropdown menu ─────────────────────────────────────────────── */
	.hamburger {
		display: none;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 0.5rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-cream-2);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.hamburger:hover {
		background: var(--color-bg-elev);
		color: var(--color-cream-0);
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: default;
	}

	.nav-menu {
		position: fixed;
		top: 54px;
		right: 0.6rem;
		z-index: 41;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 13.5rem;
		padding: 0.45rem;
		background: var(--color-bg-elev);
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		box-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.7);
		animation: menu-in 0.14s ease;
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.6rem 0.7rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-cream-2);
		text-decoration: none;
	}
	.menu-item:hover {
		background: var(--color-bg-elev-2);
		color: var(--color-cream-0);
	}
	.menu-item.active {
		color: var(--accent);
	}

	/* Collapse chapter nav + text actions into the dropdown; keep brand + hamburger. */
	@media (max-width: 900px) {
		.topnav {
			gap: 0.5rem;
			padding: 0 0.75rem;
		}
		.links {
			display: none;
		}
		.actions {
			margin-left: auto;
		}
		.actions .action {
			display: none;
		}
		.hamburger {
			display: inline-flex;
		}
	}

	@media (max-width: 380px) {
		.brand-name {
			display: none;
		}
	}
</style>
