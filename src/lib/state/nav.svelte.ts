/**
 * Where "Back" should go from a detour page.
 *
 * Setup, the glossary, and the model explorer are detours: you pop over from
 * wherever you were reading and you want to return THERE, not to a chapter
 * home. The root layout records every non-detour route as it becomes current;
 * the TopNav shows a Back button (→ that route) whenever you're on a detour.
 * Deep-linking straight into a detour falls back to home.
 */
const DETOURS = ['/setup', '/glossary', '/1-langchain/model/explorer'];

export const nav = $state({ backTo: '/' });

export function isDetour(path: string): boolean {
	return DETOURS.some((d) => path === d || path.startsWith(d + '/'));
}

/** Called by the root layout on every navigation. */
export function trackRoute(path: string) {
	if (!isDetour(path)) nav.backTo = path;
}
