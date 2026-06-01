<script lang="ts">
	/**
	 * A small, dependency-free graph renderer for agent/LangGraph loops.
	 *
	 * Nodes are rounded with centred labels; edges are smooth quadratic splines with
	 * arrowheads (the loop-back edge bows to one side so the two arcs read clearly).
	 * Pass `activeNode` + `path` (the node ids the run has visited, in order) and the
	 * traversed nodes/edges light up — so it animates live as a demo streams.
	 */
	interface GNode {
		id: string;
		label: string;
		sub?: string;
		cx: number;
		cy: number;
		w: number;
		h: number;
		shape?: 'box' | 'pill';
	}
	interface GEdge {
		from: string;
		to: string;
		/** Perpendicular bow of the spline; +/- separates the two loop arcs. */
		bow?: number;
		/** Vertical offset of both endpoints — lifts the two loop arrows apart. */
		lift?: number;
		label?: string;
		/** Extra vertical nudge for the label, e.g. to lift it clear of its arrow. */
		labelDy?: number;
	}
	interface Props {
		nodes: GNode[];
		edges: GEdge[];
		activeNode?: string;
		/** A node the run is paused on (e.g. awaiting human approval) — pulses. */
		pausedNode?: string;
		path?: string[];
		caption?: string;
	}
	let { nodes, edges, activeNode, pausedNode, path = [], caption }: Props = $props();

	const byId = $derived(new Map(nodes.map((n) => [n.id, n])));

	// viewBox from node extents + padding.
	const pad = 18;
	const vb = $derived.by(() => {
		const xs = nodes.flatMap((n) => [n.cx - n.w / 2, n.cx + n.w / 2]);
		const ys = nodes.flatMap((n) => [n.cy - n.h / 2, n.cy + n.h / 2]);
		const minX = Math.min(...xs) - pad;
		const minY = Math.min(...ys) - pad;
		const w = Math.max(...xs) + pad - minX;
		const h = Math.max(...ys) + pad - minY;
		return `${minX} ${minY} ${w} ${h}`;
	});

	// Traversed nodes, derived from the path (with an implicit __start__).
	const fullPath = $derived(path.length && path[0] !== '__start__' ? ['__start__', ...path] : path);
	// Only the CURRENT transition lights up — the edge just taken into the active
	// node. So as the loop advances, the previous edge turns off as the next turns on.
	const currentEdge = $derived(
		fullPath.length >= 2 ? `${fullPath[fullPath.length - 2]}|${fullPath[fullPath.length - 1]}` : ''
	);

	// Border intersection point of a node's box in the direction of (tx, ty).
	function anchor(n: GNode, tx: number, ty: number) {
		const dx = tx - n.cx;
		const dy = ty - n.cy;
		const hw = n.w / 2;
		const hh = n.h / 2;
		const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
		const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
		const s = Math.min(sx, sy);
		return { x: n.cx + dx * s, y: n.cy + dy * s };
	}

	// Resolve an edge to its two endpoints + spline control point. `lift` shifts
	// both endpoints vertically (so the two loop arrows attach at different heights).
	function endpoints(e: GEdge) {
		const a = byId.get(e.from);
		const b = byId.get(e.to);
		if (!a || !b) return null;
		const lift = e.lift ?? 0;
		const p1 = anchor(a, b.cx, b.cy);
		const p2 = anchor(b, a.cx, a.cy);
		p1.y += lift;
		p2.y += lift;
		const mx = (p1.x + p2.x) / 2;
		const my = (p1.y + p2.y) / 2;
		const bow = e.bow ?? 0;
		let nx = -(p2.y - p1.y);
		let ny = p2.x - p1.x;
		const len = Math.hypot(nx, ny) || 1;
		nx /= len;
		ny /= len;
		return { p1, p2, mx, my, bow, cx: mx + nx * bow, cy: my + ny * bow, nx, ny };
	}

	function edgePath(e: GEdge): string {
		const g = endpoints(e);
		return g ? `M ${g.p1.x} ${g.p1.y} Q ${g.cx} ${g.cy} ${g.p2.x} ${g.p2.y}` : '';
	}

	// Edge-label position: the midpoint, nudged toward the control point.
	function labelPos(e: GEdge) {
		const g = endpoints(e);
		if (!g) return { x: 0, y: 0 };
		return {
			x: g.mx + g.nx * g.bow * 0.55,
			y: g.my + g.ny * g.bow * 0.55 + (e.labelDy ?? 0)
		};
	}
</script>

