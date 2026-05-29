<script lang="ts">
	import type { DiagramSpec, DiagramNode } from '$lib/diagrams/types';

	interface Props {
		spec: DiagramSpec;
		title?: string;
	}

	let { spec, title }: Props = $props();

	const nodeMap = $derived(new Map(spec.nodes.map((n) => [n.id, n])));

	function dims(n: DiagramNode) {
		const w = n.w ?? 120;
		const h = n.h ?? (n.sub ? 52 : 40);
		return { w, h, x: n.x - w / 2, y: n.y - h / 2 };
	}

	// Compute an edge path between the borders of two node boxes.
	function edgePath(fromId: string, toId: string, curve: string | undefined) {
		const a = nodeMap.get(fromId);
		const b = nodeMap.get(toId);
		if (!a || !b) return '';
		if (curve === 'over' || curve === 'under') {
			const dir = curve === 'over' ? -1 : 1;
			const midX = (a.x + b.x) / 2;
			const peak = Math.min(a.y, b.y) + dir * 48;
			return `M ${a.x} ${a.y} Q ${midX} ${peak} ${b.x} ${b.y}`;
		}
		return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
	}

	function edgeMid(fromId: string, toId: string, curve: string | undefined) {
		const a = nodeMap.get(fromId);
		const b = nodeMap.get(toId);
		if (!a || !b) return { x: 0, y: 0 };
		if (curve === 'over' || curve === 'under') {
			const dir = curve === 'over' ? -1 : 1;
			return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) + dir * 30 };
		}
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 };
	}
</script>

<figure class="diagram">
	<svg viewBox={`0 0 ${spec.width} ${spec.height}`} role="img" aria-label={title ?? spec.caption ?? 'diagram'}>
		<defs>
			<marker id="dgm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-fg-muted)" />
			</marker>
		</defs>

		{#each spec.edges as e, i (i)}
			{@const mid = edgeMid(e.from, e.to, e.curve)}
			<path
				d={edgePath(e.from, e.to, e.curve)}
				class="edge"
				class:dashed={e.dashed}
				fill="none"
				marker-end="url(#dgm-arrow)"
			/>
			{#if e.label}
				<text x={mid.x} y={mid.y} class="edge-label" text-anchor="middle">{e.label}</text>
			{/if}
		{/each}

		{#each spec.nodes as n (n.id)}
			{@const d = dims(n)}
			<g class="node" data-kind={n.kind ?? 'default'}>
				<rect x={d.x} y={d.y} width={d.w} height={d.h} rx="9" />
				<text x={n.x} y={n.sub ? n.y - 4 : n.y} text-anchor="middle" dominant-baseline="central" class="lbl">
					{n.label}
				</text>
				{#if n.sub}
					<text x={n.x} y={n.y + 12} text-anchor="middle" dominant-baseline="central" class="sub">
						{n.sub}
					</text>
				{/if}
			</g>
		{/each}
	</svg>
	{#if spec.caption}
		<figcaption>{spec.caption}</figcaption>
	{/if}
</figure>

<style>
	.diagram {
		margin: 1.5rem 0;
		border: 1px solid var(--color-rule, var(--color-border));
		border-radius: 0.6rem;
		background: var(--color-paper, var(--color-bg-elev));
		padding: 1.1rem 1.2rem 0.6rem;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		font-family: var(--font-mono);
	}
	.edge {
		stroke: var(--color-fg-muted, #888);
		stroke-width: 1.6;
		opacity: 0.7;
	}
	.edge.dashed {
		stroke-dasharray: 5 4;
	}
	.edge-label {
		fill: var(--color-fg-faint, #999);
		font-size: 10px;
	}
	.node rect {
		fill: var(--color-bg, #fff);
		stroke: var(--color-rule, var(--color-border));
		stroke-width: 1.4;
	}
	.node .lbl {
		fill: var(--color-ink-100, var(--color-fg));
		font-size: 13px;
		font-weight: 500;
	}
	.node .sub {
		fill: var(--color-fg-faint, #999);
		font-size: 9.5px;
	}
	.node[data-kind='accent'] rect {
		fill: color-mix(in oklch, var(--accent) 16%, var(--color-bg, #fff));
		stroke: var(--accent);
	}
	.node[data-kind='accent'] .lbl {
		fill: var(--accent-ink, var(--accent));
	}
	.node[data-kind='start'] rect,
	.node[data-kind='end'] rect {
		fill: color-mix(in oklch, var(--accent) 75%, var(--color-bg, #000));
		stroke: var(--accent);
	}
	.node[data-kind='start'] .lbl,
	.node[data-kind='end'] .lbl {
		fill: var(--color-paper, #fff);
		font-weight: 600;
	}
	.node[data-kind='muted'] rect {
		fill: var(--color-bg-elev-2, #f4f4f4);
		stroke-dasharray: 4 3;
	}
	.node[data-kind='ghost'] rect {
		fill: transparent;
		stroke-dasharray: 3 3;
		opacity: 0.7;
	}
	figcaption {
		margin-top: 0.5rem;
		text-align: center;
		font-size: 0.74rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint, #999);
		letter-spacing: 0.03em;
	}
</style>
