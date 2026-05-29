import type { IconName } from '$lib/components/icons';

export type NodeKind = 'default' | 'accent' | 'start' | 'end' | 'muted' | 'ghost';

export interface DiagramNode {
	id: string;
	label: string;
	/** Optional second line (smaller, faint). */
	sub?: string;
	/** Icon rendered at the top of the node card. */
	icon?: IconName;
	kind?: NodeKind;
	/** Grid column (0-based). */
	col: number;
	/** Grid row (0-based). */
	row: number;
	/** Number of columns this node spans (default 1). */
	cspan?: number;
}

export interface DiagramEdge {
	from: string;
	to: string;
	label?: string;
	dashed?: boolean;
	/** Animate a token travelling along the edge. */
	flow?: boolean;
	/** Force a curved route bulging out to one side (for loops / back-edges). */
	side?: 'left' | 'right';
}

/** A faint dashed container drawn behind a rectangular block of grid cells. */
export interface DiagramGroup {
	label?: string;
	col: number;
	row: number;
	cspan: number;
	rspan: number;
	kind?: 'accent' | 'muted';
}

export interface DiagramSpec {
	title?: string;
	caption?: string;
	/** Grid dimensions. */
	cols: number;
	rows: number;
	/** Aspect hint; portrait keeps constituents large in a top-to-bottom column. */
	shape?: 'portrait' | 'square' | 'wide';
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	groups?: DiagramGroup[];
}
