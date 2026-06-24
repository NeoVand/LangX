import { browser } from '$app/environment';

/**
 * User preference for the book-side "Listen" (audiobook) feature.
 *
 * - 'model'   — the on-device Kokoro "Heart" voice: warm and natural, but loads a
 *               small model on first use and runs best on desktop (WebGPU / WASM).
 * - 'browser' — the operating system's built-in speech: instant, no download,
 *               works everywhere (including iOS, where the model can't run).
 *
 * Stored per-device in localStorage so the choice survives reloads. The narration
 * player auto-falls back to the browser voice if the model can't start on a device.
 */

export type VoiceEngine = 'model' | 'browser';

const STORAGE_KEY = 'langx.voice-engine';

class VoicePref {
	engine = $state<VoiceEngine>('model');

	constructor() {
		if (!browser) return;
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'model' || stored === 'browser') this.engine = stored;

		$effect.root(() => {
			$effect(() => {
				localStorage.setItem(STORAGE_KEY, this.engine);
			});
		});
	}

	set(engine: VoiceEngine) {
		this.engine = engine;
	}
}

export const voicePref = new VoicePref();
