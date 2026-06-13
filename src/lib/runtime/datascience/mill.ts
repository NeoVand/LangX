// ─────────────────────────────────────────────────────────────────────────────
// The Mill — Babbage's name for the Analytical Engine's calculating unit.
//
// `runUserCode` runs a snippet of analysis code with a real dataframe toolkit in
// scope and returns its value. It is deliberately PURE and environment-agnostic:
// the SAME function powers the Web Worker the live demo uses (true sandbox
// isolation — no DOM, no network) AND the unit tests, which call it directly in
// Node. That symmetry is the whole point — what the tests prove is exactly what
// the agent runs.
// ─────────────────────────────────────────────────────────────────────────────

import * as aq from 'arquero';
import * as ss from 'simple-statistics';

export type Row = Record<string, unknown>;

export interface MillResult {
	ok: boolean;
	/** The snippet's return value, coerced to something transportable & printable. */
	value?: unknown;
	error?: string;
	elapsedMs?: number;
}

/** Defensive cap — an uploaded file could be enormous; the Mill stays responsive. */
const MAX_ROWS = 200_000;
/** Materialised rows we hand back from an Arquero table return (keeps results small). */
const MAX_RESULT_ROWS = 2000;

/**
 * Run one analysis snippet. In scope for the snippet:
 *
 *   data   — the active dataset as an array of row objects
 *   table  — an Arquero table built from `data` (table.groupby(…).rollup(…)…)
 *   aq     — the Arquero namespace (aq.from, aq.desc, aq.escape, aq.op …)
 *   op     — Arquero's operator namespace (op.mean, op.count, op.corr, op.quantile …)
 *   ss     — simple-statistics (ss.sampleCorrelation, ss.linearRegression, ss.quantile …)
 *
 * The snippet MUST `return` a JSON-serialisable value. An Arquero table return is
 * auto-materialised to an array of plain row objects.
 */
export async function runUserCode(code: string, data: Row[]): Promise<MillResult> {
	const start = now();
	try {
		const rows = Array.isArray(data) ? data.slice(0, MAX_ROWS) : [];
		const table = aq.from(rows);
		// A plain function body — the snippet uses `return` to produce its value.
		const fn = new Function('aq', 'op', 'ss', 'data', 'table', `"use strict";\n${code}`);
		let out = fn(aq, aq.op, ss, rows, table);
		if (out && typeof (out as Promise<unknown>).then === 'function') out = await out;
		return { ok: true, value: coerce(out), elapsedMs: now() - start };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			elapsedMs: now() - start
		};
	}
}

/** Make rich returns (Arquero tables) transportable across the worker boundary. */
function coerce(value: unknown): unknown {
	if (isArqueroTable(value)) {
		return value.objects({ limit: MAX_RESULT_ROWS });
	}
	return value;
}

function isArqueroTable(v: unknown): v is { objects: (opt?: { limit?: number }) => Row[] } {
	return (
		!!v &&
		typeof v === 'object' &&
		typeof (v as { objects?: unknown }).objects === 'function' &&
		typeof (v as { numRows?: unknown }).numRows === 'function'
	);
}

// `Date.now()` is unavailable in some sandboxed contexts; guard it.
function now(): number {
	try {
		return Date.now();
	} catch {
		return 0;
	}
}
