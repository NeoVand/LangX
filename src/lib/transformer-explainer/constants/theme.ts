// @ts-nocheck
/**
 * Colour palette for the ported Transformer Explainer (JS side: d3 scales, canvas
 * vectors, Sankey flow gradients). The CSS side mirrors these as `var(--color-*)`
 * in styles/te-theme.css — keep the channel hues in sync.
 *
 * Tuned to LangX's warm "steampunk" theme (the app accent is a golden ochre,
 * --color-accent-langchain). The channels are aged-metal / patina tones so the
 * whole thing harmonises with the rest of the app while staying distinct enough
 * to read the Query/Key/Value/attention/MLP flows:
 *   blue   = Query     → steel blue
 *   red    = Key       → copper
 *   green  = Value     → verdigris
 *   purple = attention → plum (Victorian)
 *   indigo = MLP out   → tarnished indigo
 * `gray` is a warm taupe for residual / pass-through flows (quiet, never milky),
 * and `white` is the page colour so "fade to white" gradients fade into the dark.
 * The SAMPLED / predicted token is the golden accent (set as predictedColor in
 * the store + --predicted-color in te-theme.css).
 */

// Loose value typing so consumers can write theme.colors.blue[200] freely.
export const theme: { colors: Record<string, any> } = {
	colors: {
		// "fade to white" Sankey gradient stops fade to BLACK so the coloured flows
		// glow on the dark page instead of picking up a white/milky mix
		white: '#000000',
		black: '#000000',
		// residual / pass-through flows — very dark warm, so they recede into the
		// page and let the coloured flows glow (no light-gray "milky" wash)
		gray: {
			50: '#161109',
			100: '#1c160d',
			200: '#322c20',
			300: '#3f3829',
			400: '#4c4432',
			500: '#5a5140',
			600: '#322c20',
			700: '#262015',
			800: '#1c160d',
			900: '#161109'
		},
		// Query — steel blue
		blue: {
			100: '#c5d8ec',
			200: '#5a8fc0',
			300: '#4a7cac',
			400: '#3e6890',
			500: '#345777',
			600: '#2b4861',
			700: '#233a4e'
		},
		// Key — copper
		red: {
			100: '#f1cdb6',
			200: '#c87142',
			300: '#b56439',
			400: '#9d5630',
			500: '#854829',
			600: '#6d3b22',
			700: '#59311c'
		},
		// Value — verdigris
		green: {
			100: '#bfe6d4',
			200: '#56a884',
			300: '#469073',
			400: '#3a7a61',
			500: '#306450',
			600: '#1f4434'
		},
		// attention / out — plum
		purple: {
			100: '#e8ccd6',
			200: '#b06a82',
			300: '#9c5b72',
			400: '#854c60',
			500: '#6f4050',
			600: '#5b3441',
			700: '#492a34'
		},
		// MLP out — tarnished indigo
		indigo: {
			200: '#8079b0',
			300: '#6f689c'
		},
		// ── App "golden" spectrum (matches --color-accent-langchain) ──
		// Used for the structural / carrier flows (embedding stream, MLP, output)
		// instead of blue/purple, and for the embedding magnitudes. Three distinct
		// golds so embeddings / expanded / compressed read differently.
		gold: {
			100: '#f3dca5',
			200: '#d9a441',
			300: '#bb8a32',
			400: '#9a7029',
			500: '#7a5a22',
			600: '#5f461a',
			700: '#473512'
		},
		amber: {
			100: '#f8e2b4',
			200: '#ecc068',
			300: '#cfa247',
			400: '#ab8334',
			500: '#896727',
			600: '#6d521f',
			700: '#4e3a16'
		},
		bronze: {
			100: '#e2c89f',
			200: '#c08a38',
			300: '#a3742c',
			400: '#855e24',
			500: '#66461b',
			600: '#503714',
			700: '#3a2a0e'
		}
	}
};
