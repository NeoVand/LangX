<script lang="ts">
	import {
		app,
		setApiKey,
		setPreferredProvider,
		setTjsModel,
		TJS_MODELS,
		type ModelProvider
	} from '$lib/state/app.svelte';
	import ParrotMark from '$lib/components/ParrotMark.svelte';
	import Term from '$lib/components/Term.svelte';
	import { onMount } from 'svelte';

	let provider: ModelProvider = $state(app.preferredProvider);

	$effect(() => {
		if (provider !== app.preferredProvider) setPreferredProvider(provider);
	});

	onMount(() => {
		provider = app.preferredProvider;
	});

	let testing = $state(false);
	let testMessage = $state<string | null>(null);
	let testOk = $state<boolean | null>(null);

	async function pingAnthropic() {
		if (!app.keys.anthropic) return;
		testing = true;
		testMessage = null;
		try {
			const { ChatAnthropic } = await import('@langchain/anthropic');
			const llm = new ChatAnthropic({
				apiKey: app.keys.anthropic,
				model: 'claude-haiku-4-5',
				temperature: 0,
				maxTokens: 32,
				clientOptions: { dangerouslyAllowBrowser: true }
			});
			const r = await llm.invoke([
				{ role: 'system', content: 'Reply with the single word: ready.' },
				{ role: 'user', content: 'ping' }
			]);
			const text = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
			testOk = true;
			testMessage = `Live response: "${text.trim().slice(0, 80)}"`;
		} catch (err) {
			testOk = false;
			testMessage = err instanceof Error ? err.message : String(err);
		} finally {
			testing = false;
		}
	}

	const hasAnyKey = $derived(!!(app.keys.anthropic || app.keys.openai || app.keys.groq));

	function tierColor(tier: string) {
		if (tier === 'XS') return 'tier-xs';
		if (tier === 'S') return 'tier-s';
		if (tier === 'M') return 'tier-m';
		if (tier === 'L') return 'tier-l';
		return 'tier-xl';
	}
</script>

