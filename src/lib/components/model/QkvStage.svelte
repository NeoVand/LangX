<script lang="ts">
	// Stage B — Q/K/V projection. Before attention can happen, every token's
	// embedding is multiplied by three learned matrices to produce a Query, a Key,
	// and a Value. Pick a token; watch its one vector fan out into three roles.
	import ModelStage from './ModelStage.svelte';
	import MoltenVector from './MoltenVector.svelte';
	import { SAMPLE, cleanToken } from './data';

	const tokens = SAMPLE.tokens;
	const ids = SAMPLE.tokenIds;
	let selected = $state(1);

	const roles = [
		{ key: 'Q', tone: 'blue', name: 'Query', desc: 'what this token is looking for' },
		{ key: 'K', tone: 'red', name: 'Key', desc: 'what this token offers to others' },
		{ key: 'V', tone: 'green', name: 'Value', desc: 'what it contributes if attended to' }
	] as const;
</script>

<ModelStage
	n="B"
	title="Query, Key &amp; Value"
	sub="Three learned matrices turn each token's vector into three roles."
>
	<div class="pills" role="group" aria-label="Choose a token">
		{#each tokens as tok, i (i)}
			<button class="pill" class:on={selected === i} onclick={() => (selected = i)}
				>{cleanToken(tok)}</button
			>
		{/each}
	</div>

	<div class="qkv">
		<div class="src">
			<span class="src-strip"><MoltenVector tone="gold" seed={ids[selected]} width={22} /></span>
			<span class="src-label"
				>embedding of <span class="tok">{cleanToken(tokens[selected])}</span></span
			>
		</div>

		<div class="branches">
			{#each roles as r (r.key)}
				<div class="branch">
					<span class="mul">× W<sub>{r.key}</sub> →</span>
					<span class="role-strip"
						><MoltenVector tone={r.tone} seed={ids[selected] + r.key.charCodeAt(0)} width={18} /></span
					>
					<span class="role-text">
						<span class="role-name" data-role={r.key}>{r.name}</span>
						<span class="role-desc">{r.desc}</span>
					</span>
				</div>
			{/each}
		</div>
	</div>

	<p class="cap">
		Every token produces its own <b>Q</b>, <b>K</b> and <b>V</b>. Next, each token's
		<b>query</b> is compared against every <b>key</b> to decide how much of each <b>value</b> to pull
		in — that comparison is attention.
	</p>
</ModelStage>

<style>
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}
	.pill {
		appearance: none;
		border: 1px solid rgba(217, 164, 65, 0.16);
		background: rgba(0, 0, 0, 0.2);
		color: #b6ad99;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		padding: 0.22rem 0.5rem;
		border-radius: 0.4rem;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.pill:hover {
		color: #ece5d7;
	}
	.pill.on {
		color: #fbf6ec;
		background: rgba(217, 164, 65, 0.14);
		border-color: rgba(217, 164, 65, 0.45);
	}

	.qkv {
		display: flex;
		align-items: center;
		gap: 1.1rem;
	}
	.src {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.45rem;
		flex-shrink: 0;
	}
	.src-strip {
		display: block;
		height: 96px;
		width: 22px;
	}
	.src-label {
		font-size: 0.62rem;
		color: #837c6c;
		font-family: var(--font-mono);
		text-align: center;
		max-width: 6rem;
		line-height: 1.3;
	}

	.branches {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 1;
		min-width: 0;
	}
	.branch {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.mul {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: #b6ad99;
		white-space: nowrap;
	}
	.mul sub {
		color: #d9a441;
	}
	.role-strip {
		display: block;
		height: 30px;
		width: 18px;
		flex-shrink: 0;
	}
	.role-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.role-name {
		font-size: 0.84rem;
		font-weight: 600;
	}
	.role-name[data-role='Q'] {
		color: #6f9bc4;
	}
	.role-name[data-role='K'] {
		color: #c87142;
	}
	.role-name[data-role='V'] {
		color: #56a884;
	}
	.role-desc {
		font-size: 0.72rem;
		color: #837c6c;
	}
	.cap {
		margin: 1rem 0 0;
	}
</style>
