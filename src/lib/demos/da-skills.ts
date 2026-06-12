import { createDeepAgent, StateBackend, parseSkillFrontmatter } from '$lib/deepagents';
import type { CompiledDeepAgent } from '$lib/deepagents';
import { messageTokens } from '$lib/deepagents/tokens';
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import type { Tracer } from '$lib/runtime/tracer';

/**
 * THE SUPPORT DESK — one customer request, three identical agents that differ
 * ONLY in how company procedure reaches them:
 *
 *   bare     no skills at all — the model wings it on a refund calculation
 *   crammed  every procedure inlined in the system prompt, paid EVERY round
 *   skilled  a five-line catalog; the agent reads the ONE manual it needs and
 *            runs its script (progressive disclosure, the official shape)
 *
 * A deterministic inspector recomputes the math and stamps each reply.
 */

export type ClerkVariant = 'bare' | 'crammed' | 'skilled';

export const CLERKS: { variant: ClerkVariant; title: string; tagline: string }[] = [
	{ variant: 'bare', title: 'The Bare Clerk', tagline: 'no skills — improvises policy' },
	{
		variant: 'crammed',
		title: 'The Crammed Clerk',
		tagline: 'all 5 procedures in the prompt, every round'
	},
	{
		variant: 'skilled',
		title: 'The Skilled Clerk',
		tagline: 'catalog + reads the one manual it needs'
	}
];

// ── The proration script the refund-policy skill ships ───────────────────────
// Deterministic money math. This is exactly why skills bundle scripts: month
// boundaries, fees and cent-rounding are things a model should never improvise.

const PRORATE_JS = `// Proration calculator — Lumen Analytics refund policy v3.
// main({ plan, interval, purchaseDate, cancelDate })
//   -> { refund, gross, fee, unusedMonths, fullRefund } (USD)
const PRICES = {
  starter: { monthly: 19, annual: 190 },
  pro: { monthly: 49, annual: 490 },
  team: { monthly: 99, annual: 990 }
};
function round(x) { return Math.round(x * 100) / 100; }
function main(input) {
  const { plan, interval, purchaseDate, cancelDate } = input || {};
  const price = PRICES[plan] && PRICES[plan][interval];
  if (!price) return { error: 'unknown plan/interval: ' + plan + '/' + interval };
  const p = new Date(purchaseDate + 'T00:00:00Z');
  const c = new Date(cancelDate + 'T00:00:00Z');
  if (isNaN(p.getTime()) || isNaN(c.getTime()) || c < p) return { error: 'bad dates' };
  const days = Math.floor((c - p) / 86400000);
  if (days <= 14) {
    return { refund: round(price), gross: round(price), fee: 0,
             unusedMonths: interval === 'annual' ? 12 : 1, fullRefund: true };
  }
  if (interval === 'monthly') {
    return { refund: 0, gross: 0, fee: 0, unusedMonths: 0, fullRefund: false,
             note: 'monthly plans: cancellation stops the next renewal; no refund' };
  }
  // A started month counts as used.
  let used = (c.getUTCFullYear() - p.getUTCFullYear()) * 12 + (c.getUTCMonth() - p.getUTCMonth());
  if (c.getUTCDate() > p.getUTCDate()) used += 1;
  used = Math.min(Math.max(used, 1), 12);
  const unused = 12 - used;
  const gross = round((price * unused) / 12);
  const fee = round(gross * 0.15);
  return { refund: round(gross - fee), gross: gross, fee: fee, unusedMonths: unused, fullRefund: false };
}`;

// ── The five skills, as real files (Agent Skills standard) ───────────────────

