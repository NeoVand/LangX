// ─────────────────────────────────────────────────────────────────────────────
// CAPSTONE — THE ANALYTICAL ENGINE
//
// A generalist data-scientist agent that does real data science in the browser,
// with no Python and no server. Babbage's vocabulary maps onto the harness:
//   • THE STORE — the virtual filesystem: /data (input + schema), /analysis
//     (computed results), /reports (figures + the report).
//   • THE MILL  — a sandboxed dataframe interpreter (Arquero + simple-statistics)
//     the agent writes TypeScript for; our browser stand-in for the official
//     code-interpreter middleware. The agent computes every number; it never guesses.
//   • THE PLOTTER — Observable Plot, rendering honest SVG charts.
//
// It composes the whole harness: a plan the human APPROVES (interruptOn),
// progressive-disclosure SKILLS for method, code written + run in the sandbox,
// the filesystem as working memory, and compaction for the long haul.
//
// This is the exact source the demo runs.
// ─────────────────────────────────────────────────────────────────────────────

import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type Todo,
	type VirtualFile
} from '$lib/deepagents';
import { getModel } from '$lib/runtime/llm';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';
import {
	Mill,
	profileDataset,
	describeSchema,
	dataPath,
	loadDataset,
	DATASETS,
	type LoadedDataset,
	type Row
} from '$lib/runtime/datascience';

import tabularEdaSkill from '$lib/demos/skills/ds-tabular-eda.md?raw';
import statisticsSkill from '$lib/demos/skills/ds-statistics.md?raw';
import chartingSkill from '$lib/demos/skills/ds-charting.md?raw';

// ── The skill shelf, as real backend files (Agent Skills standard) ────────────

export const DS_SKILL_FILES: Record<string, string> = {
	'/skills/ds-tabular-eda/SKILL.md': tabularEdaSkill,
	'/skills/ds-statistics/SKILL.md': statisticsSkill,
	'/skills/ds-charting/SKILL.md': chartingSkill
};

export const DS_SKILL_NAMES = ['ds-tabular-eda', 'ds-statistics', 'ds-charting'];

// ── Shared shapes ─────────────────────────────────────────────────────────────

export interface ComputeStep {
	label: string;
	code: string;
	result: string;
	ok: boolean;
	elapsedMs?: number;
}

export interface AnalysisPlanStep {
	question: string;
	method: string;
	chart?: string;
}
export interface AnalysisPlan {
	title: string;
	dataset: string;
	steps: AnalysisPlanStep[];
}

export interface Figure {
	path: string;
	caption: string;
	mark: string;
}

export interface DsCallbacks {
	/** The whole growing trace-event list. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live plan + filesystem snapshot whenever the agent state changes. */
	onProgress?: (s: { todos: Todo[]; files: VirtualFile[] }) => void;
	/** Each Mill run: the code and its result. */
	onStep?: (steps: ComputeStep[]) => void;
	/** Each chart rendered to the Store. */
	onFigures?: (figures: Figure[]) => void;
}

// ── The Plotter — Observable Plot → an SVG string ─────────────────────────────

export interface PlotSpec {
	title?: string;
	mark: 'scatter' | 'bar' | 'line';
	x: string;
	y: string;
	color?: string;
	xScale?: 'linear' | 'log';
	yScale?: 'linear' | 'log';
}

// A clean, on-theme qualitative palette for categorical color — distinguishable
// on the dark paper background, and shared by the marks AND the legend.
const CATEGORY_COLORS = [
	'#c9a227',
	'#8b7bd8',
	'#5fa37a',
	'#d08a52',
	'#6f9bc4',
	'#c56b8a',
	'#b0a04a',
	'#9aa0a6'
];

