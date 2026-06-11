import { describe, expect, it } from 'vitest';
import { evaluate, type FilesystemPermission } from '$lib/deepagents';
import { BADGE, OFFICE } from './da-permissions';

// Permissions are policy-as-data: the evaluator's semantics (first match
// wins, declaration order, default-allow, three verbs) and the New Hire's
// badge must both behave exactly as the lesson claims.

describe('the evaluator', () => {
	it('first match wins — declaration order is the policy', () => {
		const allowFirst: FilesystemPermission[] = [
			{ operations: ['write'], paths: ['/a/**'], mode: 'allow' },
			{ operations: ['write'], paths: ['**'], mode: 'deny' }
		];
		expect(evaluate(allowFirst, 'write', '/a/x.md').decision).toBe('allow');

		// Same rules, swapped order: the catch-all now shadows the allow.
		const denyFirst = [allowFirst[1], allowFirst[0]];
		expect(evaluate(denyFirst, 'write', '/a/x.md').decision).toBe('deny');
		expect(evaluate(denyFirst, 'write', '/a/x.md').ruleIndex).toBe(0);
	});

	it('allows by default when no rule matches', () => {
		const r = evaluate(BADGE, 'read', '/notes/standup-mon.md');
		expect(r.decision).toBe('allow');
		expect(r.ruleIndex).toBe(-1);
		expect(r.matchedRule).toBeNull();
	});

	it('only consults rules whose operation matches', () => {
		const rules: FilesystemPermission[] = [
			{ operations: ['read'], paths: ['**'], mode: 'deny' }
		];
		expect(evaluate(rules, 'write', '/x.md').decision).toBe('allow'); // read rule ignores writes
		expect(evaluate(rules, 'read', '/x.md').decision).toBe('deny');
	});

	it('surfaces the interrupt verb', () => {
		const r = evaluate(BADGE, 'write', '/config/team.yaml');
		expect(r.decision).toBe('interrupt');
		expect(r.ruleIndex).toBe(1);
		expect(r.reason).toBeUndefined(); // not a refusal — a summons
	});
});

describe("the new hire's badge", () => {
	const expectVerdict = (
		op: 'read' | 'write',
		path: string,
		decision: string,
		ruleIndex: number
	) => {
		const r = evaluate(BADGE, op, path);
		expect(r.decision, `${op} ${path}`).toBe(decision);
		expect(r.ruleIndex, `${op} ${path}`).toBe(ruleIndex);
	};

	it('produces exactly the verdicts the lesson narrates', () => {
		expectVerdict('read', '/notes/standup-mon.md', 'allow', -1); // default-allow
		expectVerdict('write', '/notes/action-items.md', 'allow', 2);
		expectVerdict('write', '/docs/handbook.md', 'allow', 2);
		expectVerdict('read', '/secrets/payroll.md', 'deny', 0); // even reads bounce
		expectVerdict('write', '/secrets/api-keys.txt', 'deny', 0);
		expectVerdict('write', '/config/team.yaml', 'interrupt', 1); // a human decides
		expectVerdict('read', '/finance/q2-ledger.csv', 'allow', -1);
		expectVerdict('write', '/finance/expenses.csv', 'deny', 3); // closed posture
	});

	it('guards a workspace that actually contains the dangerous things', () => {
		expect(Object.keys(OFFICE)).toContain('/secrets/payroll.md');
		expect(Object.keys(OFFICE)).toContain('/config/team.yaml');
		expect(OFFICE['/finance/q2-ledger.csv']).toContain('intern-budget');
	});
});