const REFUND_SKILL = `---
name: refund-policy
description: Compute and communicate refunds for Lumen Analytics cancellations. Use whenever a customer asks to cancel, requests a refund, or asks how much money comes back. Covers the 14-day window, annual proration, the early-termination fee, and required disclosures.
---

# Refund policy & cancellation procedure

## Never compute a refund by hand
Month boundaries, fees and cent-rounding are easy to get wrong. ALWAYS run the script:

run_script with path \`/skills/refund-policy/scripts/prorate.js\` and input
\`{"plan":"starter|pro|team","interval":"monthly|annual","purchaseDate":"YYYY-MM-DD","cancelDate":"YYYY-MM-DD"}\`

It returns \`{ refund, gross, fee, unusedMonths, fullRefund }\` in USD. Quote ONLY these numbers.

## The rules the script implements
1. Within 14 days of purchase: full refund, no fee.
2. Annual plans after 14 days: refund = unused full months x (yearly price / 12),
   minus a 15% early-termination fee. A started month counts as used.
3. Monthly plans: no refunds — cancellation stops the next renewal.

## Supporting files
- Price table: read \`/skills/refund-policy/references/plans.md\` if you need it.
- REQUIRED disclosures: read \`/skills/refund-policy/references/disclosures.md\`
  and include every item in your reply.

## Reply shape
Lead with the answer — exact amount and effective date — then the disclosures.
One short, warm paragraph plus the disclosure lines. No apology theater.`;

const REFUND_PLANS = `# Lumen Analytics price table (USD)

| plan    | monthly | annual |
| ------- | ------- | ------ |
| starter | $19     | $190   |
| pro     | $49     | $490   |
| team    | $99     | $990   |`;

const REFUND_DISCLOSURES = `# Required disclosures — refund replies

Every refund reply MUST state, explicitly:
1. The exact refund amount in USD — and that a 15% early-termination fee was
   deducted, with the fee amount in dollars.
2. The refund arrives in 5-7 business days, to the original payment method.
3. Access continues until the end of the current paid month; billing stops immediately.`;

const TONE_SKILL = `---
name: tone-guide
description: Lumen Analytics voice and style for customer replies. Use when drafting or revising any customer-facing message — greetings, sign-offs, formatting, words we avoid.
---

# Tone guide

## Voice
Plain, warm, specific. Short sentences. Lead with the answer, never with process.
Say "you" and "we". One exclamation mark per message, maximum. No emoji.

## Structure
1. The answer, with numbers and dates, in the first sentence.
2. What happens next, concretely, with who-does-what-by-when.
3. One-line sign-off: "— The Lumen team" (support) or your first name (success).

## Rewrites we expect (before -> after)
- "Unfortunately, per our refund policy, eligibility requires…" ->
  "You'll get $X back. Here's how that breaks down: …"
- "Your request has been received and will be processed in due course." ->
  "Done — I've started this now; you'll see it complete by Thursday."
- "We apologize for any inconvenience this may have caused." ->
  "We broke your dashboard for four hours yesterday — that was on us."
- "Please be advised that your account has been actioned." ->
  "I've made the change you asked for."

## Formatting rules
- Numbers: always digits ("5 seats", never "five seats"); money with cents ("$49.00")
  when quoting charges, whole dollars when describing prices.
- Dates: "June 12, 2026" in replies, never "06/12" (ambiguous across regions).
- Bold for the single most important fact, at most once per message.
- Bullet lists only past three parallel items; otherwise write sentences.
- Links: bare descriptive text ("your billing page"), never "click here".

## Words we avoid
"Unfortunately" as an opener; "as per our policy"; "please be advised"; "valued
customer"; "kindly"; "revert" (meaning reply); passive voice for bad news
("your account has been actioned"); "feel free to reach out" as a closer.

## Apologies
Apologize once, specifically, and only when we caused harm. Name the harm. Never
apologize for policy, and never attach an apology to a refusal as cushioning.

## Status updates
When work is in progress: say what is done, what remains, and the next time they
will hear from us — even if the update is "no change". Silence reads as neglect.`;

