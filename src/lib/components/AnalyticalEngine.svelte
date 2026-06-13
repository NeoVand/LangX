<script lang="ts">
	// The Analytical Engine cockpit — a phase-driven brass schematic of the
	// data-science pipeline: the Deck (data) → the Plan (a human-approved gate) →
	// the Mill (sandboxed compute) → the Store (virtual filesystem) → the Plotter
	// (charts) → the Report. The stage matching the run's phase lights violet; the
	// Mill's gears turn while it computes. Same house visual language as TroupeStage.

	export type EnginePhase =
		| 'idle'
		| 'inspecting'
		| 'planning'
		| 'awaiting'
		| 'computing'
		| 'plotting'
		| 'reporting'
		| 'done';

	interface Props {
		phase: EnginePhase;
		/** Mill runs so far. */
		steps?: number;
		/** Figures rendered. */
		figures?: number;
		/** Files in the Store. */
		files?: number;
	}
	let { phase, steps = 0, figures = 0, files = 0 }: Props = $props();

	type St = 'idle' | 'active' | 'awaiting' | 'done';

	const ORDER: EnginePhase[] = [
		'idle',
		'inspecting',
		'planning',
		'awaiting',
		'computing',
		'plotting',
		'reporting',
		'done'
	];
	const idx = $derived(Math.max(0, ORDER.indexOf(phase)));

	const deck = $derived<St>(phase === 'inspecting' ? 'active' : idx > 1 ? 'done' : 'idle');
	const plan = $derived<St>(
		phase === 'planning' ? 'active' : phase === 'awaiting' ? 'awaiting' : idx > 3 ? 'done' : 'idle'
	);
	const mill = $derived<St>(phase === 'computing' ? 'active' : idx > 4 ? 'done' : 'idle');
	const store = $derived<St>(
		idx === 0 ? 'idle' : phase === 'reporting' ? 'active' : idx >= 6 ? 'done' : 'done'
	);
	const plotter = $derived<St>(phase === 'plotting' ? 'active' : idx > 5 ? 'done' : 'idle');
	const report = $derived<St>(
		phase === 'reporting' ? 'active' : phase === 'done' ? 'done' : 'idle'
	);

	const CAPTION: Record<EnginePhase, string> = {
		idle: 'the Engine is at rest',
		inspecting: 'reading the deck — profiling the data',
		planning: 'drafting the analysis plan',
		awaiting: 'awaiting your approval of the plan',
		computing: 'turning the Mill — computing in the sandbox',
		plotting: 'drawing on the Plotter',
		reporting: 'engraving the report',
		done: 'analysis certified'
	};

	// Stations along the spine. The Mill sits centre and larger.
	const SX = { deck: 92, plan: 268, mill: 458, store: 648, plotter: 808 };
	const SPINE = 142;
</script>

