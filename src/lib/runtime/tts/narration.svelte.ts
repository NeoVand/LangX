import { kokoro } from './kokoro.svelte';
import { speakUtterance, cancelSpeech, canSpeak } from './browser-speech';
import type { VoiceEngine } from '$lib/state/voice.svelte';

/**
 * Plays a lesson's prose as a continuous audiobook. Two engines, one API:
 *
 * - 'model'   — Kokoro synthesizes each segment to a Web Audio buffer (generated
 *               one ahead of the playhead) and schedules them back to back, so
 *               seeking, speed, and the time readout are all exact.
 * - 'browser' — the Web Speech API speaks each segment in turn; timing is
 *               estimated from word counts and seeking snaps to segment edges.
 *
 * The model engine auto-falls back to the browser engine if Kokoro can't start
 * on this device, so "Listen" always works.
 */

export type NarrationStatus =
	| 'idle'
	| 'loadingModel'
	| 'buffering'
	| 'playing'
	| 'paused'
	| 'done'
	| 'error';

const PREFETCH_AHEAD = 8; // generate at most this many segments past the playhead
const WORDS_PER_SEC = 165 / 60; // browser-engine timing estimate (~165 wpm)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function estimateSeconds(text: string): number {
	const words = text.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(0.6, words / WORDS_PER_SEC);
}

export class Narration {
	status = $state<NarrationStatus>('idle');
	index = $state(0);
	generatedCount = $state(0);
	durations = $state<number[]>([]);
	/** Seconds elapsed within the current segment (live while playing). */
	displayPos = $state(0);
	error = $state<string | null>(null);
	/** Playback rate (1 = normal). */
	speed = $state(1);
	/** Engine actually in use — may flip from 'model' to 'browser' on fallback. */
	engine = $state<VoiceEngine>('model');
	/** True once a model→browser fallback has happened (for a quiet UI note). */
	fellBack = $state(false);

	readonly total: number;
	#segments: string[];
	#voice: string;
	/** Estimated per-segment seconds at 1× (browser engine only). */
	#baseDur: number[];
	#buffers: (AudioBuffer | null)[];
	#ctx: AudioContext | null = null;
	#source: AudioBufferSourceNode | null = null;
	#startedAt = 0;
	#startedOffset = 0;
	#playing = false;
	#genRunning = false;
	#destroyed = false;
	#manualStop = false;
	#tickId = 0;
	/** Token guarding browser utterance callbacks against superseded calls. */
	#seq = 0;
	/** Bumped on a speed change so in-flight model synths are discarded + redone. */
	#genToken = 0;

	constructor(segments: string[], voice: string, engine: VoiceEngine, speed = 1) {
		this.#segments = segments;
		this.#voice = voice;
		this.engine = engine;
		this.speed = speed;
		this.total = segments.length;
		this.#buffers = new Array(segments.length).fill(null);
		this.#baseDur = segments.map(estimateSeconds);
		this.durations =
			engine === 'browser' ? this.#effectiveDurations() : new Array(segments.length).fill(0);
	}

	get isPlaying() {
		return this.#playing;
	}
	get knownDuration() {
		let s = 0;
		const n = this.engine === 'browser' ? this.total : this.generatedCount;
		for (let i = 0; i < n; i++) s += this.durations[i] || 0;
		return s;
	}
	get position() {
		let s = 0;
		for (let i = 0; i < this.index; i++) s += this.durations[i] || 0;
		return s + this.displayPos;
	}

