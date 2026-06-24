<script lang="ts">
	import { onDestroy } from 'svelte';
	import { slide } from 'svelte/transition';
	import { Headphones, Play, Pause, RotateCcw, RotateCw, X, ChevronDown } from '@lucide/svelte';
	import { kokoro, NARRATOR_VOICES, DEFAULT_VOICE } from '$lib/runtime/tts/kokoro.svelte';
	import { extractNarration, type NarrationSegment } from '$lib/runtime/tts/extract';
	import { Narration } from '$lib/runtime/tts/narration.svelte';
	import { voicePref } from '$lib/state/voice.svelte';
	import { primeVoices } from '$lib/runtime/tts/browser-speech';

	const SPEEDS = [1, 1.25, 1.5, 0.75];

	let rootEl = $state<HTMLElement>();
	let voice = $state(DEFAULT_VOICE);
	let speed = $state(1);
	let narr = $state<Narration | null>(null);
	let segs: NarrationSegment[] = [];
	let empty = $state(false);

	/** Find the lesson's book-pane content (this player lives inside it). */
	function proseRoot(): HTMLElement | null {
		return rootEl?.closest('.narrative-inner') ?? null;
	}

	function makeNarration() {
		const root = proseRoot();
		if (!root) return;
		narr?.dispose();
		clearHighlight();
		segs = extractNarration(root);
		if (segs.length === 0) {
			empty = true;
			return;
		}
		empty = false;
		const n = new Narration(
			segs.map((s) => s.text),
			voice,
			voicePref.engine,
			speed
		);
		narr = n;
		n.start();
	}

	function close() {
		narr?.dispose();
		narr = null;
		clearHighlight();
	}
	function changeVoice(v: string) {
		if (v === voice) return;
		voice = v;
		if (narr) makeNarration();
	}
	function cycleSpeed() {
		const i = SPEEDS.indexOf(speed);
		speed = SPEEDS[(i + 1) % SPEEDS.length];
		narr?.setSpeed(speed);
	}

	onDestroy(() => {
		narr?.dispose();
		clearHighlight();
	});

	const status = $derived(narr?.status ?? 'idle');
	const isBusy = $derived(
		status === 'playing' || status === 'buffering' || status === 'loadingModel'
	);
	const isSpinning = $derived(status === 'buffering' || status === 'loadingModel');
	const usingModel = $derived(narr?.engine === 'model');
	const hasError = $derived(status === 'error');

	const estTotal = $derived.by(() => {
		if (!narr) return 0;
		if (narr.engine === 'browser') return narr.knownDuration;
		if (narr.generatedCount === 0) return 0;
		return (narr.knownDuration / narr.generatedCount) * narr.total;
	});
	const progressPct = $derived(
		narr && estTotal > 0 ? Math.min(100, (narr.position / estTotal) * 100) : 0
	);

	function fmt(sec: number) {
		if (!isFinite(sec) || sec < 0) sec = 0;
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// One-time model download is the only message worth showing; later chapters reuse
	// the cached singleton and just show a brief spinner on the play button.
	const downloading = $derived(
		usingModel &&
			!kokoro.loaded &&
			kokoro.status === 'loading' &&
			kokoro.progress > 0 &&
			kokoro.progress < 100
	);
	const statusText = $derived.by(() => {
		if (hasError) return 'Voice unavailable';
		if (downloading) return `Downloading voice — ${kokoro.progress}%`;
		return '';
	});

	// ── reading highlight: the segment being read maps straight to its element ──
	let highlighted: HTMLElement | null = null;

	function clearHighlight() {
		if (highlighted) highlighted.classList.remove('is-narrating');
		highlighted = null;
	}

	function scrollIntoViewIfNeeded(el: HTMLElement) {
		const r = el.getBoundingClientRect();
		const topGuard = 120; // clear the frosted nav + sticky player
		if (r.top < topGuard || r.bottom > window.innerHeight - 24) {
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}
	}

	function highlight(i: number) {
		const el = segs[i]?.el ?? null;
		if (el === highlighted) {
			if (el && status === 'playing') scrollIntoViewIfNeeded(el);
			return;
		}
		clearHighlight();
		if (el) {
			el.classList.add('is-narrating');
			highlighted = el;
			if (status === 'playing') scrollIntoViewIfNeeded(el);
		}
	}

	$effect(() => {
		const i = narr?.index;
		void narr?.status; // re-run when playback starts so we scroll to the first line
		if (narr && i != null) highlight(i);
		else clearHighlight();
	});
</script>

<div class="listen" bind:this={rootEl} data-no-narrate>
	{#if !narr}
		<button class="listen-btn" type="button" onclick={makeNarration} onpointerenter={primeVoices}>
			<Headphones size={15} strokeWidth={2} />
			<span>Listen</span>
		</button>
		{#if empty}
			<span class="empty-note">Nothing to read aloud on this page.</span>
		{/if}
	{:else}
		<div class="player" transition:slide={{ duration: 200 }}>
			<div class="row">
				<button
					class="rw"
					type="button"
					onclick={() => narr?.rewind(10)}
					aria-label="Rewind"
					disabled={status === 'loadingModel'}
				>
					<RotateCcw size={18} strokeWidth={1.8} />
				</button>

				<button
					class="play"
					type="button"
					onclick={() => narr?.toggle()}
					aria-label={isBusy ? 'Pause' : 'Play'}
				>
					{#if isSpinning}
						<span class="spinner" aria-hidden="true"></span>
					{:else if isBusy}
						<Pause size={19} strokeWidth={2} fill="currentColor" />
					{:else}
						<Play size={19} strokeWidth={2} fill="currentColor" />
					{/if}
				</button>

				<button
					class="rw"
					type="button"
					onclick={() => narr?.forward(10)}
					aria-label="Forward"
					disabled={status === 'loadingModel'}
				>
					<RotateCw size={18} strokeWidth={1.8} />
				</button>

				<div class="readout">
					{#if statusText}
						<span class="status" class:err={hasError}>{statusText}</span>
					{:else}
						<span class="time">{fmt(narr.position)}</span>
						<span class="seg">¶ {Math.min(narr.index + 1, narr.total)}/{narr.total}</span>
					{/if}
				</div>

				<button class="speed" type="button" onclick={cycleSpeed} title="Playback speed">
					{speed}×
				</button>

				{#if usingModel}
					<span class="voice-wrap">
						<select
							class="voice"
							value={voice}
							onchange={(e) => changeVoice(e.currentTarget.value)}
							aria-label="Narrator voice"
							title={kokoro.device ? `on-device · ${kokoro.device}` : 'on-device voice'}
						>
							{#each NARRATOR_VOICES as v (v.id)}
								<option value={v.id}>{v.label}</option>
							{/each}
						</select>
						<span class="voice-caret"><ChevronDown size={12} strokeWidth={2.4} /></span>
					</span>
				{:else}
					<span class="voice-tag" title="Your browser's built-in voice">browser voice</span>
				{/if}

				<button class="x" type="button" onclick={close} aria-label="Close player">
					<X size={15} strokeWidth={2} />
				</button>
			</div>

			{#if hasError}
				<p class="player-err">
					{kokoro.error ?? 'The audio engine couldn’t start. Try the browser voice in Setup.'}
				</p>
			{:else}
				<div class="bar" aria-hidden="true">
					<div
						class="bar-fill"
						class:dl={downloading}
						style:width="{downloading ? kokoro.progress : progressPct}%"
					></div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.listen {
		position: sticky;
		top: calc(60px + 0.5rem);
		z-index: 8;
		margin-bottom: 1.5rem;
	}

	.listen-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem 0.85rem 0.4rem 0.7rem;
		border-radius: 999px;
		border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--color-border));
		background: color-mix(in oklch, var(--color-bg-elev) 80%, transparent);
		color: var(--accent-ink);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		cursor: pointer;
		backdrop-filter: var(--frost);
		-webkit-backdrop-filter: var(--frost);
		transition:
			border-color 0.16s ease,
			background 0.16s ease,
			color 0.16s ease;
	}
	.listen-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in oklch, var(--accent) 10%, var(--color-bg-elev));
	}

	.empty-note {
		margin-left: 0.6rem;
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}

	.player {
		padding: 0.7rem 0.9rem 0.8rem;
		border-radius: 0.9rem;
		border: 1px solid color-mix(in oklch, var(--accent) 24%, var(--color-border));
		background: color-mix(in oklch, var(--color-bg-elev) 88%, transparent);
		box-shadow: var(--surface-shadow-soft);
		backdrop-filter: var(--frost);
		-webkit-backdrop-filter: var(--frost);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.rw,
	.x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--color-fg-muted);
		cursor: pointer;
		flex: none;
		padding: 0;
	}
	.rw {
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
	}
	.rw:hover:not(:disabled) {
		color: var(--accent);
	}
	.rw:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.x {
		width: 1.6rem;
		height: 1.6rem;
		color: var(--color-fg-faint);
	}
	.x:hover {
		color: var(--color-fg);
	}

	.play {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 999px;
		border: none;
		background: var(--accent);
		color: var(--color-ink-0);
		cursor: pointer;
		flex: none;
		box-shadow: 0 3px 12px -6px color-mix(in oklch, var(--accent) 75%, transparent);
	}
	.play:active {
		transform: scale(0.95);
	}
	.spinner {
		width: 1.05rem;
		height: 1.05rem;
		border-radius: 999px;
		border: 2.5px solid color-mix(in oklch, var(--color-ink-0) 40%, transparent);
		border-top-color: var(--color-ink-0);
		animation: listen-spin 0.7s linear infinite;
	}
	@keyframes listen-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.readout {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		min-width: 0;
		flex: 1;
		overflow: hidden;
		padding-left: 0.2rem;
	}
	.time {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg);
	}
	.seg {
		font-size: 0.66rem;
		color: var(--color-fg-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.status {
		font-size: 0.74rem;
		color: var(--color-fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-mono);
	}
	.status.err {
		color: var(--color-accent-danger);
	}

	.speed {
		flex: none;
		min-width: 2.5rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-fg-muted);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.35rem 0.55rem;
		cursor: pointer;
	}
	.speed:hover {
		border-color: var(--accent-rule);
		color: var(--accent);
	}

	.voice-tag {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
		white-space: nowrap;
	}

	/* Custom, theme-aware caret over the native select. */
	.voice-wrap {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	.voice-caret {
		position: absolute;
		right: 0.45rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		display: inline-flex;
		color: var(--color-fg-muted);
	}
	.voice {
		appearance: none;
		-webkit-appearance: none;
		max-width: 7.5rem;
		font-family: var(--font-sans);
		font-size: 0.74rem;
		color: var(--color-fg);
		background-color: var(--color-bg);
		background-image: none;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.3rem 1.4rem 0.3rem 0.5rem;
		cursor: pointer;
	}
	.voice:hover {
		border-color: var(--accent-rule);
	}
	.voice:focus {
		outline: none;
	}
	.voice:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 22%, transparent);
	}

	.bar {
		margin-top: 0.9rem;
		height: 4px;
		border-radius: 999px;
		background: color-mix(in oklch, var(--color-border) 55%, transparent);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
		transition: width 220ms linear;
	}
	.bar-fill.dl {
		background: var(--color-accent-warning);
	}
	.player-err {
		margin: 0.5rem 0.15rem 0;
		font-size: 0.74rem;
		line-height: 1.45;
		color: var(--color-fg-muted);
	}

	@media (max-width: 640px) {
		.voice {
			max-width: 5.5rem;
		}
	}

	/* The paragraph currently being read — a soft accent-tinted block with a little
	   breathing room around the text (the halo), no edge rule.
	   Lives outside this component's DOM, so it must be a global rule. */
	:global(.narrative-inner .is-narrating) {
		position: relative;
		border-radius: 0.4rem;
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		box-shadow: 0 0 0 0.4rem color-mix(in oklch, var(--accent) 8%, transparent);
		transition: background 0.25s ease;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.narrative-inner .is-narrating) {
			transition: none;
		}
	}
</style>
