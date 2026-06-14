<script lang="ts">
	// Live tokenization: type a sentence, watch GPT-2 split it into tokens. Uses the
	// same Xenova/gpt2 tokenizer the workshop runs, loaded lazily when scrolled into
	// view (~2 MB once). Shows what a "token" actually is.
	import { tokenize, type Tok } from '$lib/demos/tokenize';

	let text = $state(
		"Tokenization breaks text into the model's vocabulary. Common words are one token; rarer ones split into pieces."
	);
	let toks = $state<Tok[]>([]);
	let loading = $state(false);
	let ready = $state(false);
	let err = $state('');

	let host = $state<HTMLElement>();
	let visible = $state(false);

	$effect(() => {
		if (!host || visible) return;
		const io = new IntersectionObserver(
			(es) => {
				if (es.some((e) => e.isIntersecting)) {
					visible = true;
					io.disconnect();
				}
			},
			{ rootMargin: '160px 0px' }
		);
		io.observe(host);
		return () => io.disconnect();
	});

	async function run(t: string) {
		loading = true;
		err = '';
		try {
			toks = await tokenize(t);
			ready = true;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!visible) return;
		const t = text;
		const delay = ready ? 250 : 0;
		const id = setTimeout(() => run(t), delay);
		return () => clearTimeout(id);
	});

	// stable colour per token by position, in the warm lesson palette
	const PALETTE = ['#d9a441', '#c56b8a', '#5fa37a', '#6f9bc4', '#d08a52', '#8b7bd8', '#b0a04a'];
	function disp(t: string) {
		return t.replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '⭾');
	}
</script>

<figure class="tok-demo" bind:this={host}>
	<div class="card">
		<div class="head">
			<label class="lbl" for="tok-input">Type anything — watch it become tokens</label>
			<span class="tk-badge" title="Real GPT-2 tokenizer (Xenova/gpt2) running in your browser via transformers.js — the same one the workshop runs">
				GPT-2 · byte-pair encoding
			</span>
		</div>
		<textarea id="tok-input" bind:value={text} rows="2" spellcheck="false"></textarea>

		<div class="out" aria-live="polite">
			{#if err}
				<p class="err">Couldn't load the tokenizer: {err}</p>
			{:else if !visible || (loading && !ready)}
				<p class="muted">{visible ? 'Loading the GPT-2 tokenizer (~2 MB, once)…' : 'Tokenizer loads when you reach this demo…'}</p>
			{:else}
				<div class="chips">
					{#each toks as tk, i (i)}
						<span
							class="chip"
							style:--c={PALETTE[i % PALETTE.length]}
							title="token id {tk.id}"
						>
							<span class="chip-text">{disp(tk.text)}</span>
							<span class="chip-id">{tk.id}</span>
						</span>
					{/each}
				</div>
				<p class="count">
					<b>{toks.length}</b> tokens · <b>{text.length}</b> characters ·
					<span class="muted">≈ {(text.length / Math.max(toks.length, 1)).toFixed(1)} chars/token</span>
				</p>
			{/if}
		</div>
	</div>
	<figcaption>
		These are real GPT-2 tokens — the actual <b>byte-pair-encoding</b> tokenizer (Xenova/gpt2) runs
		live in your browser, nothing hard-coded. A <b>token</b> is a chunk of text — often a word,
		sometimes a word-piece or a single symbol; the model's whole vocabulary is ~50,257 of them, and
		<span class="mono">·</span> marks a leading space.
	</figcaption>
</figure>

<style>
	.tok-demo {
		margin: 1.6rem 0;
	}
	.card {
		border: 1px solid var(--color-border);
		border-radius: 0.7rem;
		background: var(--color-bg-elev);
		padding: 1rem 1.1rem 1.1rem;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
	.lbl {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-fg-faint);
	}
	.tk-badge {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--accent-ink);
		background: var(--accent-soft);
		border: 1px solid var(--accent-rule);
		border-radius: 0.35rem;
		padding: 0.12rem 0.45rem;
		white-space: nowrap;
	}
	textarea {
		width: 100%;
		font-family: var(--font-prose);
		font-size: 0.95rem;
		line-height: 1.5;
		padding: 0.6rem 0.7rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-fg);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent-rule);
	}
	.out {
		margin-top: 0.85rem;
		min-height: 3rem;
	}
	.muted {
		color: var(--color-fg-faint);
		font-size: 0.88rem;
		margin: 0.3rem 0;
	}
	.err {
		color: var(--color-accent-danger);
		font-size: 0.86rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.chip {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		padding: 0.2rem 0.4rem 0.15rem;
		border-radius: 0.35rem;
		background: color-mix(in oklch, var(--c) 18%, var(--color-bg));
		border: 1px solid color-mix(in oklch, var(--c) 45%, transparent);
		line-height: 1.1;
	}
	.chip-text {
		font-family: var(--font-mono);
		font-size: 0.84rem;
		color: var(--color-fg);
		white-space: pre;
	}
	.chip-id {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--color-fg-faint);
	}
	.count {
		margin: 0.75rem 0 0;
		font-size: 0.86rem;
		color: var(--color-fg-muted);
	}
	.count b {
		color: var(--color-fg);
	}
	figcaption {
		margin-top: 0.65rem;
		font-family: var(--font-prose);
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-ink-300);
		font-style: italic;
	}
	figcaption .mono {
		font-family: var(--font-mono);
		font-style: normal;
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
