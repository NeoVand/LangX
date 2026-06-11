<script lang="ts">
	export type StationState = 'idle' | 'working' | 'done' | 'error' | 'cancelled';
	export interface StationStatus {
		state: StationState;
		note?: string;
	}

	interface Props {
		/** Keyed by agent name: maestro, melody-wright, bass-wright, drum-wright, arranger. */
		status: Record<string, StationStatus>;
	}
	let { status }: Props = $props();

	const st = (name: string): StationStatus => status[name] ?? { state: 'idle' };

	const WRIGHTS = [
		{ name: 'melody-wright', label: 'Melody-wright', kind: 'melody', x: 160, y: 462 },
		{ name: 'bass-wright', label: 'Bass-wright', kind: 'bass', x: 412, y: 488 },
		{ name: 'drum-wright', label: 'Drum-wright', kind: 'drum', x: 664, y: 462 }
	];
	const MAESTRO = { x: 412, y: 252 };
	const ARRANGER = { x: 756, y: 196 };

	function trim(note: string | undefined, n = 26): string {
		if (!note) return '';
		return note.length > n ? note.slice(0, n - 1) + '…' : note;
	}

	const GLYPH: Record<StationState, string> = {
		idle: '',
		working: '⚙ ',
		done: '✓ ',
		error: '✗ ',
		cancelled: '⊘ '
	};
</script>