async function renderPlot(spec: PlotSpec, rows: Row[]): Promise<string> {
	const Plot = await import('@observablehq/plot');
	const accent = 'var(--accent, var(--color-accent-langchain))';

	// Curate the categorical color scale ourselves: on-theme colors and a clean
	// legend of just the distinct categories (not Plot's default scheme).
	let color: Record<string, unknown> | undefined;
	const colorKey = spec.color;
	if (colorKey) {
		const domain = [...new Set(rows.map((r) => r[colorKey]).filter((v) => v != null && v !== ''))]
			.map(String)
			.sort();
		color = {
			domain,
			range: domain.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
			legend: true
		};
	}

	const opts: Record<string, unknown> = {
		title: spec.title,
		width: 600,
		height: 380,
		marginLeft: 68,
		marginBottom: 52,
		marginRight: 24,
		marginTop: 24,
		style: {
			background: 'transparent',
			color: 'currentColor',
			fontSize: '12px',
			overflow: 'visible'
		},
		x: {
			label: spec.x,
			type: spec.xScale === 'log' ? 'log' : undefined,
			grid: spec.mark !== 'bar',
			tickFormat: spec.xScale === 'log' ? '~s' : undefined
		},
		y: {
			label: spec.y,
			grid: true,
			type: spec.yScale === 'log' ? 'log' : undefined
		},
		color
	};

	let marks: unknown[];
	if (spec.mark === 'line') {
		marks = [
			Plot.line(rows, {
				x: spec.x,
				y: spec.y,
				stroke: spec.color ?? accent,
				strokeWidth: 1.8,
				sort: { channel: 'x' }
			})
		];
	} else if (spec.mark === 'bar') {
		// Defensive: coerce the height channel to a real number (a string y renders
		// as zero/equal bars), and force an ordinal x so a bar chart always reads as
		// discrete bars — one per category — rather than a continuous axis.
		const yKey = spec.y;
		const barRows = rows.map((r) => ({
			...r,
			[yKey]: typeof r[yKey] === 'number' ? r[yKey] : Number(r[yKey])
		}));
		(opts.x as Record<string, unknown>).type = 'band';
		marks = [
			Plot.ruleY([0]),
			Plot.barY(barRows, { x: spec.x, y: yKey, fill: spec.color ?? accent, sort: { x: '-y' } })
		];
	} else {
		marks = [
			Plot.dot(rows, {
				x: spec.x,
				y: spec.y,
				fill: spec.color ?? accent,
				r: 3.4,
				fillOpacity: 0.82,
				stroke: 'var(--color-bg)',
				strokeWidth: 0.4
			})
		];
	}
	opts.marks = marks;

	const chart = Plot.plot(opts) as unknown as { outerHTML: string; remove?: () => void };
	const out = chart.outerHTML;
	chart.remove?.();
	return out;
}

// ── The system prompt — the Engine's operating manual ─────────────────────────

const SYSTEM_PROMPT = `You are the operator of the ANALYTICAL ENGINE — a meticulous, generalist data
scientist that writes TypeScript and RUNS it to analyse data. You never guess at a number; you compute it.

# Your instruments
- compute({ code }) — THE MILL: a sandbox (no DOM, no network) with the active dataset in scope as
  \`data\` (an array of row objects) and \`table\` (an Arquero dataframe), plus \`aq\`, \`op\` (Arquero
  operators) and \`ss\` (simple-statistics). EVERY count, mean, correlation, regression and quantile goes
  through here. Use \`return\` to produce a JSON value.
- plot({ title, mark, x, y, color?, from?, data?, xScale?, yScale?, caption? }) — THE PLOTTER: renders a
  scatter / bar / line chart to /reports/figures/. Prefer xScale:"log" for income/population/money.
- The filesystem — THE STORE: /data holds the input and a <id>.profile.json schema; /analysis is your
  scratch space for computed results; /reports holds figures and the report. (write_file is create-only —
  use a fresh path, or edit_file to change a file.)
- write_todos — your plan board. Keep it current.
- present_plan({ title, steps }) — show the human your plan and PAUSE for approval.
- Your /skills/ shelf — read the SKILL.md you need before you use it: ds-tabular-eda (profiling &
  aggregation), ds-statistics (correlation, regression, outliers), ds-charting (which chart, how to spec it).

# How you work
1. INSPECT — read /data/<id>.profile.json to learn the columns and missingness. Read the skill(s) you'll need.
2. PLAN — draft a short, concrete plan (3–5 steps, each a {question, method, chart}) and call present_plan.
   Do NO computation yet. If the human responds with comments, REVISE the plan and present it again. Begin
   only after they approve.
3. EXECUTE — for each step: compute the result in the Mill (never by hand); save anything a chart needs to
   /analysis/<name>.json; render the chart with plot. If a snippet errors, read the message, fix the code, re-run.
4. REPORT — write /reports/report.md as the FINAL, polished deliverable: a title, a one-paragraph executive
   summary, a section per question with the COMPUTED numbers, an "## Insights" section with at least one
   NON-OBVIOUS finding (an outlier, a reversal / Simpson's paradox, a surprising correlation), and a short
   "## Method" note. EMBED EVERY chart you rendered, each in the section it belongs to, with the exact
   markdown the plot tool gave you: ![caption](/reports/figures/N.svg). Do not leave a chart out of the
   report. Quote ONLY numbers you computed.
5. ANSWER — reply with a 2–3 sentence executive summary and where the report was saved.

# Rules
- NEVER fabricate a statistic. If you did not compute it, do not claim it.
- Aggregate, then reason: return small summaries from the Mill, not raw rows.
- Honest charts: a bar/line chart shows a PRE-AGGREGATED summary (one row per category) — compute it in the
  Mill and save it, then plot from that file; never hand plot the raw rows for a bar chart. On a bar chart
  x is a CATEGORY/LABEL (a name like country/region/month) and y is the numeric value — NEVER put a number
  on x, which draws a row of identical equal-height bars. Use color only when it adds a real second
  dimension, and keep it to a handful of categories so the legend stays clean.
- Embed every figure in the report; the report is what the human reads at the end, so it must stand alone.
- Be the scientist — state uncertainty, name plausible confounders, and don't assert cause from correlation.`;