	#effectiveDurations() {
		return this.#baseDur.map((d) => d / this.speed);
	}

	#curOffset() {
		if (this.engine === 'browser') {
			if (this.#playing && this.#startedAt) return (this.#now() - this.#startedAt) / 1000;
			return this.displayPos;
		}
		// Speed is baked into the generated audio (Kokoro native speed), so the buffer
		// plays at playbackRate 1 and elapsed time is real wall-clock — no scaling.
		if (this.#playing && this.#source && this.#ctx)
			return this.#startedOffset + (this.#ctx.currentTime - this.#startedAt);
		return this.displayPos;
	}

	#now() {
		return typeof performance !== 'undefined' ? performance.now() : Date.now();
	}

	#ensureCtx() {
		if (!this.#ctx) {
			const AC =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.#ctx = new AC();
		}
		if (this.#ctx.state === 'suspended') void this.#ctx.resume();
		return this.#ctx;
	}

	/** Begin (called from a user gesture so audio is allowed to start). */
	start() {
		if (this.#destroyed) return;
		if (this.engine === 'browser') {
			this.#startBrowser(this.index);
			return;
		}
		this.#ensureCtx();
		this.#startGen();
		this.#play();
	}

	// ─── Model engine (Kokoro → Web Audio) ──────────────────────────────────

	#startGen() {
		if (this.#genRunning) return;
		this.#genRunning = true;
		void this.#genLoop();
	}

	async #genLoop() {
		while (!this.#destroyed && this.engine === 'model' && this.generatedCount < this.total) {
			while (!this.#destroyed && this.generatedCount - this.index > PREFETCH_AHEAD) {
				await sleep(150);
			}
			if (this.#destroyed || this.engine !== 'model') break;
			const i = this.generatedCount;
			const token = this.#genToken;
			try {
				const raw = await kokoro.generate(this.#segments[i], this.#voice, this.speed);
				if (this.#destroyed || this.engine !== 'model') break;
				// A speed change invalidated this synth (it used the old speed) — drop it
				// and loop again to regenerate from the reset playhead.
				if (token !== this.#genToken) continue;
				const ctx = this.#ensureCtx();
				const buf = ctx.createBuffer(1, raw.audio.length, raw.sampling_rate);
				buf.getChannelData(0).set(raw.audio);
				this.#buffers[i] = buf;
				const next = this.durations.slice();
				next[i] = raw.audio.length / raw.sampling_rate;
				this.durations = next;
				this.generatedCount = i + 1;
				// If playback is waiting on exactly this segment, start it now.
				if (this.#playing && this.#source === null && this.index === i) {
					this.#playSeg(i, this.displayPos);
				}
			} catch (e) {
				if (this.#destroyed) break;
				if (token !== this.#genToken) continue; // stale failure after a speed change
				// Kokoro couldn't start / generate — fall back to the browser voice so
				// Listen still works, rather than erroring out.
				if (i === 0 && canSpeak()) {
					console.warn('[narration] model failed, falling back to browser voice', e);
					this.#fallbackToBrowser();
					return;
				}
				this.error = e instanceof Error ? e.message : String(e);
				this.status = 'error';
				this.#playing = false;
				break;
			}
		}
		this.#genRunning = false;
	}

	#play() {
		if (this.#destroyed) return;
		this.#playing = true;
		this.#ensureCtx();
		if (this.#buffers[this.index]) {
			this.#playSeg(this.index, this.displayPos);
		} else {
			this.status = kokoro.isReady ? 'buffering' : 'loadingModel';
		}
	}

	#playSeg(i: number, offset: number) {
		const ctx = this.#ensureCtx();
		const buf = this.#buffers[i];
		if (!buf) {
			this.status = 'buffering';
			return;
		}
		this.#stopSource();
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.connect(ctx.destination);
		// playbackRate stays 1: speed is already baked into the synthesized audio.
		this.#manualStop = false;
		src.onended = () => {
			if (this.#manualStop || this.#destroyed) return;
			this.index = i + 1;
			this.displayPos = 0;
			if (this.index >= this.total) {
				this.#playing = false;
				this.status = 'done';
				this.#stopTick();
				return;
			}
			if (this.#buffers[this.index]) this.#playSeg(this.index, 0);
			else {
				// Next segment isn't synthesized yet. Null the source so the generator
				// loop's resume check (#source === null) fires the moment it's ready —
				// without this, playback hangs between paragraphs.
				this.#source = null;
				this.status = 'buffering';
			}
		};
		src.start(0, offset);
		this.#source = src;
		this.#startedAt = ctx.currentTime;
		this.#startedOffset = offset;
		this.index = i;
		this.#playing = true;
		this.status = 'playing';
		this.#startTick();
	}

	#stopSource() {
		if (this.#source) {
			this.#manualStop = true;
			try {
				this.#source.onended = null;
				this.#source.stop();
			} catch {
				/* already stopped */
			}
			try {
				this.#source.disconnect();
			} catch {
				/* noop */
			}
			this.#source = null;
		}
	}

	// ─── Browser engine (Web Speech API) ────────────────────────────────────

	#fallbackToBrowser() {
		this.engine = 'browser';
		this.fellBack = true;
		this.#stopSource();
		this.durations = this.#effectiveDurations();
		this.generatedCount = this.total;
		this.#startBrowser(this.index);
	}

	#startBrowser(from: number) {
		this.durations = this.#effectiveDurations();
		this.#playing = true;
		this.#speakBrowser(from, 0);
	}

	#speakBrowser(i: number, offset: number) {
		if (this.#destroyed || i >= this.total) {
			if (i >= this.total) {
				this.#playing = false;
				this.status = 'done';
				this.#stopTick();
			}
			return;
		}
		const token = ++this.#seq;
		this.index = i;
		this.displayPos = offset;
		this.status = 'playing';
		this.#playing = true;
		const ok = speakUtterance(this.#segments[i], {
			rate: this.speed,
			onStart: () => {
				if (token !== this.#seq) return;
				// Anchor the clock so the (offset, then live) readout tracks real time.
				this.#startedAt = this.#now() - offset * 1000;
				this.#startTick();
			},
			onEnd: () => {
				if (token !== this.#seq || this.#destroyed) return;
				this.index = i + 1;
				this.displayPos = 0;
				this.#startedAt = 0;
				if (this.index >= this.total) {
					this.#playing = false;
					this.status = 'done';
					this.#stopTick();
				} else {
					this.#speakBrowser(this.index, 0);
				}
			}
		});
		if (!ok) {
			this.error = 'Speech engine unavailable on this device.';
			this.status = 'error';
			this.#playing = false;
		}
	}

	// ─── Shared transport controls ──────────────────────────────────────────

	pause() {
		if (!this.#playing && this.status !== 'buffering' && this.status !== 'loadingModel') return;
		this.displayPos = this.#curOffset();
		if (this.engine === 'browser') {
			this.#seq++; // invalidate the in-flight utterance's callbacks
			cancelSpeech();
		} else {
			this.#stopSource();
		}
		this.#playing = false;
		this.status = 'paused';
		this.#stopTick();
	}

	resume() {
		if (this.#destroyed || this.status === 'done' || this.status === 'error') return;
		if (this.engine === 'browser') {
			// Web Speech can't resume mid-utterance reliably — restart this segment.
			this.#startBrowser(this.index);
			return;
		}
		this.#startGen();
		this.#play();
	}

	toggle() {
		if (this.#playing || this.status === 'buffering' || this.status === 'loadingModel')
			this.pause();
		else this.resume();
	}

	/**
	 * Live speed change. The browser engine re-speaks at the new rate. The model
	 * engine re-synthesizes at Kokoro's native speed (so pitch is preserved, unlike
	 * resampling) — it discards buffers from the current paragraph on and regenerates
	 * them, restarting the current paragraph at the new speed.
	 */
	setSpeed(s: number) {
		if (s === this.speed) return;
		this.speed = s;
		if (this.engine === 'browser') {
			this.durations = this.#effectiveDurations();
			if (this.#playing) this.#startBrowser(this.index);
			return;
		}
		const keep = this.index;
		this.#stopSource(); // nulls #source
		this.#genToken++; // discard any in-flight synth at the old speed
		const d = this.durations.slice();
		for (let i = keep; i < this.total; i++) {
			this.#buffers[i] = null;
			d[i] = 0;
		}
		this.durations = d;
		this.generatedCount = keep;
		this.displayPos = 0;
		if (this.#playing) {
			this.status = 'buffering';
			this.#startGen();
		}
	}

	/** Seek by a signed number of seconds along the audio timeline. */
	seek(deltaSeconds: number) {
		const target = Math.max(0, this.position + deltaSeconds);
		let acc = 0;
		let ti = 0;
		let toff = 0;
		const canSubSeek = this.engine === 'model';
		for (let i = 0; i < this.total; i++) {
			// Model: generated segments are contiguous from 0; the first null is the edge.
			if (canSubSeek && this.#buffers[i] == null) {
				ti = i;
				toff = 0;
				break;
			}
			const d = this.durations[i] || 0;
			if (target < acc + d || i === this.total - 1) {
				ti = i;
				toff = canSubSeek ? Math.max(0, Math.min(d, target - acc)) : 0;
				break;
			}
			acc += d;
		}
		this.index = ti;
		this.displayPos = toff;
		if (this.engine === 'browser') {
			if (this.#playing) this.#startBrowser(ti);
			return;
		}
		if (this.#playing) {
			if (this.#buffers[ti]) this.#playSeg(ti, toff);
			else {
				this.#stopSource();
				this.status = 'buffering';
			}
		}
	}

	rewind(seconds = 10) {
		this.seek(-seconds);
	}
	forward(seconds = 10) {
		this.seek(seconds);
	}

	#startTick() {
		this.#stopTick();
		// A 200ms interval (not rAF) keeps the clock advancing even when the tab
		// isn't focused; audio plays on its own thread regardless.
		this.#tickId = window.setInterval(() => {
			if (this.#destroyed || !this.#playing) {
				this.#stopTick();
				return;
			}
			let pos = this.#curOffset();
			if (this.engine === 'browser') pos = Math.min(pos, this.durations[this.index] || pos);
			this.displayPos = pos;
		}, 200);
	}
	#stopTick() {
		if (this.#tickId) {
			clearInterval(this.#tickId);
			this.#tickId = 0;
		}
	}

	dispose() {
		this.#destroyed = true;
		this.#seq++;
		this.#stopSource();
		cancelSpeech();
		this.#stopTick();
		if (this.#ctx) {
			try {
				void this.#ctx.close();
			} catch {
				/* noop */
			}
			this.#ctx = null;
		}
	}
}
