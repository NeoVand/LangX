import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { azureKeylessProxy } from './vite-plugins/azure-keyless-proxy';

export default defineConfig({
	plugins: [azureKeylessProxy(), tailwindcss(), sveltekit()],
	// kokoro-js + its bundled transformers.js load ONNX/WASM and large model files at
	// runtime and are imported only in the browser (lazily, on the first "Listen"). Keep
	// Vite from pre-bundling them and from trying to externalize/run them during SSR.
	optimizeDeps: {
		exclude: ['kokoro-js']
	},
	ssr: {
		external: ['kokoro-js']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