// ── Building one Engine over a loaded dataset ─────────────────────────────────

function cap(s: string, n = 4000): string {
	return s.length > n ? `${s.slice(0, n)}\n… (truncated; ${s.length} chars total)` : s;
}

export interface DsBuild {
	agent: CompiledDeepAgent;
	thread: string;
	input: string;
}

/**
 * Wire up the Analytical Engine for one already-loaded dataset and one question.
 * The host owns loading/profiling (so the DataTable shows instantly); here we
 * seed the Store, mount the skills, and hand back an agent ready to start().
 */
export async function buildDataScienceAgent(
	loaded: LoadedDataset,
	question: string,
	cb: DsCallbacks = {}
): Promise<DsBuild> {
	const localEvents: TraceEvent[] = [];
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		cb.onTrace?.([...localEvents]);
	});

	const backend = new StateBackend();
	// Mount the skill shelf (progressive disclosure: only the frontmatter ships up-front).
	for (const [path, content] of Object.entries(DS_SKILL_FILES)) await backend.write(path, content);

	// Seed the Store: the raw deck + a machine-readable schema.
	const profile = profileDataset(loaded.rows);
	await backend.write(dataPath(loaded), loaded.text);
	await backend.write(`/data/${loaded.id}.profile.json`, JSON.stringify(profile, null, 2));

	const mill = new Mill();
	// De-proxy the rows: the host passes them from Svelte $state (a reactive
	// Proxy), which structured-clone CANNOT send across the Worker boundary
	// (postMessage throws "could not be cloned"). A flat copy yields plain,
	// cloneable objects — our datasets are flat tabular, so a shallow spread
	// is enough (Dates from d3 autoType are passed through untouched).
	const activeRows: Row[] = loaded.rows.map((r) => ({ ...r }));
	const steps: ComputeStep[] = [];
	const figures: Figure[] = [];
	let figureCount = 0;

	// THE MILL — sandboxed compute over the active dataset.
	const computeTool = tool(
		async ({ code, label }) => {
			const out = await mill.run(code, activeRows);
			const result = out.ok ? cap(JSON.stringify(out.value, null, 2)) : `Error: ${out.error}`;
			steps.push({ label: label ?? '', code, result, ok: out.ok, elapsedMs: out.elapsedMs });
			cb.onStep?.([...steps]);
			return result;
		},
		{
			name: 'compute',
			description:
				'Run a JavaScript/TypeScript analysis snippet in the Mill — a sandbox with NO DOM and NO network. ' +
				'In scope: `data` (the dataset rows), `table` (an Arquero dataframe of them), `aq`, `op` (Arquero) and ' +
				'`ss` (simple-statistics). Use `return` to produce a JSON-serialisable value. Compute every statistic ' +
				'here; never do arithmetic by hand. `label` is a short human description of the step.',
			schema: z.object({ code: z.string(), label: z.string().optional() })
		}
	);

	// THE PLOTTER — Observable Plot SVG into the Store.
	const plotTool = tool(
		async ({ title, mark, x, y, color, from, data, xScale, yScale, caption }) => {
			try {
				let rows: Row[];
				if (Array.isArray(data) && data.length) rows = data as Row[];
				else if (from && from !== 'dataset') {
					const raw = await backend.read(from);
					if (!raw) return `No file at ${from}. compute the data and write_file it first.`;
					rows = JSON.parse(raw) as Row[];
				} else rows = activeRows;
				if (!Array.isArray(rows) || !rows.length) return 'No rows to plot.';
				const svg = await renderPlot({ title, mark, x, y, color, xScale, yScale }, rows);
				const path = `/reports/figures/${++figureCount}.svg`;
				await backend.write(path, svg);
				const cpt = caption || title || `${mark} of ${y} vs ${x}`;
				figures.push({ path, caption: cpt, mark });
				cb.onFigures?.([...figures]);
				return (
					`Rendered ${mark} chart to ${path}. Embed it in the report in the relevant section with ` +
					`this exact line:\n![${cpt}](${path})`
				);
			} catch (e) {
				return `Plot error: ${e instanceof Error ? e.message : String(e)}`;
			}
		},
		{
			name: 'plot',
			description:
				'Render an Observable Plot chart (mark: "scatter" | "bar" | "line") to /reports/figures/. x and y are ' +
				'column names; optional color is a categorical column; xScale/yScale may be "log". Data source: inline ' +
				'`data` (array of rows), or `from` a Store path like "/analysis/agg.json", else the active dataset. ' +
				'caption is one honest sentence.',
			schema: z.object({
				title: z.string().optional(),
				mark: z.enum(['scatter', 'bar', 'line']),
				x: z.string(),
				y: z.string(),
				color: z.string().optional(),
				from: z.string().optional(),
				data: z.array(z.record(z.string(), z.unknown())).optional(),
				xScale: z.enum(['linear', 'log']).optional(),
				yScale: z.enum(['linear', 'log']).optional(),
				caption: z.string().optional()
			})
		}
	);

	// THE GATE — present the plan and pause for the human. Because this tool is
	// gated by interruptOn, its body only ever runs AFTER the human approves (a
	// reject/respond is answered by the harness, not by this return). So the
	// return value is the "go" signal the model reads to start executing.
	const presentPlanTool = tool(
		async ({ title, steps: planSteps }) =>
			`APPROVED — the human signed off on "${title}" (${planSteps.length} steps). Begin executing now: ` +
			`work the steps in order — compute every number in the Mill, save results a chart needs to /analysis, ` +
			`render the charts with plot, then write /reports/report.md. Do not call present_plan again.`,
		{
			name: 'present_plan',
			description:
				'Show the human your analysis plan and PAUSE for approval BEFORE any computation. steps is an ordered ' +
				'list of { question, method, chart? }.',
			schema: z.object({
				title: z.string(),
				steps: z.array(
					z.object({
						question: z.string(),
						method: z.string(),
						chart: z.string().optional()
					})
				)
			})
		}
	);

	const model = await getModel({ temperature: 0, maxTokens: 6000 });
	const agent = createDeepAgent({
		model,
		backend,
		tracer,
		tools: [computeTool, plotTool, presentPlanTool],
		systemPrompt: SYSTEM_PROMPT,
		skills: ['/skills/'],
		interruptOn: { present_plan: { allowedDecisions: ['approve', 'respond', 'reject'] } },
		compaction: { maxTokens: 32000, summarizeThresholdPct: 88, largeToolResultMin: 8000 },
		maxIterations: 30
	});

	agent.subscribe((s) => cb.onProgress?.({ todos: s.todos, files: s.files }));

	const input =
		`Dataset: "${loaded.name}" (${loaded.provenance}). It is loaded into the Store at ${dataPath(loaded)} ` +
		`and available to the Mill as \`data\` / \`table\`.\n\n` +
		`Schema:\n${describeSchema(profile)}\n\n` +
		`The analyst's request:\n${question.trim()}\n\nBegin.`;

	const thread = `ds-${slug(loaded.id)}-${stamp()}`;
	return { agent, thread, input };
}

