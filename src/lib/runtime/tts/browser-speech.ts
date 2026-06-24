/**
 * Web Speech API helpers — the always-available fallback voice for the book-side
 * audiobook. Free, on-device, works on iOS Safari, Chrome (mobile + desktop),
 * Edge, and Firefox. Voice quality varies by device, but macOS / iOS ship
 * excellent en-US voices (Samantha, Ava, Allison).
 */

let cachedEnglishVoice: SpeechSynthesisVoice | null = null;

const PREFERRED_VOICE_NAMES = ['Samantha', 'Ava (Premium)', 'Ava', 'Allison', 'Karen', 'Joanna'];

function pickEnglishVoice(): SpeechSynthesisVoice | null {
	if (cachedEnglishVoice) return cachedEnglishVoice;
	const voices = window.speechSynthesis.getVoices();
	if (voices.length === 0) return null;

	for (const name of PREFERRED_VOICE_NAMES) {
		const v = voices.find((voice) => voice.name === name || voice.name.startsWith(name));
		if (v) {
			cachedEnglishVoice = v;
			return v;
		}
	}

	const enUs = voices.find((v) => v.lang === 'en-US');
	if (enUs) {
		cachedEnglishVoice = enUs;
		return enUs;
	}

	const enAny = voices.find((v) => v.lang.startsWith('en'));
	cachedEnglishVoice = enAny ?? null;
	return cachedEnglishVoice;
}

let voicesPrimed = false;

/** Prime the browser voice list (cheap; some browsers populate it asynchronously). */
export function primeVoices(): void {
	if (voicesPrimed || typeof window === 'undefined' || !window.speechSynthesis) return;
	voicesPrimed = true;
	window.speechSynthesis.getVoices();
	window.speechSynthesis.addEventListener?.('voiceschanged', () => {
		cachedEnglishVoice = null;
		pickEnglishVoice();
	});
}

/** Collapse whitespace so the engine reads naturally, with no stray gaps. */
export function cleanForSpeech(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

export function canSpeak(): boolean {
	return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

/**
 * Speak one segment. `rate` maps the player's speed (1 = normal). Resolves via
 * `onEnd` when the utterance finishes (or errors). Returns false if the engine
 * is unavailable. Caller is responsible for sequencing segments.
 */
export function speakUtterance(
	text: string,
	opts: { rate?: number; onEnd?: () => void; onStart?: () => void } = {}
): boolean {
	if (typeof window === 'undefined' || !window.speechSynthesis) return false;
	const synth = window.speechSynthesis;
	const cleaned = cleanForSpeech(text);
	if (!cleaned) {
		opts.onEnd?.();
		return true;
	}
	const utter = new SpeechSynthesisUtterance(cleaned);
	utter.lang = 'en-US';
	utter.rate = opts.rate ?? 1;
	utter.pitch = 1;
	utter.volume = 1;
	const voice = pickEnglishVoice();
	if (voice) utter.voice = voice;
	if (opts.onStart) utter.onstart = () => opts.onStart?.();
	utter.onend = () => opts.onEnd?.();
	utter.onerror = () => opts.onEnd?.();

	// Chrome bug: cancel() immediately followed by speak() can leave the engine in a
	// "paused" state where the new utterance silently fires onend. Only cancel when
	// there's something to interrupt, and yield a tick before speaking afterwards.
	const needsCancel = synth.speaking || synth.pending;
	if (needsCancel) {
		synth.cancel();
		setTimeout(() => synth.speak(utter), 0);
	} else {
		synth.speak(utter);
	}
	return true;
}

export function cancelSpeech(): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;
	const synth = window.speechSynthesis;
	if (synth.speaking || synth.pending) synth.cancel();
}
