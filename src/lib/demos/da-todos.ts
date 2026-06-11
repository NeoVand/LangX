/**
 * "The Data Janitor" — planning as the product. An agent is handed a dirty
 * dataset, drafts its cleaning plan with write_todos, and STOPS for human
 * review (plan mode, the Claude Code way). You can edit the board — reword,
 * delete, reorder, add — then execution starts, and the plan keeps living:
 * statuses tick as steps finish, and when validation surfaces a problem the
 * plan never anticipated (rows that can't be auto-fixed), the agent REPLANS —
 * write_todos replaces the whole list, so inserting recovery steps mid-run is
 * the tool's native gesture, not an exception.
 *
 * The transforms themselves are deterministic little tools on purpose: this
 * chapter is about the plan, so the plan is the only thing the model is
 * trusted to produce. Every run reproduces the same counts (locked by a unit
 * test in da-todos.test.ts).
 *
 * This is the exact source the demo runs.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type DeepAgentStateType,
	type Todo
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

// ── The seeded dataset ─────────────────────────────────────────────────────────
// 40 order rows with four kinds of planted dirt:
//  · 12 dates in the wrong format (8 US "5/2/2026", 4 written "3 May 2026")
//  · 3 exact duplicate rows (ORD-1007, ORD-1015, ORD-1022 appear twice)
//  · 2 totals that don't equal qty × unit_price (typos — auto-fixable)
//  · 3 rows with negative quantities/totals (refunds or import errors —
//    internally consistent, so NOT auto-fixable: a policy call, not a typo)

export const SEED_CSV = `order_id,date,customer,sku,qty,unit_price,total
ORD-1001,2026-05-01,Ada Lovelace,MUG-001,2,14.00,28.00
ORD-1002,2026-05-01,Grace Hopper,TEE-002,1,22.50,22.50
ORD-1003,5/2/2026,Alan Turing,PIN-004,5,3.50,17.50
ORD-1004,2026-05-02,Edsger Dijkstra,BAG-005,1,89.00,89.00
ORD-1005,3 May 2026,Barbara Liskov,MUG-001,3,14.00,42.00
ORD-1006,2026-05-03,Donald Knuth,CAP-003,2,18.75,37.50
ORD-1007,2026-05-04,Radia Perlman,TEE-002,2,22.50,45.00
ORD-1008,5/4/2026,Vint Cerf,PIN-004,10,3.50,35.00
ORD-1009,2026-05-05,Ken Thompson,MUG-001,3,14.00,24.00
ORD-1010,2026-05-05,Dennis Ritchie,BAG-005,1,89.00,89.00
ORD-1011,5/6/2026,Bjarne Stroustrup,CAP-003,1,18.75,18.75
ORD-1012,2026-05-06,Guido van Rossum,TEE-002,3,22.50,67.50
ORD-1013,2026-05-07,Margaret Hamilton,PIN-004,4,3.50,14.00
ORD-1007,2026-05-04,Radia Perlman,TEE-002,2,22.50,45.00
ORD-1014,8 May 2026,Linus Torvalds,MUG-001,1,14.00,14.00
ORD-1015,2026-05-08,Katherine Johnson,BAG-005,2,89.00,178.00
ORD-1016,2026-05-09,Tim Berners-Lee,CAP-003,3,18.75,56.25
ORD-1017,5/9/2026,Frances Allen,TEE-002,1,22.50,22.50
ORD-1018,2026-05-10,John Carmack,PIN-004,6,3.50,21.00
ORD-1019,2026-05-10,Anita Borg,MUG-001,4,14.00,56.00
ORD-1020,2026-05-11,Claude Shannon,BAG-005,1,89.00,89.00
ORD-1021,5/11/2026,Adele Goldberg,CAP-003,2,18.75,37.50
ORD-1015,2026-05-08,Katherine Johnson,BAG-005,2,89.00,178.00
ORD-1022,2026-05-12,Brian Kernighan,TEE-002,2,22.50,45.00
ORD-1023,2026-05-12,Hedy Lamarr,PIN-004,8,3.50,28.00
ORD-1024,13 May 2026,Niklaus Wirth,MUG-001,2,14.00,28.00
ORD-1025,2026-05-13,Sophie Wilson,CAP-003,1,18.75,18.75
ORD-1026,2026-05-14,John Backus,TEE-002,2,22.50,4.50
ORD-1027,5/14/2026,Lynn Conway,PIN-004,3,3.50,10.50
ORD-1028,2026-05-15,Seymour Cray,BAG-005,1,89.00,89.00
ORD-1029,2026-05-15,Evelyn Boyd,TEE-002,-2,22.50,-45.00
ORD-1030,2026-05-16,Steve Wozniak,CAP-003,2,18.75,37.50
ORD-1031,17 May 2026,Gordon Moore,MUG-001,5,14.00,70.00
ORD-1032,5/17/2026,Robert Noyce,TEE-002,1,22.50,22.50
ORD-1022,2026-05-12,Brian Kernighan,TEE-002,2,22.50,45.00
ORD-1033,2026-05-18,Jean Bartik,PIN-004,-7,3.50,-24.50
ORD-1034,2026-05-18,Mary Shaw,MUG-001,2,14.00,28.00
ORD-1035,5/19/2026,David Patterson,CAP-003,4,18.75,75.00
ORD-1036,2026-05-19,John Hennessy,PIN-004,2,3.50,7.00
ORD-1037,2026-05-20,Marlyn Meltzer,BAG-005,-1,89.00,-89.00
`;

// ── CSV helpers + pure transforms ──────────────────────────────────────────────
// Pure string → result functions: the tools wrap these, the unit test locks
// them. No Date(), no randomness — fully deterministic.

export function parseCsv(csv: string): { header: string[]; rows: string[][] } {
	const lines = csv.trim().split(/\r?\n/);
	return { header: lines[0].split(','), rows: lines.slice(1).map((l) => l.split(',')) };
}

function serializeCsv(header: string[], rows: string[][]): string {
	return [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const US_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const WRITTEN_RE = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/;
const MONTHS: Record<string, string> = {
	january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
	july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

export function dateKind(value: string): 'iso' | 'us' | 'written' | 'other' {
	if (ISO_RE.test(value)) return 'iso';
	if (US_RE.test(value)) return 'us';
	const w = value.match(WRITTEN_RE);
	if (w && MONTHS[w[2].toLowerCase()]) return 'written';
	return 'other';
}

function toIso(value: string): string | null {
	if (ISO_RE.test(value)) return value;
	const us = value.match(US_RE);
	if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
	const w = value.match(WRITTEN_RE);
	if (w && MONTHS[w[2].toLowerCase()])
		return `${w[3]}-${MONTHS[w[2].toLowerCase()]}-${w[1].padStart(2, '0')}`;
	return null;
}

export const COL = { id: 0, date: 1, customer: 2, sku: 3, qty: 4, price: 5, total: 6 };
const money = (n: number) => n.toFixed(2);
const offBy = (r: string[]) =>
	Math.abs(Number(r[COL.qty]) * Number(r[COL.price]) - Number(r[COL.total])) > 0.005;
const badBusiness = (r: string[]) => Number(r[COL.qty]) < 1 || Number(r[COL.total]) < 0;

export function profileCsv(csv: string): string {
	const { header, rows } = parseCsv(csv);
	const kinds = { iso: 0, us: 0, written: 0, other: 0 };
	for (const r of rows) kinds[dateKind(r[COL.date])]++;
	const ids = rows.map((r) => r[COL.id]);
	const dupRows = ids.length - new Set(ids).size;
	const mismatches = rows.filter(offBy).length;
	return [
		`${rows.length} rows × ${header.length} columns (${header.join(', ')})`,
		`dates: ${kinds.iso} ISO (2026-05-01) · ${kinds.us} US (5/2/2026) · ${kinds.written} written (3 May 2026)${kinds.other ? ` · ${kinds.other} unparseable` : ''}`,
		`order_id: ${new Set(ids).size} unique — ${dupRows} duplicated row${dupRows === 1 ? '' : 's'}`,
		`arithmetic: ${mismatches} row${mismatches === 1 ? '' : 's'} where total ≠ qty × unit_price`,
		`${new Set(rows.map((r) => r[COL.sku])).size} distinct skus · ${new Set(rows.map((r) => r[COL.customer])).size} customers`,
		`(structural profile only — business rules are checked by validate_data)`
	].join('\n');
}

export function normalizeDatesCsv(csv: string): { csv: string; converted: number } {
	const { header, rows } = parseCsv(csv);
	let converted = 0;
	for (const r of rows) {
		const iso = toIso(r[COL.date]);
		if (iso && iso !== r[COL.date]) {
			r[COL.date] = iso;
			converted++;
		}
	}
	return { csv: serializeCsv(header, rows), converted };
}

export function dedupeCsv(csv: string): { csv: string; removed: number } {
	const { header, rows } = parseCsv(csv);
	const seen = new Set<string>();
	const kept = rows.filter((r) => {
		if (seen.has(r[COL.id])) return false;
		seen.add(r[COL.id]);
		return true;
	});
	return { csv: serializeCsv(header, kept), removed: rows.length - kept.length };
}

export function fixTotalsCsv(csv: string): { csv: string; fixed: number } {
	const { header, rows } = parseCsv(csv);
	let fixed = 0;
	for (const r of rows) {
		if (offBy(r)) {
			r[COL.total] = money(Number(r[COL.qty]) * Number(r[COL.price]));
			fixed++;
		}
	}
	return { csv: serializeCsv(header, rows), fixed };
}

export interface ValidationRule {
	rule: string;
	pass: boolean;
	failures: number;
	detail: string;
}

export function validateCsv(csv: string): ValidationRule[] {
	const { rows } = parseCsv(csv);
	const list = (bad: string[][], fmt: (r: string[]) => string) =>
		bad.slice(0, 5).map(fmt).join(', ') + (bad.length > 5 ? ', …' : '');

	const nonIso = rows.filter((r) => !ISO_RE.test(r[COL.date]));
	const seen = new Set<string>();
	const dups = rows.filter((r) => (seen.has(r[COL.id]) ? true : (seen.add(r[COL.id]), false)));
	const mismatched = rows.filter(offBy);
	const negative = rows.filter(badBusiness);

	return [
		{
			rule: 'every date is ISO (YYYY-MM-DD)',
			pass: nonIso.length === 0,
			failures: nonIso.length,
			detail: nonIso.length ? list(nonIso, (r) => `${r[COL.id]} (${r[COL.date]})`) : 'all dates ISO'
		},
		{
			rule: 'order_id is unique',
			pass: dups.length === 0,
			failures: dups.length,
			detail: dups.length ? list(dups, (r) => r[COL.id]) : 'no duplicates'
		},
		{
			rule: 'total = qty × unit_price',
			pass: mismatched.length === 0,
			failures: mismatched.length,
			detail: mismatched.length
				? list(
						mismatched,
						(r) => `${r[COL.id]} (${r[COL.total]} should be ${money(Number(r[COL.qty]) * Number(r[COL.price]))})`
					)
				: 'all totals consistent'
		},
		{
			rule: 'qty ≥ 1 and total ≥ 0',
			pass: negative.length === 0,
			failures: negative.length,
			detail: negative.length
				? list(negative, (r) => `${r[COL.id]} (qty ${r[COL.qty]}, total ${r[COL.total]})`) +
					' — internally consistent, so NOT auto-fixable: refunds or import sign errors, a policy call'
				: 'no negative rows'
		}
	];
}

export function quarantineCsv(csv: string): { clean: string; quarantined: string; moved: number } {
	const { header, rows } = parseCsv(csv);
	const bad = rows.filter(badBusiness);
	const good = rows.filter((r) => !badBusiness(r));
	return {
		clean: serializeCsv(header, good),
		quarantined: serializeCsv(header, bad),
		moved: bad.length
	};
}

// ── The harness build ──────────────────────────────────────────────────────────

export interface JanitorHooks {
	onState?: (state: DeepAgentStateType) => void;
	onValidate?: (rules: ValidationRule[]) => void;
	onTrace?: (events: TraceEvent[]) => void;
}

export interface Janitor {
	agent: CompiledDeepAgent;
	/** Phase 1 — profile + draft the plan, then stop for human review. */
	draftPlan(): Promise<{ todos: Todo[]; ask: string }>;
	/** Phase 2 — execute; pass the human-revised step list if the board was edited. */
	execute(revised?: string[]): Promise<DeepAgentStateType>;
	readFile(path: string): Promise<string | null>;
	finalText(state: DeepAgentStateType): string;
}

