<script lang="ts">
	import type { Garden, Stage } from '$lib/demos/da-hitl';

	interface Props {
		garden: Garden;
		/** Bed currently under review, highlighted. */
		pendingBed?: number | null;
		/** Verb under review, shown as a floating label on that bed. */
		pendingAction?: string | null;
		/** Whether the gardener is mid-thought (animates the core). */
		thinking?: boolean;
	}
	let { garden, pendingBed = null, pendingAction = null, thinking = false }: Props = $props();

	// Four beds in a row to the right of the gardener.
	const BX = [300, 458, 616, 774];
	const BASE = 440; // soil baseline
	const BOX_W = 118;

	function bedX(i: number): number {
		return BX[i] ?? 300;
	}

	// Species → bloom/fruit color, drawn on mature plants.
	function speciesColor(species: string | null): string {
		const s = (species ?? '').toLowerCase();
		if (/rose|lavender|violet|iris/.test(s)) return 'var(--accent)';
		if (/tomato|pepper|chili|strawberr/.test(s)) return 'var(--color-accent-danger)';
		if (/sun|marigold|daffodil|calendula/.test(s)) return 'var(--color-accent-warning)';
		return 'var(--color-accent-success)';
	}
	function stemHeight(stage: Stage): number {
		return [0, 24, 44, 66][stage];
	}

	// Decorative hanging baskets that fill the glasshouse midground.
	const BASKETS = [
		{ x: 235, y: 232 },
		{ x: 470, y: 205 },
		{ x: 612, y: 250 }
	];
	function leafRows(stage: Stage): number[] {
		// y-offsets up the stem where leaf pairs sit
		if (stage <= 0) return [];
		if (stage === 1) return [14];
		if (stage === 2) return [14, 28];
		return [14, 30, 46];
	}

	const ACTION_LABEL: Record<string, string> = {
		plant: 'plant?',
		water: 'water?',
		prune: 'prune?',
		remove_pests_by_hand: 'de-bug?',
		spray_pesticide: 'spray?',
		ask_gardener: 'asking…'
	};
</script>

