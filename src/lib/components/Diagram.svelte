<script lang="ts">
	import type { DiagramSpec, DiagramNode, DiagramEdge } from '$lib/diagrams/types';
	import { ICONS } from './icons';

	interface Props {
		spec: DiagramSpec;
		title?: string;
	}

	let { spec, title }: Props = $props();

	// Unique suffix so gradient/filter ids never collide between diagrams on a page.
	const uid = `dgm-${Math.random().toString(36).slice(2, 8)}`;

	const CELL_W = 150;
	const CELL_H = 102;
	const PAD_X = 22;
	const PAD_TOP = 18;
	const PAD_BOT = 18;
	const GAP_X = 30;
	const GAP_Y = 36;

	const W = $derived(2 * PAD_X + spec.cols * CELL_W);
	const H = $derived(PAD_TOP + PAD_BOT + spec.rows * CELL_H);
	const maxW = $derived(Math.min(Math.max(spec.cols * 156, 300), 480));

	const nodeMap = $derived(new Map(spec.nodes.map((n) => [n.id, n])));

	function geom(n: DiagramNode) {
		const cspan = n.cspan ?? 1;
		const bw = cspan * CELL_W - GAP_X;
		const bh = CELL_H - GAP_Y;
		const cx = PAD_X + n.col * CELL_W + (cspan * CELL_W) / 2;
		const cy = PAD_TOP + n.row * CELL_H + CELL_H / 2;
		return { cx, cy, bw, bh, x: cx - bw / 2, y: cy - bh / 2 };
	}

	type Pt = { x: number; y: number };
	function port(g: ReturnType<typeof geom>, side: 'top' | 'bottom' | 'left' | 'right'): Pt {
		switch (side) {
			case 'top':
				return { x: g.cx, y: g.y };
			case 'bottom':
				return { x: g.cx, y: g.y + g.bh };
			case 'left':
				return { x: g.x, y: g.cy };
			case 'right':
				return { x: g.x + g.bw, y: g.cy };
		}
	}

	function cubic(p1: Pt, c1: Pt, c2: Pt, p2: Pt) {
		const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
		const mid = {
			x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
			y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8
		};
		return { d, mid };
	}

	function edgeGeom(e: DiagramEdge) {
		const a = nodeMap.get(e.from);
		const b = nodeMap.get(e.to);
		if (!a || !b) return { d: '', mid: { x: 0, y: 0 } };
		const A = geom(a);
		const B = geom(b);
		const dx = B.cx - A.cx;
		const dy = B.cy - A.cy;

		if (e.side) {
			const p1 = port(A, e.side);
			const p2 = port(B, e.side);
			const off = (e.side === 'right' ? 1 : -1) * Math.max(64, Math.abs(dy) * 0.7);
			return cubic(p1, { x: p1.x + off, y: p1.y }, { x: p2.x + off, y: p2.y }, p2);
		}

		let aSide: 'top' | 'bottom' | 'left' | 'right';
		let bSide: 'top' | 'bottom' | 'left' | 'right';
		if (Math.abs(dy) >= Math.abs(dx)) {
			aSide = dy > 0 ? 'bottom' : 'top';
			bSide = dy > 0 ? 'top' : 'bottom';
		} else {
			aSide = dx > 0 ? 'right' : 'left';
			bSide = dx > 0 ? 'left' : 'right';
		}
		const p1 = port(A, aSide);
		const p2 = port(B, bSide);
		const k = 0.3;
		const c1: Pt =
			aSide === 'bottom' || aSide === 'top'
				? { x: p1.x, y: p1.y + (aSide === 'bottom' ? 1 : -1) * Math.abs(dy) * k }
				: { x: p1.x + (aSide === 'right' ? 1 : -1) * Math.abs(dx) * k, y: p1.y };
		const c2: Pt =
			bSide === 'top' || bSide === 'bottom'
				? { x: p2.x, y: p2.y + (bSide === 'top' ? -1 : 1) * Math.abs(dy) * k }
				: { x: p2.x + (bSide === 'left' ? -1 : 1) * Math.abs(dx) * k, y: p2.y };
		return cubic(p1, c1, c2, p2);
	}

	const edgeData = $derived(spec.edges.map((e) => ({ e, ...edgeGeom(e) })));

	function groupRect(g: NonNullable<DiagramSpec['groups']>[number]) {
		return {
			x: PAD_X + g.col * CELL_W + 8,
			y: PAD_TOP + g.row * CELL_H + 8,
			w: g.cspan * CELL_W - 16,
			h: g.rspan * CELL_H - 16
		};
	}
</script>

