/**
 * The Clockwork Troupe's sound box — a tiny WebAudio orchestrion. Client-only.
 * Reads assembled Movement files and performs them: square-wave melody,
 * triangle bass, chimey bells, and noise-burst clockwork drums.
 */
import { noteToFreq, parsePitch, TOTAL_STEPS, type Movement } from './music';

export interface PlayPosition {
	/** Index into the movements array currently sounding. */
	movement: number;
	/** 0–31 within that movement, or null when playback ends. */
	step: number;
}

export interface TroupePlayer {
	/** Perform one or more movements back to back, seamlessly. */
	play(movements: Movement[], onStep?: (pos: PlayPosition | null) => void): void;
	stop(): void;
	readonly playing: boolean;
}

/** Let the final releases and bell decays ring out before teardown. */
const TAIL_SECONDS = 1.6;

export function createTroupePlayer(): TroupePlayer {
	let ctx: AudioContext | null = null;
	let master: GainNode | null = null;
	let raf = 0;
	let playing = false;

	function ensureCtx(): AudioContext {
		if (!ctx) ctx = new AudioContext();
		return ctx;
	}

	function voice(
		ac: AudioContext,
		out: GainNode,
		type: OscillatorType,
		freq: number,
		t0: number,
		dur: number,
		peak: number,
		release: number
	) {
		const osc = ac.createOscillator();
		osc.type = type;
		osc.frequency.value = freq;
		const g = ac.createGain();
		g.gain.setValueAtTime(0, t0);
		g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
		g.gain.setValueAtTime(peak, Math.max(t0 + 0.012, t0 + dur - 0.02));
		g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur + release);
		osc.connect(g).connect(out);
		osc.start(t0);
		osc.stop(t0 + dur + release + 0.05);
	}

	function noiseBurst(
		ac: AudioContext,
		out: GainNode,
		t0: number,
		dur: number,
		peak: number,
		filterType: BiquadFilterType,
		freq: number
	) {
		const len = Math.ceil(ac.sampleRate * dur);
		const buf = ac.createBuffer(1, len, ac.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
		const src = ac.createBufferSource();
		src.buffer = buf;
		const filter = ac.createBiquadFilter();
		filter.type = filterType;
		filter.frequency.value = freq;
		const g = ac.createGain();
		g.gain.setValueAtTime(peak, t0);
		g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
		src.connect(filter).connect(g).connect(out);
		src.start(t0);
	}

	function kick(ac: AudioContext, out: GainNode, t0: number) {
		const osc = ac.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(150, t0);
		osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.55, t0);
		g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
		osc.connect(g).connect(out);
		osc.start(t0);
		osc.stop(t0 + 0.2);
	}

	function scheduleMovement(ac: AudioContext, out: GainNode, m: Movement, t0: number, stepDur: number) {
		for (const n of m.parts.melody) {
			const p = parsePitch(n.pitch);
			if (p) voice(ac, out, 'square', noteToFreq(p.midi), t0 + n.step * stepDur, n.dur * stepDur * 0.92, 0.085, 0.06);
		}
		for (const n of m.parts.bass) {
			const p = parsePitch(n.pitch);
			if (p) voice(ac, out, 'triangle', noteToFreq(p.midi), t0 + n.step * stepDur, n.dur * stepDur * 0.95, 0.26, 0.05);
		}
		for (const n of m.parts.bells ?? []) {
			const p = parsePitch(n.pitch);
			if (!p) continue;
			const t = t0 + n.step * stepDur;
			voice(ac, out, 'sine', noteToFreq(p.midi), t, n.dur * stepDur * 0.5, 0.11, 0.5);
			voice(ac, out, 'sine', noteToFreq(p.midi) * 3, t, n.dur * stepDur * 0.25, 0.025, 0.4);
		}
		for (const h of m.parts.drums) {
			const t = t0 + h.step * stepDur;
			if (h.drum === 'kick') kick(ac, out, t);
			else if (h.drum === 'snare') noiseBurst(ac, out, t, 0.14, 0.22, 'bandpass', 1900);
			else noiseBurst(ac, out, t, 0.05, 0.1, 'highpass', 7000);
		}
	}

	return {
		get playing() {
			return playing;
		},

		play(movements, onStep) {
			this.stop();
			if (!movements.length) return;
			const ac = ensureCtx();
			void ac.resume();
			master = ac.createGain();
			master.gain.value = 1;
			master.connect(ac.destination);

			const t0 = ac.currentTime + 0.08;
			const starts: number[] = [];
			let cursor = t0;
			for (const m of movements) {
				const stepDur = 60 / m.tempo / 4;
				starts.push(cursor);
				scheduleMovement(ac, master, m, cursor, stepDur);
				// Seamless: the next movement's step 0 lands exactly one step after
				// this movement's step 63 — no gap, the suite plays as one piece.
				cursor += TOTAL_STEPS * stepDur;
			}
			const end = cursor + TAIL_SECONDS;
			playing = true;

			const tickLoop = () => {
				const now = ac.currentTime;
				if (!playing) return;
				if (now >= end) {
					this.stop();
					onStep?.(null);
					return;
				}
				// The lead-in must NOT read as "ended" — onStep(null) is reserved for
				// the true end of playback (the page keys off it). During the tail,
				// the clamp below holds the playhead on the final step while it rings.
				let pos: PlayPosition | null = null;
				for (let i = movements.length - 1; i >= 0; i--) {
					if (now >= starts[i]) {
						const stepDur = 60 / movements[i].tempo / 4;
						const step = Math.floor((now - starts[i]) / stepDur);
						pos = { movement: i, step: Math.min(step, TOTAL_STEPS - 1) };
						break;
					}
				}
				if (pos) onStep?.(pos);
				raf = requestAnimationFrame(tickLoop);
			};
			raf = requestAnimationFrame(tickLoop);
		},

		stop() {
			playing = false;
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			if (master && ctx) {
				// A short fade instead of a hard disconnect — chopping live tails
				// mid-ring is an audible click, and it's what made endings feel cut off.
				const m = master;
				master = null;
				const t = ctx.currentTime;
				try {
					m.gain.cancelScheduledValues(t);
					m.gain.setValueAtTime(m.gain.value, t);
					m.gain.linearRampToValueAtTime(0.0001, t + 0.08);
				} catch {
					/* context may already be closed */
				}
				setTimeout(() => m.disconnect(), 160);
			}
		}
	};
}
