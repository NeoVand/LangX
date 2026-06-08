// @ts-nocheck
// Per-path flow opacities.
//
// These are deliberately TRANSLUCENT. On the dark stage the ribbons are
// composited with `mix-blend-mode: screen` (see Explorer.svelte), so a
// translucent gold over near-black still glows, and where ribbons overlap the
// light ADDS (screen) toward a brighter gold instead of muddying to grey.
// Opaque ribbons would read as flat painted slabs — the thing we're avoiding.
export const ATTENTION_HEAD_BACK = 0.4;
export const EMBEDDING = 0.55;
export const ATTENTION_HEAD_1 = 0.62;
export const ATTENTION_OUT = 0.5;
export const MLP = 0.42;
export const TRANSFORMER_BLOCKS = 0.55;
export const LOGIT = 0.5;
