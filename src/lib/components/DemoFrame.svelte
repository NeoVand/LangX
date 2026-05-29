<script lang="ts">
	import type { Snippet } from 'svelte';
	import CodeBlock from './CodeBlock.svelte';
	import StateInspector from './StateInspector.svelte';
	import type { DemoStep } from '$lib/demos/types';

	interface Props {
		title?: string;
		subtitle?: string;
		/** Source of the executed module, imported with Vite's `?raw`. */
		code?: string;
		codeLang?: string;
		codeCaption?: string;
		/** Intermediate steps emitted by the run via onStep. */
		steps?: DemoStep[];
		/** Final state object for the State tab. */
		finalState?: unknown;
		/** The Run tab content: controls + live output. */
		run: Snippet;
	}

	let {
		title,
		subtitle,
		code,
		codeLang = 'ts',
		codeCaption = 'The exact source this demo runs',
		steps = [],
		finalState,
		run
	}: Props = $props();

	type Tab = 'run' | 'steps' | 'code' | 'state';
	let tab = $state<Tab>('run');
	let expanded = $state<Set<number>>(new Set());

	function toggle(i: number) {
		const next = new Set(expanded);
		if (next.has(i)) next.delete(i);
		else next.add(i);
		expanded = next;
	}

	const hasState = $derived(finalState !== undefined && finalState !== null);
	const tabs = $derived(
		[
			{ id: 'run' as const, label: 'Run', show: true },
			{ id: 'steps' as const, label: `Steps${steps.length ? ` (${steps.length})` : ''}`, show: true },
			{ id: 'code' as const, label: 'Code', show: !!code },
			{ id: 'state' as const, label: 'State', show: hasState }
		].filter((t) => t.show)
	);

	const kindGlyph: Record<DemoStep['kind'], string> = {
		model: '◆',
		tool: '⚙',
		state: '▣',
		note: '·'
	};
</script>

<section class="demo-frame">
	<header class="frame-head">
		<div class="titles">
			{#if title}<h3>{title}</h3>{/if}
			{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
		</div>
		<div class="tabs" role="tablist">
			{#each tabs as t (t.id)}
				<button
					role="tab"
					aria-selected={tab === t.id}
					class="tab"
					class:active={tab === t.id}
					onclick={() => (tab = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>
	</header>

	<div class="frame-body">
		{#if tab === 'run'}
			{@render run()}
		{:else if tab === 'steps'}
			{#if steps.length}
				<ol class="steps">
					{#each steps as step, i (i)}
						<li class="step" data-kind={step.kind}>
							<button class="step-head" onclick={() => toggle(i)}>
								<span class="glyph" aria-hidden="true">{kindGlyph[step.kind]}</span>
								<span class="step-label">{step.label}</span>
								{#if step.detail}<span class="step-detail">{step.detail}</span>{/if}
								{#if step.payload !== undefined}
									<span class="chev" class:open={expanded.has(i)} aria-hidden="true">›</span>
								{/if}
							</button>
							{#if expanded.has(i) && step.payload !== undefined}
								<div class="step-payload">
									<StateInspector state={step.payload} compact />
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			{:else}
				<p class="empty">Run the demo to capture its intermediate steps here.</p>
			{/if}
		{:else if tab === 'code'}
			{#if code}
				<CodeBlock code={code} lang={codeLang} caption={codeCaption} dense />
			{/if}
		{:else if tab === 'state'}
			<StateInspector state={finalState} />
		{/if}
	</div>
</section>

<style>
	.demo-frame {
		border: 1px solid var(--color-border);
		border-radius: 0.6rem;
		background: var(--color-bg-elev-2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.frame-head {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.75rem 1rem 0;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in oklch, var(--color-bg-elev-2) 92%, var(--color-bg) 8%);
	}

	.titles {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	h3 {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg);
		margin: 0;
	}

	.subtitle {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin: 0;
	}

	.tabs {
		display: flex;
		gap: 0.15rem;
	}

	.tab {
		appearance: none;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.4rem 0.7rem;
		font-size: 0.72rem;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--color-fg-faint);
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.tab:hover {
		color: var(--color-fg-muted);
	}

	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.frame-body {
		padding: 0.85rem 1rem 1rem;
		font-size: 0.88rem;
	}

	.empty {
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		font-style: italic;
		text-align: center;
		padding: 1rem 0;
		margin: 0;
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.step {
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		overflow: hidden;
	}

	.step-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.45rem 0.6rem;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		color: var(--color-fg);
		font-size: 0.8rem;
	}

	.glyph {
		font-size: 0.8rem;
		color: var(--color-fg-faint);
		width: 1rem;
		text-align: center;
		flex-shrink: 0;
	}

	.step[data-kind='model'] .glyph {
		color: var(--accent);
	}
	.step[data-kind='tool'] .glyph {
		color: #88e0c1;
	}
	.step[data-kind='state'] .glyph {
		color: #cda7e6;
	}

	.step-label {
		font-weight: 500;
		flex-shrink: 0;
	}

	.step-detail {
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}

	.chev {
		margin-left: auto;
		color: var(--color-fg-faint);
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	.chev.open {
		transform: rotate(90deg);
	}

	.step-payload {
		padding: 0 0.6rem 0.6rem;
	}
</style>