const DATA_PATH = '/data/orders.csv';
const ORIGINAL_PATH = '/data/orders.original.csv';
const QUARANTINE_PATH = '/data/quarantine.csv';
const REPORT_PATH = '/report/cleanup.md';

const SYSTEM_PROMPT = `You are the Data Janitor — a careful, methodical data-cleaning agent.

PHASE 1 — PLAN. When asked to plan:
- Call profile_data on ${DATA_PATH} FIRST. Plan from evidence, never from guesses.
- Then write_todos a 5–7 step cleaning plan that addresses exactly what the
  profile found, ending with: validate, then write the report.
- Then reply with ONE short sentence asking the human to review the plan, and
  STOP. Run no transforms before approval.

PHASE 2 — EXECUTE. After the human approves (they may have revised the plan):
- Work the board one step at a time. Keep it current with write_todos: the
  current step in_progress, finished steps completed, the FULL list every
  time. Exactly ONE step is in_progress at any moment.
- validate_data is the gate before the report. If validation reveals problems
  the plan didn't anticipate, REPLAN: write_todos the full updated list —
  completed steps stay, new recovery steps go where they belong. Rows that
  cannot be auto-fixed are quarantined (quarantine_rows) and documented; that
  is the standard recovery.
- Finish by writing ${REPORT_PATH}: what was found, what was fixed (with
  counts), what was quarantined and why, and the final row count. Then reply
  with a 2–3 sentence summary.

RULES:
- ${ORIGINAL_PATH} is the untouched source — never write to it (blocked anyway).
- Never invent or hand-edit data rows. Only the transform tools touch the dataset.
- The board is the contract with the human watching it: keep it current.`;

