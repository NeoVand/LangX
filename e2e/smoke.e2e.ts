import { test, expect } from '@playwright/test';
import { chapters } from '../src/lib/curriculum';

const ROUTES = [
	'/',
	'/setup',
	'/glossary',
	...chapters.flatMap((ch) => [ch.base, ...ch.lessons.map((l) => `${ch.base}/${l.slug}`)])
];

test.describe('LangX smoke', () => {
	for (const route of ROUTES) {
		test(`renders ${route}`, async ({ page }) => {
			const errors: string[] = [];
			// Page errors are the real ones — uncaught exceptions inside the page.
			page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
			// Suppress 404s for hero images (placeholder SVG covers them).
			page.on('requestfailed', (req) => {
				if (/\/heroes\//.test(req.url())) return;
				errors.push(`requestfailed: ${req.method()} ${req.url()}`);
			});
			// Capture console errors that aren't benign 404s or sourcemap warnings.
			page.on('console', (msg) => {
				if (msg.type() !== 'error') return;
				const text = msg.text();
				if (/sourcemap/i.test(text)) return;
				if (/Failed to load resource/i.test(text)) return; // network 404s are handled above
				errors.push(`console.error: ${text}`);
			});

			const response = await page.goto(route, { waitUntil: 'networkidle' });
			expect(response?.status(), `route ${route} returned ${response?.status()}`).toBeLessThan(
				400
			);

			await expect(page.locator('body')).toBeVisible();
			// Each page should have at least one heading rendered.
			await expect(page.locator('h1, h2').first()).toBeVisible();

			expect(errors, `errors on ${route}:\n${errors.join('\n')}`).toEqual([]);
		});
	}
});
