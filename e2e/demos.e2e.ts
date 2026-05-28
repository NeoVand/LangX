import { test, expect } from '@playwright/test';

/**
 * Lesson demo coverage. Reads ANTHROPIC_API_KEY from process.env and seeds it
 * into localStorage before navigating, so each lesson's primary demo button
 * drives a real Claude Haiku 4.5 call.
 */

const KEY = process.env.ANTHROPIC_API_KEY;

interface LessonCase {
	route: string;
	/** Regex matched against the primary demo button text. */
	button: RegExp;
	/** Skip the live-call assertion if true (page is static, e.g. system-prompt assembly). */
	staticOnly?: boolean;
}

const lessons: LessonCase[] = [
	{ route: '/1-langchain/runnables', button: /^run\b/i },
	{ route: '/1-langchain/streaming', button: /^run\b/i },
	{ route: '/1-langchain/structured-output', button: /^run\b/i },
	{ route: '/1-langchain/tools', button: /^run\b/i },
	{ route: '/1-langchain/rag', button: /^run\b/i },
	{ route: '/1-langchain/agent', button: /^run\b/i },
	{ route: '/2-langgraph/stategraph', button: /^run\b/i },
	{ route: '/2-langgraph/conditional-edges', button: /^run\b/i },
	{ route: '/2-langgraph/checkpointers', button: /^run\b/i },
	{ route: '/2-langgraph/interrupts', button: /^draft email/i },
	{ route: '/2-langgraph/streaming-modes', button: /^stream\b/i },
	{ route: '/2-langgraph/send-fanout', button: /^map\b|^send\b|^fan/i },
	{ route: '/2-langgraph/subgraphs', button: /^run\b/i },
	{ route: '/3-deepagents/harness', button: /./, staticOnly: true },
	{ route: '/3-deepagents/virtual-fs', button: /^run\b/i },
	{ route: '/3-deepagents/todos', button: /^run\b/i },
	{ route: '/3-deepagents/backends', button: /^run\b/i },
	{ route: '/3-deepagents/permissions', button: /^check\b|^try\b|^run\b/i },
	{ route: '/3-deepagents/subagents', button: /^plan/i },
	{ route: '/3-deepagents/skills', button: /^run\b|^load\b/i },
	{ route: '/3-deepagents/compaction', button: /^run\b|^compact\b/i },
	{ route: '/3-deepagents/hitl', button: /^try\b/i }
];

test.describe('LangX live demos', () => {
	test.beforeEach(async ({ context }) => {
		test.skip(!KEY, 'Set ANTHROPIC_API_KEY to run the live-demo suite.');
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

	for (const c of lessons) {
		test(`${c.route} — ${c.staticOnly ? 'renders without errors' : 'runs against Anthropic'}`, async ({
			page
		}) => {
			const errors: string[] = [];
			page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
			page.on('requestfailed', (req) => {
				if (/\/heroes\//.test(req.url())) return;
				errors.push(`requestfailed: ${req.method()} ${req.url()}`);
			});
			page.on('console', (msg) => {
				if (msg.type() !== 'error') return;
				const text = msg.text();
				if (/sourcemap/i.test(text) || /Failed to load resource/i.test(text)) return;
				errors.push(`console.error: ${text}`);
			});

			await page.goto(c.route, { waitUntil: 'networkidle' });

			if (!c.staticOnly) {
				const runBtn = page.getByRole('button', { name: c.button }).first();
				await expect(runBtn).toBeVisible({ timeout: 10_000 });
				await runBtn.click();
				await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0, {
					timeout: 60_000
				});
			}

			expect(errors, `errors on ${c.route}:\n${errors.join('\n')}`).toEqual([]);
		});
	}
});