<main class="setup">
	<header class="hero">
		<div class="parrot"><ParrotMark size={64} /></div>
		<div>
			<div class="eyebrow font-display">Setup</div>
			<h1>Bring your own model.</h1>
			<p class="lead">
				Every demo in LangX runs against a real model. Paste a hosted-API key for the fastest
				path, or pick a <Term t="Transformers.js">Transformers.js</Term> model that downloads once and runs locally on <Term t="WebGPU">WebGPU</Term>. <Term t="API key">API keys</Term>
				stay in <Term t="localStorage"><code>localStorage</code></Term> on this device — they never leave your browser.
			</p>
		</div>
	</header>

	<section class="status">
		<div class="status-row">
			<span class="status-key">WebGPU</span>
			<span class="status-val" class:ok={app.webgpuOk} class:bad={app.webgpuOk === false}>
				{app.webgpuOk === null ? 'checking…' : app.webgpuOk ? 'available' : 'not available'}
			</span>
		</div>
		<p class="status-note">
			Local models run faster on WebGPU. If WebGPU is missing, LangX falls back to WebAssembly
			(~5× slower) or you can use a hosted provider below.
		</p>
	</section>

	<section class="block gate" class:ok={hasAnyKey}>
		<div class="gate-body">
			<h2>Step 1 · Hosted-API key</h2>
			<p class="muted">
				Anthropic is the recommended path — Claude Haiku 4.5 is fast, agentic, and Browser-CORS
				enabled. Paste any key below and LangX will use it as the default.
			</p>
			<div class="keys">
				<label>
					<span>Anthropic</span>
					<input
						type="password"
						value={app.keys.anthropic}
						oninput={(e) => setApiKey('anthropic', (e.target as HTMLInputElement).value)}
						placeholder="sk-ant-..."
						autocomplete="off"
					/>
				</label>
				<label>
					<span>OpenAI</span>
					<input
						type="password"
						value={app.keys.openai}
						oninput={(e) => setApiKey('openai', (e.target as HTMLInputElement).value)}
						placeholder="sk-..."
						autocomplete="off"
					/>
				</label>
				<label>
					<span>Groq</span>
					<input
						type="password"
						value={app.keys.groq}
						oninput={(e) => setApiKey('groq', (e.target as HTMLInputElement).value)}
						placeholder="gsk_..."
						autocomplete="off"
					/>
				</label>
				<label>
					<span>Voyage <small>(embeddings, optional)</small></span>
					<input
						type="password"
						value={app.keys.voyage}
						oninput={(e) => setApiKey('voyage', (e.target as HTMLInputElement).value)}
						placeholder="pa-..."
						autocomplete="off"
					/>
				</label>
			</div>
			<div class="ping">
				<button
					class="btn ghost"
					disabled={!app.keys.anthropic || testing}
					onclick={pingAnthropic}
				>
					{testing ? 'Pinging…' : 'Ping Anthropic'}
				</button>
				{#if testMessage}
					<p class="ping-msg" class:ok={testOk} class:bad={testOk === false}>{testMessage}</p>
				{/if}
			</div>
		</div>
		<div class="gate-status">
			{#if hasAnyKey}
				<span class="check">✔</span>
				<span>Ready. Pick a default provider below.</span>
			{:else}
				<span class="x">!</span>
				<span>Add a key or switch the default to Transformers.js.</span>
			{/if}
		</div>
	</section>

	<section class="block">
		<h2>Step 2 · Default provider</h2>
		<div class="providers">
			<label class="provider" class:selected={provider === 'anthropic'}>
				<input type="radio" name="provider" bind:group={provider} value="anthropic" />
				<span class="p-title">Anthropic</span>
				<span class="p-desc">Claude Haiku 4.5. Strong tool use, fast first token.</span>
			</label>
			<label class="provider" class:selected={provider === 'openai'}>
				<input type="radio" name="provider" bind:group={provider} value="openai" />
				<span class="p-title">OpenAI</span>
				<span class="p-desc">GPT-4o mini via the browser-CORS endpoint.</span>
			</label>
			<label class="provider" class:selected={provider === 'groq'}>
				<input type="radio" name="provider" bind:group={provider} value="groq" />
				<span class="p-title">Groq</span>
				<span class="p-desc">Hosted Llama-3.3 70B at high token throughput.</span>
			</label>
			<label class="provider" class:selected={provider === 'transformers-js'}>
				<input
					type="radio"
					name="provider"
					bind:group={provider}
					value="transformers-js"
				/>
				<span class="p-title">Transformers.js</span>
				<span class="p-desc">Local model in your browser. No key, no network at runtime.</span>
			</label>
		</div>
	</section>

	<section class="block">
		<h2>Step 3 · Local model (optional)</h2>
		<p class="muted">
			These models live on Hugging Face and download once into your browser cache. The harness
			needs at least <strong>good</strong> agentic grade for the Deep Agents chapter to behave
			properly.
		</p>
		<div class="models">
			{#each TJS_MODELS as model (model.id)}
				<label class="model" class:selected={app.tjsModel === model.id}>
					<input
						type="radio"
						name="tjs-model"
						value={model.id}
						checked={app.tjsModel === model.id}
						onchange={() => setTjsModel(model.id)}
					/>
					<div class="m-head">
						<div>
							<span class="m-name font-display">{model.label}</span>
							<span class="m-sub">{model.family} · {model.dtype}</span>
						</div>
						<span class="tier {tierColor(model.tier)}">{model.tier}</span>
					</div>
					<dl class="m-stats">
						<div>
							<dt>Size</dt>
							<dd>{(model.sizeMb / 1024).toFixed(2)} GB</dd>
						</div>
						<div>
							<dt>RAM</dt>
							<dd>{model.recommendedRamGb} GB</dd>
						</div>
						<div>
							<dt>TTFT</dt>
							<dd>{model.bench.ttftMs} ms</dd>
						</div>
						<div>
							<dt>Throughput</dt>
							<dd>{model.bench.decodeTokPerSec} tok/s</dd>
						</div>
						<div>
							<dt>WebGPU</dt>
							<dd>{model.requiresWebGpu ? 'required' : 'optional'}</dd>
						</div>
						<div>
							<dt>Agentic</dt>
							<dd class="grade grade-{model.agenticGrade}">{model.agenticGrade}</dd>
						</div>
					</dl>
					<p class="m-notes">{model.notes}</p>
				</label>
			{/each}
		</div>
	</section>

	<section class="block end">
		<a class="btn primary" href="/1-langchain">Begin · LangChain →</a>
		<a class="btn ghost" href="/">Back to home</a>
	</section>
</main>

<style>
	.setup {
		max-width: 64rem;
		margin: 0 auto;
		padding: 4rem 2rem 6rem;
		display: flex;
		flex-direction: column;
		gap: 2.75rem;
	}

	.hero {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.parrot {
		flex: 0 0 auto;
		color: var(--accent-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: color-mix(in oklch, var(--accent-soft) 70%, transparent);
		box-shadow:
			inset 0 0 0 1px var(--color-rule),
			0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-ink-300);
		margin-bottom: 0.5rem;
	}

	.hero h1 {
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		font-weight: 500;
		letter-spacing: -0.02em;
		margin: 0;
		line-height: 1.05;
	}

	.lead {
		font-family: var(--font-prose);
		font-size: 1.05rem;
		color: var(--color-ink-200);
		max-width: 44rem;
		line-height: 1.65;
		margin-top: 0.85rem;
	}

	.status {
		border: 1px solid var(--color-rule);
		border-radius: 0.6rem;
		padding: 1rem 1.25rem;
		background: var(--color-paper);
	}
	.status-row {
		display: flex;
		gap: 1rem;
		align-items: baseline;
	}
	.status-key {
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-300);
	}
	.status-val.ok {
		color: var(--accent-ink);
	}
	.status-val.bad {
		color: var(--color-accent-warning);
	}
	.status-note {
		font-size: 0.88rem;
		color: var(--color-ink-200);
		margin-top: 0.5rem;
	}

	.block h2 {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 1.5rem;
		margin: 0 0 0.5rem;
		letter-spacing: -0.01em;
	}

	.muted {
		color: var(--color-ink-200);
		font-size: 0.92rem;
		margin-bottom: 0.75rem;
		line-height: 1.55;
	}

	.gate {
		display: grid;
		grid-template-columns: 1fr;
		border: 1px solid var(--color-rule);
		border-radius: 0.7rem;
		padding: 1.25rem 1.5rem;
		background: var(--color-paper);
		gap: 0.75rem;
	}

	.gate.ok {
		border-color: color-mix(in oklch, var(--accent-ink) 30%, var(--color-rule));
		background: color-mix(in oklch, var(--accent-soft) 30%, var(--color-paper));
	}

	.gate-status {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.9rem;
		color: var(--color-ink-200);
	}

	.gate-status .check {
		display: inline-grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: var(--accent-ink);
		color: var(--color-paper);
		font-size: 0.75rem;
		font-weight: 700;
	}
	.gate-status .x {
		display: inline-grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: var(--color-accent-warning);
		color: var(--color-paper);
		font-size: 0.75rem;
		font-weight: 700;
	}

	.providers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 0.6rem;
	}

	.provider {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		padding: 0.95rem;
		background: var(--color-paper);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		transition: border-color 0.18s ease;
	}

	.provider input {
		display: none;
	}

	.provider.selected {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}

	.p-title {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 1.05rem;
	}

	.p-desc {
		font-size: 0.85rem;
		color: var(--color-ink-200);
		line-height: 1.45;
	}

	.models {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	@media (max-width: 760px) {
		.models {
			grid-template-columns: 1fr;
		}
		.hero {
			flex-direction: column;
		}
	}

	.model {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		padding: 1rem;
		background: var(--color-paper);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.model input {
		display: none;
	}

	.model.selected {
		border-color: var(--accent-ink);
		box-shadow: inset 0 0 0 1px var(--accent-ink);
	}

	.m-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.m-name {
		display: block;
		font-size: 1.02rem;
		font-weight: 500;
		letter-spacing: -0.005em;
	}

	.m-sub {
		display: block;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-300);
		margin-top: 0.2rem;
	}

	.tier {
		display: inline-grid;
		place-items: center;
		min-width: 2rem;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		font-weight: 600;
		border: 1px solid var(--color-rule);
		color: var(--color-ink-100);
	}
	.tier-xs {
		background: color-mix(in oklch, var(--accent-soft) 50%, transparent);
	}
	.tier-s {
		background: color-mix(in oklch, var(--accent-soft) 70%, transparent);
	}
	.tier-m {
		background: color-mix(in oklch, var(--accent-ink) 14%, transparent);
		color: var(--accent-ink);
		border-color: color-mix(in oklch, var(--accent-ink) 30%, var(--color-rule));
	}
	.tier-l {
		background: color-mix(in oklch, var(--accent-ink) 22%, transparent);
		color: var(--accent-ink);
		border-color: color-mix(in oklch, var(--accent-ink) 50%, var(--color-rule));
	}

	.m-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem 0.75rem;
		margin: 0;
	}
	.m-stats div {
		display: flex;
		flex-direction: column;
	}
	.m-stats dt {
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-300);
	}
	.m-stats dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--color-ink-100);
	}

	.grade-no {
		color: var(--color-ink-300);
	}
	.grade-weak {
		color: var(--color-accent-warning);
	}
	.grade-good {
		color: var(--accent-ink);
	}
	.grade-excellent {
		color: var(--accent-ink);
		font-weight: 600;
	}

	.m-notes {
		font-size: 0.86rem;
		color: var(--color-ink-200);
		margin: 0;
		line-height: 1.5;
		font-family: var(--font-prose);
	}

	.keys {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.keys label {
		display: grid;
		grid-template-columns: 7rem 1fr;
		align-items: center;
		gap: 0.75rem;
	}

	.keys input {
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--color-ink-100);
	}

	.keys input:focus {
		outline: none;
		border-color: var(--accent-ink);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent-ink) 35%, transparent);
	}

	.ping {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
	}

	.ping-msg {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-ink-200);
		font-family: var(--font-mono);
	}
	.ping-msg.ok {
		color: var(--accent-ink);
	}
	.ping-msg.bad {
		color: var(--color-accent-warning);
	}

	.end {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-top: 1.5rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-display);
		font-weight: 500;
		padding: 0.7rem 1.2rem;
		border-radius: 0.5rem;
		text-decoration: none;
		font-size: 0.95rem;
		border: 1px solid transparent;
		cursor: pointer;
	}

	.btn.primary {
		background: var(--accent-ink);
		color: var(--color-paper);
	}

	.btn.ghost {
		background: transparent;
		color: var(--color-ink-100);
		border-color: var(--color-rule);
	}
	.btn.ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	code {
		font-family: var(--font-mono);
		background: var(--color-paper);
		padding: 0.1em 0.35em;
		border-radius: 0.3em;
		border: 1px solid var(--color-rule);
		font-size: 0.85em;
	}
</style>