<svg viewBox="0 0 880 540" role="img" aria-label="The greenhouse beds" class="house">
	<defs>
		<radialGradient id="house-wash" cx="50%" cy="22%" r="75%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.1" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="house-bulb" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="var(--color-accent-warning)" stop-opacity="0.8" />
			<stop offset="100%" stop-color="var(--color-accent-warning)" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="house-core" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.9" />
			<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
		</radialGradient>
		<clipPath id="house-clip"><rect x="0" y="0" width="880" height="540" rx="10" /></clipPath>
	</defs>

	<g clip-path="url(#house-clip)">
		<rect x="0" y="0" width="880" height="540" fill="url(#house-wash)" />

		<!-- glasshouse roof: arched ribs + mullions -->
		<path d="M 20 150 Q 440 18 860 150" class="rib" />
		<path d="M 20 178 Q 440 52 860 178" class="rib faint" />
		{#each [80, 200, 320, 440, 560, 680, 800] as mx (mx)}
			<line x1={mx} y1="150" x2={mx} y2="92" class="mullion" />
		{/each}
		<line x1="20" y1="150" x2="860" y2="150" class="eave" />

		<!-- hanging bulbs -->
		{#each [200, 340, 480, 620] as gx (gx)}
			<g class="bulb">
				<line x1={gx} y1="150" x2={gx} y2="176" class="cord" />
				<circle cx={gx} cy="184" r="16" fill="url(#house-bulb)" opacity="0.55" />
				<circle cx={gx} cy="184" r="4" class="filament" />
			</g>
		{/each}

		<!-- back wall gauges -->
		{#each [{ x: 700, r: 26 }, { x: 770, r: 18 }, { x: 824, r: 14 }] as g (g.x)}
			<g class="gauge">
				<circle cx={g.x} cy="118" r={g.r} />
				<line x1={g.x} y1="118" x2={g.x + g.r * 0.5} y2={118 - g.r * 0.5} class="needle" />
				<circle cx={g.x} cy="118" r="2" class="hub" />
			</g>
		{/each}

		<!-- hanging baskets fill the glasshouse midground -->
		{#each BASKETS as b (b.x)}
			<g class="basket">
				<line x1={b.x} y1="150" x2={b.x} y2={b.y - 12} class="cord" />
				<line x1={b.x - 16} y1={b.y - 11} x2={b.x} y2={b.y - 2} class="cord thin" />
				<line x1={b.x + 16} y1={b.y - 11} x2={b.x} y2={b.y - 2} class="cord thin" />
				<path d="M {b.x - 18} {b.y - 10} A 18 12 0 0 0 {b.x + 18} {b.y - 10} Z" class="pot" />
				<!-- trailing vines -->
				{#each [-12, 2, 14] as vx, vi (vx)}
					<path
						d="M {b.x + vx} {b.y - 6} q {vi % 2 ? 8 : -8} 14 {vi % 2 ? 2 : -2} 30"
						class="vine"
					/>
					<ellipse cx={b.x + vx + (vi % 2 ? 5 : -5)} cy={b.y + 12} rx="5" ry="3" class="vleaf" />
					<ellipse cx={b.x + vx + (vi % 2 ? 2 : -2)} cy={b.y + 24} rx="4.5" ry="2.6" class="vleaf" />
				{/each}
			</g>
		{/each}

		<!-- ground -->
		<line x1="0" y1={BASE + 44} x2="880" y2={BASE + 44} class="ground" />

		<!-- ── the gardener automaton ── -->
		<g class="auto" class:thinking transform="translate(118 {BASE - 36})">
			<ellipse cx="0" cy="92" rx="34" ry="7" class="shadow" />
			<!-- legs/feet -->
			<rect x="-14" y="58" width="9" height="20" rx="3" class="limb" />
			<rect x="5" y="58" width="9" height="20" rx="3" class="limb" />
			<ellipse cx="-9.5" cy="80" rx="9" ry="4.5" class="foot" />
			<ellipse cx="9.5" cy="80" rx="9" ry="4.5" class="foot" />
			<!-- arm pointing toward the beds -->
			<path d="M 24 6 Q 56 0 92 -6" class="arm" />
			<circle cx="92" cy="-6" r="4" class="hand" />
			<path d="M -24 8 Q -40 18 -40 34" class="arm" />
			<circle cx="-40" cy="34" r="4" class="hand" />
			<!-- watering can in the back hand -->
			<g transform="translate(-48 30)">
				<rect x="-10" y="-8" width="18" height="14" rx="3" class="can" />
				<path d="M 8 -4 L 20 -10 L 22 -7 L 10 0 Z" class="can" />
				<rect x="-12" y="-14" width="6" height="7" rx="2" class="can" />
			</g>
			<!-- torso + glowing core -->
			<rect x="-24" y="-14" width="48" height="50" rx="10" class="body" />
			<circle cx="0" cy="14" r="16" fill="url(#house-core)" class="coreglow" />
			<circle cx="0" cy="14" r="9" class="porthole" />
			<g class="gear" class:spin={thinking}>
				<circle cx="0" cy="14" r="6" class="gear-rim" />
				{#each [0, 60, 120] as a (a)}
					<line x1="0" y1="7" x2="0" y2="21" class="gear-spoke" transform="rotate({a} 0 14)" />
				{/each}
			</g>
			<!-- head -->
			<circle cx="0" cy="-32" r="16" class="head" />
			<path d="M -14 -41 A 14 14 0 0 1 14 -41 L 16 -38 L -16 -38 Z" class="cap" />
			<circle cx="-5.5" cy="-33" r="2.6" class="eye" />
			<circle cx="5.5" cy="-33" r="2.6" class="eye" />
			<line x1="0" y1="-48" x2="0" y2="-55" class="antenna" />
			<circle cx="0" cy="-58" r="3" class="bulbtip" />
			<rect x="-44" y="98" width="88" height="16" rx="3" class="plate" />
			<text x="0" y="110" class="plate-name">The Automaton</text>
		</g>

		<!-- ── beds ── -->
		{#each garden.plots as p, i (p.id)}
			{@const bx = bedX(i)}
			{@const pending = pendingBed === p.id}
			<g class="bed {p.health}" class:pending>
				{#if pending}
					<rect
						x={bx - BOX_W / 2 - 8}
						y={BASE - 96}
						width={BOX_W + 16}
						height="150"
						rx="12"
						class="ring"
					/>
				{/if}

				<!-- planter box -->
				<rect x={bx - BOX_W / 2} y={BASE} width={BOX_W} height="44" rx="5" class="box" />
				<rect x={bx - BOX_W / 2} y={BASE} width={BOX_W} height="12" rx="5" class="soil" />

				<!-- the plant -->
				{#if p.stage > 0}
					{@const h = stemHeight(p.stage)}
					{@const overgrown = p.health === 'overgrown'}
					<line x1={bx} y1={BASE} x2={bx} y2={BASE - h} class="stem" />
					{#each leafRows(p.stage) as ly, li (li)}
						<ellipse cx={bx - 11} cy={BASE - ly} rx="10" ry="5" class="leaf" transform="rotate(-22 {bx - 11} {BASE - ly})" />
						<ellipse cx={bx + 11} cy={BASE - ly} rx="10" ry="5" class="leaf" transform="rotate(22 {bx + 11} {BASE - ly})" />
						{#if overgrown}
							<ellipse cx={bx - 17} cy={BASE - ly - 6} rx="9" ry="4" class="leaf wild" transform="rotate(-50 {bx - 17} {BASE - ly - 6})" />
							<ellipse cx={bx + 17} cy={BASE - ly - 6} rx="9" ry="4" class="leaf wild" transform="rotate(50 {bx + 17} {BASE - ly - 6})" />
						{/if}
					{/each}
					{#if p.stage >= 3}
						<circle cx={bx} cy={BASE - h - 4} r="7" class="bloom" style:fill={speciesColor(p.species)} />
						<circle cx={bx - 12} cy={BASE - h + 4} r="4.5" class="bloom" style:fill={speciesColor(p.species)} />
						<circle cx={bx + 12} cy={BASE - h + 4} r="4.5" class="bloom" style:fill={speciesColor(p.species)} />
					{/if}
					{#if p.health === 'pests'}
						{#each [[-8, 18], [9, 24], [-3, 30], [12, 14]] as [dx, dy] (dx)}
							<circle cx={bx + dx} cy={BASE - dy} r="2.2" class="aphid" />
						{/each}
					{/if}
				{:else}
					<!-- empty: little soil furrows -->
					{#each [-22, 0, 22] as dx (dx)}
						<line x1={bx + dx} y1={BASE + 4} x2={bx + dx} y2={BASE + 9} class="furrow" />
					{/each}
				{/if}

				<!-- nameplate -->
				<rect x={bx - 40} y={BASE + 52} width="80" height="16" rx="3" class="plate" />
				<text x={bx} y={BASE + 64} class="plate-name">{p.name}</text>
				<text x={bx} y={BASE + 84} class="plate-sub">
					{p.health === 'empty' ? 'empty' : `${p.species} · ${['', 'seedling', 'sprout', 'mature'][p.stage]}`}
				</text>

				{#if pending && pendingAction}
					<g class="action-tag" transform="translate({bx} {BASE - 112})">
						<rect x="-30" y="-13" width="60" height="22" rx="11" />
						<text x="0" y="2">{ACTION_LABEL[pendingAction] ?? pendingAction}</text>
					</g>
				{/if}
			</g>
		{/each}
	</g>
</svg>

<style>
	.house {
		display: block;
		width: 100%;
		height: auto;
		background: var(--color-paper);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.rib {
		fill: none;
		stroke: color-mix(in oklch, var(--color-rule) 60%, transparent);
		stroke-width: 1.6;
	}
	.rib.faint {
		stroke: color-mix(in oklch, var(--color-rule) 32%, transparent);
		stroke-width: 1;
	}
	.mullion {
		stroke: color-mix(in oklch, var(--color-rule) 38%, transparent);
		stroke-width: 1;
	}
	.eave {
		stroke: color-mix(in oklch, var(--color-rule) 55%, transparent);
		stroke-width: 1.4;
	}
	.bulb .cord {
		stroke: color-mix(in oklch, var(--color-rule) 50%, transparent);
		stroke-width: 1;
	}
	.bulb .filament {
		fill: color-mix(in oklch, var(--color-accent-warning) 60%, var(--color-cream-3));
	}
	.gauge circle {
		fill: none;
		stroke: color-mix(in oklch, var(--color-rule) 45%, transparent);
		stroke-width: 1.3;
	}
	.gauge .needle {
		stroke: color-mix(in oklch, var(--color-rule) 70%, transparent);
		stroke-width: 1.4;
	}
	.gauge .hub {
		fill: color-mix(in oklch, var(--color-rule) 70%, transparent);
	}
	.basket .cord {
		stroke: color-mix(in oklch, var(--color-rule) 45%, transparent);
		stroke-width: 1;
	}
	.basket .cord.thin {
		stroke-width: 0.8;
	}
	.basket .pot {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.basket .vine {
		fill: none;
		stroke: color-mix(in oklch, var(--color-accent-success) 65%, var(--color-ink-2));
		stroke-width: 1.4;
	}
	.basket .vleaf {
		fill: color-mix(in oklch, var(--color-accent-success) 60%, var(--color-ink-2));
	}
	.ground {
		stroke: var(--color-rule);
		stroke-width: 1.4;
	}

	/* automaton */
	.shadow {
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
	.auto .limb,
	.auto .foot {
		fill: var(--color-ink-3);
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
		stroke-width: 1.1;
	}
	.auto .can {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.1;
	}
	.auto .cap {
		fill: color-mix(in oklch, var(--color-accent-success) 30%, var(--color-ink-2));
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.auto .eye {
		fill: var(--color-cream-3);
	}
	.auto.thinking .eye {
		fill: var(--accent);
	}
	.auto .antenna {
		stroke: var(--color-cream-4);
		stroke-width: 1.4;
	}
	.auto .bulbtip {
		fill: var(--color-cream-4);
	}
	.auto.thinking .bulbtip {
		fill: var(--accent);
		animation: pulse 1.1s ease-in-out infinite;
	}
	.coreglow {
		opacity: 0.35;
	}
	.auto.thinking .coreglow {
		animation: pulse 1.5s ease-in-out infinite;
	}
	.porthole {
		fill: var(--color-ink-0);
		stroke: var(--color-cream-4);
		stroke-width: 1.2;
	}
	.gear-rim {
		fill: none;
		stroke: var(--color-cream-3);
		stroke-width: 1.4;
	}
	.gear-spoke {
		stroke: var(--color-cream-3);
		stroke-width: 1;
	}
	.gear {
		transform-box: fill-box;
		transform-origin: center;
	}
	.gear.spin {
		animation: spin 2.6s linear infinite;
	}

	/* beds */
	.box {
		fill: var(--color-ink-1);
		stroke: var(--color-cream-4);
		stroke-width: 1.3;
	}
	.soil {
		fill: color-mix(in oklch, var(--color-ink-3) 70%, var(--color-cream-4));
		stroke: none;
	}
	.furrow {
		stroke: color-mix(in oklch, var(--color-cream-4) 40%, transparent);
		stroke-width: 1.4;
	}
	.stem {
		stroke: var(--color-accent-success);
		stroke-width: 2.4;
		stroke-linecap: round;
	}
	.leaf {
		fill: color-mix(in oklch, var(--color-accent-success) 70%, var(--color-ink-2));
		stroke: color-mix(in oklch, var(--color-accent-success) 85%, var(--color-cream-4));
		stroke-width: 0.8;
	}
	.leaf.wild {
		fill: color-mix(in oklch, var(--color-accent-warning) 55%, var(--color-ink-2));
	}
	.bloom {
		stroke: var(--color-cream-4);
		stroke-width: 0.8;
	}
	.aphid {
		fill: var(--color-accent-danger);
		opacity: 0.9;
	}

	.bed .box {
		transition: stroke 0.25s ease;
	}
	.bed.pests .box {
		stroke: color-mix(in oklch, var(--color-accent-danger) 55%, var(--color-cream-4));
	}
	.bed.overgrown .box {
		stroke: color-mix(in oklch, var(--color-accent-warning) 55%, var(--color-cream-4));
	}
	.bed.healthy .box {
		stroke: color-mix(in oklch, var(--color-accent-success) 45%, var(--color-cream-4));
	}

	.ring {
		fill: color-mix(in oklch, var(--accent) 7%, transparent);
		stroke: var(--accent);
		stroke-width: 1.8;
		stroke-dasharray: 6 5;
		animation: dash 0.9s linear infinite;
	}
	.action-tag rect {
		fill: var(--accent);
	}
	.action-tag text {
		fill: var(--accent-contrast, #1a1206);
		font-size: 11px;
		font-weight: 600;
		text-anchor: middle;
	}

	.plate {
		fill: var(--color-ink-1);
		stroke: var(--color-border-strong);
		stroke-width: 0.9;
	}
	.plate-name {
		font-size: 11px;
		letter-spacing: 0.04em;
		fill: var(--color-fg-muted);
		text-anchor: middle;
	}
	.plate-sub {
		font-size: 10px;
		fill: var(--color-fg-faint);
		text-anchor: middle;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.4;
		}
	}
	@keyframes dash {
		to {
			stroke-dashoffset: -22;
		}
	}
</style>
