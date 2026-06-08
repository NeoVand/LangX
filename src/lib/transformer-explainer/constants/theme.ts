// @ts-nocheck
/**
 * Self-contained colour palette for the ported Transformer Explainer (JS side:
 * d3 scales, canvas vectors, Sankey flows). The CSS side mirrors these as
 * `var(--color-*)` in styles/te-theme.css — keep the channel hues in sync.
 *
 * Dark theme. The semantic channels must stay vivid + distinct so the Sankey
 * ribbons read on the near-black background (muted tones disappeared):
 *   blue   = Query     → bright azure
 *   red    = Key       → warm coral
 *   green  = Value     → emerald
 *   purple = attention → violet
 *   indigo = MLP out   → periwinkle
 * `gray` is a warm light neutral for residual / inactive flows, and `white` is
 * mapped to the dark page colour so the original "fade to white" Sankey gradients
 * fade into the background instead of glowing.
 */

// Loose value typing so consumers can write theme.colors.blue[200] freely.
export const theme: { colors: Record<string, any> } = {
	colors: {
		// fades in Sankey gradients should melt into the dark page, not glow white
		white: '#171411',
		black: '#000000',
		// warm neutral grays — light enough to read as faint flows on the dark page
		gray: {
			50: '#1d1813',
			100: '#2a241c',
			200: '#c8bca7',
			300: '#b1a48f',
			400: '#8d8170',
			500: '#6f6555',
			600: '#bdb2a1',
			700: '#d4c9b8',
			800: '#e6dccc',
			900: '#f2eadc'
		},
		// Query — bright azure
		blue: {
			100: '#cfe6fb',
			200: '#9fd0f5',
			300: '#6fb6ec',
			400: '#4a9ce0',
			500: '#3486d4',
			600: '#2c72bd',
			700: '#255f9e'
		},
		// Key — warm coral / copper
		red: {
			100: '#fbd9c8',
			200: '#f5b79a',
			300: '#ee9670',
			400: '#e87a4f',
			500: '#d9633a',
			600: '#bd5130',
			700: '#9e4428'
		},
		// Value — emerald / verdigris
		green: {
			100: '#c8f1dd',
			200: '#97e3c0',
			300: '#67d2a3',
			400: '#45bd88',
			500: '#34a474',
			600: '#2c8a62'
		},
		// attention / out — violet
		purple: {
			100: '#e7d5f7',
			200: '#d2b4ef',
			300: '#bd92e6',
			400: '#a972dc',
			500: '#9558cc',
			600: '#7e46b0',
			700: '#673a90'
		},
		// MLP out — periwinkle
		indigo: {
			200: '#bcc2f5',
			300: '#9aa2ec'
		}
	}
};
