import { test, expect, type Page } from '@playwright/test';

/**
 * Key-free UI assertions: the footer pane toggles, the demo pane's View-source
 * flip showing the real executed module source, and lesson diagrams rendering.
 * None of these drive an LLM, so they run in every CI environment without a key.
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
	test('the footer pane toggles show and hide the narrative and demo panes', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/tools', { waitUntil: 'networkidle' });

		const narrative = page.locator('.narrative-pane');
		const demo = page.locator('.demo-pane');
		// The footer (LessonNav) exposes a book toggle and a wrench toggle — no
		// keyboard shortcuts; the panes are driven by these buttons.
		const bookToggle = page.locator('button[title="Toggle the reading pane"]');
		const workshopToggle = page.locator('button[title="Toggle the demo pane"]');

		// Default: both panes present (Workshop + Book on).
		await expect(narrative).toHaveCount(1);
		await expect(demo).toHaveCount(1);

		// The book toggle hides the narrative pane, leaving the demo pane.
		await bookToggle.click();
		await expect(narrative).toHaveCount(0);
		await expect(demo).toHaveCount(1);

		// Toggling it again restores the narrative pane.
		await bookToggle.click();
		await expect(narrative).toHaveCount(1);

		// The wrench toggle hides the demo pane, leaving the narrative pane.
		await workshopToggle.click();
		await expect(demo).toHaveCount(0);
		await expect(narrative).toHaveCount(1);
		await workshopToggle.click();
		await expect(demo).toHaveCount(1);

		expect(errors).toEqual([]);
	});

	test('View source shows the real executed module source (no drift)', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/tools', { waitUntil: 'networkidle' });

		// Flip the demo pane to its source view (the toolbar "View source" button).
		const viewSource = page.getByRole('button', { name: /view source/i });
		await expect(viewSource).toBeVisible({ timeout: 10_000 });
		await viewSource.click();

		// Open the executed module's file — the page runs runDatabaseDemo from
		// src/lib/demos/tools-database.ts, so its source must show that export.
		await page.getByRole('tab', { name: 'tools-database.ts' }).click();

		const codeText = (await page.locator('.demo-pane pre').first().textContent()) ?? '';
		expect(codeText, 'View source did not show the executed module source').toContain(
			'runDatabaseDemo'
		);

		expect(errors).toEqual([]);
	});

	test('lessons embed a diagram image', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/overview', { waitUntil: 'networkidle' });

		// Lessons render their diagrams as PNG HeroImages inside <figure class="diagram">.
		const figure = page.locator('.diagram').first();
		await figure.scrollIntoViewIfNeeded();
		const img = figure.locator('img').first();

		// The PNG must actually load: naturalWidth > 0 proves the asset resolved and
		// rendered, not just an empty/broken <img> box.
		await expect
			.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
				timeout: 10_000
			})
			.toBeGreaterThan(0);
		await expect(img).toBeVisible();

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
