<script lang="ts" module>
	// ── Shared shapes a demo supplies to <LiveGraph> ──────────────────────────
	export type Variant = 'code' | 'llm' | 'router' | 'interrupt' | 'fanout';
	type Side = 'top' | 'bottom' | 'left' | 'right';

	export interface GNode {
		id: string;
		label: string;
		sub?: string;
		cx: number;
		cy: number;
		w: number;
		h: number;
		shape?: 'box' | 'pill';
		variant?: Variant;
	}
	export interface GEdge {
		from: string;
		to: string;
		bow?: number;
		lift?: number;
		label?: string;
		labelDy?: number;
		ortho?: { from: Side; to: Side };
	}
	export interface NodeMeta {
		/** Fuller label for the popover header (falls back to the node's graph label). */
		label?: string;
		/** Friendly, learn-first explanation — the popover's default tab. */
		explain?: { lead: string; body: string };
		/** One-line technical description (Detail tab). */
		desc?: string;
		/** Source snippet for this node (Implementation tab). */
		code?: string;
	}
	export interface EdgeDetail {
		title: string;
		variant: Variant | '';
		desc: string;
		code?: string;
	}
	/** What a demo's `describe()` returns for the Detail tab (the dynamic part). */
	export interface StepInfo {
		summary?: string;
		items?: { icon: string; text: string; detail?: string; status?: string }[];
		insight?: string;
		stateChange?: string;
	}
	export interface Frame {
		node: string;
		snap: unknown;
	}
</script>

