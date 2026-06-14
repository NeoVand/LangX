<script lang="ts">
	// Stage E — from logits to the next token, on the REAL cached GPT-2 logits.
	// Tune temperature and top-k / top-p and watch the distribution reshape; roll
	// the dice to actually sample. The prompt was "Data visualization empowers
	// users to ___".
	import ModelStage from './ModelStage.svelte';
	import {
		SAMPLE,
		cleanToken,
		nextTokenDistribution,
		sampleToken,
		greedyToken,
		type TokenProb
	} from './data';

	let temperature = $state(0.8);
	let mode = $state<'top-k' | 'top-p'>('top-k');
	let k = $state(5);
	let p = $state(0.9);

	const sampling = $derived(
		mode === 'top-k' ? { type: 'top-k' as const, value: k } : { type: 'top-p' as const, value: p }
	);
	const dist = $derived(nextTokenDistribution({ temperature, sampling }));
	const top = $derived(dist.slice(0, 12));
	const maxProb = $derived(Math.max(...top.map((d) => d.probability), 0.0001));
	const greedy = $derived(greedyToken(dist));
	const keptCount = $derived(
		mode === 'top-k' ? k : ((dist[0]?.cutoffIndex ?? 0) + 1)
	);

	let sampled = $state<TokenProb | null>(null);
	let recent = $state<string[]>([]);

	function roll() {
		const pick = sampleToken(dist);
		sampled = pick;
		recent = [cleanToken(pick.token), ...recent].slice(0, 12);
	}

	function pct(v: number): string {
		if (v === 0) return '0%';
		if (v < 0.001) return '<0.1%';
		return (v * 100).toFixed(1) + '%';
	}
</script>

<ModelStage
	n="E"
	title="Logits → the next token"
	sub="The model scores every word; sampling picks one."
>
	{#snippet controls()}
		<button class="mbtn" onclick={roll}>⚄ Sample</button>
	{/snippet}

	<div class="prompt-line">
		<span class="pre">{SAMPLE.prompt}</span><span class="cursor">▌</span>
		{#if sampled}
			<span class="picked">{cleanToken(sampled.token)}</span>
		{/if}
	</div>

	<div class="bars">
		{#each top as d (d.tokenId)}
			{@const isSampled = sampled?.tokenId === d.tokenId}
			{@const isGreedy = greedy?.tokenId === d.tokenId}
			<div class="bar-row" class:zero={d.probability === 0} class:sampled={isSampled}>
				<span class="bl" title={d.token}>
					{#if isGreedy}<span class="greedy-mark" title="most likely (greedy)">▸</span>{/if}
					{cleanToken(d.token)}
				</span>
				<span class="bt">
					<span class="bfill" style:width="{(d.probability / maxProb) * 100}%"></span>
				</span>
				<span class="bp">{pct(d.probability)}</span>
			</div>
		{/each}
	</div>

	<div class="controls">
		<label class="ctl">
			<span class="ctl-l">temperature <b>{temperature.toFixed(1)}</b></span>
			<input class="mrange" type="range" min="0.1" max="2" step="0.1" bind:value={temperature} />
		</label>

		<div class="ctl-row">
			<div class="seg" role="group" aria-label="Sampling method">
				<button class:on={mode === 'top-k'} onclick={() => (mode = 'top-k')}>top-k</button>
				<button class:on={mode === 'top-p'} onclick={() => (mode = 'top-p')}>top-p</button>
			</div>
			{#if mode === 'top-k'}
				<label class="ctl inline">
					<span class="ctl-l">k = <b>{k}</b></span>
					<input class="mrange" type="range" min="1" max="12" step="1" bind:value={k} />
				</label>
			{:else}
				<label class="ctl inline">
					<span class="ctl-l">p = <b>{p.toFixed(2)}</b></span>
					<input class="mrange" type="range" min="0.1" max="1" step="0.05" bind:value={p} />
				</label>
			{/if}
		</div>
	</div>

	<p class="cap kept">
		Keeping <b>{keptCount}</b> of 50 candidates · greedy pick:
		<span class="tok">{cleanToken(greedy?.token ?? '')}</span>
		{#if recent.length}
			<span class="recent">rolls: {recent.join(' · ')}</span>
		{/if}
	</p>

	<p class="cap">
		Low temperature sharpens toward the top word; high temperature flattens the field. <b>top-k</b>
		keeps a fixed number of candidates; <b>top-p</b> keeps just enough to cover probability
		<em>p</em>. Then one token is drawn — and the whole loop runs again for the word after.
	</p>
</ModelStage>

<style>
	.prompt-line {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: #c3b9a3;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(217, 164, 65, 0.12);
		border-radius: 0.45rem;
		padding: 0.5rem 0.6rem;
		margin-bottom: 0.9rem;
		line-height: 1.4;
	}
	.prompt-line .cursor {
		color: #d9a441;
		animation: blink 1.1s step-end infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	.prompt-line .picked {
		color: #1a140c;
		background: #ecc068;
		border-radius: 0.3rem;
		padding: 0.02rem 0.32rem;
		margin-left: 0.1rem;
		font-weight: 600;
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 6.5rem 1fr 3.2rem;
		align-items: center;
		gap: 0.55rem;
		padding: 0.12rem 0.3rem;
		border-radius: 0.3rem;
		transition: background 0.15s ease;
	}
	.bar-row.sampled {
		background: rgba(217, 164, 65, 0.14);
	}
	.bar-row.zero {
		opacity: 0.34;
	}
	.bl {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: #ece5d7;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.greedy-mark {
		color: #d9a441;
		margin-right: 0.1rem;
	}
	.bt {
		position: relative;
		height: 8px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 4px;
		overflow: hidden;
	}
	.bfill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		border-radius: 4px;
		background: linear-gradient(90deg, #9a7029, #e7b450);
		transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}
	.bar-row.sampled .bfill {
		background: linear-gradient(90deg, #cf982f, #f3dca5);
	}
	.bp {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: #b6ad99;
		text-align: right;
	}

	.controls {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.ctl {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.ctl.inline {
		flex: 1;
		min-width: 7rem;
	}
	.ctl-l {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: #b6ad99;
	}
	.ctl-l b {
		color: #d9a441;
	}
	.ctl .mrange {
		width: 100%;
	}
	.ctl-row {
		display: flex;
		align-items: flex-end;
		gap: 0.8rem;
	}

	.kept {
		margin: 0.95rem 0 0.3rem;
	}
	.kept b {
		color: #f4ead4;
	}
	.recent {
		display: block;
		margin-top: 0.2rem;
		color: #837c6c;
		font-size: 0.72rem;
	}
	.cap em {
		font-style: italic;
		color: #f4ead4;
	}
</style>