// ── A standalone runner (used by the downloadable source) ─────────────────────

export interface DsRunResult {
	report: string | null;
	files: VirtualFile[];
	steps: ComputeStep[];
	figures: Figure[];
	events: TraceEvent[];
	finalText: string;
}

/**
 * Headless convenience: load the flagship dataset, run the Engine to completion,
 * approving (or steering) the plan via `decide`. Mirrors the live demo's flow.
 */
export async function runDataScienceCapstone(
	question: string,
	decide: (
		plan: AnalysisPlan
	) => { type: 'approve' } | { type: 'respond'; message: string } = () => ({
		type: 'approve'
	}),
	cb: DsCallbacks = {}
): Promise<DsRunResult> {
	const loaded = await loadDataset(DATASETS[0]);
	const steps: ComputeStep[] = [];
	const figures: Figure[] = [];
	const events: TraceEvent[] = [];
	const built = await buildDataScienceAgent(loaded, question, {
		onTrace: (e) => ((events.length = 0), events.push(...e), cb.onTrace?.(e)),
		onStep: (s) => ((steps.length = 0), steps.push(...s), cb.onStep?.(s)),
		onFigures: (f) => ((figures.length = 0), figures.push(...f), cb.onFigures?.(f)),
		onProgress: cb.onProgress
	});

	let res = await built.agent.start({ input: built.input, thread: built.thread });
	while (res.status === 'interrupted') {
		const plan = res.interrupt.args as unknown as AnalysisPlan;
		res = await built.agent.resume(decide(plan), built.thread);
	}

	const files = res.state.files;
	const last = res.state.messages[res.state.messages.length - 1];
	return {
		report: files.find((f) => f.path === '/reports/report.md')?.content ?? null,
		files,
		steps,
		figures,
		events,
		finalText: typeof last?.content === 'string' ? last.content : ''
	};
}

// ── tiny utils ────────────────────────────────────────────────────────────────

function slug(s: string): string {
	return s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}
function stamp(): string {
	return Math.random().toString(36).slice(2, 6);
}