<script lang="ts">
	import AgentGraph from './AgentGraph.svelte';
	import StateInspector from './StateInspector.svelte';
	import CodeBlock from './CodeBlock.svelte';

	type InspectTarget = { kind: 'node' | 'edge'; id: string; rect: DOMRect };

	interface Props {
		nodes: GNode[];
		edges: GEdge[];
		/** The streamed frames so far (demo owns the array + pacing). */
		frames: Frame[];
		/** Playback head — bindable so Prev/Next and click-to-jump work. */
		frameIdx?: number;
		/** Per-node popover content (label override / explain / desc / code). */
		meta?: Record<string, NodeMeta>;
		/** Per-edge popover content, keyed by `from|to`. */
		edgeDetails?: Record<string, EdgeDetail>;
		/** Per-step "what happened" for the Detail tab. */
		describe?: (node: string, snap: any, prev: any, count: number) => StepInfo | null;
		/** Map a snapshot to the plain object shown in the State tab. */
		toState?: (snap: any) => Record<string, unknown>;
		/** A node the run is paused on (pulses). */
		pausedNode?: string;
		subtitle?: string;
	}
	let {
		nodes,
		edges,
		frames,
		frameIdx = $bindable(0),
		meta = {},
		edgeDetails = {},
		describe,
		toState,
		pausedNode
	}: Props = $props();

	// ── Playback ──────────────────────────────────────────────────────────────
	const cur = $derived(frames.length ? frames[Math.min(frameIdx, frames.length - 1)] : null);
	const activeNode = $derived(cur?.node);
	const pathSoFar = $derived(frames.slice(0, frameIdx + 1).map((f) => f.node));
	const nodeById = $derived(new Map(nodes.map((n) => [n.id, n])));
	const labelOf = (id: string | undefined) =>
		(id && (meta[id]?.label ?? nodeById.get(id)?.label)) || id || '';
	const stepLabel = $derived(
		frames.length ? `Step ${frameIdx + 1} / ${frames.length} · ${labelOf(cur?.node)}` : ''
	);
	const inspectable = $derived(
		new Set<string>([...nodes.map((n) => n.id), ...Object.keys(edgeDetails)])
	);

	// ── Timeline: collapse consecutive same-node frames (fan-out), then diff ────
	interface TLEntry extends StepInfo {
		node: string;
		frameEnd: number;
		stateObj?: Record<string, unknown>;
		changedKeys?: string[];
	}
	const timelineEntries = $derived.by((): TLEntry[] => {
		const entries: TLEntry[] = [];
		const visible = frames.slice(0, frameIdx + 1);
		let i = 0;
		while (i < visible.length) {
			const node = visible[i].node;
			let j = i;
			while (j < visible.length && visible[j].node === node) j++;
			const count = j - i;
			const snap = visible[j - 1].snap;
			const prev = i > 0 ? visible[i - 1].snap : null;
			const info = describe?.(node, snap, prev, count) ?? {};
			entries.push({ node, frameEnd: j - 1, ...info });
			i = j;
		}
		if (toState) {
			let prevObj: Record<string, unknown> = {};
			for (const e of entries) {
				const obj = toState(frames[e.frameEnd]?.snap);
				e.stateObj = obj;
				e.changedKeys = Object.keys(obj).filter(
					(k) => JSON.stringify(obj[k]) !== JSON.stringify(prevObj[k])
				);
				prevObj = obj;
			}
		}
		return entries;
	});
	// Most recent entry for a node (graphs that loop revisit nodes).
	const entryFor = (id: string) => [...timelineEntries].reverse().find((e) => e.node === id);

	function selectNode(id: string) {
		const e = entryFor(id);
		if (e) frameIdx = e.frameEnd;
	}

	// ── Hover-to-inspect popover ────────────────────────────────────────────────
	const POP_MAX_H = 520;
	let inspect = $state<InspectTarget | null>(null);
	let popTab = $state<'explain' | 'detail' | 'state' | 'code'>('explain');
	let popEl = $state<HTMLDivElement | null>(null);
	let popPos = $state<{ left: number; top: number } | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	function cancelClose() {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	}
	function scheduleClose() {
		cancelClose();
		closeTimer = setTimeout(() => (inspect = null), 180);
	}
	function handleInspect(t: InspectTarget | null) {
		if (!t) {
			scheduleClose();
			return;
		}
		cancelClose();
		const changed = !inspect || inspect.id !== t.id || inspect.kind !== t.kind;
		inspect = t;
		if (changed) {
			popTab = 'explain';
			popPos = null;
		}
	}
	$effect(() => {
		const t = inspect;
		popTab; // re-measure when the tab (and thus height) changes
		if (!t || !popEl) return;
		const M = 12;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const pr = popEl.getBoundingClientRect();
		const w = pr.width || 340;
		const h = Math.min(pr.height || 220, POP_MAX_H);
		let left = t.rect.right + M;
		if (left + w > vw - M) left = t.rect.left - w - M;
		left = Math.max(M, Math.min(left, vw - w - M));
		const top = Math.max(M, Math.min(t.rect.top, vh - h - M));
		popPos = { left, top };
	});

	// Derived popover content for the open target.
	const openNode = $derived(inspect?.kind === 'node' ? nodeById.get(inspect.id) : undefined);
	const openMeta = $derived(inspect?.kind === 'node' ? (meta[inspect.id] ?? {}) : {});
	const openEntry = $derived(inspect?.kind === 'node' ? entryFor(inspect.id) : undefined);
	const openEdge = $derived(inspect?.kind === 'edge' ? edgeDetails[inspect.id] : undefined);
</script>

<AgentGraph
	{nodes}
	{edges}
	{activeNode}
	{pausedNode}
	path={pathSoFar}
	{inspectable}
	onInspect={handleInspect}
	onActivate={selectNode}
/>
<div class="playback">
	<button onclick={() => (frameIdx = Math.max(0, frameIdx - 1))} disabled={frameIdx <= 0}>‹ Prev</button>
	<span class="pb-label">{stepLabel}</span>
	<button onclick={() => (frameIdx = Math.min(frames.length - 1, frameIdx + 1))} disabled={frameIdx >= frames.length - 1}>Next ›</button>
</div>
<div class="step-desc">{(cur && meta[cur.node]?.desc) ?? ''}</div>

