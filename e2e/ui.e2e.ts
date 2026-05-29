import { test, expect, type Page } from '@playwright/test';

/**
 * Key-free UI assertions: view-mode toggles, the DemoFrame Code tab showing the
 * real executed source, and inline diagrams rendering. None of these drive an
 * LLM, so they run in every CI environment without an API key.
 */

const collectErrors = (page: Page) => {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('requestfailed', (req) => {
		if (/\/heroes\//.test(req.url())) return;
		errors.push(`requestfailed: ${req.method()} ${req.url()}`);
	});
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const t = msg.text();
		if (/sourcemap/i.test(t) || /Failed to load resource/i.test(t)) return;
		errors.push(`console.error: ${t}`);
	});
	return errors;
};

test.describe('LangX UI (no key required)', () => {
	test('view-mode shortcuts toggle the narrative and demo panes', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/tools', { waitUntil: 'networkidle' });

		const narrative = page.locator('.narrative-pane');
		const demo = page.locator('.demo-pane');

		// Default: both panes present (Workshop + Book on).
		await expect(narrative).toHaveCount(1);
		await expect(demo).toHaveCount(1);

		// B toggles the Book (narrative) pane off, leaving the demo pane.
		await page.locator('body').press('b');
		await expect(narrative).toHaveCount(0);
		await expect(demo).toHaveCount(1);

		// B again restores it.
		await page.locator('body').press('b');
		await expect(narrative).toHaveCount(1);

		// W toggles the Workshop (demo) pane off, leaving the narrative pane.
		await page.locator('body').press('w');
		await expect(demo).toHaveCount(0);
		await expect(narrative).toHaveCount(1);
		await page.locator('body').press('w');
		await expect(demo).toHaveCount(1);

		// P enters presentation mode (overlay + in-presentation root).
		await page.locator('body').press('p');
		await expect(page.locator('.presentation-root.in-presentation')).toHaveCount(1);
		await page.keyboard.press('Escape');
		await expect(page.locator('.presentation-root.in-presentation')).toHaveCount(0);

		expect(errors).toEqual([]);
	});

	test('Code tab shows the real executed module source (no drift)', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/tools', { waitUntil: 'networkidle' });

		// Open the DemoFrame "Code" tab.
		const codeTab = page.getByRole('tab', { name: /^code$/i }).first();
		await expect(codeTab).toBeVisible({ timeout: 10_000 });
		await codeTab.click();

		// The displayed source must contain a token unique to the executed module
		// (src/lib/demos/tools-weather.ts exports runWeatherDemo).
		const codeText = (await page.locator('.demo-pane pre').first().textContent()) ?? '';
		expect(codeText, 'Code tab did not show the executed module source').toContain(
			'runWeatherDemo'
		);

		expect(errors).toEqual([]);
	});

	test('lessons embed an inline SVG diagram', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/agent', { waitUntil: 'networkidle' });
		await expect(page.locator('.diagram svg').first()).toBeVisible({ timeout: 10_000 });
		// The diagram should contain labelled nodes.
		const labels = await page.locator('.diagram svg text').count();
		expect(labels, 'diagram rendered no labels').toBeGreaterThan(2);
		expect(errors).toEqual([]);
	});

	test('no lesson shows a raw [object Object] on first load', async ({ page }) => {
		const errors = collectErrors(page);
		const routes = [
			'/1-langchain/agent',
			'/1-langchain/tools',
			'/2-langgraph/streaming-modes',
			'/3-deepagents/subagents'
		];
		for (const route of routes) {
			await page.goto(route, { waitUntil: 'networkidle' });
			const body = (await page.locator('body').textContent()) ?? '';
			expect(body, `'[object Object' leaked on ${route}`).not.toContain('[object Object');
		}
		expect(errors).toEqual([]);
	});
});
