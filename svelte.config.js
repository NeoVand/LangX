import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		// The ported Transformer Explainer (src/lib/transformer-explainer/**) is written in
		// legacy Svelte 4 syntax (export let, $:, stores, slots) — exempt it so it compiles
		// as-is (returning undefined lets Svelte auto-detect per file).
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ||
			filename.includes('transformer-explainer')
				? undefined
				: true
	},
	kit: { adapter: adapter() },
	// vitePreprocess enables <style lang="scss"> (used by the ported Transformer
	// Explainer); mdsvex handles .md/.svx lesson content.
	preprocess: [vitePreprocess(), mdsvex({ extensions: ['.svx', '.md'] })],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
