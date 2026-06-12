import { describe, it, expect } from 'vitest';
import {
	StateBackend,
	parseSkillFrontmatter,
	scanSkillCatalog,
	createRunScriptTool,
	buildPromptSections
} from '$lib/deepagents';
import { approxTokens } from '$lib/deepagents/tokens';
import {
	SKILL_FILES,
	SKILL_NAMES,
	EXPECTED,
	crammedInstructions,
	inspectRefundReply,
	inspectDeletionReply
} from './da-skills';

async function seededBackend(): Promise<StateBackend> {
	const backend = new StateBackend();
	for (const [path, content] of Object.entries(SKILL_FILES)) await backend.write(path, content);
	return backend;
}

describe('skill frontmatter & catalog (level 1)', () => {
	it('parses name/description frontmatter and returns the body', () => {
		const parsed = parseSkillFrontmatter(SKILL_FILES['/skills/refund-policy/SKILL.md']);
		expect(parsed?.name).toBe('refund-policy');
		expect(parsed?.description).toContain('refund');
		expect(parsed?.body).toContain('Never compute a refund by hand');
	});

	it('rejects files without proper frontmatter', () => {
		expect(parseSkillFrontmatter('# just markdown')).toBeNull();
		expect(parseSkillFrontmatter('---\nname: x\n---\nbody')).toBeNull(); // no description
	});

	it('scans the shelf into a five-entry catalog', async () => {
		const catalog = await scanSkillCatalog(await seededBackend(), ['/skills/']);
		expect(catalog.map((c) => c.name).sort()).toEqual([...SKILL_NAMES].sort());
		const refund = catalog.find((c) => c.name === 'refund-policy')!;
		expect(refund.file).toBe('/skills/refund-policy/SKILL.md');
	});

	it('skips a skill whose frontmatter name does not match its directory', async () => {
		const backend = await seededBackend();
		await backend.write(
			'/skills/wrong-dir/SKILL.md',
			'---\nname: something-else\ndescription: imposter\n---\nbody'
		);
		const catalog = await scanSkillCatalog(backend, ['/skills/']);
		expect(catalog.find((c) => c.name === 'something-else')).toBeUndefined();
		expect(catalog).toHaveLength(SKILL_NAMES.length);
	});

	it('last source wins when two sources ship the same skill name', async () => {
		const backend = await seededBackend();
		await backend.write(
			'/team-skills/refund-policy/SKILL.md',
			'---\nname: refund-policy\ndescription: the team override\n---\noverride body'
		);
		const catalog = await scanSkillCatalog(backend, ['/skills/', '/team-skills/']);
		const refund = catalog.find((c) => c.name === 'refund-policy')!;
		expect(refund.description).toBe('the team override');
		expect(refund.file).toBe('/team-skills/refund-policy/SKILL.md');
	});
});

describe('prorate.js via run_script (level 3)', () => {
	async function runProrate(input: Record<string, unknown>): Promise<string> {
		const tool = createRunScriptTool({ backend: await seededBackend() });
		return (await tool.invoke({
			path: '/skills/refund-policy/scripts/prorate.js',
			input: JSON.stringify(input)
		})) as string;
	}

	it('computes the headline case to the cent — Pro annual, Mar 3 → Jun 12', async () => {
		const out = JSON.parse(
			await runProrate({
				plan: 'pro',
				interval: 'annual',
				purchaseDate: '2026-03-03',
				cancelDate: '2026-06-12'
			})
		);
		expect(out.refund).toBe(EXPECTED.refund); // 277.67
		expect(out.gross).toBe(EXPECTED.gross); // 326.67
		expect(out.fee).toBe(EXPECTED.fee); // 49.00
		expect(out.unusedMonths).toBe(EXPECTED.unusedMonths); // 8
		expect(out.fullRefund).toBe(false);
	});

	it('honors the 14-day full-refund window, fee-free', async () => {
		const out = JSON.parse(
			await runProrate({
				plan: 'pro',
				interval: 'annual',
				purchaseDate: '2026-06-01',
				cancelDate: '2026-06-10'
			})
		);
		expect(out).toMatchObject({ refund: 490, fee: 0, fullRefund: true });
	});

	it('monthly plans refund nothing — cancellation stops renewal', async () => {
		const out = JSON.parse(
			await runProrate({
				plan: 'starter',
				interval: 'monthly',
				purchaseDate: '2026-01-10',
				cancelDate: '2026-06-01'
			})
		);
		expect(out.refund).toBe(0);
		expect(out.note).toContain('no refund');
	});

	it('returns readable errors for bad input and missing scripts', async () => {
		expect(await runProrate({ plan: 'platinum', interval: 'annual' })).toContain('unknown plan');
		const tool = createRunScriptTool({ backend: new StateBackend() });
		expect(await tool.invoke({ path: '/skills/nope.js', input: '{}' })).toContain('No script at');
	});
});

