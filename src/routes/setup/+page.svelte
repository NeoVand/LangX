<script lang="ts">
	import {
		app,
		setApiKey,
		setPreferredProvider,
		setProviderModel,
		setEmbeddingModel,
		setTjsModel,
		TJS_MODELS,
		type ModelProvider
	} from '$lib/state/app.svelte';
	import {
		modelsForProvider,
		findHostedModel,
		formatContext,
		embeddingModelsForProvider,
		type HostedModel,
		type HostedProvider,
		type EmbeddingModel
	} from '$lib/models/catalog';
	import ParrotMark from '$lib/components/ParrotMark.svelte';
	import Term from '$lib/components/Term.svelte';
	import { Link2, Cpu } from '@lucide/svelte';

	/** Provider brand marks (under static/images/brands). */
	const brandLogo: Record<string, string> = {
		anthropic: '/images/brands/claude.svg',
		openai: '/images/brands/openai.svg',
		google: '/images/brands/gemini.svg'
	};
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

	const providerChoices = [
		{ id: 'anthropic', title: 'Anthropic' },
		{ id: 'openai', title: 'OpenAI' },
		{ id: 'google', title: 'Google Gemini' },
		{ id: 'transformers-js', title: 'Local' }
	] as const;

	/** Per-provider copy for the contextual key step. */
	const PROVIDER_META: Record<
		HostedProvider,
		{ label: string; placeholder: string; keysUrl: string; blurb: string }
	> = {
		anthropic: {
			label: 'Anthropic',
			placeholder: 'sk-ant-...',
			keysUrl: 'https://console.anthropic.com/settings/keys',
			blurb: 'Claude — fast, strongly agentic, and browser-CORS friendly.'
		},
		openai: {
			label: 'OpenAI',
			placeholder: 'sk-proj-...',
			keysUrl: 'https://platform.openai.com/api-keys',
			blurb: 'GPT-4o mini plus the GPT-5.x reasoning family.'
		},
		google: {
			label: 'Google Gemini',
			placeholder: 'AIza...',
			keysUrl: 'https://aistudio.google.com/apikey',
			blurb: 'Gemini — 1M-token context, multimodal, with thinking models.'
		}
	};

	const EMBED_META: Record<'openai' | 'voyage', { placeholder: string; keysUrl: string }> = {
		openai: { placeholder: 'sk-proj-...', keysUrl: 'https://platform.openai.com/api-keys' },
		voyage: { placeholder: 'pa-...', keysUrl: 'https://dashboard.voyageai.com/' }
	};

	/** Selected provider as a hosted provider, or null when running locally. */
	const hostedProvider = $derived(
		provider === 'transformers-js' ? null : (provider as HostedProvider)
	);
	const activeKey = $derived(hostedProvider ? app.keys[hostedProvider] : '');
	const canPing = $derived(!!hostedProvider && !!activeKey);
	/** Configured = local runtime (no key) or the selected hosted provider has a key. */
	const connected = $derived(provider === 'transformers-js' || !!activeKey);
	const selectedModelLabel = $derived(
		hostedProvider
			? (findHostedModel(app.models[hostedProvider])?.label ?? app.models[hostedProvider])
			: ''
	);

	const embedGroups = $derived([
		{ provider: 'openai' as const, title: 'OpenAI', hasKey: !!app.keys.openai },
		{ provider: 'voyage' as const, title: 'Voyage', hasKey: !!app.keys.voyage }
	]);

	async function pingModel() {
		if (!canPing) return;
		testing = true;
		testMessage = null;
		testOk = null;
		try {
			// Goes through the real getModel() path, so it tests the exact provider +
			// model the demos will use (and exercises the reasoning-model branch).
			const { getModel } = await import('$lib/runtime/llm');
			// 512 (not ~32) so thinking models like Gemini 2.5 have room to emit visible text.
			const llm = await getModel({ provider, temperature: 0, maxTokens: 512 });
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

	function costLabel(m: HostedModel): string {
		return m.price ? `$${m.price.inMtok} / $${m.price.outMtok}` : m.costTier;
	}

	function embedCost(m: EmbeddingModel): string {
		return m.price ? `$${m.price.inMtok}/Mtok` : m.costTier;
	}

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
				Every demo in LangX runs against a real model you choose. Pick one below — hosted models
				need an <Term t="API key">API key</Term>, local <Term t="Transformers.js">Transformers.js</Term>
				models download once and run on <Term t="WebGPU">WebGPU</Term>. <Term t="API key">Keys</Term> stay
				in <Term t="localStorage">localStorage</Term> on this device — they never leave your
				browser.
			</p>
		</div>
	</header>

	<!-- Step 1 — choose the model first, so we only ask for the key it needs. -->
	<section class="block">
		<h2>Step 1 · Choose your <Term t="Model">model</Term></h2>
		<p class="muted">
			Pick the engine your demos run on. Hosted models need a key (next step); local models
			download to your browser and need no key.
		</p>
		<div class="provider-tabs" role="tablist" aria-label="Model provider">
			{#each providerChoices as pc (pc.id)}
				<button
					type="button"
					role="tab"
					aria-selected={provider === pc.id}
					class="ptab"
					class:active={provider === pc.id}
					onclick={() => (provider = pc.id)}
				>
					{#if brandLogo[pc.id]}
						<img class="ptab-logo" src={brandLogo[pc.id]} alt="" aria-hidden="true" />
					{:else}
						<Cpu size={16} strokeWidth={2} />
					{/if}
					<span>{pc.title}</span>
				</button>
			{/each}
		</div>

		{#if hostedProvider}
			<p class="provider-blurb">{PROVIDER_META[hostedProvider].blurb}</p>
			<div class="models hosted-models">
				{#each modelsForProvider(hostedProvider) as model (model.id)}
					<label class="model" class:selected={app.models[hostedProvider] === model.id}>
						<input
							type="radio"
							name="hosted-model"
							value={model.id}
							checked={app.models[hostedProvider] === model.id}
							onchange={() => setProviderModel(hostedProvider, model.id)}
						/>
						<div class="m-head">
							<div>
								<span class="m-name font-display">{model.label}</span>
								<span class="m-sub">{model.tier}{model.reasoning ? ' · reasoning' : ''}</span>
							</div>
							{#if model.recommended}<span class="tag-rec">default</span>{/if}
						</div>
						<dl class="m-stats">
							<div>
								<dt>Context</dt>
								<dd>{formatContext(model.contextTokens)}</dd>
							</div>
							<div>
								<dt>Cost</dt>
								<dd class="cost-{model.costTier}">{costLabel(model)}</dd>
							</div>
							<div>
								<dt>Speed</dt>
								<dd>{model.speed}</dd>
							</div>
							<div>
								<dt>Agentic</dt>
								<dd class="grade grade-{model.agenticGrade}">{model.agenticGrade}</dd>
							</div>
						</dl>
						<p class="m-notes">{model.blurb}</p>
					</label>
				{/each}
			</div>
		{:else}
			<p class="provider-blurb">
				Runs entirely in your browser — no key, no network at runtime. Larger models need more RAM
				and a real GPU. The <Term t="Harness">harness</Term> wants at least <strong>good</strong>
				<Term t="Agentic grade">agentic grade</Term> for the <Term t="Deep Agent">Deep Agents</Term> chapter.
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
		{/if}
	</section>

	<!-- Step 2 — only the selected model's key, with the test tied to that model. -->
	<section class="block gate" class:ok={connected}>
		<div class="gate-body">
			{#if hostedProvider}
				<h2>Step 2 · Connect {PROVIDER_META[hostedProvider].label}</h2>
				<p class="muted">
					Paste your {PROVIDER_META[hostedProvider].label} key — it stays in
					<Term t="localStorage">localStorage</Term> on this device. Get one from
					<a href={PROVIDER_META[hostedProvider].keysUrl} target="_blank" rel="noopener noreferrer"
						>{PROVIDER_META[hostedProvider].label} ↗</a
					>.
				</p>
				<div class="keys">
					<label>
						<span>API key</span>
						<input
							type="password"
							value={app.keys[hostedProvider]}
							oninput={(e) => setApiKey(hostedProvider, (e.target as HTMLInputElement).value)}
							placeholder={PROVIDER_META[hostedProvider].placeholder}
							autocomplete="off"
						/>
					</label>
				</div>
				<div class="ping">
					<button class="btn ghost" disabled={!canPing || testing} onclick={pingModel}>
						{testing ? 'Testing…' : `Test ${selectedModelLabel}`}
					</button>
					{#if testMessage}
						<p class="ping-msg" class:ok={testOk} class:bad={testOk === false}>{testMessage}</p>
					{/if}
				</div>
			{:else}
				<h2>Step 2 · Run locally</h2>
				<p class="muted">
					No API key needed — your selected model downloads once into the browser cache and runs on
					<Term t="WebGPU">WebGPU</Term>.
				</p>
				<div class="status">
					<div class="status-row">
						<span class="status-key">WebGPU</span>
						<span class="status-val" class:ok={app.webgpuOk} class:bad={app.webgpuOk === false}>
							{app.webgpuOk === null ? 'checking…' : app.webgpuOk ? 'available' : 'not available'}
						</span>
					</div>
					<p class="status-note">
						If WebGPU is missing, LangX falls back to <Term t="WebAssembly">WebAssembly</Term> (~5×
						slower).
					</p>
				</div>
			{/if}
		</div>
		<div class="gate-status">
			{#if connected}
				<span class="check">✔</span>
				<span>Ready — start the curriculum below.</span>
			{:else}
				<span class="x">!</span>
				<span>Add your {hostedProvider ? PROVIDER_META[hostedProvider].label : ''} key to continue.</span>
			{/if}
		</div>
	</section>

	<!-- Step 3 — embeddings are independent of the chat model; reveal each key inline. -->
	<section class="block">
		<h2>Step 3 · <Term t="embedding model">Embeddings</Term> (RAG)</h2>
		<p class="muted">
			The <a href="/1-langchain/rag">RAG lesson</a> turns text into vectors with an embedding model.
			Local <Term t="MiniLM">MiniLM</Term> runs in-browser with no key; to use a hosted model in the RAG
			demo, pick it below and add that provider's key.
		</p>
		{#each embedGroups as group (group.provider)}
			<div class="embed-group" class:locked={!group.hasKey}>
				<div class="embed-head">
					<span class="embed-provider font-display">{group.title}</span>
					<span class="embed-key" class:ok={group.hasKey}>
						{group.hasKey ? 'key ready' : 'needs a key'}
					</span>
				</div>
				{#if !group.hasKey}
					<div class="keys">
						<label>
							<span>API key</span>
							<input
								type="password"
								value={app.keys[group.provider]}
								oninput={(e) => setApiKey(group.provider, (e.target as HTMLInputElement).value)}
								placeholder={EMBED_META[group.provider].placeholder}
								autocomplete="off"
							/>
						</label>
					</div>
				{/if}
				<div class="models hosted-models">
					{#each embeddingModelsForProvider(group.provider) as model (model.id)}
						<label class="model" class:selected={app.embeddingModels[group.provider] === model.id}>
							<input
								type="radio"
								name={`embed-${group.provider}`}
								value={model.id}
								checked={app.embeddingModels[group.provider] === model.id}
								onchange={() => setEmbeddingModel(group.provider, model.id)}
							/>
							<div class="m-head">
								<div>
									<span class="m-name font-display">{model.label}</span>
									<span class="m-sub">{model.dimensions}-dim</span>
								</div>
								{#if model.recommended}<span class="tag-rec">default</span>{/if}
							</div>
							<dl class="m-stats">
								<div>
									<dt>Dimensions</dt>
									<dd>{model.dimensions}</dd>
								</div>
								<div>
									<dt>Cost</dt>
									<dd class="cost-{model.costTier}">{embedCost(model)}</dd>
								</div>
							</dl>
							<p class="m-notes">{model.blurb}</p>
						</label>
					{/each}
				</div>
			</div>
		{/each}
		<p class="muted local-note">
			<strong>Local · MiniLM</strong> (all-MiniLM-L6-v2, 384-dim) runs fully in-browser with no key — the
			default in the RAG lesson.
		</p>
	</section>

	<section class="block end">
		<a class="btn primary" href="/1-langchain">
			<Link2 size={17} strokeWidth={2} />
			Begin · LangChain →
		</a>
		<a class="btn ghost" href="/">
			<ParrotMark size={17} />
			Back to home
		</a>
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
		color: var(--accent);
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
		color: var(--accent);
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

	/* Inline links (get-your-key, RAG lesson) read as accent so they're easy to spot. */
	.muted a {
		color: var(--accent);
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 0.2em;
		text-decoration-color: color-mix(in oklch, var(--accent) 45%, transparent);
		transition: text-decoration-color 0.15s ease;
	}
	.muted a:hover {
		text-decoration-color: var(--accent);
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
		border-color: color-mix(in oklch, var(--accent) 30%, var(--color-rule));
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
		background: var(--accent);
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

	/* Provider selector — compact pill row above the model cards. */
	.provider-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}

	.ptab {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 0.95rem;
		padding: 0.5rem 0.95rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
		color: var(--color-ink-200);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
	}

	.ptab:hover {
		color: var(--color-ink-100);
		border-color: color-mix(in oklch, var(--accent) 40%, var(--color-rule));
	}

	.ptab.active {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in oklch, var(--accent-soft) 30%, var(--color-paper));
	}

	.ptab-logo {
		width: 18px;
		height: 18px;
		display: block;
		flex: 0 0 auto;
	}

	.provider-blurb {
		font-size: 0.9rem;
		color: var(--color-ink-200);
		line-height: 1.5;
		margin: 0 0 0.9rem;
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
		--card-accent: var(--accent);
		border: 1px solid transparent;
		border-radius: 0.7rem;
		padding: 1rem;
		/* Same treatment as the home level cards: corner accent glows over a tinted fill
		   that keeps colour through the middle, sized to border-box so no edge artifact. */
		background:
			radial-gradient(
				115% 80% at 0% 0%,
				color-mix(in oklch, var(--card-accent) 18%, transparent),
				transparent 52%
			),
			radial-gradient(
				115% 80% at 100% 100%,
				color-mix(in oklch, var(--card-accent) 11%, transparent),
				transparent 52%
			),
			linear-gradient(150deg, var(--color-paper), color-mix(in oklch, var(--color-paper) 60%, #000));
		background-origin: border-box;
		background-clip: border-box;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		transition: border-color 0.18s ease;
	}

	.model input {
		display: none;
	}

	.model:hover {
		border-color: color-mix(in oklch, var(--card-accent) 38%, var(--color-rule));
	}

	/* Selected: a single thin accent border — no inset ring, so it stays subtle. */
	.model.selected {
		border-color: var(--accent);
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
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		color: var(--accent);
		border-color: color-mix(in oklch, var(--accent) 30%, var(--color-rule));
	}
	.tier-l {
		background: color-mix(in oklch, var(--accent) 22%, transparent);
		color: var(--accent);
		border-color: color-mix(in oklch, var(--accent) 50%, var(--color-rule));
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
		color: var(--accent);
	}
	.grade-excellent {
		color: var(--accent);
		font-weight: 600;
	}

	/* Hosted-model cards reuse the .model card styles with a tighter 2-col stat grid. */
	.hosted-models .m-stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.tag-rec {
		flex: 0 0 auto;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--accent) 16%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--color-rule));
		white-space: nowrap;
	}

	.cost-low {
		color: var(--accent);
	}
	.cost-medium {
		color: var(--color-ink-100);
	}
	.cost-high {
		color: var(--color-accent-warning);
	}
	.cost-free {
		color: var(--accent);
	}

	.embed-group {
		margin-top: 1.1rem;
	}
	.embed-group.locked {
		opacity: 0.78;
	}
	.embed-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
	.embed-provider {
		font-size: 1.05rem;
		font-weight: 500;
	}
	.embed-key {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--color-accent-warning);
	}
	.embed-key.ok {
		color: var(--accent);
	}
	.local-note {
		margin-top: 1.1rem;
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
		margin-bottom: 0.6rem;
	}

	.keys label {
		display: grid;
		grid-template-columns: 6rem 1fr;
		align-items: center;
		gap: 0.75rem;
	}

	.keys label span {
		font-size: 0.8rem;
		color: var(--color-ink-200);
		font-family: var(--font-mono);
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
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 35%, transparent);
	}

	.ping {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 0.2rem;
	}

	.ping-msg {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-ink-200);
		font-family: var(--font-mono);
	}
	.ping-msg.ok {
		color: var(--accent);
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
		justify-content: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-weight: 600;
		padding: 0.8rem 1.4rem;
		border-radius: 0.55rem;
		text-decoration: none;
		font-size: 0.95rem;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease;
	}

	.btn.primary {
		background: var(--color-fg);
		color: #000;
	}
	.btn.primary:hover {
		background: color-mix(in oklch, var(--color-fg) 90%, var(--accent));
	}

	.btn.ghost {
		background: color-mix(in oklch, var(--color-bg-elev) 60%, transparent);
		color: var(--color-fg);
		border-color: var(--color-border);
	}
	.btn.ghost:hover {
		border-color: var(--color-border-strong);
		background: var(--color-bg-elev);
	}
	.btn.ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.ghost:disabled:hover {
		border-color: var(--color-border);
		background: color-mix(in oklch, var(--color-bg-elev) 60%, transparent);
	}

</style>
