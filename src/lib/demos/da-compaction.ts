import { createDeepAgent, StateBackend } from '$lib/deepagents';
import { totalMessageTokens } from '$lib/deepagents/tokens';
import type { VirtualFile, CompiledDeepAgent } from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { createTracer } from '$lib/runtime/tracer';
import type { Tracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * THE INCIDENT ROOM — a context-compaction demo grounded in the most natural
 * context-bomb there is: production logs.
 *
 * An on-call SRE agent must find the root cause of a checkout outage by reading
 * several large log files. Each read is a fat tool result that gets EVICTED to
 * /large_tool_results/; the long investigation trips SUMMARIZATION, which folds
 * the early turns — including the opening brief — into one summary card. The
 * brief carries the "needle": a scope + a 14:00 rollback deadline that must
 * survive compaction all the way to the final report.
 *
 * The compaction budget here is deliberately tiny so every tier visibly fires;
 * the real model keeps its full window — we are simulating the harness, not the
 * model's limit.
 */

// Budget VISIBLE TO THE COMPACTION PIPELINE — small on purpose so tiers fire.
export const MAX_TOKENS = 1600;
export const EVICT_THRESHOLD_PCT = 45;
export const SUMMARIZE_THRESHOLD_PCT = 82;

// ── The needle: the constraint that must outlive the window ──────────────────
export const NEEDLE =
	'Scope: api-gateway deploys only · roll back before 14:00 UTC · ignore the worker fleet';

// ── The incident brief (the opening human message — carries the needle) ──────
export const INCIDENT_BRIEF = `URGENT — incident INC-2207. Since ~13:32 UTC, checkout has been returning 503 errors and customers cannot pay.

SCOPE (read carefully): the emergency rollback window closes at 14:00 UTC. We can roll back exactly ONE service, and ONLY api-gateway deploys are in scope for this incident. The worker fleet is a separate, known-noisy system — do NOT chase it. Logs are under /logs/, metrics under /metrics/.

Find the single root cause and write /report/root-cause.md stating: the exact deploy to roll back, the root cause in one or two sentences, and confirm the rollback can be completed before the 14:00 UTC deadline.`;

// ── Seeded evidence (genuinely large → evicted as the agent reads it) ────────

const API_GATEWAY_LOG = `# /logs/api-gateway.log  (service: api-gateway)
2026-06-12T13:25:02Z INFO  gw build gw-4418 healthy; connection_pool.max=50; upstream=checkout
2026-06-12T13:27:33Z INFO  health ok; checkout p99=110ms; 200 rate 240/s
2026-06-12T13:29:50Z INFO  health ok; checkout p99=115ms; 200 rate 238/s
2026-06-12T13:31:40Z INFO  ci-bot: deploy pipeline started for gw-4421
2026-06-12T13:32:10Z INFO  DEPLOY gw-4421 applied by ci-bot
2026-06-12T13:32:10Z INFO  config diff gw-4418 -> gw-4421: connection_pool.max 50 -> 5   (only changed key)
2026-06-12T13:32:41Z WARN  connection pool saturated: 5/5 connections in use, 18 requests queued
2026-06-12T13:32:58Z WARN  connection pool saturated: 5/5 in use, 64 queued, oldest wait 240ms
2026-06-12T13:33:02Z ERROR upstream checkout 503: no pool connection acquired within 250ms
2026-06-12T13:33:05Z ERROR upstream checkout 503 rate 12/s and climbing
2026-06-12T13:33:31Z ERROR upstream checkout 503 rate 39/s; pool exhausted (max=5)
2026-06-12T13:34:00Z ERROR upstream checkout 503 rate 61/s
2026-06-12T13:35:12Z INFO  ci-bot: gw-4421 marked stable by smoke test (smoke test does NOT exercise checkout)
2026-06-12T13:36:40Z ERROR upstream checkout 503 rate 77/s; queue depth 900
2026-06-12T13:38:20Z ERROR upstream checkout 503 rate 84/s
2026-06-12T13:40:00Z ERROR upstream checkout 503 rate 88/s; GET /config -> connection_pool.max=5 (confirmed)
2026-06-12T13:42:15Z INFO  manual probe: setting pool.max=50 in staging restores 200s instantly
2026-06-12T13:44:01Z ERROR upstream checkout 503 rate 86/s; prod still on gw-4421
2026-06-12T13:46:30Z NOTE  prior good build gw-4418 had pool.max=50 for 3 months with no 503s`;

const WORKER_LOG = `# /logs/worker.log  (service: worker-fleet — OUT OF SCOPE per incident)
2026-06-12T13:18:09Z WARN  worker-3 task retry (attempt 2) backoff 200ms queue=email
2026-06-12T13:19:44Z WARN  worker-7 task retry (attempt 3) backoff 400ms queue=thumbnails
2026-06-12T13:21:02Z WARN  worker-2 queue depth 1100; scaling consumers 4 -> 6
2026-06-12T13:22:51Z WARN  worker-7 retry (attempt 2) backoff 200ms queue=thumbnails
2026-06-12T13:24:33Z WARN  worker-5 dead-letter 1 message (malformed) queue=webhooks
2026-06-12T13:27:10Z WARN  worker-3 retry (attempt 2) backoff 200ms queue=email
2026-06-12T13:30:00Z WARN  worker-7 queue depth 1200; consumers 6
2026-06-12T13:33:14Z WARN  worker-2 retry (attempt 4) backoff 800ms queue=thumbnails
2026-06-12T13:36:45Z WARN  worker-7 retry storm: 240 retries in 60s queue=thumbnails
2026-06-12T13:40:20Z WARN  worker-5 dead-letter 2 messages queue=webhooks
2026-06-12T13:44:02Z WARN  worker-3 queue depth 980; consumers 6
NOTE: the worker fleet has emitted continuous retry noise for ~3 weeks (tracked in OPS-1188);
this is pre-existing and unrelated to the checkout 503 incident. Do not be misled by the volume.`;

const DATABASE_LOG = `# /logs/database.log  (service: payments-db)
2026-06-12T13:25:00Z INFO  connections: 38 active / 200 max; p99 query 8ms
2026-06-12T13:30:00Z INFO  connections: 41 active / 200 max; p99 query 9ms
2026-06-12T13:32:20Z INFO  connections: 6 active / 200 max  (checkout traffic dropping off)
2026-06-12T13:34:00Z INFO  connections: 5 active / 200 max; p99 query 8ms
2026-06-12T13:36:00Z INFO  slow query log: 2 queries > 500ms (nightly report job, expected)
2026-06-12T13:40:00Z INFO  connections: 5 active / 200 max; db healthy, well under capacity
NOTE: the database is HEALTHY and far below limits. The low active-connection count is a
SYMPTOM — the gateway is no longer forwarding checkout requests, so the db sees fewer of them.`;

const LATENCY_CSV = `# /metrics/latency.csv  (checkout endpoint)
minute_utc,requests,status_200,status_503,p99_ms
13:25,1440,1440,0,110
13:28,1440,1439,1,114
13:31,1440,1438,2,116
13:32,1440,980,460,242
13:33,1440,360,1080,251
13:35,1440,180,1260,248
13:38,1440,150,1290,250
13:40,1440,150,1290,249
13:43,1440,160,1280,250`;

/** Every seeded file, exactly as the agent finds it — the page's evidence drawer. */
export const LOG_FILES: Record<string, string> = {
	'/logs/api-gateway.log': API_GATEWAY_LOG,
	'/logs/worker.log': WORKER_LOG,
	'/logs/database.log': DATABASE_LOG,
	'/metrics/latency.csv': LATENCY_CSV
};

// ── The deterministic inspector — recompute the verdict, no vibes ────────────

export interface InspectorCheck {
	label: string;
	pass: boolean;
	detail?: string;
}
export interface Verdict {
	pass: boolean;
	checks: InspectorCheck[];
}

export function inspectReport(report: string): Verdict {
	const text = report ?? '';
	// Scope test: a POSITIVE recommendation to roll back the worker is out of
	// scope. Judge per sentence/line, and exempt negations ("do NOT roll back the
	// worker", "the worker fleet is healthy") — saying the worker is fine is good.
	const workerRollback = text
		.split(/[.\n]+/)
		.some(
			(s) =>
				/worker/i.test(s) &&
				/roll[\s-]?back/i.test(s) &&
				!/(\bnot\b|n't|never|avoid|instead|rather than|healthy|out.of.scope|ignore|separate)/i.test(s)
		);
	const checks: InspectorCheck[] = [
		{
			label: 'Names the exact deploy to roll back: gw-4421',
			pass: /gw-?4421/i.test(text)
		},
		{
			label: 'Identifies the connection-pool root cause',
			pass: /pool/i.test(text) && /(exhaust|saturat|starv|max|503)/i.test(text)
		},
		{
			label: 'Honors the 14:00 UTC rollback deadline (the needle)',
			pass: /14[:.]00/.test(text) || /\b14\b[^\n]{0,28}(UTC|deadline|window|roll)/i.test(text)
		},
		{
			label: 'Correct scope — rolls back api-gateway, not the worker',
			pass: /gw-?4421/i.test(text) && /roll[\s-]?back/i.test(text) && !workerRollback,
			detail: workerRollback ? 'recommends rolling back the out-of-scope worker' : undefined
		}
	];
	return { pass: checks.every((c) => c.pass), checks };
}

// ── The agent ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an on-call Site Reliability Engineer (SRE) agent for a payments company.
You investigate production incidents methodically and decisively.

Procedure — be efficient, you are racing a deadline:
- List /logs and /metrics once. Read each IN-SCOPE source AT MOST ONCE. The in-scope api-gateway
  log is where the root cause will be; the metrics confirm timing. You usually do not need more.
- Keep a running scratchpad at /notes/findings.md: right after you read a source, append ONE bullet
  with the key fact (timestamp, service, what changed). Your notes are your memory — once a fact is
  written there, you do NOT need to read that source again.
- A tool result that says it was "evicted to /large_tool_results/…" is NORMAL: the harness moved the
  bulk to disk. Do NOT re-read that path — you already captured what mattered in /notes/findings.md.
- Find the SINGLE root cause. Do not blame a symptom. Stay strictly within the stated scope.
- As soon as you know the cause, write /report/root-cause.md with: the exact deploy to roll back,
  the root cause in one or two sentences, and a line confirming the rollback fits before the stated
  deadline. Then STOP — do not keep investigating after the report is written.`;

export interface CompactionRunResult {
	events: TraceEvent[];
	files: VirtualFile[];
	messages: BaseMessage[];
	report: string;
	findings: string;
	finalText: string;
	verdict: Verdict;
}

export interface CompactionCallbacks {
	onTrace?: (events: TraceEvent[]) => void;
	onProgress?: (snapshot: {
		files: VirtualFile[];
		liveTokens: number;
		messages: BaseMessage[];
	}) => void;
}

export interface IncidentDesk {
	agent: CompiledDeepAgent;
	backend: StateBackend;
}

/** Build the incident desk: seed the evidence, wire the low-threshold pipeline. */
export async function buildIncidentDesk(tracer?: Tracer): Promise<IncidentDesk> {
	const backend = new StateBackend();
	for (const [path, content] of Object.entries(LOG_FILES)) await backend.write(path, content);
	const model = await getModel({ maxTokens: 1500, temperature: 0, reasoningEffort: 'low' });
	const agent = createDeepAgent({
		model,
		backend,
		tracer,
		systemPrompt: SYSTEM_PROMPT,
		maxIterations: 30,
		compaction: {
			maxTokens: MAX_TOKENS,
			evictThresholdPct: EVICT_THRESHOLD_PCT,
			summarizeThresholdPct: SUMMARIZE_THRESHOLD_PCT,
			largeToolResultMin: 400, // a single log read is well past this → evicted
			historyKeep: 4
		}
	});
	return { agent, backend };
}

/**
 * Drives the Incident Room run end to end: the SRE reads the logs (each evicted),
 * the investigation summarizes the early brief, and the final report is judged
 * by the deterministic inspector. This is the exact source the demo runs.
 */
export async function runCompactionDemo(
	cb: CompactionCallbacks = {}
): Promise<CompactionRunResult> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	const { agent, backend } = await buildIncidentDesk(tracer);
	agent.subscribe((s) => {
		cb.onProgress?.({
			files: [...s.files],
			liveTokens: totalMessageTokens(s.messages),
			messages: [...s.messages]
		});
	});

	const out = await agent.invoke({
		input: INCIDENT_BRIEF,
		thread: `incident-${Math.random().toString(36).slice(2, 6)}`
	});
	const last = out.messages[out.messages.length - 1];
	const finalText =
		typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	const report = (await backend.read('/report/root-cause.md')) ?? '';
	const findings = (await backend.read('/notes/findings.md')) ?? '';
	return {
		events: localEvents,
		files: await backend.list(),
		messages: out.messages as BaseMessage[],
		report,
		findings,
		finalText,
		verdict: inspectReport(report)
	};
}
