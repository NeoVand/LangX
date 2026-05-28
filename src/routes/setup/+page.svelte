<script lang="ts">
	import {
		app,
		setApiKey,
		setPreferredProvider,
		setTjsModel,
		TJS_MODELS,
		type ModelProvider
	} from '$lib/state/app.svelte';
	import { onMount } from 'svelte';

	let copied = $state(false);

	function copyEnv() {
		navigator.clipboard.writeText(JSON.stringify(app.keys, null, 2));
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}

	let provider: ModelProvider = $state(app.preferredProvider);

	$effect(() => {
		if (provider !== app.preferredProvider) setPreferredProvider(provider);
	});

	onMount(() => {
		provider = app.preferredProvider;
	});
</script>

<main class="setup">
	<section class="hero">
		<div class="eyebrow">Setup</div>
		<h1>Pick your model.</h1>
		<p class="lead">
			LangX runs entirely in the browser. You can use a small model that downloads once via
			Transformers.js and runs on WebGPU, or paste an API key to use a hosted model — keys stay
			in <code>localStorage</code> and never leave this device.
		</p>
	</section>

	<section class="status">
		<div class="status-row">
			<span class="status-key">WebGPU</span>
			<span class="status-val" class:ok={app.webgpuOk} class:bad={app.webgpuOk === false}>
				{app.webgpuOk === null ? 'checking…' : app.webgpuOk ? 'available' : 'not available'}
			</span>
		</div>
		<p class="status-note">
			If WebGPU is unavailable, LangX falls back to WebAssembly (slower) or you can use a hosted
			model below. Some browsers gate WebGPU behind a flag — see Hugging Face's setup guide.
		</p>
	</section>

	<section class="block">
		<h2>Default provider</h2>
		<div class="providers">
			<label class="provider" class:selected={provider === 'mock'}>
				<input type="radio" name="provider" bind:group={provider} value="mock" />
				<span class="p-title">Mock</span>
				<span class="p-desc">
					Deterministic scripted model. Best for understanding the loop step by step.
				</span>
			</label>
			<label class="provider" class:selected={provider === 'transformers-js'}>
				<input
					type="radio"
					name="provider"
					bind:group={provider}
					value="transformers-js"
				/>
				<span class="p-title">Transformers.js</span>
				<span class="p-desc">
					Runs locally in your browser via WebGPU. No key required.
				</span>
			</label>
			<label class="provider" class:selected={provider === 'openai'}>
				<input type="radio" name="provider" bind:group={provider} value="openai" />
				<span class="p-title">OpenAI</span>
				<span class="p-desc">
					Reliable tool calling. Requires an API key with browser-allowed CORS.
				</span>
			</label>
			<label class="provider" class:selected={provider === 'anthropic'}>
				<input
					type="radio"
					name="provider"
					bind:group={provider}
					value="anthropic"
				/>
				<span class="p-title">Anthropic</span>
				<span class="p-desc">Claude models. Strong agentic behavior.</span>
			</label>
			<label class="provider" class:selected={provider === 'groq'}>
				<input type="radio" name="provider" bind:group={provider} value="groq" />
				<span class="p-title">Groq</span>
				<span class="p-desc">Very fast hosted Llama and Mixtral models.</span>
			</label>
		</div>
	</section>

	<section class="block">
		<h2>Transformers.js model</h2>
		<p class="muted">
			These models live on Hugging Face and download once into your browser cache. Bigger models
			are smarter but take longer to download and warm up.
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
					<div class="m-row">
						<span class="m-name">{model.label}</span>
						<span class="m-size">{model.sizeMb} MB · {model.dtype}</span>
					</div>
					<div class="m-tools">
						Tool calling:
						<span class="tag tag-{model.supportsTools}">
							{model.supportsTools}
						</span>
					</div>
					<p class="m-notes">{model.notes}</p>
				</label>
			{/each}
		</div>
	</section>

	<section class="block">
		<h2>API keys (optional)</h2>
		<p class="muted">
			Stored only in your browser's <code>localStorage</code>. Used directly from the client for
			model calls. Don't paste keys you wouldn't expose to a single-page app.
		</p>
		<div class="keys">
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
				<span>Groq</span>
				<input
					type="password"
					value={app.keys.groq}
					oninput={(e) => setApiKey('groq', (e.target as HTMLInputElement).value)}
					placeholder="gsk_..."
					autocomplete="off"
				/>
			</label>
		</div>
		<button class="copy" onclick={copyEnv}>
			{copied ? 'Copied' : 'Copy as JSON'}
		</button>
	</section>

	<section class="block end">
		<a class="btn primary" href="/1-langchain">Start with LangChain →</a>
	</section>
