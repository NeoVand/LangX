/**
 * "The Bug Hunt" — an agent fixes a real bug in a codebase it has never seen,
 * using nothing but the six filesystem tools and a test runner.
 *
 * We seed a ~15-file JavaScript project (a tiny shop) into the virtual
 * filesystem with ONE subtle bug, hand the agent a ticket, and watch the
 * professional loop run: reproduce (run_tests) → locate (glob + grep) → read
 * only what the evidence points to (read_file with offset/limit) → write the
 * diagnosis to /notes/ → the smallest possible edit_file → verify until green.
 *
 * Two details worth stealing:
 *  • run_tests executes the project's OWN tests from the virtual filesystem,
 *    in a sandboxed Worker with a timeout — a real verify tool, not vibes.
 *  • permissions deny writes under /test/** — the agent cannot "fix" the bug
 *    by editing the spec. Enforce at the tool layer, not in the prompt.
 *
 * This is the exact source the demo runs.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type DeepAgentStateType
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { displayContent } from '$lib/runtime/messages';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

// ── The seeded project ─────────────────────────────────────────────────────────
// A small, realistic codebase: enough files that reading everything is the
// wrong strategy, and the agent has to search instead. All money is integer
// cents. CommonJS on purpose — it makes the in-Worker test runner trivial.

export const CORRECT_FILES: Record<string, string> = {
	'/README.md': `# minishop

A tiny e-commerce pricing engine. All money is integer **cents**.

| Module | Responsibility |
| --- | --- |
| src/cart.js | cart lines, SKU merging, subtotal |
| src/pricing.js | bulk discount + coupon stacking |
| src/coupons.js | coupon table & discount math |
| src/shipping.js | shipping rates, free-shipping threshold |
| src/tax.js | sales tax |
| src/checkout.js | the full receipt |
| src/inventory.js | stock levels |
| src/validate.js | SKU / quantity validation |

Tests live in \`/test\` — run them with the run_tests tool.
`,

	'/src/format.js': `'use strict';

// All money in this codebase is integer cents — never floats.
function formatMoney(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return sign + '$' + dollars + '.' + rest;
}

function centsOf(dollars) {
  return Math.round(dollars * 100);
}

module.exports = { formatMoney, centsOf };
`,

	'/src/validate.js': `'use strict';

const SKU_RE = /^[A-Z]{2,4}-\\d{3}$/;

function validateSku(sku) {
  return typeof sku === 'string' && SKU_RE.test(sku);
}

function validateQty(qty) {
  return Number.isInteger(qty) && qty > 0 && qty <= 999;
}

module.exports = { validateSku, validateQty };
`,

	'/src/inventory.js': `'use strict';

// In the real system this is a database; here it is a plain map.
const STOCK = {
  'MUG-001': 40,
  'TEE-002': 18,
  'CAP-003': 0,
  'PIN-004': 250,
  'BAG-005': 7
};

function inStock(sku, qty) {
  return (STOCK[sku] || 0) >= qty;
}

function reserve(sku, qty) {
  if (!inStock(sku, qty)) throw new Error('Insufficient stock for ' + sku);
  STOCK[sku] -= qty;
  return STOCK[sku];
}

module.exports = { inStock, reserve };
`,

	'/src/cart.js': `'use strict';

const { validateSku, validateQty } = require('./validate');

function createCart() {
  return { items: [] };
}

// Adding a SKU that is already in the cart merges into the existing
// line — quantities add up; the cart never holds duplicate lines.
function addItem(cart, item) {
  if (!validateSku(item.sku)) throw new Error('Invalid SKU: ' + item.sku);
  if (!validateQty(item.qty)) throw new Error('Invalid quantity: ' + item.qty);
  const existing = cart.items.find((line) => line.sku === item.sku);
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.items.push({ sku: item.sku, name: item.name, unitPrice: item.unitPrice, qty: item.qty });
  }
  return cart;
}

function removeItem(cart, sku) {
  cart.items = cart.items.filter((line) => line.sku !== sku);
  return cart;
}

function itemCount(cart) {
  return cart.items.reduce((n, line) => n + line.qty, 0);
}

function subtotal(cart) {
  return cart.items.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

module.exports = { createCart, addItem, removeItem, itemCount, subtotal };
`,

	'/src/coupons.js': `'use strict';

// Active coupon codes. type 'percent' takes value % off the order;
// type 'fixed' takes value cents off. Codes are case-insensitive.
const COUPONS = {
  SAVE10: { type: 'percent', value: 10 },
  SAVE20: { type: 'percent', value: 20 },
  FIVEOFF: { type: 'fixed', value: 500 }
};

function lookupCoupon(code) {
  if (!code) return null;
  return COUPONS[String(code).trim().toUpperCase()] || null;
}

// How many cents a coupon takes off the given amount.
function couponDiscount(coupon, amount) {
  if (!coupon) return 0;
  if (coupon.type === 'percent') return Math.round((amount * coupon.value) / 100);
  if (coupon.type === 'fixed') return Math.min(coupon.value, amount);
  return 0;
}

module.exports = { lookupCoupon, couponDiscount };
`,

	'/src/pricing.js': `'use strict';

const { subtotal, itemCount } = require('./cart');
const { lookupCoupon, couponDiscount } = require('./coupons');

// Orders of 10+ units earn a 5% bulk discount on the subtotal.
const BULK_MIN_UNITS = 10;
const BULK_PCT = 5;

function bulkDiscount(cart, sub) {
  if (itemCount(cart) < BULK_MIN_UNITS) return 0;
  return Math.round((sub * BULK_PCT) / 100);
}

// Discount order matters: bulk first, then the coupon applies to the
// already-discounted amount. Stacking the other way over-discounts.
function priceOrder(cart, couponCode) {
  const sub = subtotal(cart);
  const bulkOff = bulkDiscount(cart, sub);
  const afterBulk = sub - bulkOff;
  const coupon = lookupCoupon(couponCode);
  const couponOff = couponDiscount(coupon, afterBulk);
  return {
    subtotal: sub,
    bulkDiscount: bulkOff,
    couponDiscount: couponOff,
    total: afterBulk - couponOff
  };
}

module.exports = { bulkDiscount, priceOrder, BULK_MIN_UNITS, BULK_PCT };
`,

	'/src/shipping.js': `'use strict';

// Free standard shipping at $50.00 (5000 cents) and above.
const FREE_SHIPPING_MIN = 5000;
const STANDARD_RATE = 595;
const EXPEDITED_RATE = 1495;

function shippingFor(orderTotal, expedited) {
  if (expedited) return EXPEDITED_RATE;
  if (orderTotal >= FREE_SHIPPING_MIN) return 0;
  return STANDARD_RATE;
}

module.exports = { shippingFor, FREE_SHIPPING_MIN, STANDARD_RATE, EXPEDITED_RATE };
`,

	'/src/tax.js': `'use strict';

// Flat demo tax. Applied to goods only — shipping is never taxed.
const TAX_RATE = 0.08;

function taxFor(amount) {
  return Math.round(amount * TAX_RATE);
}

module.exports = { taxFor, TAX_RATE };
`,

	'/src/checkout.js': `'use strict';

const { priceOrder } = require('./pricing');
const { shippingFor } = require('./shipping');
const { taxFor } = require('./tax');
const { formatMoney } = require('./format');

// Turns a cart into a final receipt: price → shipping → tax → grand total.
function checkout(cart, opts) {
  opts = opts || {};
  const priced = priceOrder(cart, opts.couponCode);
  const shipping = shippingFor(priced.total, !!opts.expedited);
  const tax = taxFor(priced.total);
  const grandTotal = priced.total + shipping + tax;
  return {
    subtotal: priced.subtotal,
    bulkDiscount: priced.bulkDiscount,
    couponDiscount: priced.couponDiscount,
    shipping: shipping,
    tax: tax,
    grandTotal: grandTotal,
    display: formatMoney(grandTotal)
  };
}

module.exports = { checkout };
`,

	'/test/cart.test.js': `'use strict';

const { createCart, addItem, itemCount, subtotal } = require('../src/cart');

test('subtotal multiplies unit price by quantity', () => {
  const cart = createCart();
  addItem(cart, { sku: 'MUG-001', name: 'Mug', unitPrice: 1400, qty: 2 });
  expect(subtotal(cart)).toBe(2800);
});

test('adding the same SKU twice merges into one line', () => {
  const cart = createCart();
  addItem(cart, { sku: 'PIN-004', name: 'Pin', unitPrice: 350, qty: 2 });
  addItem(cart, { sku: 'PIN-004', name: 'Pin', unitPrice: 350, qty: 3 });
  expect(cart.items.length).toBe(1);
  expect(itemCount(cart)).toBe(5);
  expect(subtotal(cart)).toBe(1750);
});

test('rejects an invalid SKU', () => {
  const cart = createCart();
  let threw = false;
  try {
    addItem(cart, { sku: 'not a sku', name: 'X', unitPrice: 100, qty: 1 });
  } catch (e) {
    threw = true;
  }
  expect(threw).toBe(true);
});
`,

	'/test/pricing.test.js': `'use strict';

const { createCart, addItem } = require('../src/cart');
const { priceOrder } = require('../src/pricing');

function bigCart() {
  const cart = createCart();
  addItem(cart, { sku: 'MUG-001', name: 'Mug', unitPrice: 1400, qty: 8 });
  addItem(cart, { sku: 'PIN-004', name: 'Pin', unitPrice: 350, qty: 4 });
  return cart; // 12 units, subtotal 12600
}

test('no discounts below the bulk threshold and without a coupon', () => {
  const cart = createCart();
  addItem(cart, { sku: 'TEE-002', name: 'Tee', unitPrice: 2200, qty: 2 });
  expect(priceOrder(cart).total).toBe(4400);
});

test('10+ units earn the 5% bulk discount', () => {
  const p = priceOrder(bigCart());
  expect(p.bulkDiscount).toBe(630); // 5% of 12600
  expect(p.total).toBe(11970);
});

test('a percent coupon stacks on the bulk-discounted amount', () => {
  const p = priceOrder(bigCart(), 'SAVE10');
  expect(p.bulkDiscount).toBe(630);
  expect(p.couponDiscount).toBe(1197); // 10% of 11970 — NOT of 12600
  expect(p.total).toBe(10773);
});
`,

	'/test/shipping.test.js': `'use strict';

const { shippingFor, FREE_SHIPPING_MIN, STANDARD_RATE, EXPEDITED_RATE } = require('../src/shipping');

test('orders under $50 pay standard shipping', () => {
  expect(shippingFor(4999, false)).toBe(STANDARD_RATE);
});

test('free shipping starts at exactly $50.00', () => {
  expect(shippingFor(FREE_SHIPPING_MIN, false)).toBe(0);
});

test('orders over $50 ship free', () => {
  expect(shippingFor(9000, false)).toBe(0);
});

test('expedited shipping is never free', () => {
  expect(shippingFor(9000, true)).toBe(EXPEDITED_RATE);
});
`,

	'/test/checkout.test.js': `'use strict';

const { createCart, addItem } = require('../src/cart');
const { checkout } = require('../src/checkout');

test('a full receipt adds shipping and tax to the discounted total', () => {
  const cart = createCart();
  addItem(cart, { sku: 'TEE-002', name: 'Tee', unitPrice: 2200, qty: 1 });
  // total 2200 → shipping 595 → tax 176 (8% of 2200) → 2971
  const r = checkout(cart);
  expect(r.shipping).toBe(595);
  expect(r.tax).toBe(176);
  expect(r.grandTotal).toBe(2971);
});

test('an order of exactly $50 ships free', () => {
  const cart = createCart();
  addItem(cart, { sku: 'MUG-001', name: 'Mug', unitPrice: 2500, qty: 2 });
  expect(checkout(cart).shipping).toBe(0); // 5000 cents exactly
});

test('bulk + coupon + shipping + tax all settle correctly', () => {
  const cart = createCart();
  addItem(cart, { sku: 'MUG-001', name: 'Mug', unitPrice: 1400, qty: 6 });
  addItem(cart, { sku: 'MUG-001', name: 'Mug', unitPrice: 1400, qty: 4 });
  // merged line: 10 mugs → subtotal 14000, bulk 700, SAVE20 takes 2660 off 13300
  const r = checkout(cart, { couponCode: 'SAVE20' });
  expect(r.grandTotal).toBe(11491);
  expect(r.display).toBe('$114.91');
});
`,

	'/test/format.test.js': `'use strict';

const { formatMoney, centsOf } = require('../src/format');

test('formats cents as dollars', () => {
  expect(formatMoney(12345)).toBe('$123.45');
});

test('pads single-digit cents', () => {
  expect(formatMoney(1205)).toBe('$12.05');
});

test('round-trips dollar amounts', () => {
  expect(centsOf(19.99)).toBe(1999);
});
`
};

// ── The tickets ────────────────────────────────────────────────────────────────
// Each ticket overlays ONE buggy file on the correct project. The comments in
// the buggy files still describe the intended behavior — code lies, comments
// lie harder, tests don't.

export type TicketId = 'coupon-stack' | 'free-shipping' | 'lost-items';

export interface Ticket {
	id: TicketId;
	tag: string;
	title: string;
	blurb: string;
	report: string;
	buggy: Record<string, string>;
}

export const TICKETS: Ticket[] = [
	{
		id: 'coupon-stack',
		tag: 'BUG-1042',
		title: 'Coupons over-discount on bulk orders',
		blurb: 'Finance says coupon + bulk discount orders charge too little.',
		report: `Finance flagged yesterday's orders: whenever a percent coupon is used on an
order that ALSO qualifies for the bulk discount, we charge less than the
receipt math says we should.

Repro: 8 mugs ($14.00 each) + 4 pins ($3.50 each), coupon SAVE10.
Expected order total after discounts: $107.73 — actual: $107.10.

Small orders with coupons look right. Bulk orders without coupons look right.
It is only the combination that drifts.`,
		buggy: {
			'/src/pricing.js': CORRECT_FILES['/src/pricing.js'].replace(
				'const couponOff = couponDiscount(coupon, afterBulk);',
				'const couponOff = couponDiscount(coupon, sub);'
			)
		}
	},
	{
		id: 'free-shipping',
		tag: 'BUG-1043',
		title: 'Charged $5.95 shipping on an exactly-$50 order',
		blurb: 'Free shipping is promised "from $50" — $50.00 exactly still pays.',
		report: `Marketing promises "free standard shipping from $50". A customer with a cart
totalling exactly $50.00 was charged $5.95 standard shipping; orders at $50.01
ship free as expected. Expedited orders are unaffected.

Expected: an order total of exactly $50.00 → free standard shipping.
Actual: $5.95 standard shipping is added at exactly $50.00.`,
		buggy: {
			'/src/shipping.js': CORRECT_FILES['/src/shipping.js'].replace(
				'if (orderTotal >= FREE_SHIPPING_MIN) return 0;',
				'if (orderTotal > FREE_SHIPPING_MIN) return 0;'
			)
		}
	},
	{
		id: 'lost-items',
		tag: 'BUG-1044',
		title: 'Cart loses items when a product is added twice',
		blurb: 'Add 2 pins, then 3 more — the cart ends up with 3, not 5.',
		report: `Support has three reports of "disappearing items". Adding the same product to
the cart in two steps — 2 pins, then 3 more pins — ends with a cart of 3 pins,
not 5. Subtotals come out short and orders that should earn the bulk discount
don't get it.

Expected: lines for the same SKU merge and their quantities ADD.
Actual: the second add seems to replace the first.`,
		buggy: {
			'/src/cart.js': CORRECT_FILES['/src/cart.js'].replace(
				'existing.qty += item.qty;',
				'existing.qty = item.qty;'
			)
		}
	}
];

// ── run_tests: the project's own suite, actually executed ─────────────────────
// A ~50-line CommonJS loader + micro test framework. It runs INSIDE a sandboxed
// Worker (no DOM, no network) with a hard timeout, so even an agent-introduced
// infinite loop can't freeze the page. The function is self-contained on
// purpose: it is stringified into the Worker via toString().

export interface TestResult {
	file: string;
	name: string;
	pass: boolean;
	detail?: string;
}

export function execTests(files: Record<string, string>): TestResult[] {
	const results: TestResult[] = [];
	const cache: Record<string, { exports: unknown }> = {};
	let currentFile = '';

	function resolvePath(from: string, spec: string): string {
		let path = spec;
		if (spec.startsWith('./') || spec.startsWith('../')) {
			const parts = from.split('/').filter(Boolean);
			parts.pop(); // drop the file itself — resolve against its directory
			for (const seg of spec.split('/')) {
				if (seg === '.' || seg === '') continue;
				if (seg === '..') parts.pop();
				else parts.push(seg);
			}
			path = '/' + parts.join('/');
		}
		if (files[path] == null && files[path + '.js'] != null) path += '.js';
		return path;
	}

	function testFn(name: string, fn: () => void) {
		try {
			fn();
			results.push({ file: currentFile, name, pass: true });
		} catch (e) {
			results.push({
				file: currentFile,
				name,
				pass: false,
				detail: e instanceof Error ? e.message : String(e)
			});
		}
	}

	function expectFn(actual: unknown) {
		return {
			toBe(expected: unknown) {
				if (actual !== expected)
					throw new Error(
						'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual)
					);
			},
			toEqual(expected: unknown) {
				const a = JSON.stringify(actual);
				const b = JSON.stringify(expected);
				if (a !== b) throw new Error('expected ' + b + ' but got ' + a);
			}
		};
	}

	function loadModule(path: string): unknown {
		const hit = cache[path];
		if (hit) return hit.exports;
		const code = files[path];
		if (code == null) throw new Error('Cannot find module ' + path);
		const mod = { exports: {} as unknown };
		cache[path] = mod;
		const req = (spec: string) => loadModule(resolvePath(path, spec));
		new Function('require', 'module', 'exports', 'test', 'expect', code)(
			req,
			mod,
			mod.exports,
			testFn,
			expectFn
		);
		return mod.exports;
	}

	const testFiles = Object.keys(files)
		.filter((p) => p.startsWith('/test/') && p.endsWith('.test.js'))
		.sort();
	for (const tf of testFiles) {
		currentFile = tf;
		try {
			loadModule(tf);
		} catch (e) {
			results.push({
				file: tf,
				name: '(file failed to load)',
				pass: false,
				detail: e instanceof Error ? e.message : String(e)
			});
		}
	}
	return results;
}

async function runSuite(files: Record<string, string>): Promise<TestResult[]> {
	// Node (the downloaded source): no sandbox available — run inline, honestly.
	if (typeof Worker === 'undefined') return execTests(files);
	const src = `self.onmessage=function(e){self.postMessage((${execTests.toString()})(e.data));};`;
	const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
	const worker = new Worker(url);
	try {
		return await new Promise<TestResult[]>((resolve) => {
			const timer = setTimeout(
				() =>
					resolve([
						{
							file: '(runner)',
							name: 'suite timed out after 3s',
							pass: false,
							detail:
								'The tests never finished — most likely an infinite loop introduced by the last change. Fix or revert it.'
						}
					]),
				3000
			);
			worker.onmessage = (e) => {
				clearTimeout(timer);
				resolve(e.data as TestResult[]);
			};
			worker.onerror = (e) => {
				clearTimeout(timer);
				resolve([
					{
						file: '(runner)',
						name: 'suite crashed',
						pass: false,
						detail: String(e.message ?? 'unknown worker error')
					}
				]);
			};
			worker.postMessage(files);
		});
	} finally {
		worker.terminate();
		URL.revokeObjectURL(url);
	}
}

function formatReport(results: TestResult[]): string {
	const fails = results.filter((r) => !r.pass);
	const lines: string[] = [
		fails.length
			? `${fails.length} FAILING · ${results.length - fails.length} passing`
			: `ALL ${results.length} TESTS PASSING`
	];
	for (const r of results) {
		if (r.pass) lines.push(`  ✓ ${r.file} › ${r.name}`);
		else lines.push(`  ✗ ${r.file} › ${r.name}\n      ${r.detail ?? 'failed'}`);
	}
	return lines.join('\n');
}

// ── The harness build ──────────────────────────────────────────────────────────

export interface FileEdit {
	path: string;
	before: string;
	after: string;
}

export interface BugHuntHooks {
	onState?: (state: DeepAgentStateType) => void;
	onTests?: (results: TestResult[]) => void;
	onEdits?: (edits: FileEdit[]) => void;
	onTrace?: (events: TraceEvent[]) => void;
}

export interface BugHunt {
	agent: CompiledDeepAgent;
	/** Work the ticket to completion (with one "suite is still red" nudge). */
	start(): Promise<DeepAgentStateType>;
	readFile(path: string): Promise<string | null>;
	finalText(state: DeepAgentStateType): string;
}

