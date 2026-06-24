/**
 * Pull the readable "free text" out of a rendered lesson's book pane so it can be
 * narrated like an audiobook. We deliberately read only authored prose — the
 * chapter title, each <Slide>'s heading + body paragraphs/lists, and figure
 * captions — and skip code blocks, interactive demo widgets, link cards, and the
 * <Term> glossary tooltips (whose definitions are in the DOM but must not be read).
 *
 * Each segment carries the DOM element it came from, so the player can highlight
 * the paragraph currently being read and scroll it into view.
 */

export type NarrationSegment = {
	/** A short, sentence-aligned chunk of text to synthesize. */
	text: string;
	/** The block element this chunk belongs to (for the reading highlight). */
	el: HTMLElement;
};

const MAX_CHUNK = 240; // characters per chunk — keeps first audio fast and synth bounded

/** Split a block of prose into short, sentence-aligned chunks. */
function splitForTts(text: string, max = MAX_CHUNK): string[] {
	const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
	const chunks: string[] = [];
	let cur = '';
	for (const s of sentences) {
		let piece = s.trim();
		if (!piece) continue;
		// A single sentence longer than the limit gets hard-split on a space.
		while (piece.length > max) {
			const cut = piece.lastIndexOf(' ', max);
			const at = cut > max * 0.5 ? cut : max;
			if (cur) {
				chunks.push(cur);
				cur = '';
			}
			chunks.push(piece.slice(0, at).trim());
			piece = piece.slice(at).trim();
		}
		if (cur && cur.length + piece.length + 1 > max) {
			chunks.push(cur);
			cur = piece;
		} else {
			cur = cur ? `${cur} ${piece}` : piece;
		}
	}
	if (cur) chunks.push(cur);
	return chunks;
}

/**
 * Read an element's spoken text: its textContent minus glossary tooltips,
 * decorative SVGs, and any buttons. We clone so the live DOM is never touched.
 */
function readableText(el: HTMLElement): string {
	const clone = el.cloneNode(true) as HTMLElement;
	clone
		.querySelectorAll(
			'[role="tooltip"], .tip, svg, button, [aria-hidden="true"], [data-no-narrate]'
		)
		.forEach((n) => n.remove());
	return (clone.textContent ?? '')
		.replace(/\s+/g, ' ')
		.replace(/\s+([,.;:!?])/g, '$1') // tidy spaces inline elements leave before punctuation
		.trim();
}

/** Skip code figures, code blocks, raw markup, and decorative/interactive nodes. */
function isSkippable(el: Element): boolean {
	const tag = el.tagName.toLowerCase();
	if (tag === 'pre' || tag === 'code' || tag === 'svg' || tag === 'button' || tag === 'figure')
		return true;
	const cls = el.className;
	if (typeof cls === 'string' && /shiki|code-surface|codeblock|hljs/.test(cls)) return true;
	if (el.hasAttribute('data-no-narrate')) return true;
	return false;
}

/** Append every prose chunk found in `block` to `out`, mapped to its source element. */
function pushBlock(block: HTMLElement, out: NarrationSegment[]): void {
	const text = readableText(block);
	if (!text) return;
	for (const chunk of splitForTts(text)) out.push({ text: chunk, el: block });
}

/** Walk a slide body, emitting paragraphs / list items / sub-headings as segments. */
function collectProse(node: HTMLElement, out: NarrationSegment[]): void {
	for (const child of Array.from(node.children)) {
		if (!(child instanceof HTMLElement) || isSkippable(child)) continue;
		const tag = child.tagName.toLowerCase();
		if (tag === 'p' || tag === 'blockquote' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
			pushBlock(child, out);
		} else if (tag === 'ul' || tag === 'ol') {
			for (const li of Array.from(child.children)) {
				if (li instanceof HTMLElement && li.tagName.toLowerCase() === 'li') pushBlock(li, out);
			}
		} else if (tag === 'li') {
			pushBlock(child, out);
		} else {
			// A wrapping div (e.g. a Markdown block) — descend to reach its prose.
			collectProse(child, out);
		}
	}
}

/**
 * Extract narration segments from a lesson's book pane (`.narrative-inner`).
 * Returns an empty array when there's nothing readable.
 */
export function extractNarration(root: HTMLElement): NarrationSegment[] {
	const out: NarrationSegment[] = [];

	for (const child of Array.from(root.children)) {
		if (!(child instanceof HTMLElement) || child.hasAttribute('data-no-narrate')) continue;
		const cls = typeof child.className === 'string' ? child.className : '';
		const tag = child.tagName.toLowerCase();

		// 1) Title slide: chapter title → motivation → intro paragraphs.
		if (cls.includes('title-slide')) {
			const h1 = child.querySelector('h1');
			if (h1 instanceof HTMLElement) pushBlock(h1, out);
			const motivation = child.querySelector('.motivation');
			if (motivation instanceof HTMLElement) pushBlock(motivation, out);
			const intro = child.querySelector('.intro');
			if (intro instanceof HTMLElement) collectProse(intro, out);
			continue;
		}

		// 2) A <Slide>: its heading, then the prose in its body.
		if (tag === 'section' && cls.includes('slide')) {
			const title = child.querySelector('.slide-title');
			if (title instanceof HTMLElement) pushBlock(title, out);
			const body = child.querySelector('.slide-body');
			if (body instanceof HTMLElement) collectProse(body, out);
			continue;
		}

		// 3) A poster figure: read its caption (skip code figures — those have a <pre>).
		if (tag === 'figure') {
			if (child.querySelector('pre, code')) continue;
			const cap = child.querySelector('figcaption');
			if (cap instanceof HTMLElement) pushBlock(cap, out);
			continue;
		}

		// Everything else (launch cards, demo-link lists, ReadMore, interactive
		// widgets, diagrams) is not authored prose — skip it.
	}

	return out;
}
