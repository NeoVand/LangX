<script lang="ts">
	// Stage D — the feed-forward network (MLP). After attention mixes information
	// between tokens, each token is transformed on its own: expand to ~4× the
	// width, pass through GELU, compress back. Drag the input to see GELU at work.
	import ModelStage from './ModelStage.svelte';
	import MoltenVector from './MoltenVector.svelte';

	function gelu(x: number): number {
		return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3)));
	}

	// curve geometry
	const W = 150;
	const H = 96;
	const XMIN = -4;
	const XMAX = 4;
	const YMIN = -1;
	const YMAX = 4;
	const sx = (x: number) => ((x - XMIN) / (XMAX - XMIN)) * W;
	const sy = (y: number) => H - ((y - YMIN) / (YMAX - YMIN)) * H;

	const geluPath = (() => {
		const pts: string[] = [];
		for (let i = 0; i <= 60; i++) {
			const x = XMIN + (i / 60) * (XMAX - XMIN);
			pts.push(`${sx(x).toFixed(1)},${sy(gelu(x)).toFixed(1)}`);
		}
		return 'M' + pts.join(' L');
	})();
	const reluPath = (() => {
		const pts: string[] = [];
		for (let i = 0; i <= 60; i++) {
			const x = XMIN + (i / 60) * (XMAX - XMIN);
			pts.push(`${sx(x).toFixed(1)},${sy(Math.max(0, x)).toFixed(1)}`);
		}
		return 'M' + pts.join(' L');
	})();

	let xIn = $state(1.2);
	const yOut = $derived(gelu(xIn));
</script>

<ModelStage
	n="D"
	title="The MLP"
	sub="Each token, on its own: expand to 4× the width, GELU, compress back."
>
	<div class="flow">
		<figure class="layer">
			<span class="strip" style:width="22px"><MoltenVector tone="gold" seed={7} width={22} /></span>
			<figcaption>in · 768</figcaption>
		</figure>
		<span class="arrow">expand →</span>
		<figure class="layer">
			<span class="strip wide"><MoltenVector tone="amber" seed={21} width={88} /></span>
			<figcaption>hidden · 3072 &nbsp;<span class="gelu-tag">GELU</span></figcaption>
		</figure>
		<span class="arrow">compress →</span>
		<figure class="layer">
			<span class="strip" style:width="22px"
				><MoltenVector tone="bronze" seed={13} width={22} /></span
			>
			<figcaption>out · 768</figcaption>
		</figure>
	</div>

	<div class="gelu">
		<svg viewBox="0 0 {W} {H}" width={W} height={H} class="gelu-svg" aria-hidden="true">
			<line x1={sx(XMIN)} y1={sy(0)} x2={sx(XMAX)} y2={sy(0)} class="axis" />
			<line x1={sx(0)} y1="0" x2={sx(0)} y2={H} class="axis" />
			<path d={reluPath} class="relu" />
			<path d={geluPath} class="curve" />
			<line x1={sx(xIn)} y1={sy(0)} x2={sx(xIn)} y2={sy(yOut)} class="drop" />
			<circle cx={sx(xIn)} cy={sy(yOut)} r="3.2" class="dot" />
		</svg>
		<div class="gelu-ctl">
			<div class="readout">
				GELU(<span class="val">{xIn.toFixed(1)}</span>) =
				<span class="val out">{yOut.toFixed(2)}</span>
			</div>
			<input class="mrange" type="range" min="-4" max="4" step="0.1" bind:value={xIn} />
			<p class="cap">
				<b>GELU</b> is a smooth gate: big positive values pass through, negatives are squashed toward
				zero. The dashed line is the older, sharper ReLU. Without a curve here, the two linear layers
				would collapse into one.
			</p>
		</div>
	</div>

	<p class="cap foot">
		Attention moves information <em>between</em> tokens; the MLP <em>transforms</em> it. Much of a
		model's learned knowledge is thought to live in these layers.
	</p>
</ModelStage>

<style>
	.flow {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		flex-wrap: wrap;
	}
	.layer {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
	}
	.strip {
		display: block;
		height: 92px;
	}
	.strip.wide {
		width: 88px;
	}
	.layer figcaption {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: #837c6c;
		display: flex;
		align-items: center;
	}
	.gelu-tag {
		color: #1a140c;
		background: #ecc068;
		border-radius: 0.3rem;
		padding: 0.02rem 0.3rem;
		font-size: 0.58rem;
		font-weight: 600;
	}
	.arrow {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: #b6ad99;
		margin-top: 2.4rem;
		white-space: nowrap;
	}

	.gelu {
		margin-top: 1.1rem;
		padding-top: 0.95rem;
		border-top: 1px solid rgba(217, 164, 65, 0.14);
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.gelu-svg {
		flex-shrink: 0;
		background: rgba(0, 0, 0, 0.25);
		border-radius: 0.4rem;
		border: 1px solid rgba(217, 164, 65, 0.12);
	}
	.axis {
		stroke: rgba(182, 173, 153, 0.25);
		stroke-width: 1;
	}
	.curve {
		fill: none;
		stroke: #d9a441;
		stroke-width: 2;
	}
	.relu {
		fill: none;
		stroke: rgba(182, 173, 153, 0.4);
		stroke-width: 1.2;
		stroke-dasharray: 3 3;
	}
	.drop {
		stroke: rgba(217, 164, 65, 0.5);
		stroke-width: 1;
		stroke-dasharray: 2 2;
	}
	.dot {
		fill: #f0c558;
		stroke: #1a140c;
		stroke-width: 1;
	}
	.gelu-ctl {
		flex: 1;
		min-width: 0;
	}
	.readout {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: #ece5d7;
		margin-bottom: 0.4rem;
	}
	.readout .val {
		color: #d9a441;
	}
	.readout .val.out {
		color: #f0c558;
		font-weight: 600;
	}
	.gelu-ctl .mrange {
		width: 100%;
		margin-bottom: 0.5rem;
	}
	.gelu-ctl .cap {
		margin: 0;
	}
	.foot {
		margin: 1rem 0 0;
	}
	.foot em {
		color: #f4ead4;
		font-style: italic;
	}
</style>