const ESCALATION_SKILL = `---
name: escalation-rules
description: When and how to escalate a Lumen Analytics support conversation to a human team. Use for legal threats, security reports, outage reports, press inquiries, enterprise contracts, or repeated unresolved contacts.
---

# Escalation rules

## Escalate IMMEDIATELY (same message) when the customer mentions
- Legal action, regulators, or chargebacks -> tier-2 + legal@ (template E-1)
- A security vulnerability or data exposure -> security@ within 15 minutes (template E-2)
- A production outage affecting their org -> page on-call via /escalate outage (template E-3)
- Press or social media -> comms@ only; do not answer on substance

## Escalate at the SECOND contact
- The same unresolved billing issue twice -> billing-humans queue
- Any request you cannot complete with the tools you have
- Enterprise contract questions (>25 seats, custom terms, security reviews) -> sales-eng

## Response-time commitments you may quote
| queue          | first response       |
| -------------- | -------------------- |
| tier-2         | 4 business hours     |
| billing-humans | 1 business day       |
| security@      | 1 hour, 24/7         |
| sales-eng      | 1 business day       |
Never quote a RESOLUTION time — only first response. Never promise outcomes on
behalf of the receiving team.

## Templates (use verbatim, fill the brackets)
E-1 (legal): "I've routed this to our legal and senior support team as
[TICKET]. Because legal questions are involved I have to step back here — a
specialist will reply within 4 business hours. Nothing about your account
changes in the meantime."

E-2 (security): "Thank you for reporting this. I've alerted our security team
as [TICKET] — they treat reports like this as their highest priority and will
contact you directly within the hour. Please don't share details publicly
until they've responded."

E-3 (outage): "I've paged our on-call engineers as [TICKET]. You can follow
live updates at status.lumen.example. I'll stay on this thread and update you
the moment I hear more, even if the update is 'still investigating'."

## How to file
File the escalation BEFORE replying, then reply naming the queue, the ticket
reference, and the first-response window from the table. One escalation per
thread — if a thread already has an open escalation, add to it, never fork.

## What NOT to escalate
Routine refunds, plan changes, how-to questions, and feature requests (log the
last in the product-feedback board instead). Escalating these erodes the
queues' response times for customers who genuinely need them.`;

const DELETION_SKILL = `---
name: data-deletion
description: Handle account-deletion and data-erasure requests (GDPR/CCPA) for Lumen Analytics. Use when a customer asks to delete their account, erase personal data, or invoke privacy rights.
---

# Data deletion procedure

## Steps, in order
1. VERIFY: confirm the request comes from the account's billing email. If the
   channel is not that email, ask them to re-send from it. Do not proceed unverified.
2. OFFER EXPORT: deletion is irreversible — offer a full data export first, and
   note the offer stands for 7 days.
3. GRACE PERIOD: deletion completes after a 30-day grace window during which the
   account can be restored by replying to the confirmation email.
4. CONFIRM: issue a reference number in the format DEL-YYYYMMDD (the request date),
   state what is erased (workspaces, dashboards, usage history, billing profile)
   and what we retain (invoices — 7 years, tax law).

## Reply must include
The reference number, the 30-day grace window, the export offer, and the
verification status. Keep it factual; this is a rights request, not a save attempt.

## What gets erased vs. retained
| system            | erased                          | retained                     |
| ----------------- | ------------------------------- | ---------------------------- |
| workspaces        | all dashboards, queries, alerts | nothing                      |
| usage analytics   | event history, session logs     | aggregate counts (anonymous) |
| billing profile   | cards, addresses, contacts      | invoices, 7 years (tax law)  |
| support history   | ticket bodies after 90 days     | ticket metadata, 2 years     |

## Edge cases
- TEAM accounts: only an owner may request org deletion; a member's request
  deletes their seat and personal data only — say which one you are doing.
- Pending invoices: deletion proceeds, but unpaid invoices remain collectible;
  state the open amount if any.
- Active legal hold: deletion is deferred until the hold lifts; do not confirm
  a completion date, confirm the request and the hold.
- Re-registration with the same email is allowed after erasure; nothing restores.

## Legal basis
GDPR Art. 17 (right to erasure) and CCPA §1798.105. The 30-day window is our
operational grace period and is shorter than the statutory one-month deadline —
never describe it as a legal requirement; it is our policy.`;

