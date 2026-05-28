<script lang="ts">
	export interface GraphNode {
		id: string;
		label: string;
		x: number;
		y: number;
		kind?: 'start' | 'end' | 'node' | 'tool' | 'subgraph';
	}

	export interface GraphEdge {
		from: string;
		to: string;
		label?: string;
		conditional?: boolean;
	}

	interface Props {
		nodes: GraphNode[];
		edges: GraphEdge[];
		active?: string;
		path?: string[];
		width?: number;
		height?: number;
	}

	let { nodes, edges, active, path = [], width = 360, height = 240 }: Props = $props();

	function nodeById(id: string) {
		return nodes.find((n) => n.id === id);
	}

	function edgeKey(e: GraphEdge) {
		return `${e.from}->${e.to}`;
	}

	function edgeIsActive(e: GraphEdge) {
		for (let i = 1; i < path.length; i++) {
			if (path[i - 1] === e.from && path[i] === e.to) return true;
		}
		return false;
	}
</script>

<svg viewBox="0 0 {width} {height}" class="graph" role="img" aria-label="Graph visualization">
	<defs>
		<marker
			id="arrow"
			viewBox="0 0 10 10"
			refX="9"
			refY="5"
			markerWidth="6"
			markerHeight="6"
			orient="auto-start-reverse"
		>
			<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
		</marker>
		<marker
			id="arrow-active"
			viewBox="0 0 10 10"
			refX="9"
			refY="5"
			markerWidth="6"
			markerHeight="6"
			orient="auto-start-reverse"
		>
			<path d="M 0 0 L 10 5 L 0 10 z" />
		</marker>
	</defs>

	{#each edges as e (edgeKey(e))}
		{@const a = nodeById(e.from)}
		{@const b = nodeById(e.to)}
		{#if a && b}
			{@const mx = (a.x + b.x) / 2}
			{@const my = (a.y + b.y) / 2 - 12}
			<g class="edge" class:active={edgeIsActive(e)} class:conditional={e.conditional}>
				<path
					d="M {a.x} {a.y} Q {mx} {my} {b.x} {b.y}"
					marker-end={edgeIsActive(e) ? 'url(#arrow-active)' : 'url(#arrow)'}
				/>
				{#if e.label}
					<text x={mx} y={my - 2} text-anchor="middle" class="edge-label">{e.label}</text>
				{/if}
			</g>
		{/if}
	{/each}

	{#each nodes as n (n.id)}
		<g
			class="node"
			data-kind={n.kind ?? 'node'}
			class:active={active === n.id}
			transform="translate({n.x}, {n.y})"
		>
			<rect
				x={-46}
				y={-16}
				width={92}
				height={32}
				rx="8"
				ry="8"
			/>
			<text text-anchor="middle" dominant-baseline="middle">{n.label}</text>
		</g>
	{/each}
</svg>

<style>
	.graph {
		width: 100%;
		height: auto;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		font-family: var(--font-mono);
		font-size: 11px;
	}

	.edge path {
		stroke: var(--color-border-strong);
		stroke-width: 1.4;
		fill: none;
		color: var(--color-border-strong);
		transition: stroke 0.2s, color 0.2s;
	}

	.edge.conditional path {
		stroke-dasharray: 3 3;
	}

	.edge.active path {
		stroke: var(--accent);
		color: var(--accent);
		stroke-width: 2;
	}

	.edge-label {
		fill: var(--color-fg-faint);
		font-size: 9px;
	}

	.node rect {
		fill: var(--color-bg-elev);
		stroke: var(--color-border-strong);
		stroke-width: 1.2;
		transition: fill 0.2s, stroke 0.2s;
	}

	.node text {
		fill: var(--color-fg-muted);
	}

	.node[data-kind='start'] rect,
	.node[data-kind='end'] rect {
		fill: transparent;
		stroke-dasharray: 3 3;
	}

	.node[data-kind='tool'] rect {
		stroke: color-mix(in oklch, var(--accent) 60%, var(--color-border-strong));
	}

	.node.active rect {
		fill: color-mix(in oklch, var(--accent) 18%, var(--color-bg-elev));
		stroke: var(--accent);
		stroke-width: 1.8;
	}

	.node.active text {
		fill: var(--color-fg);
	}
</style>
