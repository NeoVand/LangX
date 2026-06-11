<script lang="ts">
	import {
		CATALOG,
		BACKGROUND_STARS,
		type Chart,
		type SkyRegion
	} from '$lib/demos/da-backends';

	interface Props {
		/** The durable atlas — drives everything that glows. */
		chart: Chart;
		/** Regions surveyed tonight (reticles): looked at, not yet engraved. */
		surveyed?: string[];
		/** Currently selected region id (ring highlight). */
		selected?: string | null;
		/** 'flat' = equirectangular atlas sheet · 'sphere' = drag-to-rotate globe. */
		mode?: 'flat' | 'sphere';
		onselect?: (region: SkyRegion, chartedNight: number | null) => void;
	}
	let { chart, surveyed = [], selected = null, mode = 'flat', onselect }: Props = $props();

	const chartedMap = $derived(new Map(chart.charted.map((e) => [e.region, e.night])));

	// ── Projections ────────────────────────────────────────────────────────────
	// Flat: an equirectangular northern atlas sheet (Dec +90…−50). RA increases
	// to the LEFT, like a real sky map, with the seam parked at RA 110° — a gap
	// where no chartable constellation lives, so no figure ever crosses an edge.
	// Sphere: an orthographic celestial globe, viewed from outside, rotated by
	// dragging.
	const W = 1000;
	const H = 560;
	const SEAM = 110;
	const RAD = Math.PI / 180;

	interface Pt {
		x: number;
		y: number;
		front: boolean;
	}

	function flatProject(ra: number, dec: number): Pt {
		const r = (ra - SEAM + 360) % 360;
		return {
			x: 20 + (1 - r / 360) * 960,
			y: 28 + ((90 - dec) / 140) * 504,
			front: dec >= -50
		};
	}

	// Sphere rotation, in degrees. Initial view: the Cassiopeia–Andromeda shore.
	let lon = $state(20);
	let lat = $state(45);

	function sphereProject(ra: number, dec: number, lonV: number, latV: number): Pt {
		const R = 252;
		const lr = (ra - lonV) * RAD;
		const dr = dec * RAD;
		const x = Math.cos(dr) * Math.cos(lr);
		const y = Math.cos(dr) * Math.sin(lr);
		const z = Math.sin(dr);
		const tilt = latV * RAD;
		const x2 = x * Math.cos(tilt) + z * Math.sin(tilt);
		const z2 = -x * Math.sin(tilt) + z * Math.cos(tilt);
		return { x: 500 - R * y, y: 285 - R * z2, front: x2 > 0.01 };
	}

	const project = $derived(
		mode === 'flat'
			? (ra: number, dec: number) => flatProject(ra, dec)
			: (ra: number, dec: number) => sphereProject(ra, dec, lon, lat)
	);

	// ── Drag to rotate the sphere ──────────────────────────────────────────────
	let dragging = $state(false);
	let last = { x: 0, y: 0 };
	let pending: { dx: number; dy: number } | null = null;
	let raf = 0;

	function onDown(e: PointerEvent) {
		if (mode !== 'sphere') return;
		dragging = true;
		last = { x: e.clientX, y: e.clientY };
		(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
	}
	function onMove(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - last.x;
		const dy = e.clientY - last.y;
		last = { x: e.clientX, y: e.clientY };
		pending = { dx: (pending?.dx ?? 0) + dx, dy: (pending?.dy ?? 0) + dy };
		if (!raf) {
			raf = requestAnimationFrame(() => {
				if (pending) {
					lon = (lon + pending.dx * 0.35 + 360) % 360;
					lat = Math.max(-89, Math.min(89, lat + pending.dy * 0.35));
					pending = null;
				}
				raf = 0;
			});
		}
	}
	function onUp() {
		dragging = false;
	}

	// ── Scene assembly ─────────────────────────────────────────────────────────
	const bgStars = $derived.by(() =>
		BACKGROUND_STARS.map(([ra, dec, mag]) => ({ p: project(ra, dec), mag })).filter(
			(s) => s.p.front
		)
	);

	interface RegionView {
		region: SkyRegion;
		night: number | null;
		fresh: boolean;
		surveyedNow: boolean;
		cx: number;
		cy: number;
		hitR: number;
		front: boolean;
		stars: { x: number; y: number; mag: number; name?: string }[];
		segs: { x1: number; y1: number; x2: number; y2: number }[];
	}

	const views = $derived.by((): RegionView[] =>
		CATALOG.map((region) => {
			// Centroid via 3D mean — immune to the RA wrap.
			let mx = 0,
				my = 0,
				mz = 0;
			for (const s of region.stars) {
				mx += Math.cos(s.dec * RAD) * Math.cos(s.ra * RAD);
				my += Math.cos(s.dec * RAD) * Math.sin(s.ra * RAD);
				mz += Math.sin(s.dec * RAD);
			}
			const cRa = ((Math.atan2(my, mx) / RAD) + 360) % 360;
			const cDec = Math.atan2(mz, Math.hypot(mx, my)) / RAD;
			const c = project(cRa, cDec);

			const stars = region.stars
				.map((s) => ({ p: project(s.ra, s.dec), mag: s.mag, name: s.name }))
				.filter((s) => s.p.front)
				.map((s) => ({ x: s.p.x, y: s.p.y, mag: s.mag, name: s.name }));

			const segs = region.segments
				.map(([[ra1, dec1], [ra2, dec2]]) => ({ a: project(ra1, dec1), b: project(ra2, dec2) }))
				.filter(({ a, b }) => a.front && b.front)
				.map(({ a, b }) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }));

			const hitR = Math.min(
				120,
				Math.max(30, ...stars.map((s) => Math.hypot(s.x - c.x, s.y - c.y) + 14))
			);
			const night = chartedMap.get(region.id) ?? null;
			return {
				region,
				night,
				fresh: night !== null && night === chart.night,
				surveyedNow: surveyed.includes(region.id) && night === null,
				cx: c.x,
				cy: c.y,
				hitR,
				front: c.front && stars.length > 0,
				stars,
				segs
			};
		})
	);

	// The sphere's equator, as visible polyline runs.
	const equator = $derived.by(() => {
		if (mode !== 'sphere') return [];
		const runs: string[] = [];
		let run: string[] = [];
		for (let ra = 0; ra <= 360; ra += 4) {
			const p = sphereProject(ra, 0, lon, lat);
			if (p.front) run.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
			else if (run.length > 1) {
				runs.push(run.join(' '));
				run = [];
			} else run = [];
		}
		if (run.length > 1) runs.push(run.join(' '));
		return runs;
	});

	const bgR = (mag: number) => Math.max(0.6, 2.4 - mag * 0.38);
	const bgO = (mag: number) => Math.max(0.16, 0.8 - mag * 0.13);
	const figR = (mag: number) => Math.max(1.7, 4.0 - mag * 0.55);

	const chartedCount = $derived(chart.charted.length);
