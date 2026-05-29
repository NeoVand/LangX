import {
	createDeepAgent,
	StateBackend,
	type CompiledDeepAgent,
	type VirtualFile
} from '$lib/deepagents';
import { JsSandbox } from '$lib/runtime/sandbox';
import { getModel } from '$lib/runtime/llm';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createTracer } from '$lib/runtime/tracer';
import type { TraceEvent } from '$lib/runtime/tracer/types';

export interface ComputeStep {
	code: string;
	result: string;
}

const INSTRUCTIONS = `You are a data-science agent. You have two custom tools:
- \`compute({ code })\` runs JavaScript inside a scoped Worker. The variable \`csv\` is pre-bound to
  the raw CSV text. Use \`return\` to produce a JSON-serialisable value.
- \`plot({ mark, data, x, y, title })\` renders an Observable Plot chart to an SVG file under
  /reports/figures/ and returns its path. \`data\` is an array of objects.

Follow this recipe exactly:
1. write_file('/data/sales.csv', <the CSV string the user provided>) — pass the CSV through verbatim.
2. compute({ code: <JS that parses csv into rows, then aggregates quantity and revenue per product, then returns { rowCount, byProduct: [{ product, quantity, revenue }] }> })
3. plot({ mark: 'bar', data: <the byProduct array>, x: 'product', y: 'revenue', title: 'Revenue by product' })
4. write_file('/reports/sales.md', <a short markdown report with three sections:
   - "Summary" — one paragraph with rowCount and product count.
   - "Revenue by product" — a markdown table of product / quantity / revenue.
   - "Chart" — the line  ![Revenue by product](/reports/figures/1.svg)  >)
5. Reply with one sentence noting where the report was saved and how many rows were analysed.

Do not chat between tool calls. Do not skip steps.`;

async function renderPlot(spec: {
	mark: string;
	data: Record<string, unknown>[];
	x: string;
	y: string;
	title?: string;
}): Promise<string> {
	const Plot = await import('@observablehq/plot');
	const fill = 'var(--color-accent-deepagents, #8a6cff)';
	const marks =
		spec.mark === 'line'
			? [
					Plot.line(spec.data, { x: spec.x, y: spec.y, stroke: fill, strokeWidth: 2 }),
					Plot.dot(spec.data, { x: spec.x, y: spec.y, fill })
				]
			: spec.mark === 'dot'
				? [Plot.dot(spec.data, { x: spec.x, y: spec.y, fill })]
				: [Plot.barY(spec.data, { x: spec.x, y: spec.y, fill })];
	const chart = Plot.plot({
		title: spec.title,
		width: 520,
		height: 300,
		marginLeft: 64,
		marginBottom: 44,
		x: { label: spec.x },
		y: { label: spec.y, grid: true },
		marks
	});
	const svgEl = chart.tagName.toLowerCase() === 'svg' ? chart : chart.querySelector('svg');
	const out = svgEl ? new XMLSerializer().serializeToString(svgEl) : chart.outerHTML;
	chart.remove?.();
	return out;
}