<figure class="diagram">
	{#if title}<div class="dgm-title">{title}</div>{/if}
	<svg
		viewBox={`0 0 ${W} ${H}`}
		style:max-width={`${maxW}px`}
		role="img"
		aria-label={title ?? spec.caption ?? 'diagram'}
	>
		<defs>
			<linearGradient id={`${uid}-soft`} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" class="g-soft-0" />
				<stop offset="1" class="g-soft-1" />
			</linearGradient>
			<linearGradient id={`${uid}-strong`} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" class="g-strong-0" />
				<stop offset="1" class="g-strong-1" />
			</linearGradient>
			<marker
				id={`${uid}-arrow`}
				viewBox="0 0 10 10"
				refX="8.5"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M 0 1 L 9 5 L 0 9" fill="none" class="arrowhead" />
			</marker>
			<filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
				<feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-color="#000" flood-opacity="0.28" />
			</filter>
		</defs>

		{#each spec.groups ?? [] as g, i (i)}
			{@const r = groupRect(g)}
			{@const glw = (g.label?.length ?? 0) * 5.4 + 14}
			<g class="group" data-kind={g.kind ?? 'muted'}>
				<rect x={r.x} y={r.y} width={r.w} height={r.h} rx="16" />
				{#if g.label}
					<rect x={r.x + 10} y={r.y - 8} width={glw} height="16" rx="5" class="group-label-bg" />
					<text x={r.x + 10 + glw / 2} y={r.y} text-anchor="middle" dominant-baseline="central" class="group-label">
						{g.label}
					</text>
				{/if}
			</g>
		{/each}

		{#each edgeData as { e, d, mid }, i (i)}
			<path d={d} class="edge" class:dashed={e.dashed} fill="none" marker-end={`url(#${uid}-arrow)`} />
			{#if !e.dashed}
				<circle r="3.2" class="token">
					<animateMotion path={d} dur="2.8s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
				</circle>
			{/if}
			{#if e.label}
				{@const lw = Math.max(24, e.label.length * 6 + 14)}
				<g class="edge-label" transform={`translate(${mid.x} ${mid.y})`}>
					<rect x={-lw / 2} y="-9" width={lw} height="18" rx="9" class="edge-label-bg" />
					<text text-anchor="middle" dominant-baseline="central">{e.label}</text>
				</g>
			{/if}
		{/each}

		{#each spec.nodes as n, i (n.id)}
			{@const g = geom(n)}
			{@const hasSub = !!n.sub}
			{@const hasIcon = !!n.icon}
			{@const iconCy = hasSub ? g.cy - 16 : g.cy - 12}
			{@const labelY = hasIcon ? (hasSub ? g.cy + 7 : g.cy + 13) : hasSub ? g.cy - 7 : g.cy}
			{@const subY = hasIcon ? g.cy + 21 : g.cy + 10}
			<g class="node" data-kind={n.kind ?? 'default'} style:animation-delay={`${i * 55}ms`}>
				<rect
					x={g.x}
					y={g.y}
					width={g.bw}
					height={g.bh}
					rx="13"
					class="node-box"
					fill={n.kind === 'accent'
						? `url(#${uid}-strong)`
						: n.kind === 'start' || n.kind === 'end'
							? `url(#${uid}-soft)`
							: undefined}
					filter={n.kind === 'muted' || n.kind === 'ghost' ? undefined : `url(#${uid}-shadow)`}
				/>
				{#if hasIcon}
					<g class="node-icon" transform={`translate(${g.cx - 9} ${iconCy - 9}) scale(0.78)`}>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html ICONS[n.icon!]}
					</g>
				{/if}
				<text x={g.cx} y={labelY} text-anchor="middle" dominant-baseline="central" class="lbl">
					{n.label}
				</text>
				{#if hasSub}
					<text x={g.cx} y={subY} text-anchor="middle" dominant-baseline="central" class="sub">
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
		margin: 1.75rem 0;
		padding: 1.6rem 1.25rem 1.4rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 1rem;
		background:
			radial-gradient(
				120% 80% at 50% 0%,
				color-mix(in oklch, var(--accent) 7%, transparent),
				transparent 70%
			),
			color-mix(in oklch, var(--color-fg-muted) 4%, transparent);
		border: 1px solid color-mix(in oklch, var(--color-rule) 60%, transparent);
	}
	.dgm-title {
		font-family: var(--font-display);
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--accent-ink);
		font-weight: 600;
		margin-bottom: 0.85rem;
		text-align: center;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}

	/* gradient stops driven by the chapter accent */
	.g-soft-0 {
		stop-color: color-mix(in oklch, var(--accent) 26%, var(--color-bg));
	}
	.g-soft-1 {
		stop-color: color-mix(in oklch, var(--accent) 12%, var(--color-bg));
	}
	.g-strong-0 {
		stop-color: color-mix(in oklch, var(--accent) 46%, var(--color-bg));
	}
	.g-strong-1 {
		stop-color: color-mix(in oklch, var(--accent) 24%, var(--color-bg));
	}

	/* edges */
	.edge {
		stroke: var(--color-fg-muted, #8a8a8a);
		stroke-width: 1.7;
		opacity: 0.6;
		stroke-linecap: round;
	}
	.edge.dashed {
		stroke-dasharray: 4 5;
		opacity: 0.5;
	}
	.arrowhead {
		stroke: var(--color-fg-muted, #8a8a8a);
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.75;
	}
	.edge-label text {
		fill: var(--color-ink-200, #cfcfcf);
		font-family: var(--font-mono);
		font-size: 10.5px;
	}
	.edge-label-bg {
		fill: var(--color-bg);
		stroke: var(--color-rule, #333);
		stroke-width: 1;
		opacity: 0.95;
	}
	.token {
		fill: var(--accent);
		filter: drop-shadow(0 0 4px color-mix(in oklch, var(--accent) 70%, transparent));
	}

	/* groups */
	.group rect {
		fill: color-mix(in oklch, var(--accent) 5%, transparent);
		stroke: var(--color-rule, #333);
		stroke-width: 1.4;
		stroke-dasharray: 6 5;
	}
	.group[data-kind='accent'] rect {
		stroke: color-mix(in oklch, var(--accent) 55%, transparent);
		fill: color-mix(in oklch, var(--accent) 7%, transparent);
	}
	.group-label-bg {
		fill: var(--color-bg, #111);
		stroke: var(--color-rule, #333);
		stroke-width: 1;
	}
	.group[data-kind='accent'] .group-label-bg {
		stroke: color-mix(in oklch, var(--accent) 50%, transparent);
	}
	.group-label {
		fill: var(--color-fg-faint, #9a9a9a);
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* nodes */
	.node-box {
		fill: var(--color-bg-elev, #1b1b1b);
		stroke: var(--color-rule, #333);
		stroke-width: 1.4;
	}
	.node-icon {
		color: var(--color-ink-200, #cfcfcf);
		stroke: currentColor;
		fill: none;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.lbl {
		fill: var(--color-ink-100, #f0f0f0);
		font-family: var(--font-sans, var(--font-prose));
		font-size: 13.5px;
		font-weight: 600;
	}
	.sub {
		fill: var(--color-fg-faint, #9a9a9a);
		font-family: var(--font-mono);
		font-size: 9.5px;
	}

	.node[data-kind='accent'] .node-box {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.node[data-kind='accent'] .node-icon {
		color: var(--accent-ink, var(--accent));
	}
	.node[data-kind='accent'] .lbl {
		fill: var(--accent-ink, var(--accent));
	}

	.node[data-kind='start'] .node-box,
	.node[data-kind='end'] .node-box {
		stroke: var(--accent);
		stroke-width: 1.6;
	}
	.node[data-kind='start'] .node-icon,
	.node[data-kind='end'] .node-icon {
		color: var(--accent-ink, var(--accent));
	}
	.node[data-kind='start'] .lbl,
	.node[data-kind='end'] .lbl {
		fill: var(--accent-ink, var(--accent));
	}

	.node[data-kind='muted'] .node-box {
		fill: color-mix(in oklch, var(--color-fg-muted) 8%, transparent);
		stroke: var(--color-rule, #333);
		stroke-dasharray: 5 4;
	}
	.node[data-kind='muted'] .lbl {
		fill: var(--color-ink-200, #cfcfcf);
		font-weight: 500;
	}
	.node[data-kind='ghost'] .node-box {
		fill: transparent;
		stroke: var(--color-fg-muted, #8a8a8a);
		stroke-dasharray: 3 4;
		opacity: 0.8;
	}
	.node[data-kind='ghost'] .node-icon,
	.node[data-kind='ghost'] .lbl {
		fill: var(--color-fg-muted, #9a9a9a);
		color: var(--color-fg-muted, #9a9a9a);
	}

	figcaption {
		margin-top: 1rem;
		max-width: 30rem;
		text-align: center;
		font-size: 0.78rem;
		font-family: var(--font-prose);
		font-style: italic;
		color: var(--color-fg-faint, #9a9a9a);
		line-height: 1.45;
	}

	@media (prefers-reduced-motion: no-preference) {
		.node {
			opacity: 0;
			transform: translateY(7px);
			transform-box: fill-box;
			transform-origin: center;
			animation: dgm-in 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
		}
		.edge.dashed {
			animation: dgm-march 0.7s linear infinite;
		}
		@keyframes dgm-in {
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
		@keyframes dgm-march {
			to {
				stroke-dashoffset: -18;
			}
		}
	}
</style>
