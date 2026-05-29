<script lang="ts">
	import type { Skill } from '$lib/deepagents/skills';

	interface Props {
		skill: Skill;
		loaded?: boolean;
	}

	let { skill, loaded = false }: Props = $props();
	let open = $state(false);
</script>

<article class="skill" class:loaded>
	<button class="head" onclick={() => (open = !open)}>
		<span class="sigil">SKILL.md</span>
		<span class="name">{skill.name}</span>
		{#if loaded}<span class="badge">loaded into context</span>{/if}
		<span class="chev" class:open>›</span>
	</button>
	<p class="desc">{skill.description}</p>
	{#if open}
		<div class="body">
			<div class="body-label">Full body (revealed on load_skill)</div>
			<pre class="scrollbar-slim">{skill.body}</pre>
		</div>
	{/if}
</article>

<style>
	.skill {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-bg);
		padding: 0.55rem 0.7rem;
	}
	.skill.loaded {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--accent) 35%, transparent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--color-fg);
	}
	.sigil {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		padding: 0.05rem 0.35rem;
	}
	.name {
		font-weight: 600;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
	.badge {
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}
	.chev {
		margin-left: auto;
		color: var(--color-fg-faint);
		transition: transform 0.15s ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.desc {
		margin: 0.4rem 0 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.body {
		margin-top: 0.55rem;
		border-top: 1px solid var(--color-border);
		padding-top: 0.5rem;
	}
	.body-label {
		font-size: 0.64rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		margin-bottom: 0.35rem;
		font-family: var(--font-mono);
	}
	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 16rem;
		overflow: auto;
		color: var(--color-fg-muted);
	}
</style>
