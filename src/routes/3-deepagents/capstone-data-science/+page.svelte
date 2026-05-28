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
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { JsSandbox } from '$lib/runtime/sandbox';
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

	let csv = $state(SAMPLE_CSV);
	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let report = $state<string | null>(null);

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: '/data/sales.csv', content: csv }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'compute',
						args: {
							code: `
const lines = csv.trim().split('\\n');
const header = lines.shift().split(',');
const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [header[i], v])));
const byProduct = {};
for (const r of rows) {
  byProduct[r.product] = byProduct[r.product] || { qty: 0, rev: 0 };
  byProduct[r.product].qty += +r.quantity;
  byProduct[r.product].rev += +r.revenue;
}
return { rowCount: rows.length, byProduct };
`
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/reports/sales.md',
							content: makeReport()
						}
					}
				]
			},
			{
				content:
					'Analysed 9 rows across 3 products. Report saved to /reports/sales.md with an inline ASCII chart.'
			}
		];
	}

	function asciiBar(value: number, max: number, width = 30) {
		const n = Math.max(0, Math.round((value / max) * width));
		return '█'.repeat(n) + '░'.repeat(width - n);
	}

	function makeReport() {
		const lines = csv.trim().split('\n');
		lines.shift();
		const totals: Record<string, { qty: number; rev: number }> = {};
		for (const line of lines) {
			const [, product, qty, rev] = line.split(',');
			totals[product] = totals[product] ?? { qty: 0, rev: 0 };
			totals[product].qty += +qty;
			totals[product].rev += +rev;
		}
		const maxRev = Math.max(...Object.values(totals).map((t) => t.rev));
		let body = '# Sales report\n\n';
		body += `Source: \`/data/sales.csv\` · Rows: ${lines.length}\n\n## Revenue by product\n\n`;
		body += '```\n';
		for (const [p, t] of Object.entries(totals)) {
			body += `${p}  ${asciiBar(t.rev, maxRev)}  ${t.rev}\n`;
		}
		body += '```\n\n## Notes\n- Computed entirely in a scoped JS interpreter (no DOM, no network).\n- Output written via the harness filesystem tools.';
		return body;
	}

	async function run() {
		busy = true;
		files = [];
		events = [];
		report = null;
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const sandbox = new JsSandbox();
			const computeTool = tool(
				async ({ code }) => {
					const result = await sandbox.run(code, { csv });
					if (!result.ok) return `Error: ${result.error}`;
					return JSON.stringify(result.value, null, 2);
				},
				{
					name: 'compute',
					description:
						'Run a self-contained JavaScript expression in a scoped Worker (no DOM, no network). Use `csv` as the variable holding the raw CSV text. Use `return` to produce a value.',
					schema: z.object({ code: z.string() })
				}
			);

			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const backend = new StateBackend();
			const agent = createDeepAgent({
				model,
				backend,
				tools: [computeTool],
				instructions:
					'Save the user CSV under /data/, run statistics via the compute tool, then write a markdown report under /reports/ with an inline ASCII chart.',
				tracer
			});
			agent.subscribe((s) => (files = [...s.files]));
			await agent.invoke({
				input: 'Analyse the CSV and produce a sales report.',
				thread: 'ds-' + Math.random().toString(36).slice(2, 6)
			});
			files = await backend.list();
			report = (await backend.read('/reports/sales.md')) ?? null;
			sandbox.terminate();
		} finally {
			busy = false;
		}
	}

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

<Lesson title="Capstone — Data Science" eyebrow="Phase 3 · Capstone 2">
	{#snippet intro()}
		<p>
			A second capstone with a different shape: the agent ingests a CSV, runs analysis in a
			<Term t="Scoped interpreter" /> Worker (no DOM, no network), and writes a markdown report
			with an inline ASCII chart to <code>/reports/</code>. This is the in-browser analogue of
			Deep Agents' QuickJS sandbox.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Why a worker">
			<p>
				A Web Worker has no access to <code>document</code>, no access to <code>fetch</code>{' '}
				the parent page's cookies, and dies on a configurable timeout. That makes it a
				reasonable substitute for the QuickJS-based interpreter the production Deep Agents
				harness uses for code execution. Here, the agent ships JS source via a tool; the
				worker evaluates it and returns the result.
			</p>
			<CodeBlock code={code} caption="Agent gets a `compute` tool, sandbox runs the code." />
		</Slide>

		<Slide title="The pipeline">
			<ol>
				<li>Save the user CSV under <code>/data/</code>.</li>
				<li>
					Run statistics by emitting a <code>compute</code> tool call — the worker reduces the
					rows, returns aggregates.
				</li>
				<li>
					Build a markdown report with an inline ASCII bar chart, and write it to{' '}
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
				Edit the CSV on the right and run again. The agent's plan stays the same; the report
				updates. The whole loop — including code execution — runs entirely in your tab.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Input CSV" subtitle="Sandboxed in a Worker; no DOM or network access">
			<textarea bind:value={csv} rows="10"></textarea>
			<div class="actions">
				<RunButton onclick={run} running={busy} label="Analyse" />
			</div>
		</Panel>

		<Panel title="Workspace">
			<FileTreeViewer files={files} />
		</Panel>

		{#if report}
			<Panel title="/reports/sales.md">
				<pre class="report">{report}</pre>
			</Panel>
		{/if}

		<Panel title="Trace">
			<TraceLog events={events} />
		</Panel>
	{/snippet}
</Lesson>

<style>
	textarea {
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.55rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-fg);
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.actions {
		margin-top: 0.6rem;
	}
	.report {
		margin: 0;
		padding: 0.85rem 1rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--color-fg);
		white-space: pre-wrap;
		max-height: 22rem;
		overflow: auto;
	}
</style>
