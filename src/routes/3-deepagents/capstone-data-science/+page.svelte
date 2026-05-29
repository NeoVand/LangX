<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type CompiledDeepAgent,
		type VirtualFile
	} from '$lib/deepagents';
	import { JsSandbox } from '$lib/runtime/sandbox';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { tool } from '@langchain/core/tools';
	import { z } from 'zod';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface ComputeStep {
		code: string;
		result: string;
	}

	const SAMPLE_CSV = `date,product,quantity,revenue
2025-01-01,A,12,360
2025-01-01,B,5,250
2025-01-02,A,7,210
2025-01-02,C,3,90
2025-01-03,B,9,450
2025-01-03,A,4,120
2025-01-04,C,6,180
2025-01-05,B,11,550
2025-01-05,A,8,240`;

	interface RunPayload {
		csv: string;
		files: VirtualFile[];
		events: TraceEvent[];
		steps: ComputeStep[];
		report: string | null;
		finalText: string;
	}

	let csv = $state(SAMPLE_CSV);
	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let steps = $state<ComputeStep[]>([]);
	let report = $state<string | null>(null);
	let finalText = $state<string>('');

	// Live handles kept after a fresh run so follow-up chips can re-prompt the same thread.
	let liveAgent = $state<CompiledDeepAgent | null>(null);
	let liveBackend: StateBackend | null = null;
	let liveSandbox: JsSandbox | null = null;
	let liveThread = '';

	// SVG charts the plot() tool wrote into /reports/figures/.
	const figures = $derived(
		files
			.filter((f) => f.path.startsWith('/reports/figures/') && f.path.endsWith('.svg'))
			.sort((a, b) => a.path.localeCompare(b.path))
	);

	const FOLLOWUPS = [
		'Plot revenue over time as a line chart and add it to the report.',
		'Rank the products by total revenue and add a table to the report.',
		'Compute the daily revenue totals and chart them as bars.'
	];

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
				? [Plot.line(spec.data, { x: spec.x, y: spec.y, stroke: fill, strokeWidth: 2 }), Plot.dot(spec.data, { x: spec.x, y: spec.y, fill })]
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
		const svgEl =
			chart.tagName.toLowerCase() === 'svg' ? chart : chart.querySelector('svg');
		const out = svgEl ? new XMLSerializer().serializeToString(svgEl) : chart.outerHTML;
		chart.remove?.();
		return out;
	}

	function buildAgent(localEvents: TraceEvent[], collectStep: (s: ComputeStep) => void) {
		const tracer = createTracer();
		tracer.subscribe((ev) => {
			localEvents.push(ev);
			events = [...localEvents];
		});

		const sandbox = new JsSandbox();
		const backend = new StateBackend();
		let figureCount = 0;

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

	async function run() {
		busy = true;
		files = [];
		events = [];
		steps = [];
		report = null;
		finalText = '';
		liveSandbox?.terminate();
		liveAgent = null;
		try {
			const localSteps: ComputeStep[] = [];
			const result = await withRunCache<RunPayload>(
				{ demoId: `l3-capstone-ds-${slugify(csv)}` },
				async () => {
					const localEvents: TraceEvent[] = [];
					const { agentPromise, sandbox, backend } = buildAgent(localEvents, (s) => {
						localSteps.push(s);
						steps = [...localSteps];
					});
					const agent = await agentPromise;
					agent.subscribe((s) => (files = [...s.files]));

					liveThread = `ds-${Math.random().toString(36).slice(2, 6)}`;
					const out = await agent.invoke({
						input: `Here is the CSV. Analyse it and produce a sales report.\n\n${csv}`,
						thread: liveThread
					});
					const text = lastText(out.messages);

					// Keep handles alive for follow-up chips (only on a fresh run, not a cache hit).
					liveAgent = agent;
					liveBackend = backend;
					liveSandbox = sandbox;

					return {
						csv,
						files: await backend.list(),
						events: localEvents,
						steps: localSteps,
						report: (await backend.read('/reports/sales.md')) ?? null,
						finalText: text
					};
				}
			);
			files = result.files;
			events = result.events;
			steps = result.steps ?? [];
			report = result.report;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	async function followUp(prompt: string) {
		if (!liveAgent || !liveBackend || busy) return;
		busy = true;
		try {
			const out = await liveAgent.invoke({ input: prompt, thread: liveThread });
			finalText = lastText(out.messages);
			files = await liveBackend.list();
			report = (await liveBackend.read('/reports/sales.md')) ?? report;
		} finally {
			busy = false;
		}
	}

	function lastText(messages: { content: unknown }[]): string {
		const last = messages[messages.length - 1];
		return typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
	}

	function slugify(s: string) {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
		return `h${(h >>> 0).toString(36)}`;
	}

	$effect(() => {
		const current = csv;
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: `l3-capstone-ds-${slugify(current)}` });
			if (cached && cached.payload.csv === current) {
				files = cached.payload.files;
				events = cached.payload.events;
				steps = cached.payload.steps ?? [];
				report = cached.payload.report;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `import { JsSandbox } from '$lib/runtime/sandbox';
import * as Plot from '@observablehq/plot';

const sandbox = new JsSandbox();

const computeTool = tool(
  async ({ code }) => {
    const out = await sandbox.run(code, { csv });
    return out.ok ? JSON.stringify(out.value) : 'Error: ' + out.error;
  },
  { name: 'compute', schema: z.object({ code: z.string() }) }
);

const plotTool = tool(
  async ({ mark, data, x, y, title }) => {
    const chart = Plot.plot({ title, marks: [Plot.barY(data, { x, y })] });
    const svg = new XMLSerializer().serializeToString(chart.querySelector('svg') ?? chart);
    const path = '/reports/figures/' + (++n) + '.svg';
    await backend.write(path, svg);
    return 'Wrote chart to ' + path;
  },
  {
    name: 'plot',
    schema: z.object({ mark: z.enum(['bar','line','dot']), data: z.array(z.record(z.unknown())), x: z.string(), y: z.string(), title: z.string().optional() })
  }
);

createDeepAgent({ model, backend, tools: [computeTool, plotTool] });`;
</script>

<Lesson
	title="Capstone — Data Science"
	eyebrow="Phase 3 · Capstone 2"
	motivation="Bring the data; let the agent bring the analysis. A scoped JS interpreter plus a virtual filesystem is enough for end-to-end CSV → report."
	hero={{
		id: 'l3-capstone-data-science',
		alt: "A scholar's lab with beakers labeled by glyph and a chart-press etching plots"
	}}
>
	{#snippet intro()}
		<p>
			A second capstone with a different shape: the agent ingests a CSV, runs analysis in a
			<Term t="Scoped interpreter" /> Worker (no DOM, no network), and writes a markdown
			report with an inline ASCII chart to <code>/reports/</code>. This is the in-browser
			analogue of Deep Agents' QuickJS sandbox.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Data is a file; analysis is a tool" variant="dropcap">
			<p>
				A real data-science agent does not need a vector store or a graph database to start
				being useful. It needs a place to put the input, a place to run code on it, and a
				place to put the output. The harness already supplies the first and third — the
				virtual filesystem. Adding a scoped JS interpreter as a tool gives the agent the
				second, and the loop becomes obvious: write the CSV, compute, write the report.
			</p>
			<p>
				The shape generalises. Swap the Worker for a managed sandbox (Modal, Daytona,
				Runloop) and the same agent runs against full Python stacks. Swap the CSV for a
				notebook and you get a notebook agent. The interface is what stays put.
			</p>
		</Slide>

		<Slide title="Why a worker" variant="code-first">
			<p>
				A Web Worker has no access to <code>document</code>, no cookies from the parent
				page, and dies on a configurable timeout. That makes it a reasonable substitute for
				the QuickJS-based interpreter the production Deep Agents harness uses for code
				execution. Here, the agent ships JS source via a tool; the worker evaluates it and
				returns the result.
			</p>
			<CodeBlock code={code} lang="ts" caption="Agent gets a compute tool; sandbox runs the code." />
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A virtual filesystem plus a scoped interpreter is roughly the smallest substrate on
				which an agent can do real analysis. Everything else is a richer sandbox or a
				prettier chart.
			</p>
		</Slide>

		<Slide title="The pipeline">
			<ol>
				<li>Save the user CSV under <code>/data/</code>.</li>
				<li>
					Run statistics by emitting a <code>compute</code> tool call — the worker reduces
					the rows, returns aggregates.
				</li>
				<li>
					Build a markdown report with an inline ASCII bar chart, and write it to
					<code>/reports/sales.md</code>.
				</li>
			</ol>
			<p>
				Production agents add chart libraries, table renderers, retries on failure, and
				larger sandboxes. The shape stays identical.
			</p>
		</Slide>

		<Slide title="Try a different CSV">
			<p>
				Edit the CSV on the right and run again. The agent's plan stays the same; the
				report updates. The whole loop — including code execution — runs entirely in your
				tab.
			</p>
		</Slide>

		<Slide ornament>
			<p>· ingest · compute · publish ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Input CSV" subtitle="sandboxed in a Worker; no DOM or network access">
			<textarea bind:value={csv} rows="10"></textarea>
			<div class="actions">
				<RunButton onclick={run} running={busy} label="Analyse" />
			</div>
		</Panel>

		{#if steps.length}
			<Panel title="Compute steps" subtitle="every `compute` call: the code and its result">
				<ol class="steps">
					{#each steps as s, i (i)}
						<li>
							<div class="step-h">compute · call {i + 1}</div>
							<CodeBlock code={s.code} lang="js" />
							<pre class="step-out">{s.result}</pre>
						</li>
					{/each}
				</ol>
			</Panel>
		{/if}

		<Panel title="Workspace">
			<FileTreeViewer {files} focus={report ? '/reports/sales.md' : null} />
		</Panel>

		{#if figures.length}
			<Panel title="Figures" subtitle="charts rendered by the plot() tool">
				<div class="figures">
					{#each figures as fig (fig.path)}
						<figure class="chart">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated by Observable Plot, no user input -->
							<div class="chart-svg">{@html fig.content}</div>
							<figcaption>{fig.path}</figcaption>
						</figure>
					{/each}
				</div>
			</Panel>
		{/if}

		{#if report}
			<Panel title="/reports/sales.md">
				<div class="report-md">
					<Markdown source={report} />
				</div>
			</Panel>
		{/if}

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		{#if liveAgent}
			<Panel title="Follow-up" subtitle="re-prompts the same agent on the same thread">
				<div class="chips">
					{#each FOLLOWUPS as f (f)}
						<button class="chip" onclick={() => followUp(f)} disabled={busy}>{f}</button>
					{/each}
				</div>
			</Panel>
		{/if}

		<Panel title="Trace">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	textarea {
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		padding: 0.6rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-ink-100);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent-ink);
	}
	.actions {
		margin-top: 0.65rem;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.steps li {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.step-h {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent-ink, var(--color-accent-deepagents));
	}
	.step-out {
		margin: 0;
		padding: 0.6rem 0.8rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		line-height: 1.5;
		color: var(--color-ink-200);
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 14rem;
		overflow: auto;
	}
	.figures {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.chart {
		margin: 0;
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		padding: 0.85rem;
		background: var(--color-paper);
	}
	.chart-svg :global(svg) {
		max-width: 100%;
		height: auto;
	}
	.chart figcaption {
		margin-top: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}
	.report-md {
		max-height: 26rem;
		overflow-y: auto;
		padding-right: 0.5rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.chip {
		border: 1px solid var(--color-rule);
		background: var(--color-bg);
		color: var(--color-ink-100);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		font-size: 0.84rem;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--accent-ink, var(--color-accent-deepagents));
		background: var(--color-paper);
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