describe('the inspector', () => {
	const GOOD_REPLY =
		'Your cancellation is confirmed, effective today. You will receive $277.67 back — that is ' +
		'$326.67 for your 8 unused months minus the 15% early-termination fee of $49. The refund ' +
		'arrives in 5–7 business days to your original payment method, and your access continues ' +
		'until the end of the current paid month. — The Lumen team';

	it('passes a compliant refund reply', () => {
		const v = inspectRefundReply(GOOD_REPLY);
		expect(v.checks.map((c) => c.pass)).toEqual([true, true, true, true]);
		expect(v.pass).toBe(true);
	});

	it('catches an invented refund amount BY VALUE', () => {
		const v = inspectRefundReply(
			'Good news! You qualify for a prorated refund of $305.00, arriving in 5–7 business days.'
		);
		expect(v.pass).toBe(false);
		expect(v.checks[0].pass).toBe(false); // not the right amount
		expect(v.checks[3].pass).toBe(false); // and it made one up
		expect(v.checks[3].detail).toContain('$305');
	});

	it('fails a right-amount reply that skips required disclosures', () => {
		const v = inspectRefundReply('You will get $277.67 back. Cancellation confirmed.');
		expect(v.checks[0].pass).toBe(true);
		expect(v.pass).toBe(false); // fee + timeline missing
	});

	it('judges deletion replies against the data-deletion procedure', () => {
		const good = inspectDeletionReply(
			'Deletion request DEL-20260612 confirmed (identity verified via your billing email). ' +
				'Before erasure we offer a full data export — the offer stands 7 days. Your account ' +
				'enters a 30-day grace window, restorable by replying to the confirmation email.'
		);
		expect(good.pass).toBe(true);
		const vague = inspectDeletionReply('Done! Your account will be deleted shortly.');
		expect(vague.pass).toBe(false);
		expect(vague.checks.filter((c) => c.pass)).toHaveLength(0);
	});
});

describe('context anatomy — the whole point', () => {
	it('cramming costs several times more prompt than the catalog, every round', async () => {
		const crammedUser = approxTokens(crammedInstructions());

		const catalog = await scanSkillCatalog(await seededBackend(), ['/skills/']);
		const sections = buildPromptSections({
			user: 'You are the support agent.',
			skills: catalog.map((c) => ({ name: c.name, description: c.description, file: c.file }))
		});
		const catalogSection = sections.find((s) => s.key === 'skills')!;
		const catalogTokens = approxTokens(catalogSection.text);

		// Even with five deliberately SMALL skills the crammed prompt is ~4x the
		// catalog — production skills run thousands of tokens each, so the gap
		// only widens. (Anthropic's real pptx skill alone is bigger than all five.)
		expect(crammedUser).toBeGreaterThan(1200); // five manuals, every round
		expect(catalogTokens).toBeLessThan(420); // five description lines
		expect(crammedUser / catalogTokens).toBeGreaterThan(3);

		// And the catalog names every skill, so the agent can still find them all.
		for (const name of SKILL_NAMES) expect(catalogSection.text).toContain(name);
	});
});