function buildAgent(
	csv: string,
	localEvents: TraceEvent[],
	onTrace: ((events: TraceEvent[]) => void) | undefined,
	collectStep: (s: ComputeStep) => void
) {
	const tracer = createTracer();
	tracer.subscribe((ev) => {
		localEvents.push(ev);
		onTrace?.([...localEvents]);
	});

	const sandbox = new JsSandbox();
	const backend = new StateBackend();
	let figureCount = 0;

	// ── Custom tool: compute — sandboxed JS with csv pre-bound ──────────────
	const computeTool = tool(
		async ({ code }) => {
			const out = await sandbox.run(code, { csv });
			const result = out.ok ? JSON.stringify(out.value, null, 2) : `Error: ${out.error}`;
			collectStep({ code, result });
			return result;
		},
		{
			name: 'compute',
			description:
				'Run a self-contained JavaScript expression in a scoped Worker (no DOM, no network). Use `csv` as the variable holding the raw CSV text. Use `return` to produce a value.',
			schema: z.object({ code: z.string() })
		}
	);

	// ── Custom tool: plot — Observable Plot SVG written to virtual FS ───────
	const plotTool = tool(
		async ({ mark, data, x, y, title }) => {
			try {
				const svg = await renderPlot({ mark, data, x, y, title });
				const path = `/reports/figures/${++figureCount}.svg`;
				await backend.write(path, svg);
				return `Wrote chart to ${path}`;
			} catch (e) {
				return `Plot error: ${e instanceof Error ? e.message : String(e)}`;
			}
		},
		{
			name: 'plot',
			description:
				'Render an Observable Plot chart to an SVG file under /reports/figures/. data is an array of row objects; x and y are field names; mark is "bar", "line", or "dot".',
			schema: z.object({
				mark: z.enum(['bar', 'line', 'dot']),
				data: z.array(z.record(z.string(), z.unknown())),
				x: z.string(),
				y: z.string(),
				title: z.string().optional()
			})
		}
	);

	const agentPromise = (async () => {
		const model = await getModel({ temperature: 0, maxTokens: 1200 });
		return createDeepAgent({
			model,
			backend,
			tools: [computeTool, plotTool],
			instructions: INSTRUCTIONS,
			tracer,
			maxIterations: 16
		});
	})();

	return { agentPromise, sandbox, backend };
}

function lastText(messages: { content: unknown }[]): string {
	const last = messages[messages.length - 1];
	return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
}

/** Live handles kept after a fresh run so follow-up prompts can re-use the thread. */
export interface DsLiveHandles {
	agent: CompiledDeepAgent;
	backend: StateBackend;
	sandbox: JsSandbox;
	thread: string;
}

export interface DsRunResult {
	csv: string;
	files: VirtualFile[];
	events: TraceEvent[];
	steps: ComputeStep[];
	report: string | null;
	finalText: string;
	live: DsLiveHandles;
}

export interface DsCallbacks {
	/** Live trace events (the whole list, growing) as the run progresses. */
	onTrace?: (events: TraceEvent[]) => void;
	/** Live virtual-filesystem snapshot whenever the agent state changes. */
	onFiles?: (files: VirtualFile[]) => void;
	/** Each `compute` call: the code and its result. */
	onStep?: (steps: ComputeStep[]) => void;
}

/**
 * The data-science capstone: the agent saves the CSV, runs aggregation in a
 * scoped Worker (no DOM, no network), plots a real Observable Plot SVG into
 * /reports/figures/, and writes a markdown report to /reports/sales.md. Trace,
 * filesystem, and compute-step updates stream out through the callbacks; the
 * live agent/backend/sandbox handles are returned so the host can re-prompt the
 * same thread for follow-ups. This is the exact source the demo runs.
 */
export async function runDataScienceCapstone(
	csv: string,
	cb: DsCallbacks = {}
): Promise<DsRunResult> {
	const localEvents: TraceEvent[] = [];
	const localSteps: ComputeStep[] = [];
	const { agentPromise, sandbox, backend } = buildAgent(csv, localEvents, cb.onTrace, (s) => {
		localSteps.push(s);
		cb.onStep?.([...localSteps]);
	});
	const agent = await agentPromise;
	agent.subscribe((s) => cb.onFiles?.([...s.files]));

	// ── Agent run: CSV → compute → plot → markdown report ─────────────────────
	const thread = `ds-${Math.random().toString(36).slice(2, 6)}`;
	const out = await agent.invoke({
		input: `Here is the CSV. Analyse it and produce a sales report.\n\n${csv}`,
		thread
	});
	const text = lastText(out.messages);

	return {
		csv,
		files: await backend.list(),
		events: localEvents,
		steps: localSteps,
		report: (await backend.read('/reports/sales.md')) ?? null,
		finalText: text,
		live: { agent, backend, sandbox, thread }
	};
}
