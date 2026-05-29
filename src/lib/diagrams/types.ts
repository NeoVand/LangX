export type NodeKind = 'default' | 'accent' | 'muted' | 'start' | 'end' | 'ghost';

export interface DiagramNode {
	id: string;
	label: string;
	/** Center coordinates in the diagram's 0–100 (x) / 0–100-ish (y) space. */
	x: number;
	y: number;
	w?: number;
	h?: number;
	kind?: NodeKind;
	/** Optional small caption under the label. */
	sub?: string;
}

export interface DiagramEdge {
	from: string;
	to: string;
	label?: string;
	dashed?: boolean;
	/** Curve the edge (for self-loops / back-edges). 'over' arcs up, 'under' arcs down. */
	curve?: 'straight' | 'over' | 'under';
}

export interface DiagramSpec {
	/** SVG viewBox width/height; coordinates are absolute within this. */
	width: number;
	height: number;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	caption?: string;
}