{#if inspect}
	<div
		class="ipop"
		class:positioned={popPos}
		bind:this={popEl}
		style={popPos
			? `left:${popPos.left}px; top:${popPos.top}px; max-height:${POP_MAX_H}px;`
			: `left:-9999px; top:0; max-height:${POP_MAX_H}px;`}
		role="dialog"
		onpointerenter={cancelClose}
		onpointerleave={scheduleClose}
	>
		{#if inspect.kind === 'node'}
			<div class="tl-entry">
				<div class="tl-head">
					{#if openNode?.variant}<span class="tl-dot {openNode.variant}"></span>{/if}
					<span class="tl-name">{labelOf(inspect.id)}</span>
					{#if openNode?.sub}<span class="tl-badge {openNode.variant}">{openNode.sub}</span>{/if}
				</div>
				<div class="tl-body">
					<div class="tl-tabs">
						{#if openMeta.explain}<button class:on={popTab === 'explain'} onclick={() => (popTab = 'explain')}>Explain</button>{/if}
						<button class:on={popTab === 'detail'} onclick={() => (popTab = 'detail')}>Detail</button>
						{#if openEntry?.stateObj}<button class:on={popTab === 'state'} onclick={() => (popTab = 'state')}>State</button>{/if}
						{#if openMeta.code}<button class:on={popTab === 'code'} onclick={() => (popTab = 'code')}>Implementation</button>{/if}
					</div>

					{#if popTab === 'explain' && openMeta.explain}
						<div class="ipop-tab ipop-explain">
							<p class="ex-lead">{openMeta.explain.lead}</p>
							<p class="ex-body">{openMeta.explain.body}</p>
						</div>
					{:else if popTab === 'state' && openEntry?.stateObj}
						<div class="tl-expanded ipop-tab">
							{#if openEntry.changedKeys?.length}
								<div class="tl-changed">
									<span class="tl-changed-label">changed this step</span>
									{#each openEntry.changedKeys as k}<span class="tl-chip">{k}</span>{/each}
								</div>
							{/if}
							<StateInspector state={openEntry.stateObj} compact />
						</div>
					{:else if popTab === 'code' && openMeta.code}
						<div class="tl-expanded ipop-tab">
							<CodeBlock code={openMeta.code} lang="ts" dense />
						</div>
					{:else}
						<div class="ipop-tab">
							{#if openMeta.desc}<div class="ipop-desc">{openMeta.desc}</div>{/if}
							{#if openEntry}
								{#if openEntry.summary}<div class="tl-summary">{openEntry.summary}</div>{/if}
								{#if openEntry.items}
									<div class="tl-items">
										{#each openEntry.items as item}
											<div class="tl-item {item.status ?? ''}">
												<span class="tl-icon">{item.icon}</span>
												<span class="tl-text">{item.text}</span>
												{#if item.detail}<span class="tl-detail">{item.detail}</span>{/if}
											</div>
										{/each}
									</div>
								{/if}
								{#if openEntry.stateChange}<code class="tl-delta">{openEntry.stateChange}</code>{/if}
								{#if openEntry.insight}<div class="tl-insight">{openEntry.insight}</div>{/if}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{:else if openEdge}
			<div class="tl-entry">
				<div class="tl-head">
					{#if openEdge.variant}<span class="tl-dot {openEdge.variant}"></span>{/if}
					<span class="tl-name">{openEdge.title}</span>
				</div>
				<div class="tl-body">
					<div class="ipop-desc">{openEdge.desc}</div>
					{#if openEdge.code}<div class="tl-expanded"><CodeBlock code={openEdge.code} lang="ts" dense /></div>{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.playback {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		margin-top: 0.6rem;
	}
	.playback button {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.28rem 0.7rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-rule);
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.playback button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.pb-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		min-width: 12rem;
		text-align: center;
	}
	.step-desc {
		margin-top: 0.55rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-muted);
		min-height: 1.1em;
	}

	/* ── Hover-inspect popover (one node/edge detail card) ── */
	.ipop {
		position: fixed;
		z-index: 200;
		width: 340px;
		max-width: 92vw;
		overflow-y: auto;
		background: var(--color-bg-elev-2, #1c1814);
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		box-shadow: 0 14px 48px rgba(0, 0, 0, 0.55);
		padding: 0.85rem 0.95rem;
		opacity: 0;
		transition: opacity 0.1s ease;
	}
	.ipop.positioned {
		opacity: 1;
	}
	.ipop-desc {
		font-size: 0.74rem;
		color: var(--color-fg-muted);
		line-height: 1.45;
		margin-bottom: 0.5rem;
	}
	.ipop-explain .ex-lead {
		margin: 0 0 0.4rem;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-fg);
		line-height: 1.35;
	}
	.ipop-explain .ex-body {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-fg-muted);
		line-height: 1.55;
	}

	.tl-entry {
		padding: 0;
	}
	.tl-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.2rem;
	}
	.tl-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--color-rule);
	}
	.tl-dot.code { background: #5b8ac4; }
	.tl-dot.llm { background: #9b6bc4; }
	.tl-dot.router { background: #c4a43b; }
	.tl-dot.interrupt { background: #c45b6b; }
	.tl-dot.fanout { background: #c4853b; }
	.tl-name {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--color-fg);
	}
	.tl-badge {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		padding: 0.12rem 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--color-rule);
		color: var(--color-fg-muted);
		white-space: nowrap;
	}
	.tl-badge.code { border-color: #5b8ac4; color: #5b8ac4; }
	.tl-badge.llm { border-color: #9b6bc4; color: #9b6bc4; }
	.tl-badge.router { border-color: #c4a43b; color: #c4a43b; }
	.tl-badge.interrupt { border-color: #c45b6b; color: #c45b6b; }
	.tl-badge.fanout { border-color: #c4853b; color: #c4853b; }
	.tl-summary {
		font-size: 0.76rem;
		color: var(--color-fg-muted);
		line-height: 1.4;
	}
	.tl-items {
		margin: 0.3rem 0 0.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.tl-item {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		font-size: 0.72rem;
	}
	.tl-icon {
		font-family: var(--font-mono);
		font-weight: 700;
		width: 0.9rem;
		flex-shrink: 0;
		text-align: center;
	}
	.tl-item.supported .tl-icon { color: var(--color-accent-success); }
	.tl-item.contradicted .tl-icon { color: var(--color-accent-danger); }
	.tl-item.unverifiable .tl-icon { color: var(--color-fg-faint); }
	.tl-text {
		color: var(--color-fg);
	}
	.tl-detail {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-fg-faint);
		margin-left: 0.2rem;
	}
	.tl-delta {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-fg-muted);
		margin-top: 0.25rem;
		padding: 0.2rem 0.4rem;
		background: color-mix(in oklch, var(--color-fg) 5%, transparent);
		border-radius: 0.25rem;
		white-space: pre-wrap;
		word-break: break-all;
	}
	.tl-insight {
		font-size: 0.68rem;
		color: var(--color-fg-muted);
		margin-top: 0.25rem;
		padding: 0.25rem 0.45rem;
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		border-radius: 0.3rem;
		border-left: 2px solid var(--accent-rule);
		line-height: 1.4;
	}
	.tl-expanded {
		margin-top: 0;
		padding-top: 0;
	}
	.tl-tabs {
		display: flex;
		gap: 0.2rem;
		background: color-mix(in oklch, var(--color-fg) 5%, transparent);
		border-radius: 0.4rem;
		padding: 0.15rem;
		margin-bottom: 0.5rem;
		width: fit-content;
	}
	.tl-tabs button {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.18rem 0.55rem;
		border-radius: 0.3rem;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.tl-tabs button.on {
		background: var(--color-bg-elev-2, #1c1814);
		color: var(--color-fg);
	}
	.tl-changed {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 0.45rem;
	}
	.tl-changed-label {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
		margin-right: 0.1rem;
	}
	.tl-chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.4rem;
		border-radius: 0.3rem;
		color: var(--accent);
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		border: 1px solid var(--accent-rule);
	}
	/* State + code: tighter, fonts matched to the card; .shiki/code/.line chain
	   all need the size — code & .line carry their own font-size globally. */
	.tl-expanded :global(.shiki),
	.tl-expanded :global(.shiki code),
	.tl-expanded :global(.shiki .line) {
		font-size: 0.64rem !important;
		line-height: 1.5 !important;
	}
	.tl-expanded :global(.inspector) {
		border: 1px solid color-mix(in oklch, var(--color-rule) 50%, transparent);
		border-radius: 0.4rem;
		background: color-mix(in oklch, var(--color-fg) 4%, transparent);
	}
	.tl-expanded :global(.inspector .hl) {
		max-height: 14rem;
	}
	.tl-expanded :global(.inspector pre.shiki) {
		padding: 0.5rem 0.7rem !important;
	}
	.tl-expanded :global(.code) {
		margin: 0;
		border-radius: 0.4rem;
		overflow: hidden;
	}
	.tl-expanded :global(.code pre.shiki) {
		padding: 0.6rem 0.7rem !important;
	}
	.tl-expanded :global(.code figcaption) {
		font-size: 0.6rem;
		padding: 0.35rem 0.7rem 0.45rem;
	}
</style>