</main>

<style>
	.setup {
		max-width: 56rem;
		margin: 0 auto;
		padding: 4rem 2rem 6rem;
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
	}

	.hero h1 {
		font-family: var(--font-serif);
		font-size: 2.5rem;
		font-weight: 600;
		margin: 0;
	}

	.eyebrow {
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
		margin-bottom: 0.75rem;
	}

	.lead {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		color: var(--color-fg-muted);
		max-width: 38rem;
		line-height: 1.6;
		margin-top: 0.75rem;
	}

	.status {
		border: 1px solid var(--color-border);
		border-radius: 0.6rem;
		padding: 1rem 1.25rem;
		background: var(--color-bg-elev);
	}
	.status-row {
		display: flex;
		gap: 1rem;
		align-items: baseline;
	}
	.status-key {
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
	}
	.status-val.ok {
		color: var(--color-accent-success);
	}
	.status-val.bad {
		color: var(--color-accent-warning);
	}
	.status-note {
		font-size: 0.85rem;
		color: var(--color-fg-muted);
		margin-top: 0.5rem;
	}

	.block h2 {
		font-family: var(--font-serif);
		font-size: 1.4rem;
		margin: 0 0 0.5rem;
	}

	.muted {
		color: var(--color-fg-muted);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}

	.providers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.6rem;
	}

	.provider {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.85rem;
		background: var(--color-bg-elev);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.provider input {
		display: none;
	}

	.provider.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.p-title {
		font-weight: 600;
	}

	.p-desc {
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}

	.models {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	@media (max-width: 700px) {
		.models {
			grid-template-columns: 1fr;
		}
	}

	.model {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.85rem;
		background: var(--color-bg-elev);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.model input {
		display: none;
	}

	.model.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.m-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}

	.m-name {
		font-weight: 600;
	}

	.m-size,
	.m-tools {
		font-size: 0.78rem;
		color: var(--color-fg-muted);
	}

	.m-notes {
		font-size: 0.82rem;
		color: var(--color-fg-muted);
		margin: 0.15rem 0 0;
	}

	.tag {
		display: inline-block;
		padding: 0.05em 0.45em;
		border-radius: 0.3em;
		font-size: 0.75rem;
		border: 1px solid var(--color-border);
		font-family: var(--font-mono);
	}
	.tag-no {
		color: var(--color-fg-faint);
	}
	.tag-weak {
		color: var(--color-accent-warning);
	}
	.tag-good {
		color: var(--color-accent-success);
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
		background: var(--color-bg-elev);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--color-fg);
	}

	.keys input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 40%, transparent);
	}

	.copy {
		align-self: flex-start;
		font-size: 0.82rem;
		padding: 0.45rem 0.8rem;
		background: var(--color-bg-elev);
		color: var(--color-fg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		margin-top: 0.5rem;
	}

	.end {
		margin-top: 1.5rem;
	}

	.btn.primary {
		display: inline-flex;
		font-weight: 500;
		padding: 0.7rem 1.2rem;
		background: var(--color-fg);
		color: var(--color-bg);
		border-radius: 0.5rem;
		text-decoration: none;
	}

	code {
		font-family: var(--font-mono);
		background: var(--color-bg-elev);
		padding: 0.1em 0.35em;
		border-radius: 0.3em;
		border: 1px solid var(--color-border);
		font-size: 0.85em;
	}
</style>
