<script lang="ts">
	export type DeskPhase = 'idle' | 'planning' | 'awaiting' | 'researching' | 'synthesizing' | 'done';
	export type StationState = 'idle' | 'working' | 'done';

	interface Props {
		phase: DeskPhase;
		/** Per-researcher state, keyed by agent name. */
		researchers: Record<string, StationState>;
		sources: number;
	}
	let { phase, researchers, sources }: Props = $props();

	// ── the relay spine across the top ──
	const PHASES = ['plan', 'approve', 'research', 'synthesize', 'report'];
	const PHASE_INDEX: Record<DeskPhase, number> = {
		idle: -1,
		planning: 0,
		awaiting: 1,
		researching: 2,
		synthesizing: 3,
		done: 4
	};
	const active = $derived(PHASE_INDEX[phase]);
	const RELAY_X = [120, 290, 460, 630, 800];
	const RELAY_Y = 46;

	// ── the tree below: lead → three researchers → report ──
	const LEAD = { x: 440, y: 132 };
	const ROW_Y = 262;
	const STATIONS = [
		{ name: 'docs-researcher', label: 'Docs', archive: 'DOCUMENTATION', x: 180, kind: 'docs' },
		{ name: 'code-researcher', label: 'Code', archive: 'REPOSITORIES', x: 440, kind: 'code' },
		{ name: 'concepts-researcher', label: 'Concepts', archive: 'SOURCES', x: 700, kind: 'concepts' }
	];
	const REPORT = { x: 440, y: 336 };

	const st = (name: string): StationState => researchers[name] ?? 'idle';
	const leadBusy = $derived(phase === 'planning' || phase === 'researching' || phase === 'synthesizing');
	const researching = $derived(phase === 'researching');
</script>