const PLANS_SKILL = `---
name: plan-comparison
description: Compare Lumen Analytics plans and recommend upgrades or downgrades. Use when a customer asks what plan to choose, what a tier includes, or whether to switch billing intervals.
---

# Plan comparison

## Tiers
- starter ($19/mo, $190/yr): 3 dashboards, 2 seats, 30-day history, email support
- pro ($49/mo, $490/yr): unlimited dashboards, 10 seats, 13-month history, alerts, API access
- team ($99/mo, $990/yr): SSO, audit log, unlimited seats, 3-year history, priority support

## Full feature matrix
| feature            | starter | pro       | team      |
| ------------------ | ------- | --------- | --------- |
| dashboards         | 3       | unlimited | unlimited |
| seats               | 2       | 10        | unlimited |
| data history        | 30 days | 13 months | 3 years   |
| alerts              | —       | 20        | unlimited |
| API access          | —       | 10k req/d | 100k req/d|
| SSO / SAML          | —       | —         | yes       |
| audit log           | —       | —         | yes       |
| support             | email   | email     | priority  |

## Recommending
Ask about seats and history needs first; recommend the cheapest tier that fits,
and say what specifically they gain by upgrading — never "more features".
Annual billing saves roughly two months; mention it when a customer is happy on monthly.

## Switching
Upgrades are immediate and prorated. Downgrades apply at the next renewal.
Interval changes (monthly <-> annual) apply at the next renewal; no mid-cycle swaps.

## FAQ answers we give
- Trials: 14 days of Pro, no card required; data survives a downgrade to Starter
  but locked dashboards beyond the limit become read-only.
- Overage: API requests beyond the daily cap return 429s; we never bill overage.
- Nonprofit/edu discount: 30% on any annual plan; verified via a documents form,
  applied from the next invoice, never retroactively.
- Seat counting: a seat is a unique login with edit rights; report viewers with
  read-only share links are free and unlimited.
- Currency: USD only; VAT/GST is added at checkout where required, and invoices
  show it separately.`;

/** Every skill file, exactly as seeded — the page's skill shelf renders these. */
export const SKILL_FILES: Record<string, string> = {
	'/skills/refund-policy/SKILL.md': REFUND_SKILL,
	'/skills/refund-policy/scripts/prorate.js': PRORATE_JS,
	'/skills/refund-policy/references/plans.md': REFUND_PLANS,
	'/skills/refund-policy/references/disclosures.md': REFUND_DISCLOSURES,
	'/skills/tone-guide/SKILL.md': TONE_SKILL,
	'/skills/escalation-rules/SKILL.md': ESCALATION_SKILL,
	'/skills/data-deletion/SKILL.md': DELETION_SKILL,
	'/skills/plan-comparison/SKILL.md': PLANS_SKILL
};

export const SKILL_NAMES = [
	'refund-policy',
	'tone-guide',
	'escalation-rules',
	'data-deletion',
	'plan-comparison'
];

// ── The customer ─────────────────────────────────────────────────────────────

export const CUSTOMER_REQUEST =
	'Hi — I bought the Pro annual plan on March 3, 2026, and I need to cancel today, June 12, 2026. ' +
	'How much refund will I get back? Please confirm the cancellation and the exact amount.';

export const FOLLOW_UP =
	'Thanks. One more thing — please also delete my account and erase my data once the refund is ' +
	'processed. (I am writing from my billing email.)';

/** Ground truth for the headline request — locked by unit tests. */
export const EXPECTED = { refund: 277.67, gross: 326.67, fee: 49.0, unusedMonths: 8 };

// ── The inspector — deterministic verdicts, no vibes ─────────────────────────

export interface InspectorCheck {
	label: string;
	pass: boolean;
	detail?: string;
}
export interface Verdict {
	pass: boolean;
	checks: InspectorCheck[];
}

const ALLOWED_AMOUNTS = new Set([277.67, 326.67, 49, 490, 19, 99, 190, 990, 40.83]);

export function inspectRefundReply(text: string): Verdict {
	const amounts = [...text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)].map((m) =>
		parseFloat(m[1].replace(/,/g, ''))
	);
	const invented = amounts.filter((a) => !ALLOWED_AMOUNTS.has(a));
	const checks: InspectorCheck[] = [
		{ label: `States the exact refund: $${EXPECTED.refund}`, pass: /\$\s?277\.67\b/.test(text) },
		{ label: 'Discloses the 15% early-termination fee', pass: /15\s?%/.test(text) },
		{ label: 'Gives the 5–7 business-day timeline', pass: /5\s?[–—-]\s?7\s+business/i.test(text) },
		{
			label: 'No invented dollar amounts',
			pass: invented.length === 0,
			detail: invented.length ? `invented: ${invented.map((a) => '$' + a).join(', ')}` : undefined
		}
	];
	return { pass: checks.every((c) => c.pass), checks };
}