export async function buildJanitor(hooks: JanitorHooks = {}): Promise<Janitor> {
	const events: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		events.push(ev);
		hooks.onTrace?.([...events]);
	});

	const backend = new StateBackend();
	await backend.write(DATA_PATH, SEED_CSV);
	await backend.write(ORIGINAL_PATH, SEED_CSV);

	const need = async (path: string) => {
		const csv = await backend.read(path);
		if (csv == null) throw new Error(`File not found: ${path}`);
		return csv;
	};

	const profileData = tool(async ({ path }) => profileCsv(await need(path)), {
		name: 'profile_data',
		description:
			'Structural profile of a CSV: row/column counts, date-format breakdown, duplicate order_ids, arithmetic consistency. Run this before planning.',
		schema: z.object({ path: z.string() })
	});

	const normalizeDates = tool(
		async ({ path }) => {
			const { csv, converted } = normalizeDatesCsv(await need(path));
			await backend.write(path, csv);
			return `Converted ${converted} dates to ISO (YYYY-MM-DD) in ${path}.`;
		},
		{
			name: 'normalize_dates',
			description: 'Rewrite every parseable date in the CSV to ISO YYYY-MM-DD, in place.',
			schema: z.object({ path: z.string() })
		}
	);

	const dedupeRows = tool(
		async ({ path }) => {
			const { csv, removed } = dedupeCsv(await need(path));
			await backend.write(path, csv);
			return `Removed ${removed} duplicate rows (kept first occurrence of each order_id) in ${path}.`;
		},
		{
			name: 'dedupe_rows',
			description: 'Remove rows whose order_id already appeared earlier in the file, in place.',
			schema: z.object({ path: z.string() })
		}
	);

	const fixTotals = tool(
		async ({ path }) => {
			const { csv, fixed } = fixTotalsCsv(await need(path));
			await backend.write(path, csv);
			return `Recomputed ${fixed} totals as qty × unit_price in ${path}.`;
		},
		{
			name: 'fix_totals',
			description: 'Recompute total = qty × unit_price for rows where they disagree, in place.',
			schema: z.object({ path: z.string() })
		}
	);

	const validateData = tool(
		async ({ path }) => {
			const rules = validateCsv(await need(path));
			hooks.onValidate?.(rules);
			const failing = rules.filter((r) => !r.pass);
			tracer.emit(
				'note',
				`validate_data → ${failing.length ? `${failing.length} rule(s) failing` : 'all rules pass'}`
			);
			return [
				failing.length
					? `VALIDATION: ${failing.length} of ${rules.length} rules FAILING`
					: `VALIDATION: all ${rules.length} rules pass`,
				...rules.map((r) => `  ${r.pass ? '✓' : '✗'} ${r.rule} — ${r.detail}`)
			].join('\n');
		},
		{
			name: 'validate_data',
			description:
				'Check the business rules: ISO dates, unique order_ids, total = qty × unit_price, qty ≥ 1 and total ≥ 0. Returns each rule with offending rows. The gate before any report.',
			schema: z.object({ path: z.string() })
		}
	);

	const quarantineRows = tool(
		async ({ path, quarantinePath = QUARANTINE_PATH }) => {
			const { clean, quarantined, moved } = quarantineCsv(await need(path));
			await backend.write(path, clean);
			await backend.write(quarantinePath, quarantined);
			return `Moved ${moved} rows violating qty ≥ 1 / total ≥ 0 to ${quarantinePath}; ${parseCsv(clean).rows.length} rows remain in ${path}.`;
		},
		{
			name: 'quarantine_rows',
			description:
				'Move rows that violate qty ≥ 1 / total ≥ 0 out of the dataset into a quarantine file for human review. The standard recovery for rows that cannot be auto-fixed.',
			schema: z.object({ path: z.string(), quarantinePath: z.string().optional() })
		}
	);

	const model = await getModel({ maxTokens: 2000, reasoningEffort: 'medium', temperature: 0.2 });

	const agent = createDeepAgent({
		model,
		systemPrompt: SYSTEM_PROMPT,
		backend,
		tools: [profileData, normalizeDates, dedupeRows, fixTotals, validateData, quarantineRows],
		permissions: [{ operations: ['write'], paths: [ORIGINAL_PATH], mode: 'deny' }],
		compaction: { maxTokens: 24000, evictThresholdPct: 60, summarizeThresholdPct: 85 },
		tracer,
		maxIterations: 50
	});
	agent.subscribe((s) => hooks.onState?.(s));

	const thread = `janitor-${Math.random().toString(36).slice(2, 8)}`;
	const finalText = (state: DeepAgentStateType) =>
		displayContent(
			(state.messages[state.messages.length - 1] as { content?: unknown })?.content as never
		) ?? '';

	return {
		agent,

		async draftPlan() {
			let state = await agent.invoke({
				input: `Clean the dataset at ${DATA_PATH}. Profile it first, then draft your cleaning plan and stop for my review.`,
				thread
			});
			if (!state.todos.length) {
				// Plan-mode guard: a draft phase that ends without a board is a
				// failed draft — one corrective nudge on the same thread.
				state = await agent.invoke({
					input:
						'You have not presented a plan. Call profile_data, then write_todos your plan, then stop for my review.',
					thread
				});
			}
			return { todos: state.todos, ask: finalText(state) };
		},

		async execute(revised) {
			const input = revised
				? `I reviewed your plan and revised it. The approved plan is now:\n` +
					revised.map((s, i) => `${i + 1}. ${s}`).join('\n') +
					`\nCall write_todos with EXACTLY these steps (the first in_progress, the rest pending), then execute the plan step by step.`
				: 'I approve your plan as written. Execute it now, step by step.';
			return agent.invoke({ input, thread });
		},

		readFile: (path) => backend.read(path),
		finalText
	};
}