<svg viewBox="0 0 880 300" role="img" aria-label="The Analytical Engine pipeline" class="engine">
	<defs>
		<radialGradient id="eng-wash" cx="50%" cy="42%" r="62%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.1" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="eng-core" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.95" />
			<stop offset="70%" stop-color="var(--accent)" stop-opacity="0.4" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<clipPath id="eng-clip"><rect x="0" y="0" width="880" height="300" rx="10" /></clipPath>
	</defs>

	<g clip-path="url(#eng-clip)">
		<rect x="0" y="0" width="880" height="300" fill="url(#eng-wash)" />

		<!-- conduits along the spine -->
		{#snippet conduit(x1: number, x2: number, lit: boolean)}
			<path d="M {x1} {SPINE} H {x2}" class="pipe" class:active={lit} />
		{/snippet}
		{@render conduit(SX.deck + 60, SX.plan - 60, deck === 'done' || deck === 'active')}
		{@render conduit(SX.plan + 60, SX.mill - 64, plan === 'done')}
		{@render conduit(SX.mill + 64, SX.store - 56, mill === 'done' || mill === 'active')}
		{@render conduit(SX.store + 56, SX.plotter - 56, store === 'active' || plotter !== 'idle')}

		<!-- ── DECK — punch-card data ─────────────────────────────────── -->
		<g class="stn {deck}">
			{#if deck === 'active'}<circle cx={SX.deck} cy={SPINE} r="62" class="halo" />{/if}
			<rect x={SX.deck - 56} y={SPINE - 48} width="112" height="96" rx="9" class="panel" />
			{#each [0, 1, 2, 3] as k (k)}
				<g transform="translate({SX.deck - 30 + k * 5} {SPINE - 24 - k * 6})">
					<rect x="0" y="0" width="60" height="40" rx="4" class="card" />
					{#each [10, 20, 30, 40, 50] as hx (hx)}
						<circle cx={hx} cy="13" r="1.7" class="punch" />
						<circle cx={hx} cy="27" r="1.7" class="punch" />
					{/each}
				</g>
			{/each}
			<rect x={SX.deck - 50} y={SPINE + 30} width="100" height="17" rx="3.5" class="plate" />
			<text x={SX.deck} y={SPINE + 42} class="plate-text">THE DECK</text>
			<text x={SX.deck} y={SPINE - 60} class="counter">{files ? `${files} files` : 'data'}</text>
		</g>

		<!-- ── PLAN — the human-approved gate ─────────────────────────── -->
		<g class="stn {plan}">
			{#if plan === 'active' || plan === 'awaiting'}<circle
					cx={SX.plan}
					cy={SPINE}
					r="62"
					class="halo"
				/>{/if}
			<rect x={SX.plan - 56} y={SPINE - 48} width="112" height="96" rx="9" class="panel" />
			<rect x={SX.plan - 30} y={SPINE - 34} width="60" height="70" rx="4" class="ledger" />
			{#each [0, 1, 2, 3] as r (r)}
				<line
					x1={SX.plan - 20}
					y1={SPINE - 22 + r * 13}
					x2={SX.plan + 6}
					y2={SPINE - 22 + r * 13}
					class="rule"
				/>
				<rect
					x={SX.plan + 12}
					y={SPINE - 27 + r * 13}
					width="9"
					height="9"
					rx="2"
					class="tick"
					class:checked={r < 3}
				/>
			{/each}
			<circle cx={SX.plan + 26} cy={SPINE + 30} r="11" class="seal" />
			<text x={SX.plan + 26} y={SPINE + 34} class="seal-text">✓</text>
			<rect x={SX.plan - 50} y={SPINE + 30} width="64" height="17" rx="3.5" class="plate" />
			<text x={SX.plan - 18} y={SPINE + 42} class="plate-text">THE PLAN</text>
			{#if plan === 'awaiting'}<text x={SX.plan} y={SPINE - 60} class="counter await"
					>approve →</text
				>{/if}
		</g>

		<!-- ── MILL — the sandboxed compute core ──────────────────────── -->
		<g class="stn {mill}">
			{#if mill === 'active'}<circle cx={SX.mill} cy={SPINE} r="78" class="halo big" />{/if}
			<circle cx={SX.mill} cy={SPINE} r="66" class="mill-housing" />
			<circle
				cx={SX.mill}
				cy={SPINE}
				r="38"
				fill="url(#eng-core)"
				class="mill-core"
				class:lit={mill === 'active'}
			/>
			<g class="gear" class:spin={mill === 'active'}>
				<circle cx={SX.mill} cy={SPINE} r="30" class="gear-rim" />
				{#each Array.from({ length: 12 }, (_, i) => i * 30) as a (a)}
					<rect
						x={SX.mill - 3}
						y={SPINE - 40}
						width="6"
						height="10"
						rx="1.5"
						class="tooth"
						transform="rotate({a} {SX.mill} {SPINE})"
					/>
				{/each}
				<circle cx={SX.mill} cy={SPINE} r="8" class="gear-hub" />
			</g>
			<rect x={SX.mill - 40} y={SPINE + 54} width="80" height="17" rx="3.5" class="plate" />
			<text x={SX.mill} y={SPINE + 66} class="plate-text">THE MILL</text>
			<text x={SX.mill} y={SPINE - 84} class="counter">{steps ? `${steps} runs` : 'compute'}</text>
		</g>

		<!-- ── STORE — the virtual filesystem ─────────────────────────── -->
		<g class="stn {store}">
			{#if store === 'active'}<circle cx={SX.store} cy={SPINE} r="60" class="halo" />{/if}
			<rect x={SX.store - 52} y={SPINE - 48} width="104" height="96" rx="9" class="panel" />
			{#each [0, 1, 2] as d (d)}
				<g transform="translate({SX.store} {SPINE - 26 + d * 26})">
					<rect x="-38" y="-9" width="76" height="18" rx="9" class="drum" />
					{#each [-28, -16, -4, 8, 20, 32] as tx (tx)}
						<line x1={tx} y1="-9" x2={tx} y2="9" class="drum-tick" />
					{/each}
				</g>
			{/each}
			<rect x={SX.store - 48} y={SPINE + 30} width="96" height="17" rx="3.5" class="plate" />
			<text x={SX.store} y={SPINE + 42} class="plate-text">THE STORE</text>
		</g>

		<!-- ── PLOTTER — charts onto parchment ────────────────────────── -->
		<g class="stn {plotter}">
			{#if plotter === 'active'}<circle cx={SX.plotter} cy={SPINE} r="60" class="halo" />{/if}
			<rect x={SX.plotter - 54} y={SPINE - 48} width="100" height="96" rx="9" class="panel" />
			<rect x={SX.plotter - 38} y={SPINE - 34} width="76" height="58" rx="3" class="parchment" />
			<line
				x1={SX.plotter - 30}
				y1={SPINE + 16}
				x2={SX.plotter + 30}
				y2={SPINE + 16}
				class="axis"
			/>
			<line
				x1={SX.plotter - 30}
				y1={SPINE - 28}
				x2={SX.plotter - 30}
				y2={SPINE + 16}
				class="axis"
			/>
			<polyline
				points="{SX.plotter - 28},{SPINE + 10} {SX.plotter - 14},{SPINE - 2} {SX.plotter},{SPINE +
					2} {SX.plotter + 14},{SPINE - 14} {SX.plotter + 28},{SPINE - 22}"
				class="trend"
				class:drawn={plotter === 'done' || report !== 'idle'}
			/>
			{#each [[-22, 6], [-8, -4], [6, -2], [18, -16], [28, -22]] as p (p[0])}
				<circle cx={SX.plotter + p[0]} cy={SPINE + p[1]} r="2.4" class="datum" />
			{/each}
			<rect x={SX.plotter - 48} y={SPINE + 30} width="92" height="17" rx="3.5" class="plate" />
			<text x={SX.plotter - 2} y={SPINE + 42} class="plate-text">THE PLOTTER</text>
			<text x={SX.plotter - 2} y={SPINE - 60} class="counter"
				>{figures ? `${figures} figures` : 'charts'}</text
			>
		</g>

		<!-- ── REPORT — the certified output scroll ───────────────────── -->
		<g class="stn report {report}" transform="translate({SX.plotter - 2} 250)">
			<rect x="-66" y="-16" width="132" height="30" rx="6" class="scroll" />
			<circle cx="-50" cy="-1" r="8" class="wax" />
			<text x="-50" y="2.5" class="seal-text small">★</text>
			<text x="8" y="3" class="scroll-text">REPORT</text>
		</g>

		<text x="36" y="282" class="phase-caption">{CAPTION[phase]}</text>
	</g>
</svg>

<style>
	.engine {
		display: block;
		width: 100%;
		height: auto;
		background: var(--color-paper);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	/* conduits */
	.pipe {
		fill: none;
		stroke: color-mix(in oklch, var(--color-rule) 70%, transparent);
		stroke-width: 3;
		opacity: 0.5;
	}
	.pipe.active {
		stroke: var(--accent);
		opacity: 0.95;
		stroke-dasharray: 7 6;
		animation: flow 0.9s linear infinite;
	}
	@keyframes flow {
		to {
			stroke-dashoffset: -13;
		}
	}

	/* shared station chrome */
	.panel,
	.mill-housing {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 1.4;
	}
	.stn.active .panel,
	.stn.awaiting .panel,
	.stn.active .mill-housing {
		stroke: var(--accent);
	}
	.halo {
		fill: color-mix(in oklch, var(--accent) 12%, transparent);
		animation: pulse 1.6s ease-in-out infinite;
	}
	.halo.big {
		fill: color-mix(in oklch, var(--accent) 14%, transparent);
	}
	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	.plate {
		fill: var(--color-cream-3);
		stroke: var(--color-border-strong);
		stroke-width: 0.8;
	}
	.plate-text {
		font-size: 10.5px;
		letter-spacing: 0.1em;
		fill: var(--color-ink-2);
		text-anchor: middle;
		font-weight: 600;
	}
	.counter {
		font-size: 10px;
		letter-spacing: 0.04em;
		fill: var(--color-fg-faint);
		text-anchor: middle;
		font-family: var(--font-mono);
	}
	.stn.active .counter {
		fill: var(--accent-ink);
	}
	.counter.await {
		fill: var(--color-accent-warning);
		animation: pulse 1.1s ease-in-out infinite;
	}

	/* deck */
	.card {
		fill: var(--color-cream-2);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.punch {
		fill: var(--color-ink-1);
	}

	/* plan */
	.ledger {
		fill: var(--color-cream-2);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.rule {
		stroke: color-mix(in oklch, var(--color-ink-1) 45%, transparent);
		stroke-width: 1.2;
	}
	.tick {
		fill: none;
		stroke: var(--color-ink-1);
		stroke-width: 1.2;
	}
	.tick.checked {
		fill: var(--color-accent-success);
		stroke: var(--color-accent-success);
	}
	.seal {
		fill: color-mix(in oklch, var(--accent) 35%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.seal-text {
		font-size: 12px;
		fill: var(--color-cream-2);
		text-anchor: middle;
		font-weight: 700;
	}
	.seal-text.small {
		font-size: 9px;
	}

	/* mill */
	.mill-core {
		opacity: 0.25;
	}
	.mill-core.lit {
		opacity: 1;
	}
	.gear-rim {
		fill: none;
		stroke: var(--color-cream-3);
		stroke-width: 2.4;
	}
	.tooth {
		fill: var(--color-cream-3);
	}
	.gear-hub {
		fill: var(--color-cream-3);
	}
	.gear {
		transform-box: fill-box;
		transform-origin: center;
	}
	.gear.spin {
		animation: spin 3s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.stn.done .gear-rim,
	.stn.done .tooth,
	.stn.done .gear-hub {
		stroke: var(--color-accent-success);
		fill: var(--color-accent-success);
	}
	.stn.done .gear-rim {
		fill: none;
	}

	/* store */
	.drum {
		fill: var(--color-ink-2);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.drum-tick {
		stroke: color-mix(in oklch, var(--color-cream-4) 60%, transparent);
		stroke-width: 0.8;
	}
	.stn.active .drum {
		stroke: var(--accent);
	}

	/* plotter */
	.parchment {
		fill: var(--color-cream-2);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.axis {
		stroke: color-mix(in oklch, var(--color-ink-1) 55%, transparent);
		stroke-width: 1.2;
	}
	.datum {
		fill: color-mix(in oklch, var(--accent) 55%, var(--color-ink-1));
	}
	.trend {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 120;
		stroke-dashoffset: 120;
	}
	.trend.drawn {
		stroke-dashoffset: 0;
		transition: stroke-dashoffset 1s ease;
	}

	/* report scroll */
	.scroll {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 1.2;
	}
	.stn.report.active .scroll,
	.stn.report.done .scroll {
		stroke: var(--accent);
	}
	.scroll-text {
		font-size: 11px;
		letter-spacing: 0.14em;
		fill: var(--color-fg-faint);
		text-anchor: middle;
		font-weight: 600;
	}
	.stn.report.active .scroll-text,
	.stn.report.done .scroll-text {
		fill: var(--accent-ink);
	}
	.wax {
		fill: color-mix(in oklch, var(--accent) 40%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.stn.report.idle {
		opacity: 0.55;
	}

	.phase-caption {
		font-size: 11.5px;
		letter-spacing: 0.04em;
		fill: var(--color-fg-faint);
		font-style: italic;
	}

	/* done tinting for plates */
	.stn.done .plate-text {
		fill: var(--color-ink-2);
	}
</style>