const SYSTEM_PROMPT = `You are a senior engineer assigned a bug ticket on a codebase you have never
seen. Work it the way a professional works an unfamiliar repo:

1. write_todos — a short plan (reproduce, locate, diagnose, fix, verify).
2. REPRODUCE — call run_tests FIRST. The failing tests are your ground truth.
3. LOCATE — glob to map the project, then grep the key identifiers from the
   failing tests: find the definition AND every call site before you read
   anything (a bug often lives in the caller, not the function). Read ONLY the
   files the evidence points to — never the whole repo. For long files,
   read_file with offset/limit.
4. DIAGNOSE — before fixing anything, write /notes/diagnosis.md: the file, the
   broken line, why it produces exactly the reported numbers, and the planned
   fix. Three or four sentences.
5. FIX — the SMALLEST edit_file that corrects the root cause. No refactors, no
   rewrites, no drive-by changes.
6. VERIFY — run_tests after every change, until every test passes.

HARD RULES:
- /test/** is read-only — the tests are the spec. If a test looks wrong, your
  diagnosis is wrong: re-read the code. (Writes there are blocked anyway.)
- Trust the code over its comments. Comments describe intent, not behavior.
- Keep the plan board honest: update write_todos as each step completes.
- Finish with a 2–3 sentence wrap-up: root cause → the change → the proof.`;