export function inspectDeletionReply(text: string): Verdict {
	const checks: InspectorCheck[] = [
		{ label: 'Reference number DEL-YYYYMMDD issued', pass: /DEL-\d{8}/.test(text) },
		{ label: '30-day grace window stated', pass: /30[-\s]day/i.test(text) },
		{ label: 'Data export offered first', pass: /export/i.test(text) },
		{ label: 'Identity verification addressed', pass: /verif/i.test(text) }
	];
	return { pass: checks.every((c) => c.pass), checks };
}

// ── Context accounting (page-side meters) ────────────────────────────────────

/** Tokens of tool results that are skill manuals/scripts the agent pulled in on demand. */
export function skillPayloadTokens(msgs: BaseMessage[]): number {
	const skillCallIds = new Set<string>();
	for (const m of msgs) {
		if (m instanceof AIMessage) {
			for (const tc of m.tool_calls ?? []) {
				const path = (tc.args as { path?: string })?.path ?? '';
				if ((tc.name === 'read_file' || tc.name === 'run_script') && path.startsWith('/skills/')) {
					if (tc.id) skillCallIds.add(tc.id);
				}
			}
		}
	}
	let tokens = 0;
	for (const m of msgs) {
		if (m instanceof ToolMessage && skillCallIds.has(m.tool_call_id)) tokens += messageTokens(m);
	}
	return tokens;
}

// ── The three clerks ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the customer-support agent for Lumen Analytics, a SaaS analytics product.
Resolve the customer's request yourself, completely and specifically — exact amounts, exact dates,
concrete next steps. Reply in a short, warm, professional message. Do not refer the customer
elsewhere and do not promise that "someone will follow up".`;

/** The crammed clerk's system prompt: the same core + every procedure, inline, always. */
export function crammedInstructions(): string {
	const bodies = SKILL_NAMES.map((name) => {
		const parsed = parseSkillFrontmatter(SKILL_FILES[`/skills/${name}/SKILL.md`]);
		return `## PROCEDURE: ${name}\n${parsed?.body.trim() ?? ''}`;
	});
	return (
		SYSTEM_PROMPT +
		'\n\n# COMPANY PROCEDURES (all of them, all the time)\n' +
		bodies.join('\n\n') +
		'\n\n# REFERENCE FILES\n' +
		`## /skills/refund-policy/references/plans.md\n${REFUND_PLANS}\n\n` +
		`## /skills/refund-policy/references/disclosures.md\n${REFUND_DISCLOSURES}`
	);
}

export interface ClerkDesk {
	variant: ClerkVariant;
	agent: CompiledDeepAgent;
}

/**
 * Build one desk. All three share the model, the tools and the core prompt —
 * the ONLY difference is how company procedure reaches the context window.
 * This is the exact source the demo runs.
 */
export async function buildClerk(variant: ClerkVariant, tracer?: Tracer): Promise<ClerkDesk> {
	const backend = new StateBackend();
	if (variant !== 'bare') {
		// The bare desk has no manuals anywhere; the other two get the full shelf.
		for (const [path, content] of Object.entries(SKILL_FILES)) {
			await backend.write(path, content);
		}
	}
	const model = await getModel({ maxTokens: 1400, temperature: 0.2, reasoningEffort: 'low' });
	const agent = createDeepAgent({
		model,
		backend,
		tracer,
		maxIterations: 14,
		systemPrompt: variant === 'crammed' ? crammedInstructions() : SYSTEM_PROMPT,
		// Level 1 disclosure happens HERE: only the skilled clerk gets a catalog.
		skills: variant === 'skilled' ? ['/skills/'] : undefined
	});
	return { variant, agent };
}
