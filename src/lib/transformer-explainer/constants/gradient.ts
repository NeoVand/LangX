// @ts-nocheck
import { theme } from '$lib/transformer-explainer/constants/theme';

const B = 200;
const GOLD = theme.colors.gold[B];

/*
 * Dark-theme flow gradients.
 *
 * The golden rule for clean vector graphics on a dark stage: ribbons must
 * DISSOLVE into the background (alpha → 0), never fade to an opaque colour.
 * The original (white page) faded its ribbons to `white` (= its own
 * background) so the edges vanished into the page; the dark equivalent is to
 * fade to the SAME colour at opacity 0. Fading to an opaque stop is exactly
 * what reads as a "milky slab".
 *
 * Luminosity is NOT painted in here — it emerges from translucent fills
 * (the per-path opacities in opacity.ts) composited with `mix-blend-mode:
 * screen` over the near-black stage (see Explorer.svelte). Overlaps then add
 * light instead of muddying. So colour stops stay fully saturated; alpha does
 * all the fading.
 */

// helper: a clean alpha fade of one colour (no hue/lightness shift mid-ramp)
const t = (color, opacity) => ({ color, opacity });

export const gradientMap = {
	// ── Structural / carrier flows → GOLD spectrum ──
	// embedding → qkv (block 0): a deep-gold → bright-amber ramp so it keeps a
	// luminous gradient when highlighted (like the MLP flows), not a flat slab.
	'gray-blue': { 0: theme.colors.gold[400], 100: theme.colors.amber[200] },
	'transparent-blue': { 0: t(GOLD, 0), 100: GOLD }, // embedding → qkv (block n): fade IN
	'gray-transparent-blue': { 0: t(GOLD, 0), 60: t(GOLD, 0), 100: t(GOLD, 1) },
	'blue-blue-transparent': { 0: t(GOLD, 0), 60: t(GOLD, 1), 100: t(GOLD, 0) },
	'indigo-blue-transparent': { 0: t(GOLD, 0), 40: t(GOLD, 1), 100: GOLD },
	// MLP is OUTSIDE self-attention → no plum. Expansion = gold → amber; the
	// inner MLP stays gold. (Colour is reserved for the attention block only.)
	'purple-indigo': { 0: GOLD, 100: theme.colors.amber[200] }, // MLP expansion
	'indigo-blue': { 0: theme.colors.amber[200], 100: GOLD }, // MLP compression

	// dissolve-through-the-middle ribbons: the carrier passes "behind" the
	// columns. On white this faded to the page; here it fades to transparent.
	'blue-white': { 0: GOLD, 100: t(GOLD, 0) },
	'gray-white-blue': { 0: t(GOLD, 0.55), 45: t(GOLD, 0), 60: t(GOLD, 0), 100: t(GOLD, 0.85) },
	'blue-white-blue': { 0: GOLD, 40: t(GOLD, 0), 60: t(GOLD, 0), 100: GOLD },

	'blue-gray': { 0: GOLD, 100: theme.colors.gold[400] }, // logits fan-in (stays visible)
	blue: { 0: GOLD, 100: GOLD }, // output fan-out

	// ── Query / Key / Value channels (steel / copper / verdigris) ──
	'blue-blue': { 0: theme.colors.blue[300], 100: theme.colors.blue[300] },
	'red-red': { 0: theme.colors.red[300], 100: theme.colors.red[300] },
	'green-green': { 0: theme.colors.green[300], 100: theme.colors.green[300] },
	'blue-blue2': { 0: theme.colors.blue[B], 100: theme.colors.blue[B] },
	'red-red2': { 0: theme.colors.red[B], 100: theme.colors.red[B] },
	'green-green2': { 0: theme.colors.green[B], 100: theme.colors.green[B] },
	'red-white': { 0: theme.colors.red[B], 100: t(theme.colors.red[B], 0) },
	'green-white': { 0: theme.colors.green[B], 100: t(theme.colors.green[B], 0) },

	// ── Q/K/V → attention out (channel colour → plum) ──
	'red-purple': { 90: theme.colors.red[300], 100: theme.colors.purple[300] },
	'blue-purple': { 0: theme.colors.blue[300], 100: theme.colors.purple[300] },
	'green-purple': { 0: theme.colors.green[B], 100: theme.colors.purple[B] },

	// matrix → out (INSIDE attention): plum, fade by alpha only.
	'transparent-purple2': { 0: t(theme.colors.purple[B], 0), 100: t(theme.colors.purple[B], 1) },

	// head-out → MLP (LEAVING attention): the attention output resolves into the
	// gold embedding stream. Plum only at the very out edge, amber by the time it
	// reaches the MLP — so there's no stray pink "before the MLP".
	'purple-purple': { 0: theme.colors.purple[300], 35: theme.colors.amber[200], 100: theme.colors.amber[200] },
	'transparent-purple': { 0: t(theme.colors.amber[200], 0), 100: t(theme.colors.amber[200], 1) },

	// residual / pass-through
	'gray-gray': { 0: theme.colors.gray[B], 100: theme.colors.gray[B] }
};