<figure class="agent-graph">
	<svg viewBox={vb} role="img" aria-label="Agent graph">
		<defs>
			<marker
				id="ag-arrow"
				viewBox="0 0 10 10"
				refX="8.5"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				markerUnits="userSpaceOnUse"
				orient="auto-start-reverse"
			>
				<path d="M1 1 L9 5 L1 9 Z" class="arrowhead" />
			</marker>
			<marker
				id="ag-arrow-active"
				viewBox="0 0 10 10"
				refX="8.5"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				markerUnits="userSpaceOnUse"
				orient="auto-start-reverse"
			>
				<path d="M1 1 L9 5 L1 9 Z" class="arrowhead active" />
			</marker>
		</defs>

		{#each edges as e, i (i)}
			{@const on = currentEdge === `${e.from}|${e.to}`}
			<path
				d={edgePath(e)}
				class="edge"
				class:on
				fill="none"
				marker-end={on ? 'url(#ag-arrow-active)' : 'url(#ag-arrow)'}
			/>
			{#if e.label}
				{@const lp = labelPos(e)}
				{@const lw = e.label.length * 5.6 + 14}
				<g class="edge-label-g" class:on>
					<rect class="edge-label-bg" x={lp.x - lw / 2} y={lp.y - 9} width={lw} height={18} rx={6} />
					<text class="edge-label" x={lp.x} y={lp.y}>{e.label}</text>
				</g>
			{/if}
		{/each}

		{#each nodes as n (n.id)}
			{@const active = n.id === activeNode}
			{@const paused = n.id === pausedNode}
			{@const seen = fullPath.includes(n.id)}
			<g class="node" class:active class:seen class:paused>
				<rect
					x={n.cx - n.w / 2}
					y={n.cy - n.h / 2}
					width={n.w}
					height={n.h}
					rx={n.shape === 'pill' ? n.h / 2 : 12}
				/>
				{#if n.sub}
					<text class="node-label" x={n.cx} y={n.cy - 7}>{n.label}</text>
					<text class="node-sub" x={n.cx} y={n.cy + 9}>{n.sub}</text>
				{:else}
					<text class="node-label" x={n.cx} y={n.cy}>{n.label}</text>
				{/if}
			</g>
		{/each}
	</svg>
	{#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
	.agent-graph {
		margin: 0;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		font-family: var(--font-mono);
	}

	/* Edges */
	.edge {
		stroke: var(--color-rule);
		stroke-width: 1.6;
		transition:
			stroke 0.3s ease,
			stroke-width 0.3s ease;
	}
	.edge.on {
		stroke: var(--accent);
		stroke-width: 2.2;
	}
	.arrowhead {
		fill: var(--color-rule);
	}
	.arrowhead.active {
		fill: var(--accent);
	}
	/* Edge labels sit on a chip that hides the line behind them and lights up when
	   their edge is traversed. */
	.edge-label-bg {
		fill: var(--color-bg-elev);
		stroke: var(--color-rule);
		stroke-width: 1;
		transition:
			fill 0.3s ease,
			stroke 0.3s ease;
	}
	.edge-label-g.on .edge-label-bg {
		fill: color-mix(in oklch, var(--accent) 20%, var(--color-bg-elev));
		stroke: var(--accent-rule);
	}
	.edge-label {
		fill: color-mix(in oklch, var(--color-fg) 55%, transparent);
		font-size: 9px;
		text-anchor: middle;
		dominant-baseline: central;
		transition: fill 0.3s ease;
	}
	.edge-label-g.on .edge-label {
		fill: var(--accent);
	}

	/* Nodes */
	.node rect {
		fill: var(--color-bg-elev-2, #1c1814);
		stroke: var(--color-rule);
		stroke-width: 1.3;
		transition:
			fill 0.3s ease,
			stroke 0.3s ease,
			stroke-width 0.3s ease;
	}
	.node.seen rect {
		stroke: var(--accent-rule);
	}
	.node.active rect {
		fill: color-mix(in oklch, var(--accent) 18%, var(--color-bg-elev-2, #1c1814));
		stroke: var(--accent);
		stroke-width: 2.2;
	}
	/* Paused: the run is waiting on a human at this node — a pulsing dashed ring. */
	.node.paused rect {
		fill: color-mix(in oklch, var(--accent) 14%, var(--color-bg-elev-2, #1c1814));
		stroke: var(--accent);
		stroke-width: 2.2;
		stroke-dasharray: 5 4;
		animation: ag-pulse 1.4s ease-in-out infinite;
	}
	.node.paused .node-label {
		fill: var(--accent);
	}
	@keyframes ag-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.node.paused rect {
			animation: none;
		}
	}
	.node-label {
		fill: var(--color-fg);
		font-size: 13px;
		font-weight: 600;
		text-anchor: middle;
		dominant-baseline: central;
	}
	.node.active .node-label {
		fill: var(--accent);
	}
	.node-sub {
		fill: color-mix(in oklch, var(--color-fg) 50%, transparent);
		font-size: 8.5px;
		text-anchor: middle;
		dominant-baseline: central;
	}

	figcaption {
		margin-top: 0.5rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-300);
	}
</style>
