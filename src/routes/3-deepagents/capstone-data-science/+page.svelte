<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type VirtualFile
	} from '$lib/deepagents';
	import { JsSandbox } from '$lib/runtime/sandbox';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { tool } from '@langchain/core/tools';
	import { z } from 'zod';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

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
		report: string | null;
		finalText: string;
	}

	let csv = $state(SAMPLE_CSV);
	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let report = $state<string | null>(null);
	let finalText = $state<string>('');

	const INSTRUCTIONS = `You are a data-science agent. You have a custom tool \`compute\` that runs
JavaScript inside a scoped Worker. The variable \`csv\` is pre-bound to the raw CSV text the
user provided. Follow this recipe exactly:

1. write_file('/data/sales.csv', <the CSV string the user provided>) — pass the CSV through verbatim.
2. compute({ code: <JS that parses csv into rows, then aggregates quantity and revenue per product, then returns { rowCount, byProduct }> })
3. write_file('/reports/sales.md', <a short markdown report with two sections:
   - "Summary" — one paragraph with rowCount and product count.
   - "Revenue by product" — a fenced code block with ASCII bar chart rows of the form  PRODUCT  ████░░░░  1234>)
4. Reply with one sentence noting where the report was saved and how many rows were analysed.

Do not chat between tool calls. Do not skip steps.`;

	async function run() {
		busy = true;
		files = [];
		events = [];
		report = null;
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-capstone-ds-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const sandbox = new JsSandbox();
					const computeTool = tool(
						async ({ code }) => {
							const out = await sandbox.run(code, { csv });
							if (!out.ok) return `Error: ${out.error}`;
							return JSON.stringify(out.value, null, 2);
						},
						{
							name: 'compute',
							description:
								'Run a self-contained JavaScript expression in a scoped Worker (no DOM, no network). Use `csv` as the variable holding the raw CSV text. Use `return` to produce a value.',
							schema: z.object({ code: z.string() })
						}
					);

					const model = await getModel({ temperature: 0, maxTokens: 1000 });
					const backend = new StateBackend();
					const agent = createDeepAgent({
						model,
						backend,
						tools: [computeTool],
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 12
					});
					agent.subscribe((s) => (files = [...s.files]));

					const out = await agent.invoke({
						input: `Here is the CSV. Analyse it and produce a sales report.\n\n${csv}`,
						thread: `ds-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					const finalFiles = await backend.list();
					const reportText = (await backend.read('/reports/sales.md')) ?? null;
					sandbox.terminate();
					return {
						csv,
						files: finalFiles,
						events: localEvents,
						report: reportText,
						finalText: text
					};
				}
			);
			files = result.files;
			events = result.events;
			report = result.report;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-capstone-ds-run' });
			if (cached) {
				files = cached.payload.files;
				events = cached.payload.events;
				report = cached.payload.report;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `import { JsSandbox } from '$lib/runtime/sandbox';

const sandbox = new JsSandbox();
const computeTool = tool(
  async ({ code }) => {
    const out = await sandbox.run(code, { csv });
    return out.ok ? JSON.stringify(out.value) : 'Error: ' + out.error;
  },
  {
    name: 'compute',
    description: 'Run JS in a scoped Worker. csv holds the raw text.',
    schema: z.object({ code: z.string() })
  }
);

createDeepAgent({ model, backend, tools: [computeTool] });`;
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

		<Panel title="Workspace">
			<FileTreeViewer {files} />
		</Panel>

		{#if report}
			<Panel title="/reports/sales.md">
				<pre class="report">{report}</pre>
			</Panel>
		{/if}

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
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
	.report {
		margin: 0;
		padding: 0.95rem 1.05rem;
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--color-ink-100);
		white-space: pre-wrap;
		max-height: 22rem;
		overflow: auto;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
