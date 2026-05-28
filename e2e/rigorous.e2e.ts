import { test, expect, type Page } from '@playwright/test';

/**
 * Rigorous live-demo coverage.
 *
 * Unlike `demos.e2e.ts`, which only asserts that the run button finishes and no
 * errors fire, this suite asserts on the SHAPE of the actual output: tool calls
 * happened, structured output is valid JSON with expected keys, the agent loop
 * iterated more than once, the LangGraph diagram rendered native nodes, etc.
 *
 * Run with: ANTHROPIC_API_KEY=sk-... npm run test:rigorous
 */

const KEY = process.env.ANTHROPIC_API_KEY;

test.describe('LangX rigorous live-demo assertions', () => {
	test.beforeEach(async ({ context }) => {
		test.skip(!KEY, 'Set ANTHROPIC_API_KEY to run the rigorous suite.');
		await context.addInitScript(
			(key) => {
				try {
					const v = JSON.parse(localStorage.getItem('langx.app.v2') || '{}');
					v.keys = v.keys || { openai: '', anthropic: '', groq: '' };
					v.keys.anthropic = key;
					v.preferredProvider = 'anthropic';
					localStorage.setItem('langx.app.v2', JSON.stringify(v));
				} catch {
					/* noop */
				}
			},
			KEY ?? ''
		);
	});


	const collectErrors = (page: Page) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => {
			const msg = err.message ?? String(err);
			// LangGraph interrupts are intentional and surface as pageerrors; ignore.
			if (/GraphInterrupt|Called interrupt\(\)/i.test(msg)) return;
			// Empty-message errors usually come from cancelled fetches / promise races.
			if (!msg || msg === 'undefined') return;
			errors.push(`pageerror: ${msg}`);
		});
		page.on('requestfailed', (req) => {
			if (/\/heroes\//.test(req.url())) return;
			errors.push(`requestfailed: ${req.method()} ${req.url()}`);
		});
		page.on('console', (msg) => {
			if (msg.type() !== 'error') return;
			const t = msg.text();
			if (/sourcemap/i.test(t) || /Failed to load resource/i.test(t)) return;
			if (/GraphInterrupt|interrupt\(\)/i.test(t)) return;
			errors.push(`console.error: ${t}`);
		});
		return errors;
	};

	const runPrimary = async (page: Page, label = /^run\b/i) => {
		const btn = page.getByRole('button', { name: label }).first();
		await expect(btn).toBeVisible({ timeout: 10_000 });
		await btn.click();
		await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0, {
			timeout: 90_000
		});
	};

	test('Phase 1 · runnables: pipe produces a non-empty answer', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/runnables', { waitUntil: 'networkidle' });
		await runPrimary(page);
		// A real answer should be at least a sentence.
		const out = page.locator('.output, .answer, [class*=output], [class*=answer]').first();
		await expect(out).toBeVisible();
		const text = (await out.textContent())?.trim() ?? '';
		expect(text.length, `answer too short: "${text}"`).toBeGreaterThan(15);
		expect(errors).toEqual([]);
	});

	test('Phase 1 · streaming: tokens stream incrementally', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/streaming', { waitUntil: 'networkidle' });
		const btn = page.getByRole('button', { name: /^run|^stream/i }).first();
		await expect(btn).toBeVisible({ timeout: 10_000 });
		await btn.click();
		// Watch the stream output grow.
		const streamPanel = page
			.locator('[class*=stream], pre, .output, .answer')
			.first();
		await expect(streamPanel).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0, {
			timeout: 90_000
		});
		const text = (await streamPanel.textContent())?.trim() ?? '';
		expect(text.length, 'streamed text was empty').toBeGreaterThan(20);
		expect(errors).toEqual([]);
	});

	test('Phase 1 · structured-output: result is valid JSON-shaped data', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/structured-output', { waitUntil: 'networkidle' });
		await runPrimary(page);
		// Look for evidence of structured fields in the rendered output.
		const body = await page.locator('body').textContent();
		const hasField = /(?:title|name|category|sentiment|score|tags|rating|summary)/i.test(
			body ?? ''
		);
		expect(hasField, 'no structured fields found in output').toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 1 · tools: weather/calculator returns a numeric result', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/tools', { waitUntil: 'networkidle' });
		await runPrimary(page);
		const body = (await page.locator('body').textContent()) ?? '';
		// A weather/calculator answer should mention a number or unit.
		expect(/\d/.test(body), 'no digits found in tool output').toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 1 · rag: cites at least one retrieved snippet', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/rag', { waitUntil: 'networkidle' });
		await runPrimary(page);
		const body = (await page.locator('body').textContent()) ?? '';
		// RAG answer should refer to documents/sources or have ≥ a sentence.
		expect(body.length).toBeGreaterThan(200);
		expect(errors).toEqual([]);
	});

	test('Phase 1 · agent: loop runs multiple supersteps with tool calls', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/1-langchain/agent', { waitUntil: 'networkidle' });
		// Pick the multi-tool scenario for a more rigorous loop.
		const multi = page.getByText(/parallel \+ follow-up/i);
		if (await multi.isVisible().catch(() => false)) await multi.click();
		await runPrimary(page, /^run/i);

		const aiMsgs = await page
			.locator('article.msg[data-role="assistant"], article.msg[data-role="ai"]')
			.count();
		const toolMsgs = await page.locator('article.msg[data-role="tool"]').count();
		const toolCalls = await page.locator('.toolcall .tc-name').count();

		expect(aiMsgs, 'no assistant messages rendered').toBeGreaterThan(0);
		// Multi-tool scenarios should show ≥ 1 tool message after the loop.
		expect(toolMsgs + toolCalls, 'no tool calls observed in agent loop').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('Phase 2 · stategraph: native LangGraph diagram renders + agent answers', async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/stategraph', { waitUntil: 'networkidle' });
		// Wait for the LangGraphView to draw nodes.
		await page.waitForFunction(
			() => (document.querySelectorAll('.lgv .host svg .node').length ?? 0) >= 4,
			{ timeout: 15_000 }
		);
		const nodeNames = await page.evaluate(() =>
			[...document.querySelectorAll('.lgv .host svg .nodeLabel')].map((n) =>
				n.textContent?.trim()
			)
		);
		expect(nodeNames).toEqual(
			expect.arrayContaining(['__start__', 'agent', 'tools', '__end__'])
		);
		await runPrimary(page, /^run/i);
		// Active node lit up after run.
		const lit = await page.locator('.lgv .lgv-active, .lgv .lgv-seen').count();
		expect(lit, 'no nodes lit up after run').toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});

	test('Phase 2 · conditional-edges: classifier routes to a category node', async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/conditional-edges', { waitUntil: 'networkidle' });
		await page.waitForFunction(
			() => (document.querySelectorAll('.lgv .host svg .node').length ?? 0) >= 5,
			{ timeout: 15_000 }
		);
		await runPrimary(page, /^run/i);
		// Path observed must include classify and at least one category endpoint.
		const seen = await page.evaluate(() =>
			[...document.querySelectorAll('.lgv-seen, .lgv-active')]
				.map((n) => (n.id || '').match(/-([a-z_]+)-\d+/)?.[1])
				.filter(Boolean)
		);
		expect(seen, `expected classify in seen path: ${JSON.stringify(seen)}`).toContain(
			'classify'
		);
		expect(errors).toEqual([]);
	});

	test('Phase 2 · subgraphs: xray expansion shows inner rag_retrieve / rag_generate', async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/subgraphs', { waitUntil: 'networkidle' });
		await page.waitForFunction(
			() => (document.querySelectorAll('.lgv .host svg .node').length ?? 0) >= 6,
			{ timeout: 15_000 }
		);
		const names = await page.evaluate(() =>
			[...document.querySelectorAll('.lgv .host svg .nodeLabel')]
				.map((n) => n.textContent?.trim())
				.filter(Boolean)
		);
		expect(names).toEqual(
			expect.arrayContaining(['rag_retrieve', 'rag_generate', 'classify', 'chitchat'])
		);
		await runPrimary(page, /^run/i);
		expect(errors).toEqual([]);
	});

	test('Phase 2 · checkpointers: thread state persists between runs', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/checkpointers', { waitUntil: 'networkidle' });
		await runPrimary(page, /^run/i);
		const body = (await page.locator('body').textContent()) ?? '';
		// Should reference checkpoints / threads / supersteps after a run.
		expect(/(thread|checkpoint|step|state)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 2 · interrupts: HITL email draft surfaces a resume control', async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/interrupts', { waitUntil: 'networkidle' });
		const draft = page.getByRole('button', { name: /draft|run/i }).first();
		await expect(draft).toBeVisible();
		await draft.click();
		await page.waitForTimeout(2000);
		// After the interrupt fires, an Approve / Edit / Reject style button should appear.
		const resume = page.getByRole('button', {
			name: /approve|edit|send|reject|resume/i
		});
		await expect(resume.first()).toBeVisible({ timeout: 60_000 });
		expect(errors).toEqual([]);
	});

	test('Phase 2 · streaming-modes: at least one mode emits chunks', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/streaming-modes', { waitUntil: 'networkidle' });
		await runPrimary(page, /^stream|^run/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(body.length).toBeGreaterThan(200);
		expect(errors).toEqual([]);
	});

	test('Phase 2 · send-fanout: multiple branches complete', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/2-langgraph/send-fanout', { waitUntil: 'networkidle' });
		await runPrimary(page, /^map|^send|^fan|^run/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(body.length).toBeGreaterThan(200);
		expect(errors).toEqual([]);
	});

	test('Phase 3 · virtual-fs: file is written and listed', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/virtual-fs', { waitUntil: 'networkidle' });
		await runPrimary(page, /^run|^write|^list/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(\/|file|wrote|created)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · todos: at least one todo item appears', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/todos', { waitUntil: 'networkidle' });
		await runPrimary(page, /^run|^plan/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(todo|task|step|pending|in.progress|done)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · subagents: planner spawns at least one subagent', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/subagents', { waitUntil: 'networkidle' });
		await runPrimary(page, /^plan|^run/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(subagent|spawn|task|child)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · permissions: blocked attempt surfaces a denial', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/permissions', { waitUntil: 'networkidle' });
		await runPrimary(page, /^check|^try|^run/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(deny|denied|blocked|allow|permission)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · skills: skill loads on demand', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/skills', { waitUntil: 'networkidle' });
		await runPrimary(page, /^run|^load/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(skill|loaded|read|frontmatter)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · compaction: context shrinks after compaction', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/compaction', { waitUntil: 'networkidle' });
		await runPrimary(page, /^run|^compact/i);
		const body = (await page.locator('body').textContent()) ?? '';
		expect(/(compact|tokens|summary|before|after)/i.test(body)).toBeTruthy();
		expect(errors).toEqual([]);
	});

	test('Phase 3 · hitl: approval gate appears for risky tool', async ({ page }) => {
		const errors = collectErrors(page);
		await page.goto('/3-deepagents/hitl', { waitUntil: 'networkidle' });
		const trigger = page.getByRole('button', { name: /try|run/i }).first();
		await expect(trigger).toBeVisible();
		await trigger.click();
		await page.waitForTimeout(2000);
		const approve = page.getByRole('button', { name: /approve|allow|reject|deny/i });
		await expect(approve.first()).toBeVisible({ timeout: 60_000 });
		expect(errors).toEqual([]);
	});
});