export async function buildBugHunt(
	ticketId: TicketId,
	hooks: BugHuntHooks = {}
): Promise<BugHunt> {
	const ticket = TICKETS.find((t) => t.id === ticketId) ?? TICKETS[0];
	const events: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		events.push(ev);
		hooks.onTrace?.([...events]);
	});

	// Seed the workspace: the correct project, with the ticket's bug overlaid.
	const backend = new StateBackend();
	const seeded = { ...CORRECT_FILES, ...ticket.buggy };
	for (const [path, content] of Object.entries(seeded)) await backend.write(path, content);

	let lastResults: TestResult[] | null = null;
	const runTests = tool(
		async () => {
			const all = await backend.list();
			const files = Object.fromEntries(all.map((f) => [f.path, f.content]));
			const results = await runSuite(files);
			lastResults = results;
			hooks.onTests?.(results);
			tracer.emit('note', `run_tests → ${formatReport(results).split('\n')[0]}`);
			return formatReport(results);
		},
		{
			name: 'run_tests',
			description:
				'Execute the project\'s own test suite (/test/*.test.js) from the workspace in a sandboxed worker. Returns one line per test; failures include expected vs actual. Run it first to reproduce, and again after every change.',
			schema: z.object({})
		}
	);

	// Small, careful edits — the engineer never needs to write whole files.
	const model = await getModel({ maxTokens: 2500, reasoningEffort: 'medium', temperature: 0.2 });

	const agent = createDeepAgent({
		model,
		systemPrompt: SYSTEM_PROMPT,
		backend,
		tools: [runTests],
		// The spec is law: no agent write can touch the tests. Tool-layer
		// enforcement — "trust the LLM" means boundaries live in the tools.
		permissions: [{ operations: ['write'], paths: ['/test/**'], mode: 'deny' }],
		compaction: { maxTokens: 24000, evictThresholdPct: 60, summarizeThresholdPct: 85 },
		tracer,
		maxIterations: 60
	});
	agent.subscribe((s) => hooks.onState?.(s));

	// Surface every change to an already-seeded file as a before→after diff.
	const prevContent = new Map<string, string>(Object.entries(seeded));
	const editMap = new Map<string, FileEdit>();
	agent.subscribe((s) => {
		for (const f of s.files) {
			const old = prevContent.get(f.path);
			if (old !== undefined && old !== f.content) {
				const existing = editMap.get(f.path);
				editMap.set(f.path, { path: f.path, before: existing?.before ?? old, after: f.content });
				hooks.onEdits?.([...editMap.values()]);
			}
			prevContent.set(f.path, f.content);
		}
	});

	const thread = `bughunt-${ticket.id}-${Math.random().toString(36).slice(2, 8)}`;
	const input = `Work this ticket:\n\n${ticket.tag} — ${ticket.title}\n\n${ticket.report}`;

	// Completion check: an engineer doesn't clock out on a red suite. If the
	// agent stops early, send ONE nudge turn on the same thread.
	async function start(): Promise<DeepAgentStateType> {
		let state = await agent.invoke({ input, thread });
		if (!lastResults || lastResults.some((r) => !r.pass)) {
			tracer.emit('note', 'completion check: suite not green — nudging');
			state = await agent.invoke({
				input:
					'The suite is not green yet. Re-read your diagnosis, fix the root cause in /src (the tests are correct), and run_tests until every test passes.',
				thread
			});
		}
		return state;
	}

	return {
		agent,
		start,
		readFile: (path) => backend.read(path),
		finalText: (state) =>
			displayContent(
				(state.messages[state.messages.length - 1] as { content?: unknown })?.content as never
			) ?? ''
	};
}
