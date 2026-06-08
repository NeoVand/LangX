<script lang="ts">
	/**
	 * A hands-on feel for embeddings and cosine similarity. Type up to three phrases,
	 * embed them with a real model, and see each as a unit vector on a rotating
	 * sphere. Cosine similarity is the cosine of the ANGLE between two vectors — and
	 * because any three vectors fit exactly in 3-D, the sphere shows the REAL angles
	 * (the arcs between arrows), with no projection error. The table lists the exact
	 * cosine + angle for every pair.
	 */
	import { embedText, cosineSimilarity } from '$lib/demos/agentic-rag';
	import { EMBEDDINGS_PROVIDERS, type EmbeddingsProviderId } from '$lib/runtime/rag/registry';

	const SLOTS = [
		{ id: 'A', color: 'var(--accent)' },
		{ id: 'B', color: 'oklch(0.8 0.13 195)' },
		{ id: 'C', color: 'oklch(0.74 0.15 320)' }
	];

	let texts = $state([
		'I love hiking in the mountains during the summer.',
		'Trekking through the hills in warm weather is my favorite pastime.',
		'The stock market dropped sharply after the rate announcement.'
	]);
	let provider = $state<EmbeddingsProviderId>('local');
	let busy = $state(false);
	let error = $state('');
	let res = $state<{ vecs: (number[] | null)[]; pos3: ([number, number, number] | null)[] } | null>(
		null
	);

	const providers = $derived(EMBEDDINGS_PROVIDERS.filter((p) => p.available()));
	const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

	// Place the filled embeddings as EXACT unit vectors in 3-D: their pairwise angles
	// are reproduced perfectly (three vectors always span ≤ 3-D). v1 on the x-axis,
	// v2 in the xy-plane at the true angle, v3 solved to hit both remaining angles.
	function placeVectors(vecs: (number[] | null)[]): ([number, number, number] | null)[] {
		const filled = vecs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
		const pos: ([number, number, number] | null)[] = vecs.map(() => null);
		const cos = (i: number, j: number) => clamp1(cosineSimilarity(vecs[i]!, vecs[j]!));
		if (filled.length >= 1) pos[filled[0]] = [1, 0, 0];
		if (filled.length >= 2) {
			const c = cos(filled[0], filled[1]);
			pos[filled[1]] = [c, Math.sqrt(Math.max(0, 1 - c * c)), 0];
		}
		if (filled.length >= 3) {
			const c12 = cos(filled[0], filled[1]);
			const c13 = cos(filled[0], filled[2]);
			const c23 = cos(filled[1], filled[2]);
			const s12 = Math.sqrt(Math.max(1e-9, 1 - c12 * c12));
			const x = c13;
			const y = (c23 - c13 * c12) / s12;
			const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
			pos[filled[2]] = [x, y, z];
		}
		return pos;
	}

	async function run() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const vecs = await Promise.all(
				texts.map((t) => (t.trim() ? embedText(t.trim(), provider) : Promise.resolve(null)))
			);
			res = { vecs, pos3: placeVectors(vecs) };
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// ── Rotating-sphere scene (auto-spins; drag with the mouse to rotate) ──────
	let spin = $state(0.5);
	let tilt = $state(0.42);
	let hovering = $state(false);
	let dragging = $state(false);
	let lastPt = { x: 0, y: 0 };
	$effect(() => {
		let raf = 0;
		let prev = 0;
		const loop = (t: number) => {
			if (prev && !hovering && !dragging) spin += (t - prev) * 0.0003;
			prev = t;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	function onDown(e: PointerEvent) {
		dragging = true;
		lastPt = { x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onDrag(e: PointerEvent) {
		if (!dragging) return;
		spin += (e.clientX - lastPt.x) * 0.01;
		tilt = Math.max(-1.4, Math.min(1.4, tilt + (e.clientY - lastPt.y) * 0.01));
		lastPt = { x: e.clientX, y: e.clientY };
	}
	function onUp(e: PointerEvent) {
		dragging = false;
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
	}

	const VB = 240;
	const CEN = 120;
	const SR = 94; // sphere radius in viewBox units

	const active = $derived(res ? res.vecs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0) : []);
	const pairs = $derived.by(() => {
		if (!res) return [] as { a: number; b: number; cos: number; deg: number }[];
		const out = [];
		for (let x = 0; x < active.length; x++)
			for (let y = x + 1; y < active.length; y++) {
				const i = active[x];
				const j = active[y];
				const c = cosineSimilarity(res.vecs[i]!, res.vecs[j]!);
				out.push({ a: i, b: j, cos: c, deg: (Math.acos(clamp1(c)) * 180) / Math.PI });
			}
		return out;
	});

	const scene = $derived.by(() => {
		if (!res) return null;
		const pos3 = res.pos3;
		const cs = Math.cos(spin);
		const sn = Math.sin(spin);
		const ct = Math.cos(tilt);
		const st = Math.sin(tilt);
		// rotate around Y by `spin`, then tilt around X, then orthographic project.
		const proj = (p: [number, number, number]) => {
			const x = p[0] * cs + p[2] * sn;
			const zz = -p[0] * sn + p[2] * cs;
			const y = p[1];
			const ry = y * ct - zz * st;
			const rz = y * st + zz * ct;
			return { x: CEN + SR * x, y: CEN - SR * ry, z: rz };
		};
		const arrows = active
			.map((i) => ({ idx: i, id: SLOTS[i].id, color: SLOTS[i].color, tip: proj(pos3[i]!) }))
			.sort((a, b) => a.tip.z - b.tip.z); // back to front
		// equator wireframe (a great circle in the xz-plane) for a sphere feel
		const wire = Array.from({ length: 64 }, (_, k) => {
			const t = (k / 64) * 2 * Math.PI;
			return proj([Math.cos(t), 0, Math.sin(t)]);
		});
		// angle arc between each pair, drawn as a geodesic at a small radius
		const ARC = 0.5;
		const arcs = pairs.map((pr) => {
			const a = pos3[pr.a]!;
			const b = pos3[pr.b]!;
			const om = Math.acos(clamp1(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
			const so = Math.sin(om) || 1;
			const slerp = (t: number): [number, number, number] => {
				const w1 = Math.sin((1 - t) * om) / so;
				const w2 = Math.sin(t * om) / so;
				return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
			};
			const pts = Array.from({ length: 19 }, (_, k) => {
				const v = slerp(k / 18);
				return proj([v[0] * ARC, v[1] * ARC, v[2] * ARC]);
			});
			const m = slerp(0.5);
			const lab = proj([m[0] * (ARC + 0.18), m[1] * (ARC + 0.18), m[2] * (ARC + 0.18)]);
			return {
				key: `${pr.a}-${pr.b}`,
				pts,
				lab,
				deg: pr.deg,
				c1: SLOTS[pr.a].color,
				c2: SLOTS[pr.b].color
			};
		});
		return { arrows, wire, arcs };
	});

	const pointStr = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
	const clampVB = (v: number) => Math.max(8, Math.min(VB - 8, v));

	// Similarity → color: faint cool grey when unrelated, vivid warm gold when alike.
	const simColor = (cos: number) => {
		const t = Math.max(0, Math.min(1, (cos + 0.1) / 0.95));
		return `oklch(${(0.62 + 0.2 * t).toFixed(3)} ${(0.02 + 0.16 * t).toFixed(3)} 70)`;
	};
	const simBarPct = (cos: number) => (Math.max(0, Math.min(1, cos)) * 100).toFixed(1);
	const fmtCos = (cos: number) => cos.toFixed(2).replace('-', '−'); // real minus sign
</script>

<div class="explorer">
	<div class="rows">
		{#each SLOTS as slot, i (slot.id)}
			<label>
				<span class="tag" style="--c: {slot.color}">{slot.id}</span>
				<input
					bind:value={texts[i]}
					spellcheck="false"
					placeholder={i === 2 ? 'a third phrase (optional)' : 'a phrase…'}
				/>
			</label>
		{/each}
	</div>

	<div class="bar">
		<button class="go" onclick={run} disabled={busy}>{busy ? 'Embedding…' : 'Embed & compare'}</button>
		<label class="model">
			<span>model</span>
			<select bind:value={provider} onchange={() => res && run()} disabled={busy}>
				{#each providers as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
			</select>
		</label>
	</div>

	{#if error}
		<div class="err">{error} — the local model downloads once; hosted models need a key in Setup.</div>
	{/if}

	{#if res && scene}
		<div class="viz">
			<div
				class="globe"
				class:grabbing={dragging}
				role="presentation"
				onmouseenter={() => (hovering = true)}
				onmouseleave={() => (hovering = false)}
				onpointerdown={onDown}
				onpointermove={onDrag}
				onpointerup={onUp}
				onpointercancel={onUp}
			>
				<svg viewBox="0 0 {VB} {VB}" role="img" aria-label="Phrase embeddings as vectors on a sphere">
					<defs>
						<!-- lit-orb shading: highlight offset to upper-left, shaded rim -->
						<radialGradient id="ee-sphere" cx="50%" cy="50%" r="58%" fx="34%" fy="30%">
							<stop offset="0%" stop-color="color-mix(in oklch, var(--accent) 18%, var(--color-bg-elev-2))" />
							<stop offset="46%" stop-color="color-mix(in oklch, var(--accent) 5%, var(--color-bg-elev-2))" />
							<stop offset="100%" stop-color="color-mix(in oklch, #000 34%, var(--color-bg-elev-2))" />
						</radialGradient>
						<!-- inner shadow on the lower-right to deepen the curve -->
						<radialGradient id="ee-terminator" cx="50%" cy="50%" r="52%" fx="68%" fy="74%">
							<stop offset="62%" stop-color="#000" stop-opacity="0" />
							<stop offset="100%" stop-color="#000" stop-opacity="0.32" />
						</radialGradient>
						<filter id="ee-shadow" x="-40%" y="-40%" width="180%" height="180%">
							<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.45" />
						</filter>
						{#each SLOTS as slot, i (i)}
							<marker
								id="ee-head-{i}"
								viewBox="0 0 10 10"
								refX="8"
								refY="5"
								markerWidth="6.5"
								markerHeight="6.5"
								orient="auto-start-reverse"
							>
								<path d="M1 1 L9 5 L1 9 Z" fill={slot.color} />
							</marker>
						{/each}
						{#each scene.arcs as a (a.key)}
							<linearGradient
								id="ee-arc-{a.key}"
								gradientUnits="userSpaceOnUse"
								x1={a.pts[0].x}
								y1={a.pts[0].y}
								x2={a.pts[a.pts.length - 1].x}
								y2={a.pts[a.pts.length - 1].y}
							>
								<stop offset="0" stop-color={a.c1} />
								<stop offset="1" stop-color={a.c2} />
							</linearGradient>
						{/each}
					</defs>

					<circle
						class="sphere"
						cx={CEN}
						cy={CEN}
						r={SR}
						fill="url(#ee-sphere)"
						filter="url(#ee-shadow)"
					/>
					<circle class="terminator" cx={CEN} cy={CEN} r={SR} fill="url(#ee-terminator)" />
					<polyline class="wire" points={pointStr(scene.wire)} />

					{#each scene.arcs as a (a.key)}
						<polyline class="arc" points={pointStr(a.pts)} stroke="url(#ee-arc-{a.key})" />
						<text class="arc-label" x={clampVB(a.lab.x)} y={clampVB(a.lab.y)}>{a.deg.toFixed(0)}°</text>
					{/each}

					{#each scene.arrows as ar (ar.id)}
						<line
							class="vec"
							x1={CEN}
							y1={CEN}
							x2={ar.tip.x}
							y2={ar.tip.y}
							style="--c: {ar.color}; opacity: {(0.45 + 0.55 * ((ar.tip.z + 1) / 2)).toFixed(2)}"
							marker-end="url(#ee-head-{ar.idx})"
						/>
						<text
							class="vlabel"
							style="--c: {ar.color}"
							x={clampVB(CEN + (ar.tip.x - CEN) * 1.16)}
							y={clampVB(CEN + (ar.tip.y - CEN) * 1.16) + 3}>{ar.id}</text
						>
					{/each}

					<!-- origin: where every vector starts -->
					<circle class="origin" cx={CEN} cy={CEN} r="3.2" />
				</svg>
			</div>

			{#if pairs.length}
				<table class="calc">
					<thead>
						<tr>
							<th class="ph"></th>
							<th class="hsim">similarity</th>
							<th class="hdeg">θ</th>
						</tr>
					</thead>
					<tbody>
						{#each pairs as pr (pr.a + '-' + pr.b)}
							<tr>
								<td class="pair-cell">
									<span
										class="swatch"
										style="background: linear-gradient(90deg, {SLOTS[pr.a].color}, {SLOTS[pr.b].color})"
									></span>
									<span class="pid">{SLOTS[pr.a].id}·{SLOTS[pr.b].id}</span>
								</td>
								<td class="cosv-cell">
									<span class="cosv" style="color: {simColor(pr.cos)}">{fmtCos(pr.cos)}</span>
									<span class="meter">
										<span
											class="meter-fill"
											style="width: {simBarPct(pr.cos)}%; background: {simColor(pr.cos)}"
										></span>
									</span>
								</td>
								<td class="degv">{pr.deg.toFixed(0)}°</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<div class="note">
			{#if pairs.length}Cosine = cos θ: same direction → 1 (0°); unrelated → ~0 (≈ 90°). The sphere
				shows the embeddings' real directions — the arcs mark the exact angle between each pair (it spins
				so you can see all three; hover to pause).{:else}Add a second phrase to see the angle between
				two meanings.{/if}
		</div>
	{/if}
</div>

<style>
	.explorer {
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		padding: 0.7rem;
		background: var(--color-bg-elev-2, #1c1814);
		margin: 1rem 0;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.rows label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.rows input {
		flex: 1;
		box-sizing: border-box;
		padding: 0.28rem 0.5rem;
		border-radius: 0.35rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-fg);
		font-family: var(--font-sans);
		font-size: 0.76rem;
		font-weight: 300;
		transition: border-color 0.15s ease;
	}
	.rows input:focus,
	.rows input:focus-visible {
		outline: none;
		box-shadow: none;
		border-color: var(--accent);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.05rem;
		height: 1.05rem;
		border-radius: 50%;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 500;
		flex-shrink: 0;
		color: var(--c);
		border: 1px solid var(--c);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}
	.go {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 500;
		line-height: 1.2;
		padding: 0.32rem 0.78rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		background: linear-gradient(
			155deg,
			color-mix(in oklch, var(--accent) 26%, var(--color-bg-elev-2)),
			var(--color-bg-elev-2)
		);
		color: var(--accent);
		cursor: pointer;
		transition:
			filter 0.15s ease,
			opacity 0.15s ease;
	}
	.go:hover:not(:disabled) {
		filter: brightness(1.12);
	}
	.go:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.model {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-300);
	}
	.model select {
		appearance: none;
		-webkit-appearance: none;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.2;
		color: var(--color-fg);
		padding: 0.32rem 1.4rem 0.32rem 0.55rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		background:
			var(--color-paper)
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23a99a86' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
			no-repeat right 0.5rem center;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}
	.model select:hover {
		border-color: var(--accent-rule);
	}
	.model select:focus,
	.model select:focus-visible {
		outline: none;
		box-shadow: none;
		border-color: var(--accent);
	}
	.err {
		color: var(--color-accent-warning);
		font-size: 0.76rem;
		margin: 0.5rem 0 0;
	}

	/* Sphere + calculations table, side by side and prominent. */
	.viz {
		display: flex;
		gap: 1.2rem;
		align-items: center;
		justify-content: center;
		margin-top: 0.8rem;
		flex-wrap: wrap;
	}
	.globe {
		flex-shrink: 0;
		width: 270px;
		max-width: 100%;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.globe.grabbing {
		cursor: grabbing;
	}
	.globe svg {
		width: 100%;
		height: auto;
		display: block;
		font-family: var(--font-mono);
	}
	.sphere {
		stroke: var(--color-rule);
		stroke-opacity: 0.5;
		stroke-width: 1;
	}
	.terminator {
		stroke: none;
		pointer-events: none;
	}
	.wire {
		fill: none;
		stroke: var(--color-rule);
		stroke-opacity: 0.35;
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	.arc {
		fill: none;
		stroke-opacity: 0.9;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.arc-label {
		fill: var(--color-fg);
		font-size: 9.5px;
		font-weight: 600;
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.vec {
		stroke: var(--c);
		stroke-width: 2.6;
	}
	.origin {
		fill: var(--color-fg);
		stroke: var(--color-bg-elev-2, #1c1814);
		stroke-width: 0.8;
	}
	.vlabel {
		fill: var(--c);
		font-size: 12px;
		font-weight: 500;
		text-anchor: middle;
	}

	.calc {
		border-collapse: collapse;
		font-family: var(--font-mono);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
	.calc th {
		font-weight: 500;
		color: var(--color-fg-faint);
		padding: 0 0.75rem 0.5rem;
		border-bottom: 1px solid var(--color-rule);
		vertical-align: bottom;
	}
	.calc th.ph {
		padding: 0;
	}
	.hsim {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		text-align: right;
	}
	.hdeg {
		font-size: 1.05rem;
		font-style: italic;
		text-align: center;
		color: var(--color-fg-muted);
		line-height: 1;
	}
	.calc td {
		padding: 0.5rem 0.75rem;
		vertical-align: middle;
	}
	.pair-cell {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.swatch {
		width: 1.15rem;
		height: 0.42rem;
		border-radius: 999px;
		flex-shrink: 0;
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-fg) 14%, transparent);
	}
	.pid {
		font-size: 0.92rem;
		color: var(--color-fg-muted);
	}
	.cosv-cell {
		text-align: right;
	}
	.cosv {
		display: block;
		font-size: 1.32rem;
		font-weight: 600;
		line-height: 1.05;
	}
	.meter {
		display: block;
		height: 3px;
		margin-top: 0.26rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--color-fg) 9%, transparent);
		overflow: hidden;
	}
	.meter-fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		transition: width 0.3s ease;
	}
	.degv {
		font-size: 1.32rem;
		text-align: center;
		color: var(--color-fg-muted);
	}
	.note {
		font-size: 0.68rem;
		line-height: 1.55;
		color: var(--color-fg-faint);
		margin: 0.85rem 0 0;
	}
</style>