</script>

<div class="sky" class:globe={mode === 'sphere'}>
	<svg
		viewBox="0 0 {W} {H}"
		role="img"
		aria-label="The star atlas — real Hipparcos star positions; charted constellations glow."
		class:dragging
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onpointercancel={onUp}
	>
		{#if mode === 'flat'}
			<g class="grid">
				{#each [60, 30, 0, -30] as dec (dec)}
					<line
						x1="20"
						y1={flatProject(SEAM + 0.1, dec).y}
						x2="980"
						y2={flatProject(SEAM + 0.1, dec).y}
					/>
				{/each}
				{#each [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as ra (ra)}
					<line x1={flatProject(ra, 0).x} y1="28" x2={flatProject(ra, 0).x} y2="532" />
				{/each}
			</g>
		{:else}
			<circle class="limb" cx="500" cy="285" r="252" />
			{#each equator as run, i (i)}
				<polyline class="grid-line" points={run} />
			{/each}
		{/if}

		<!-- the real sky: every star to magnitude 5 -->
		<g class="field">
			{#each bgStars as s, i (i)}
				<circle class="bg" cx={s.p.x} cy={s.p.y} r={bgR(s.mag)} opacity={bgO(s.mag)} />
			{/each}
		</g>

		{#each views as v (v.region.id)}
			{#if v.front}
				<g
					class="region"
					class:lit={v.night !== null}
					class:fresh={v.fresh}
					role="button"
					tabindex="0"
					aria-label="{v.region.name}{v.night !== null
						? `, charted night ${v.night}`
						: ', uncharted'}"
					onclick={() => onselect?.(v.region, v.night)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onselect?.(v.region, v.night);
						}
					}}
				>
					<circle class="hit" cx={v.cx} cy={v.cy} r={v.hitR} />
					{#if v.night === null}
						<text class="hint" x={v.cx} y={v.cy}>{v.region.name} · uncharted</text>
					{/if}

					{#if selected === v.region.id}
						<circle class="ring" cx={v.cx} cy={v.cy} r={v.hitR} />
					{/if}
					{#if v.surveyedNow}
						<circle class="reticle" cx={v.cx} cy={v.cy} r={Math.max(v.hitR - 6, 20)} />
					{/if}

					{#if v.night !== null}
						{#each v.segs as s, si (si)}
							<line class="figure" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
						{/each}
						{#each v.stars as star, si (si)}
							{#if v.fresh}
								<circle class="halo" cx={star.x} cy={star.y} r={figR(star.mag) * 2.6} />
							{/if}
							<circle
								class="star lit"
								cx={star.x}
								cy={star.y}
								r={figR(star.mag)}
								style="animation-delay: {((si * 0.9 + v.cx * 0.01) % 3.6).toFixed(2)}s"
							/>
							{#if star.name && star.mag <= 2.6}
								<text class="starname" x={star.x + 6} y={star.y - 5}>{star.name}</text>
							{/if}
						{/each}
						<text class="label" x={v.cx} y={v.cy + v.hitR + 4}>
							{v.region.name} · n{v.night}
						</text>
					{/if}
				</g>
			{/if}
		{/each}

		<text class="cartouche" x="980" y="550">
			{mode === 'sphere' ? 'DRAG TO TURN THE SPHERE · ' : ''}NIGHT {chart.night} · {chartedCount}/{CATALOG.length}
			CHARTED
		</text>
	</svg>
</div>

<style>
	.sky {
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		overflow: hidden;
		background: #06070c;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.globe svg {
		cursor: grab;
		touch-action: none;
	}
	.globe svg.dragging {
		cursor: grabbing;
	}

	.grid line,
	.grid-line {
		fill: none;
		stroke: #b08d57;
		stroke-opacity: 0.08;
		stroke-width: 1;
	}
	.limb {
		fill: #090a12;
		stroke: #b08d57;
		stroke-opacity: 0.35;
		stroke-width: 1.2;
	}

	.bg {
		fill: #aab3cf;
	}

	.region {
		cursor: pointer;
		outline: none;
	}
	.hit {
		fill: transparent;
	}
	.region:hover .hit,
	.region:focus-visible .hit {
		fill: color-mix(in oklch, var(--accent) 5%, transparent);
	}
	.hint {
		display: none;
		fill: #b08d57;
		opacity: 0.7;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-anchor: middle;
		pointer-events: none;
	}
	.region:hover .hint,
	.region:focus-visible .hint {
		display: block;
	}
	.ring {
		fill: none;
		stroke: var(--accent);
		stroke-opacity: 0.55;
		stroke-width: 1.2;
		stroke-dasharray: 3 4;
	}
	.reticle {
		fill: none;
		stroke: #b08d57;
		stroke-opacity: 0.4;
		stroke-width: 1;
		stroke-dasharray: 5 5;
	}

	.star.lit {
		fill: color-mix(in oklch, var(--accent) 35%, #f4f1ff);
		opacity: 0.92;
		animation: twinkle 3.6s ease-in-out infinite;
	}
	.halo {
		fill: var(--accent);
		opacity: 0.16;
		animation: breathe 2.4s ease-in-out infinite;
	}
	.figure {
		stroke: #b08d57;
		stroke-opacity: 0.55;
		stroke-width: 1.1;
	}
	.fresh .figure {
		stroke: color-mix(in oklch, var(--accent) 60%, #b08d57);
		stroke-opacity: 0.75;
	}

	.label {
		fill: #b08d57;
		opacity: 0.85;
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		text-anchor: middle;
		dominant-baseline: hanging;
		pointer-events: none;
	}
	.fresh .label {
		fill: color-mix(in oklch, var(--accent) 55%, #b08d57);
	}
	.starname {
		fill: #cdd3ea;
		opacity: 0.55;
		font-family: var(--font-mono);
		font-size: 9px;
		pointer-events: none;
	}
	.cartouche {
		fill: #b08d57;
		opacity: 0.6;
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-anchor: end;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.92;
		}
		50% {
			opacity: 0.55;
		}
	}
	@keyframes breathe {
		0%,
		100% {
			opacity: 0.16;
		}
		50% {
			opacity: 0.05;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.star.lit,
		.halo {
			animation: none;
		}
	}
</style>