<svg viewBox="0 0 880 660" role="img" aria-label="The Clockwork Troupe on stage" class="stage">
	<defs>
		<radialGradient id="troupe-spot" cx="50%" cy="30%" r="65%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.12" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="troupe-lamp" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="var(--color-accent-warning)" stop-opacity="0.85" />
			<stop offset="100%" stop-color="var(--color-accent-warning)" stop-opacity="0" />
		</radialGradient>
		<!-- everything terminates inside the container's rounded corners -->
		<clipPath id="troupe-clip">
			<rect x="0" y="0" width="880" height="660" rx="10" />
		</clipPath>
	</defs>

	<g clip-path="url(#troupe-clip)">

	<!-- spotlight wash -->
	<rect x="0" y="0" width="880" height="660" fill="url(#troupe-spot)" />

	<!-- great gear rosette on the back wall -->
	<g class="rosette">
		<circle cx="412" cy="160" r="74" />
		<circle cx="412" cy="160" r="56" />
		{#each Array.from({ length: 12 }, (_, i) => i * 30) as a (a)}
			<line x1="412" y1="86" x2="412" y2="74" transform="rotate({a} 412 160)" />
		{/each}
		<line x1="412" y1="160" x2="412" y2="118" class="hand" />
		<line x1="412" y1="160" x2="444" y2="176" class="hand" />
		<circle cx="412" cy="160" r="4" class="hub" />
	</g>

	<!-- proscenium: mirrored side drapes + scalloped valance -->
	{#snippet drape()}
		<g>
			<path
				class="curtain-panel"
				d="M 0 0 L 78 0 Q 62 170 52 316 Q 50 328 46 334 Q 54 344 64 430 Q 78 545 88 660 L 0 660 Z"
			/>
			{#each [22, 44, 66] as fx (fx)}
				<path class="curtain-fold" d="M {fx} 0 Q {fx - 7} 180 42 326" />
				<path class="curtain-fold" d="M 42 342 Q {fx + 2} 480 {fx + 16} 660" />
			{/each}
			<rect x="6" y="324" width="56" height="15" rx="7.5" class="tieback-band" />
			<circle cx="60" cy="331" r="6.5" class="tieback-rosette" />
		</g>
	{/snippet}
	{@render drape()}
	<g transform="translate(880 0) scale(-1 1)">{@render drape()}</g>

	<path
		class="valance"
		d="M 0 0 H 880 V 26 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 c -18 24 -92 24 -110 0 Z"
	/>
	{#each [110, 220, 330, 440, 550, 660, 770] as tx (tx)}
		<circle cx={tx} cy="30" r="3" class="valance-drop" />
	{/each}

	<!-- the async wing: a garret room, top right -->
	<g class="garret">
		<rect x="610" y="64" width="216" height="252" rx="8" class="room" />
		<rect x="610" y="64" width="216" height="252" rx="8" class="room-frame" />
		<circle cx="664" cy="112" r="22" class="porthole-window" />
		<path d="M 664 90 V 134 M 642 112 H 686" class="window-cross" />
		<rect x="638" y="288" width="160" height="20" rx="4" class="sign" />
		<text x="718" y="302" class="sign-text">THE ASYNC WING</text>
	</g>

	<!-- pneumatic tubes: maestro → wrights -->
	{#each WRIGHTS as w (w.name)}
		<path
			d="M {MAESTRO.x} {MAESTRO.y + 64} C {MAESTRO.x} {MAESTRO.y + 140}, {w.x} {w.y - 150}, {w.x} {w.y - 64}"
			class="tube"
			class:active={st(w.name).state === 'working'}
		/>
	{/each}
	<!-- speaking tube: maestro → garret wall -->
	<path
		d="M {MAESTRO.x + 36} {MAESTRO.y - 10} C 520 200, 560 180, 610 178"
		class="tube async"
		class:active={st('arranger').state === 'working'}
	/>

	<!-- stage floor -->
	<line x1="44" y1="568" x2="836" y2="568" class="floor-edge" />
	{#each [120, 266, 412, 558, 704] as fx (fx)}
		<line x1={fx} y1="568" x2={412 + (fx - 412) * 1.18} y2="660" class="floor-board" />
	{/each}

	<!-- footlights -->
	{#each [150, 280, 410, 540, 670] as fx (fx)}
		<g class="footlight">
			<circle cx={fx} cy="582" r="22" fill="url(#troupe-lamp)" opacity="0.5" />
			<path d="M {fx - 9} 588 A 9 9 0 0 1 {fx + 9} 588 Z" class="lamp" />
		</g>
	{/each}

	{#snippet automaton(name: string, label: string, x: number, y: number, kind: string, scale: number)}
		{@const s = st(name)}
		<g class="auto {s.state}" transform="translate({x} {y}) scale({scale})">
			{#if s.state === 'working'}
				<circle cx="0" cy="0" r="58" class="halo" />
			{/if}
			<ellipse cx="0" cy="62" rx="32" ry="6" class="shadow" />

			<!-- legs & feet -->
			<rect x="-15" y="40" width="9" height="16" rx="3" class="limb" />
			<rect x="6" y="40" width="9" height="16" rx="3" class="limb" />
			<ellipse cx="-10.5" cy="58" rx="9" ry="4.5" class="foot" />
			<ellipse cx="10.5" cy="58" rx="9" ry="4.5" class="foot" />

			<!-- arms (behind torso) -->
			{#if kind === 'maestro'}
				<path d="M -24 4 Q -40 18 -38 34" class="arm" />
				<path d="M 24 2 Q 38 -16 46 -34" class="arm" />
				<line x1="46" y1="-34" x2="58" y2="-56" class="baton" />
				<circle cx="-38" cy="34" r="3.6" class="hand" />
				<circle cx="46" cy="-34" r="3.6" class="hand" />
			{:else if kind === 'melody'}
				<path d="M -24 4 Q -38 8 -44 0" class="arm" />
				<path d="M 24 4 Q 34 16 30 30" class="arm" />
				<circle cx="-44" cy="0" r="3.6" class="hand" />
				<circle cx="30" cy="30" r="3.6" class="hand" />
			{:else if kind === 'bass'}
				<path d="M -24 2 Q -38 -6 -44 -18" class="arm" />
				<path d="M 24 4 Q 6 16 -26 18" class="arm" />
				<circle cx="-44" cy="-18" r="3.6" class="hand" />
				<circle cx="-26" cy="18" r="3.6" class="hand" />
			{:else if kind === 'drum'}
				<path d="M -24 2 Q -36 8 -42 20" class="arm" />
				<path d="M 24 2 Q 36 8 42 20" class="arm" />
				<line x1="-42" y1="20" x2="-14" y2="31" class="stick" />
				<line x1="42" y1="20" x2="14" y2="31" class="stick" />
				<circle cx="-42" cy="20" r="3.6" class="hand" />
				<circle cx="42" cy="20" r="3.6" class="hand" />
			{:else}
				<path d="M -24 6 Q -34 16 -30 28" class="arm" />
				<path d="M 24 6 Q 36 12 38 24" class="arm" />
				<line x1="38" y1="26" x2="50" y2="-2" class="quill" />
				<path d="M 50 -2 l 3 -7 l -6 3 Z" class="feather" />
				<circle cx="-30" cy="28" r="3.6" class="hand" />
				<circle cx="38" cy="26" r="3.6" class="hand" />
			{/if}

			<!-- torso -->
			<rect x="-26" y="-10" width="52" height="52" rx="10" class="body" />
			<line x1="0" y1="-10" x2="0" y2="2" class="seam" />
			{#each [-18, 18] as rx (rx)}
				<circle cx={rx} cy="-3" r="1.6" class="rivet" />
			{/each}

			<!-- chest gear porthole -->
			<circle cx="0" cy="18" r="13" class="porthole" />
			<g class="gear" class:spin={s.state === 'working'}>
				<circle cx="0" cy="18" r="7" class="gear-rim" />
				{#each [0, 45, 90, 135] as a (a)}
					<line x1="0" y1="9.5" x2="0" y2="26.5" class="gear-spoke" transform="rotate({a} 0 18)" />
				{/each}
				<circle cx="0" cy="18" r="2" class="gear-hub" />
			</g>

			<!-- head -->
			<circle cx="0" cy="-30" r="17" class="head" />
			{#if kind === 'maestro'}
				<rect x="-13" y="-62" width="26" height="18" rx="2" class="hat" />
				<rect x="-19" y="-46" width="38" height="4" rx="2" class="hat" />
			{:else}
				<path d="M -14 -39 A 14.5 14.5 0 0 1 14 -39 L 16 -36 L -16 -36 Z" class="cap" />
			{/if}
			<circle cx="-6" cy="-31" r="2.8" class="eye" />
			<circle cx="6" cy="-31" r="2.8" class="eye" />
			{#each [-22.5, -19.5] as gy (gy)}
				<line x1="-5" y1={gy} x2="5" y2={gy} class="grille" />
			{/each}
			<line x1="0" y1="-47" x2="0" y2="-54" class="antenna" />
			<circle cx="0" cy="-57" r="3" class="bulb" />

			<!-- instruments -->
			{#if kind === 'maestro'}
				<path d="M -34 56 L 34 56 L 28 74 L -28 74 Z" class="podium" />
			{:else if kind === 'melody'}
				<g class="lyre">
					<path d="M -44 2 L -44 -8 M -44 -8 L -52 -30 M -44 -8 L -36 -30 M -53 -24 L -35 -24" />
					<circle cx="-52" cy="-33" r="3" class="bell" />
					<circle cx="-44" cy="-36" r="3" class="bell" />
					<circle cx="-36" cy="-33" r="3" class="bell" />
				</g>
			{:else if kind === 'bass'}
				<g class="bassgroup">
					<ellipse cx="-44" cy="30" rx="14" ry="20" class="bassbody" />
					<ellipse cx="-44" cy="14" rx="9" ry="10" class="bassbody" />
					<line x1="-44" y1="6" x2="-44" y2="-32" class="bassneck" />
					<circle cx="-44" cy="-35" r="3.4" class="bassscroll" />
					<line x1="-44" y1="46" x2="-44" y2="-28" class="bassstring" />
					<path d="M -51 30 Q -44 36 -37 30" class="bassbridge" />
				</g>
			{:else if kind === 'drum'}
				<g class="drumkit">
					<rect x="-22" y="36" width="44" height="20" rx="4" class="drumshell" />
					<ellipse cx="0" cy="36" rx="22" ry="7" class="drumtop" />
					<line x1="-22" y1="42" x2="22" y2="42" class="drumband" />
				</g>
			{:else}
				<g class="desk">
					<rect x="-36" y="34" width="72" height="8" rx="2" class="desktop" />
					<rect x="-30" y="42" width="6" height="16" class="deskleg" />
					<rect x="24" y="42" width="6" height="16" class="deskleg" />
					<rect x="14" y="22" width="10" height="12" rx="1" class="scroll" />
					<line x1="-20" y1="34" x2="-20" y2="24" class="candle" />
					<circle cx="-20" cy="21" r="2.6" class="flame" />
				</g>
			{/if}

			<!-- name plate + status -->
			<rect x="-50" y="78" width="100" height="17" rx="3.5" class="plate" />
			<text x="0" y="90" class="plate-name">{label}</text>
			<text x="0" y="110" class="status-note">
				{GLYPH[s.state]}{s.state === 'idle' ? 'idle' : trim(s.note) || s.state}
			</text>
		</g>
	{/snippet}

	{@render automaton('arranger', 'The Arranger', ARRANGER.x, ARRANGER.y, 'arranger', 0.82)}
	{@render automaton('maestro', 'The Maestro', MAESTRO.x, MAESTRO.y, 'maestro', 1.04)}
	{#each WRIGHTS as w (w.name)}
		{@render automaton(w.name, w.label, w.x, w.y, w.kind, 1)}
	{/each}

	<text x="412" y="648" class="stage-label">THE STAGE — SYNC WRIGHTS, DISPATCHED IN PARALLEL</text>

	</g>
</svg>

<style>
	.stage {
		display: block;
		width: 100%;
		height: auto;
		background: var(--color-paper);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.rosette circle,
	.rosette line {
		stroke: color-mix(in oklch, var(--color-rule) 55%, transparent);
		stroke-width: 1.4;
		fill: none;
	}
	.rosette .hand {
		stroke: color-mix(in oklch, var(--color-rule) 80%, transparent);
		stroke-width: 2;
	}
	.rosette .hub {
		fill: color-mix(in oklch, var(--color-rule) 80%, transparent);
		stroke: none;
	}

	.curtain-panel,
	.valance {
		fill: color-mix(in oklch, var(--accent) 13%, var(--color-ink-1));
		stroke: color-mix(in oklch, var(--accent) 26%, var(--color-border-strong));
		stroke-width: 1.2;
	}
	.curtain-fold {
		fill: none;
		stroke: color-mix(in oklch, var(--color-ink-0) 60%, transparent);
		stroke-width: 2;
	}
	.valance-drop {
		fill: color-mix(in oklch, var(--accent) 42%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 0.8;
	}
	.tieback-band {
		fill: color-mix(in oklch, var(--accent) 28%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.tieback-rosette {
		fill: color-mix(in oklch, var(--accent) 45%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.garret .room {
		fill: color-mix(in oklch, var(--color-ink-0) 70%, var(--color-paper));
		stroke: none;
	}
	.garret .room-frame {
		fill: none;
		stroke: var(--color-border-strong);
		stroke-width: 1.4;
	}
	.porthole-window {
		fill: var(--color-ink-0);
		stroke: var(--color-cream-4);
		stroke-width: 1.6;
	}
	.window-cross {
		stroke: color-mix(in oklch, var(--color-cream-4) 60%, transparent);
		stroke-width: 1;
	}
	.sign {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 0.9;
	}
	.sign-text {
		font-size: 11px;
		letter-spacing: 0.22em;
		fill: var(--color-fg-faint);
		text-anchor: middle;
	}

	.tube {
		fill: none;
		stroke: color-mix(in oklch, var(--color-rule) 75%, transparent);
		stroke-width: 2.2;
		opacity: 0.5;
	}
	.tube.async {
		stroke-dasharray: 8 6;
	}
	.tube.active {
		stroke: var(--accent);
		opacity: 0.95;
		stroke-dasharray: 8 6;
		animation: flow 0.9s linear infinite;
	}
	@keyframes flow {
		to {
			stroke-dashoffset: -14;
		}
	}

	.floor-edge {
		stroke: var(--color-rule);
		stroke-width: 1.6;
	}
	.floor-board {
		stroke: color-mix(in oklch, var(--color-rule) 38%, transparent);
		stroke-width: 1;
	}
	.footlight .lamp {
		fill: color-mix(in oklch, var(--color-accent-warning) 55%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 0.8;
	}
	.stage-label {
		font-size: 11px;
		letter-spacing: 0.22em;
		fill: var(--color-fg-faint);
		text-anchor: middle;
	}

	/* ── automatons ── */
	.auto .shadow {
		fill: color-mix(in oklch, var(--color-ink-0) 80%, transparent);
	}
	.auto .body {
		fill: var(--color-ink-2);
		stroke: var(--color-cream-4);
		stroke-width: 1.4;
	}
	.auto .head {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1.4;
	}
	.auto .limb {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.auto .foot {
		fill: var(--color-ink-2);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.auto .arm {
		fill: none;
		stroke: var(--color-cream-4);
		stroke-width: 3.4;
		stroke-linecap: round;
	}
	.auto .hand {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.auto .seam {
		stroke: color-mix(in oklch, var(--color-cream-4) 50%, transparent);
		stroke-width: 1;
	}
	.auto .rivet {
		fill: var(--color-cream-4);
	}
	.auto .hat {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.auto .cap {
		fill: color-mix(in oklch, var(--accent) 20%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.auto .eye {
		fill: var(--color-cream-3);
	}
	.auto.working .eye {
		fill: var(--color-accent-warning);
	}
	.auto .grille {
		stroke: color-mix(in oklch, var(--color-cream-4) 70%, transparent);
		stroke-width: 1.2;
	}
	.auto .antenna {
		stroke: var(--color-cream-4);
		stroke-width: 1.4;
	}
	.auto .bulb {
		fill: var(--color-cream-4);
	}
	.auto.working .bulb {
		fill: var(--accent);
		animation: blink 1.1s ease-in-out infinite;
	}
	.auto.done .bulb {
		fill: var(--color-accent-success);
	}
	.auto.error .bulb,
	.auto.cancelled .bulb {
		fill: var(--color-accent-danger);
	}
	@keyframes blink {
		50% {
			opacity: 0.35;
		}
	}
	.halo {
		fill: color-mix(in oklch, var(--accent) 11%, transparent);
		animation: blink 1.6s ease-in-out infinite;
	}

	.porthole {
		fill: var(--color-ink-0);
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.gear-rim {
		fill: none;
		stroke: var(--color-cream-3);
		stroke-width: 1.6;
	}
	.gear-spoke {
		stroke: var(--color-cream-3);
		stroke-width: 1.1;
	}
	.gear-hub {
		fill: var(--color-cream-3);
	}
	.gear {
		transform-box: fill-box;
		transform-origin: center;
	}
	.gear.spin {
		animation: spin 2.4s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.baton,
	.stick,
	.quill {
		stroke: var(--color-cream-2);
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.podium {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.lyre path {
		stroke: var(--color-cream-3);
		stroke-width: 1.6;
		fill: none;
	}
	.bell {
		fill: var(--color-cream-3);
	}
	.bassbody {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.bassneck {
		stroke: var(--color-cream-3);
		stroke-width: 2.6;
		stroke-linecap: round;
	}
	.bassscroll {
		fill: var(--color-ink-2);
		stroke: var(--color-cream-3);
		stroke-width: 1.2;
	}
	.bassstring {
		stroke: color-mix(in oklch, var(--color-cream-2) 70%, transparent);
		stroke-width: 0.8;
	}
	.bassbridge {
		fill: none;
		stroke: color-mix(in oklch, var(--color-cream-4) 70%, transparent);
		stroke-width: 1.2;
	}
	.feather {
		fill: var(--color-cream-2);
	}
	.drumshell {
		fill: var(--color-ink-3);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.drumtop {
		fill: var(--color-cream-4);
		stroke: var(--color-cream-3);
		stroke-width: 1;
	}
	.drumband {
		stroke: color-mix(in oklch, var(--accent) 50%, var(--color-cream-4));
		stroke-width: 1.4;
	}
	.desktop,
	.deskleg {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1;
	}
	.scroll {
		fill: var(--color-cream-4);
		stroke: var(--color-cream-3);
		stroke-width: 0.8;
	}
	.candle {
		stroke: var(--color-cream-2);
		stroke-width: 2.4;
	}
	.flame {
		fill: var(--color-accent-warning);
	}

	.plate {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 0.9;
	}
	.plate-name {
		font-size: 11.5px;
		letter-spacing: 0.06em;
		fill: var(--color-fg-muted);
		text-anchor: middle;
	}
	.status-note {
		font-size: 10.5px;
		fill: var(--color-fg-faint);
		text-anchor: middle;
	}
	.auto.working .status-note {
		fill: var(--accent-ink);
	}
	.auto.done .status-note {
		fill: var(--color-accent-success);
	}
	.auto.error .status-note,
	.auto.cancelled .status-note {
		fill: var(--color-accent-danger);
	}
</style>