<svg viewBox="0 0 880 424" role="img" aria-label="The research bureau" class="desk">
	<defs>
		<radialGradient id="desk-core" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.9" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="desk-wash" cx="50%" cy="38%" r="70%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.08" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<clipPath id="desk-clip"><rect x="0" y="0" width="880" height="424" rx="10" /></clipPath>
	</defs>

	{#snippet bot(cx: number, cy: number, kind: string, working: boolean, done: boolean)}
		<g class="bot {kind}" class:working class:done>
			{#if working}<circle {cx} cy={cy - 2} r="30" class="halo" />{/if}
			<ellipse {cx} cy={cy + 34} rx="23" ry="4.5" class="shadow" />
			<rect x={cx - 11} y={cy + 16} width="7" height="16" rx="3" class="limb" />
			<rect x={cx + 4} y={cy + 16} width="7" height="16" rx="3" class="limb" />
			<ellipse cx={cx - 7.5} cy={cy + 33} rx="7" ry="3.5" class="foot" />
			<ellipse cx={cx + 7.5} cy={cy + 33} rx="7" ry="3.5" class="foot" />
			{#if kind === 'lead'}
				<path d="M {cx + 15} {cy - 2} Q {cx + 36} {cy + 4} {cx + 32} {cy + 24}" class="arm" />
				<circle cx={cx + 32} cy={cy + 24} r="3.4" class="hand" />
			{:else}
				<path d="M {cx + 15} {cy} Q {cx + 27} {cy + 6} {cx + 25} {cy + 16}" class="arm" />
				<circle cx={cx + 25} cy={cy + 16} r="3" class="hand" />
			{/if}
			<rect x={cx - 16} y={cy - 10} width="32" height="36" rx="8" class="body" />
			<circle cx={cx - 10} cy={cy - 3} r="1.4" class="rivet" />
			<circle cx={cx + 10} cy={cy - 3} r="1.4" class="rivet" />
			<circle {cx} cy={cy + 8} r="11" fill="url(#desk-core)" class="coreglow" />
			<circle {cx} cy={cy + 8} r="6.5" class="porthole" />
			<g class="gear" class:spin={working}>
				<circle {cx} cy={cy + 8} r="4" class="gear-rim" />
				{#each [0, 60, 120] as a (a)}
					<line x1={cx} y1={cy + 3.5} x2={cx} y2={cy + 12.5} class="gear-spoke" transform="rotate({a} {cx} {cy + 8})" />
				{/each}
			</g>
			<circle {cx} cy={cy - 24} r="11" class="head" />
			{#if kind === 'lead'}
				<rect x={cx - 9} y={cy - 47} width="18" height="14" rx="2" class="hat" />
				<rect x={cx - 13} y={cy - 34} width="26" height="3.5" rx="1.5" class="hat" />
			{:else}
				<path d="M {cx - 9.5} {cy - 31} A 9.5 9.5 0 0 1 {cx + 9.5} {cy - 31} L {cx + 11} {cy - 28} L {cx - 11} {cy - 28} Z" class="cap" />
			{/if}
			<circle cx={cx - 4} cy={cy - 25} r="2" class="eye" />
			<circle cx={cx + 4} cy={cy - 25} r="2" class="eye" />
			<line x1={cx} y1={cy - 35} x2={cx} y2={cy - 41} class="antenna" />
			<circle {cx} cy={cy - 43} r="2.4" class="bulb" />
		</g>
	{/snippet}

	{#snippet archive(cx: number, cy: number, kind: string, lit: string)}
		<g class="archive {lit}" transform="translate({cx + 30} {cy - 6})">
			{#if kind === 'docs'}
				<rect x="0" y="-2" width="7" height="28" rx="1.5" class="arch-fill" />
				<rect x="9" y="-6" width="7" height="32" rx="1.5" class="arch-fill" />
				<rect x="18" y="0" width="7" height="26" rx="1.5" class="arch-fill" />
			{:else if kind === 'code'}
				<rect x="0" y="-4" width="26" height="30" rx="2" class="arch-fill" />
				<line x1="4" y1="3" x2="22" y2="3" class="arch-line" />
				<line x1="4" y1="11" x2="22" y2="11" class="arch-line" />
				<line x1="4" y1="19" x2="16" y2="19" class="arch-line" />
				<circle cx="13" cy="3" r="1.4" class="arch-knob" />
			{:else}
				<circle cx="13" cy="11" r="14" class="arch-fill" />
				<ellipse cx="13" cy="11" rx="14" ry="5" class="arch-line" fill="none" />
				<line x1="13" y1="-3" x2="13" y2="25" class="arch-line" />
				<path d="M 0 7 Q 13 13 26 7" class="arch-line" fill="none" />
			{/if}
		</g>
	{/snippet}

	<g clip-path="url(#desk-clip)">
		<rect x="0" y="0" width="880" height="424" fill="url(#desk-wash)" />

		<!-- relay spine -->
		<line x1={RELAY_X[0]} y1={RELAY_Y} x2={RELAY_X[4]} y2={RELAY_Y} class="spine" />
		{#each PHASES as p, i (p)}
			{@const state = i < active ? 'past' : i === active ? 'now' : 'next'}
			<g class="relay {state}">
				<circle cx={RELAY_X[i]} cy={RELAY_Y} r="9" class="node" />
				{#if i < active}<path d="M {RELAY_X[i] - 3.5} {RELAY_Y} l 2.5 3 l 4.5 -5.5" class="tick" />{/if}
				<text x={RELAY_X[i]} y={RELAY_Y - 16} class="relay-label">{p}</text>
				<text x={RELAY_X[i]} y={RELAY_Y + 22} class="relay-num">{i + 1}</text>
			</g>
		{/each}
		<line x1="40" y1="88" x2="840" y2="88" class="divider" />

		<!-- conduits: lead → each researcher (a clean downward fan) -->
		{#each STATIONS as s (s.name)}
			<path
				d="M {LEAD.x} {LEAD.y + 30} C {LEAD.x} {LEAD.y + 92}, {s.x} {ROW_Y - 70}, {s.x} {ROW_Y - 38}"
				class="conduit"
				class:active={researching && st(s.name) === 'working'}
			/>
		{/each}
		<!-- returns: each researcher → the report (converging) -->
		{#each STATIONS as s (s.name)}
			<path
				d="M {s.x} {ROW_Y + 30} C {s.x} {ROW_Y + 56}, {REPORT.x} {REPORT.y - 18}, {REPORT.x} {REPORT.y - 2}"
				class="return"
				class:lit={st(s.name) === 'done'}
			/>
		{/each}

		<!-- the lead -->
		{@render bot(LEAD.x, LEAD.y, 'lead', leadBusy, phase === 'done')}
		<rect x={LEAD.x - 40} y={LEAD.y + 40} width="80" height="15" rx="3" class="plate" />
		<text x={LEAD.x} y={LEAD.y + 51} class="plate-name">Research Lead</text>

		<!-- the researchers -->
		{#each STATIONS as s (s.name)}
			{@const state = st(s.name)}
			{@render bot(s.x, ROW_Y, s.kind, state === 'working', state === 'done')}
			{@render archive(s.x, ROW_Y, s.kind, state)}
			<rect x={s.x - 44} y={ROW_Y + 40} width="88" height="15" rx="3" class="plate" />
			<text x={s.x} y={ROW_Y + 51} class="plate-name">{s.label} · {s.archive}</text>
		{/each}

		<!-- the assembling report -->
		<g class="report" class:filling={phase === 'synthesizing'} class:bound={phase === 'done'}>
			<rect x={REPORT.x - 33} y={REPORT.y} width="66" height="46" rx="4" class="book" />
			<line x1={REPORT.x} y1={REPORT.y} x2={REPORT.x} y2={REPORT.y + 46} class="book-spine" />
			{#each [10, 18, 26, 34] as ly (ly)}
				<line x1={REPORT.x - 25} y1={REPORT.y + ly} x2={REPORT.x - 6} y2={REPORT.y + ly} class="report-line" />
				<line x1={REPORT.x + 6} y1={REPORT.y + ly} x2={REPORT.x + 25} y2={REPORT.y + ly} class="report-line" />
			{/each}
			<text x={REPORT.x} y={REPORT.y + 64} class="report-label">{phase === 'done' ? 'report ready' : 'report'}</text>
		</g>

		<!-- sources tally -->
		<g class="badge" transform="translate(792 {REPORT.y + 22})">
			<rect x="-48" y="-13" width="96" height="26" rx="13" />
			<text x="0" y="4">{sources} sources</text>
		</g>
	</g>
</svg>

<style>
	.desk {
		display: block;
		width: 100%;
		height: auto;
		background: var(--color-paper);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	/* relay */
	.spine {
		stroke: color-mix(in oklch, var(--color-rule) 42%, transparent);
		stroke-width: 1.5;
	}
	.relay .node {
		fill: var(--color-ink-1);
		stroke: color-mix(in oklch, var(--color-rule) 60%, transparent);
		stroke-width: 1.4;
	}
	.relay.past .node {
		fill: color-mix(in oklch, var(--color-accent-success) 30%, var(--color-ink-1));
		stroke: var(--color-accent-success);
	}
	.relay.now .node {
		fill: color-mix(in oklch, var(--accent) 35%, var(--color-ink-1));
		stroke: var(--accent);
		animation: pulse 1.3s ease-in-out infinite;
	}
	.tick {
		stroke: var(--color-accent-success);
		stroke-width: 1.6;
		fill: none;
	}
	.relay-label {
		font-size: 11px;
		text-anchor: middle;
		fill: var(--color-fg-faint);
		letter-spacing: 0.05em;
	}
	.relay.now .relay-label {
		fill: var(--accent-ink);
		font-weight: 600;
	}
	.relay.past .relay-label {
		fill: var(--color-fg-muted);
	}
	.relay-num {
		font-size: 9px;
		text-anchor: middle;
		fill: var(--color-fg-faint);
	}
	.divider {
		stroke: color-mix(in oklch, var(--color-rule) 26%, transparent);
		stroke-width: 1;
	}

	/* conduits */
	.conduit,
	.return {
		fill: none;
		stroke: color-mix(in oklch, var(--color-rule) 38%, transparent);
		stroke-width: 1.5;
	}
	.conduit.active {
		stroke: var(--accent);
		stroke-dasharray: 7 5;
		animation: flow 0.9s linear infinite;
	}
	.return.lit {
		stroke: color-mix(in oklch, var(--color-accent-success) 55%, transparent);
		stroke-dasharray: 5 4;
	}

	/* automatons */
	.shadow {
		fill: color-mix(in oklch, var(--color-ink-0) 78%, transparent);
	}
	.body {
		fill: var(--color-ink-2);
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.head {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.limb,
	.foot {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.arm {
		fill: none;
		stroke: var(--color-cream-4);
		stroke-width: 3;
		stroke-linecap: round;
	}
	.hand {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.rivet {
		fill: var(--color-cream-4);
	}
	.hat {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.cap {
		fill: color-mix(in oklch, var(--accent) 22%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.eye {
		fill: var(--color-cream-3);
	}
	.bot.working .eye,
	.bot.lead .eye {
		fill: var(--accent);
	}
	.antenna {
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.bulb {
		fill: var(--color-cream-4);
	}
	.bot.working .bulb {
		fill: var(--accent);
		animation: pulse 1.1s ease-in-out infinite;
	}
	.bot.done .bulb {
		fill: var(--color-accent-success);
	}
	.coreglow {
		opacity: 0.3;
	}
	.bot.working .coreglow {
		animation: pulse 1.5s ease-in-out infinite;
	}
	.porthole {
		fill: var(--color-ink-0);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.gear-rim {
		fill: none;
		stroke: var(--color-cream-3);
		stroke-width: 1.2;
	}
	.gear-spoke {
		stroke: var(--color-cream-3);
		stroke-width: 0.9;
	}
	.gear {
		transform-box: fill-box;
		transform-origin: center;
	}
	.gear.spin {
		animation: spin 2.6s linear infinite;
	}
	.halo {
		fill: color-mix(in oklch, var(--accent) 10%, transparent);
		animation: pulse 1.6s ease-in-out infinite;
	}

	/* archives */
	.archive .arch-fill {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.archive.working .arch-fill {
		stroke: var(--accent);
	}
	.archive.done .arch-fill {
		stroke: color-mix(in oklch, var(--color-accent-success) 55%, var(--color-cream-4));
	}
	.arch-line {
		stroke: color-mix(in oklch, var(--color-cream-4) 70%, transparent);
		stroke-width: 1;
	}
	.arch-knob {
		fill: color-mix(in oklch, var(--color-cream-4) 70%, transparent);
	}

	.plate {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 0.9;
	}
	.plate-name {
		font-size: 10px;
		text-anchor: middle;
		fill: var(--color-fg-muted);
	}

	/* report */
	.report .book {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.report.bound .book {
		stroke: var(--color-accent-success);
	}
	.report.filling .book {
		stroke: var(--accent);
	}
	.book-spine {
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.report-line {
		stroke: color-mix(in oklch, var(--color-cream-4) 32%, transparent);
		stroke-width: 1.3;
	}
	.report.bound .report-line,
	.report.filling .report-line {
		stroke: color-mix(in oklch, var(--accent) 42%, var(--color-cream-4));
	}
	.report-label {
		font-size: 10px;
		text-anchor: middle;
		fill: var(--color-fg-faint);
	}
	.report.bound .report-label {
		fill: var(--color-accent-success);
	}

	.badge rect {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 1;
	}
	.badge text {
		font-size: 11px;
		text-anchor: middle;
		fill: var(--accent-ink);
		font-variant-numeric: tabular-nums;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}
	@keyframes flow {
		to {
			stroke-dashoffset: -12;
		}
	}
</style>
