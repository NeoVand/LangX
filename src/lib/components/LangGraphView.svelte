<script lang="ts">
	/**
	 * Native LangGraph visualization.
	 *
	 * Calls `compiledGraph.getGraphAsync()` and `Graph.drawMermaid()` — exactly the
	 * API LangChain ships — then renders the resulting Mermaid string client-side.
	 * Active node and traversed path are highlighted via DOM class injection (so we
	 * don't have to fight Mermaid's classDef parser with CSS variables).
	 */

	interface DrawableGraph {
		drawMermaid(opts?: Record<string, unknown>): string;
	}
	interface CompiledLikeGraph {
		getGraphAsync(opts?: { xray?: boolean | number }): Promise<DrawableGraph>;
	}

	interface Props {
		graph: CompiledLikeGraph;
		activeNode?: string;
		caption?: string;
		path?: string[];
		// xray expands subgraph nodes inline (LangGraph's native option).
		xray?: boolean | number;
	}

	let { graph, activeNode, caption, path = [], xray = false }: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let error = $state<string | null>(null);
	let renderToken = 0;

	$effect(() => {
		void graph;
		void renderInto();
	});

	$effect(() => {
		// Pure highlight update — no full re-render needed.
		void activeNode;
		void path;
		applyHighlight();
	});

	async function renderInto() {
		if (!host) return;
		const myToken = ++renderToken;
		try {
			error = null;
			const drawable = await graph.getGraphAsync(xray ? { xray } : undefined);
			if (myToken !== renderToken) return;
			const src = drawable.drawMermaid({ withStyles: false, curveStyle: 'linear' });
			const mermaid = (await import('mermaid')).default;
			mermaid.initialize({
				startOnLoad: false,
				theme: 'neutral',
				// 'loose' lets Mermaid keep the `<p>` wrappers `drawMermaid()` injects
				// inside node labels. The input source is fully controlled (it comes
				// from LangGraph itself), so this is safe.
				securityLevel: 'loose',
				fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
				flowchart: { curve: 'linear', padding: 8 }
			});
			const renderId = `lg-${myToken}-${Math.random().toString(36).slice(2, 8)}`;
			const { svg } = await mermaid.render(renderId, src);
			if (myToken !== renderToken || !host) return;
			host.innerHTML = svg;
			applyHighlight();
		} catch (err) {
			if (myToken === renderToken) {
				error = err instanceof Error ? err.message : String(err);
			}
		}
	}

	function applyHighlight() {
		if (!host) return;
		const nodes = host.querySelectorAll('.node');
		nodes.forEach((node) => {
			node.classList.remove('lgv-active', 'lgv-seen');
		});
		const seen = new Set(path);
		const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
		nodes.forEach((node) => {
			const id = node.id || '';
			// Mermaid encodes node ids inside the DOM id like "flowchart-agent-1"
			for (const candidate of seen) {
				if (id.includes(`-${safeId(candidate)}-`) || id.endsWith(`-${safeId(candidate)}`)) {
					node.classList.add('lgv-seen');
					break;
				}
			}
			if (activeNode) {
				const a = safeId(activeNode);
				if (id.includes(`-${a}-`) || id.endsWith(`-${a}`)) {
					node.classList.add('lgv-active');
					node.classList.remove('lgv-seen');
				}
			}
		});
	}
</script>

<figure class="lgv">
	<div bind:this={host} class="host" aria-label="LangGraph visualization"></div>
	{#if error}
		<p class="err" role="alert">Could not render graph: {error}</p>
	{/if}
	{#if caption}
		<figcaption>{caption}</figcaption>
	{/if}
</figure>

<style>
	.lgv {
		margin: 0;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		padding: 0.85rem 0.85rem 0.6rem;
		overflow: hidden;
	}

	.host {
		width: 100%;
		min-height: 4rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.host :global(svg) {
		max-width: 100%;
		height: auto;
		font-family: var(--font-mono);
	}

	/* Override Mermaid's neutral theme for our editorial look */
	.host :global(.node rect),
	.host :global(.node circle),
	.host :global(.node polygon),
	.host :global(.node path) {
		fill: color-mix(in oklch, var(--color-paper) 92%, var(--accent-soft, transparent)) !important;
		stroke: var(--color-rule) !important;
		stroke-width: 1.2px !important;
	}

	.host :global(.node .label),
	.host :global(.nodeLabel),
	.host :global(.nodeLabel p),
	.host :global(.nodeLabel span) {
		color: var(--color-ink-100) !important;
		fill: var(--color-ink-100) !important;
		font-family: var(--font-mono) !important;
		font-size: 12px !important;
	}

	.host :global(.lgv-active rect),
	.host :global(.lgv-active circle),
	.host :global(.lgv-active polygon),
	.host :global(.lgv-active path) {
		fill: var(--accent-soft) !important;
		stroke: var(--accent-ink) !important;
		stroke-width: 2px !important;
	}

	.host :global(.lgv-seen rect),
	.host :global(.lgv-seen circle),
	.host :global(.lgv-seen polygon),
	.host :global(.lgv-seen path) {
		stroke: var(--accent-rule) !important;
		stroke-width: 1.6px !important;
	}

	.host :global(.edgePath path),
	.host :global(.edgePaths path),
	.host :global(.flowchart-link) {
		stroke: var(--color-rule) !important;
		stroke-width: 1.4px !important;
		fill: none !important;
	}

	.host :global(.edgeLabel),
	.host :global(.edgeLabel rect),
	.host :global(.edgeLabel foreignObject) {
		background: transparent !important;
		fill: transparent !important;
	}

	.host :global(.edgeLabel p),
	.host :global(.edgeLabel span) {
		color: var(--color-ink-300) !important;
		font-family: var(--font-mono) !important;
		font-size: 10px !important;
	}

	.host :global(marker path) {
		fill: var(--color-rule) !important;
		stroke: var(--color-rule) !important;
	}

	.host :global(.cluster rect) {
		fill: transparent !important;
		stroke: var(--color-rule) !important;
		stroke-dasharray: 3 3;
	}

	figcaption {
		font-size: 0.7rem;
		color: var(--color-ink-300);
		margin-top: 0.45rem;
		text-align: right;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
	}

	.err {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-accent-warning, #c66);
		margin: 0.4rem 0 0;
	}
</style>
