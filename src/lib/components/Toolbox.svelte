<script lang="ts">
	/**
	 * The agent's toolbox, shown up-front (above the prompts) so it's clear which
	 * tools the model has been told it can call. Click a tool to reveal its actual
	 * implementation — the real `tool(...)` definition the agent runs.
	 */
	import CodeBlock from './CodeBlock.svelte';

	interface ToolSpec {
		name: string;
		description: string;
		params: string[];
		code?: string;
		/** When true, this tool is behind a human-approval gate. */
		gated?: boolean;
	}
	let {
		tools = [],
		label = 'Toolbox'
	}: { tools?: ToolSpec[]; label?: string } = $props();

	// Which tool's code is expanded (single-open accordion). null = all collapsed.
	let openName = $state<string | null>(null);
	const toggle = (name: string) => (openName = openName === name ? null : name);
</script>

<section class="toolbox">
	<div class="tb-head">
		<span class="tb-label">{label}</span>
		<span class="tb-sub">{tools.length} {tools.length === 1 ? 'tool' : 'tools'} the agent can call — click to see the code</span>
	</div>
	<div class="tb-list">
		{#each tools as t (t.name)}
			{@const open = openName === t.name}
			<div class="tool" class:open>
				<button
					type="button"
					class="tool-row"
					aria-expanded={open}
					disabled={!t.code}
					onclick={() => toggle(t.name)}
				>
					<span class="head">
						<span class="tn">{t.name}</span>
						<code class="tp">({t.params.join(', ')})</code>
						{#if t.gated}<span class="gate" title="Requires human approval">needs approval</span>{/if}
						{#if t.code}<span class="chev" aria-hidden="true">▸</span>{/if}
					</span>
					<span class="td">{t.description}</span>
				</button>
				{#if open && t.code}
					<div class="tool-code">
						<CodeBlock code={t.code} lang="ts" caption="{t.name} — implementation" dense />
					</div>
				{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.toolbox {
		margin-bottom: 1rem;
	}
	.tb-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.tb-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--accent);
	}
	.tb-sub {
		font-size: 0.72rem;
		color: var(--color-ink-300);
	}

	.tb-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.tool {
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-paper);
		overflow: hidden;
		transition: border-color 0.15s ease;
	}
	.tool:hover {
		border-color: var(--accent-rule);
	}
	.tool.open {
		border-color: var(--accent-rule);
	}

	.tool-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0.5rem 0.65rem;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}
	.tool-row:disabled {
		cursor: default;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}
	.tn {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--accent);
	}
	.tp {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-300);
	}
	.gate {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.05rem 0.4rem;
		background: color-mix(in oklch, var(--accent) 10%, transparent);
	}
	.chev {
		margin-left: auto;
		color: var(--accent);
		font-size: 0.7rem;
		transition: transform 0.18s ease;
	}
	.tool.open .chev {
		transform: rotate(90deg);
	}
	.td {
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--color-ink-200);
	}

	.tool-code {
		border-top: 1px solid var(--color-rule);
		padding: 0 0.65rem;
		background: var(--color-bg);
	}
	/* CodeBlock carries its own surface; trim its default vertical margin here. */
	.tool-code :global(.code) {
		margin: 0.5rem 0;
	}
</style>
