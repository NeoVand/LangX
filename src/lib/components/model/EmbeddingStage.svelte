<script lang="ts">
	// Stage A — Embeddings + position. Tokens become vectors (a learned lookup),
	// then the model is told their order. Click a token to see how its position is
	// encoded — the classic sinusoidal way, or the modern rotary (RoPE) way.
	import ModelStage from './ModelStage.svelte';
	import MoltenVector from './MoltenVector.svelte';
	import { SAMPLE, cleanToken } from './data';

	const tokens = SAMPLE.tokens;
	const ids = SAMPLE.tokenIds;

	let selected = $state(0);
	let scheme = $state<'sinusoidal' | 'rope'>('rope');

	// RoPE: rotation angle grows with position
	const ropeAngle = $derived(selected * 32); // degrees
	const handRad = $derived(((ropeAngle - 90) * Math.PI) / 180);
	const handX = $derived(26 + 18 * Math.cos(handRad));
	const handY = $derived(26 + 18 * Math.sin(handRad));
</script>

<ModelStage
	n="A"
	title="Embeddings"
	sub="Each token becomes a vector — then we tell the model their order."
>
	{#snippet controls()}
		<div class="seg" role="group" aria-label="Positional scheme">
			<button class:on={scheme === 'rope'} onclick={() => (scheme = 'rope')}>Rotary · RoPE</button
			>
			<button class:on={scheme === 'sinusoidal'} onclick={() => (scheme = 'sinusoidal')}
				>Sinusoidal</button
			>
		</div>
	{/snippet}

	<div class="tokens-row">
		{#each tokens as tok, i (i)}
			<button class="tcol" class:sel={selected === i} onclick={() => (selected = i)}>
				<span class="tlabel">{cleanToken(tok)}</span>
				<span class="tid">#{ids[i]}</span>
				<span class="tvec"><MoltenVector tone="gold" seed={ids[i]} width={15} /></span>
				<span class="tpos">{i}</span>
			</button>
		{/each}
	</div>

	<p class="cap lookup-note">
		A lookup table turns each token id into <b>{SAMPLE.tokens.length} vectors</b> of
		<b>768 numbers</b> — the token's starting meaning. Attention has no built-in sense of order, so
		position has to be added in.
	</p>

	<div class="pos-panel">
		<div class="pos-head">
			Token <span class="tok">{cleanToken(tokens[selected])}</span> at position
			<b>{selected}</b>
		</div>

		{#if scheme === 'sinusoidal'}
			<div class="sum">
				<figure>
					<span class="strip"><MoltenVector tone="gold" seed={ids[selected]} width={20} /></span>
					<figcaption>token embedding</figcaption>
				</figure>
				<span class="op">＋</span>
				<figure>
					<span class="strip"><MoltenVector tone="amber" seed={100 + selected} width={20} /></span>
					<figcaption>position {selected}</figcaption>
				</figure>
				<span class="op">＝</span>
				<figure>
					<span class="strip"
						><MoltenVector tone="gold" seed={ids[selected] + selected * 7} width={20} /></span
					>
					<figcaption>enters the stack</figcaption>
				</figure>
			</div>
			<p class="cap">
				The original transformer <b>adds</b> a fixed sine/cosine wave to each token — a different wave
				at every position, so order survives.
			</p>
		{:else}
			<div class="rope">
				<svg viewBox="0 0 52 52" width="76" height="76" aria-hidden="true">
					<circle cx="26" cy="26" r="20" class="dial" />
					<line x1="26" y1="26" x2="26" y2="6" class="dial-ref" />
					<line x1="26" y1="26" x2={handX} y2={handY} class="dial-hand" />
					<circle cx="26" cy="26" r="2.2" class="dial-hub" />
				</svg>
				<div class="rope-text">
					<div class="rope-angle">rotated {ropeAngle}°</div>
					<p class="cap">
						Modern models add <b>nothing</b>. They <b>rotate</b> the token's query &amp; key by an angle
						that grows with position. Two tokens' rotations differ by their <b>distance</b> — so attention
						depends on how far apart they are, not where they sit.
					</p>
				</div>
			</div>
		{/if}
	</div>
</ModelStage>

<style>
	.tokens-row {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.45rem;
	}
	.tcol {
		appearance: none;
		border: 1px solid transparent;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 0.5rem;
		padding: 0.45rem 0.25rem 0.35rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
		min-width: 0;
	}
	.tcol:hover {
		background: rgba(217, 164, 65, 0.06);
	}
	.tcol.sel {
		border-color: rgba(217, 164, 65, 0.5);
		background: rgba(217, 164, 65, 0.1);
	}
	.tlabel {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: #f4ead4;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tid {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: #837c6c;
	}
	.tvec {
		display: block;
		height: 58px;
		width: 15px;
	}
	.tpos {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: #b6ad99;
	}

	.lookup-note {
		margin: 0.85rem 0 0;
	}

	.pos-panel {
		margin-top: 0.95rem;
		padding-top: 0.9rem;
		border-top: 1px solid rgba(217, 164, 65, 0.14);
	}
	.pos-head {
		font-size: 0.84rem;
		color: #ece5d7;
		margin-bottom: 0.7rem;
	}
	.pos-head b {
		color: #fbf6ec;
	}

	.sum {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.sum figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}
	.sum .strip {
		display: block;
		height: 56px;
		width: 20px;
	}
	.sum figcaption {
		font-size: 0.62rem;
		color: #837c6c;
		font-family: var(--font-mono);
	}
	.sum .op {
		font-size: 1.1rem;
		color: var(--brass, #d9a441);
		margin-top: -0.9rem;
	}

	.rope {
		display: flex;
		gap: 0.9rem;
		align-items: center;
	}
	.rope svg {
		flex-shrink: 0;
	}
	.dial {
		fill: rgba(0, 0, 0, 0.3);
		stroke: rgba(217, 164, 65, 0.3);
		stroke-width: 1.2;
	}
	.dial-ref {
		stroke: rgba(182, 173, 153, 0.35);
		stroke-width: 1;
		stroke-dasharray: 2 2;
	}
	.dial-hand {
		stroke: #d9a441;
		stroke-width: 2.4;
		stroke-linecap: round;
	}
	.dial-hub {
		fill: #d9a441;
	}
	.rope-angle {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: #d9a441;
		margin-bottom: 0.25rem;
	}
	.rope-text {
		min-width: 0;
	}
	.sum :global(.cap),
	.rope-text :global(.cap) {
		margin: 0.5rem 0 0;
	}
</style>
