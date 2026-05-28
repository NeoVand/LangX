import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	timeout: 60_000,
	expect: { timeout: 15_000 },
	testMatch: '**/*.e2e.{ts,js}',
	testDir: 'e2e'
});
