<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import TodoListView from '$lib/components/TodoListView.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import AnalyticalEngine, { type EnginePhase } from '$lib/components/AnalyticalEngine.svelte';

	import type { CompiledDeepAgent, HarnessInterrupt, Todo, VirtualFile } from '$lib/deepagents';
	import type { BaseMessage } from '@langchain/core/messages';
	import {
		buildDataScienceAgent,
		type ComputeStep,
		type AnalysisPlan,
		type Figure
	} from '$lib/demos/da-capstone-data-science';
	import {
		DATASETS,
		loadDataset,
		parseUploaded,
		profileDataset,
		type DatasetSpec,
		type LoadedDataset
	} from '$lib/runtime/datascience';

	import daSrc from '$lib/demos/da-capstone-data-science.ts?raw';
	import millSrc from '$lib/runtime/datascience/mill.ts?raw';
	import datasetsSrc from '$lib/runtime/datascience/datasets.ts?raw';
	import edaSkill from '$lib/demos/skills/ds-tabular-eda.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-capstone-data-science',
		title: 'Capstone — The Analytical Engine',
		summary:
			'A generalist data-scientist agent: it profiles a dataset, proposes a plan you approve, writes TypeScript and runs it in a sandboxed dataframe interpreter (Arquero + simple-statistics), saves results to a virtual filesystem, draws Observable Plot charts, and certifies a report — all in-browser, no Python, no server.',
		entries: [
			{ path: 'lib/demos/da-capstone-data-science.ts', code: daSrc },
			{ path: 'lib/runtime/datascience/mill.ts', code: millSrc },
			{ path: 'lib/runtime/datascience/datasets.ts', code: datasetsSrc }
		],
		skill: edaSkill,
		runner: `import { runDataScienceCapstone } from './lib/demos/da-capstone-data-science';

// A CLI host that approves the first plan it's shown.
const out = await runDataScienceCapstone(
  'Auto-analyze this dataset and tell me the story it holds.',
  () => ({ type: 'approve' })
);

console.log(out.finalText);
console.log('\\nFigures:', out.figures.length, '· Mill runs:', out.steps.length);
console.log(out.report);
`
	};

	const GENERIC_SUGGESTIONS = [
		'Auto-analyze this dataset and surface the most important findings.',
		'What are the strongest relationships between the columns?',
		'Summarise every column and flag anything unusual.'
	];

	// ── dataset state ──
	let loaded = $state<LoadedDataset | null>(null);
	let loadingId = $state<string | null>(null);
	let dataError = $state('');
	let dragging = $state(false);

	const profile = $derived(loaded ? profileDataset(loaded.rows) : null);
	const suggestions = $derived(loaded?.spec?.suggested ?? GENERIC_SUGGESTIONS);
	const typeCounts = $derived.by(() => {
		const c = { quantitative: 0, temporal: 0, nominal: 0, identifier: 0 };
		for (const col of profile?.columns ?? []) c[col.type]++;
		return c;
	});

	// ── run state ──
	let question = $state('');
	let busy = $state(false);
	let started = $state(false);
	let approved = $state(false);
	let msgs = $state<BaseMessage[]>([]);
	let steps = $state<ComputeStep[]>([]);
	let figures = $state<Figure[]>([]);
	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let report = $state('');
	let pending = $state<HarnessInterrupt | null>(null);
	let comment = $state('');
	let agent: CompiledDeepAgent | null = null;
	let thread = '';

	const proposedPlan = $derived(
		pending?.tool === 'present_plan' ? (pending.args as unknown as AnalysisPlan) : null
	);

	const reportingNow = $derived(
		approved &&
			figures.length > 0 &&
			todos.some((t) => /report/i.test(t.content) && t.status === 'in_progress')
	);

	const phase = $derived.by((): EnginePhase => {
		if (!started) return 'idle';
		if (report) return 'done';
		if (proposedPlan && !approved) return 'awaiting';
		if (!approved) return 'inspecting';
		if (reportingNow) return 'reporting';
		return figures.length ? 'plotting' : 'computing';
	});

	function figureSvg(path: string): string {
		const base = path.split('/').pop() ?? path;
		const f = files.find((x) => x.path === path) ?? files.find((x) => x.path.endsWith('/' + base));
		return f?.content ?? '';
	}

	// Split the report markdown into prose runs and figure references, so we can
	// render the prose with <Markdown> and embed each chart's real SVG inline
	// (the markdown ![](/reports/figures/N.svg) paths are virtual — they can't load
	// as <img>, so we resolve them to the stored figure here).
	type ReportSeg = { type: 'md'; text: string } | { type: 'fig'; caption: string; path: string };
	const reportSegments = $derived.by((): ReportSeg[] => {
		if (!report) return [];
		const segs: ReportSeg[] = [];
		const re = /!\[([^\]]*)\]\((\/reports\/figures\/[^)\s]+)\)/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(report))) {
			if (m.index > last) segs.push({ type: 'md', text: report.slice(last, m.index) });
			segs.push({ type: 'fig', caption: m[1], path: m[2] });
			last = m.index + m[0].length;
		}
		if (last < report.length) segs.push({ type: 'md', text: report.slice(last) });
		return segs;
	});

	// ── loading datasets ──
	async function pick(spec: DatasetSpec) {
		dataError = '';
		loadingId = spec.id;
		try {
			const d = await loadDataset(spec);
			resetRun();
			loaded = d;
			question = spec.suggested[0];
		} catch (e) {
			dataError = e instanceof Error ? e.message : String(e);
		} finally {
			loadingId = null;
		}
	}

	function onFileList(list: FileList | null) {
		const file = list?.[0];
		if (!file) return;
		dataError = '';
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const d = parseUploaded(file.name, String(reader.result));
				resetRun();
				loaded = d;
				question = GENERIC_SUGGESTIONS[0];
			} catch (e) {
				dataError = e instanceof Error ? e.message : String(e);
			}
		};
		reader.onerror = () => (dataError = 'Could not read that file.');
		reader.readAsText(file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		onFileList(e.dataTransfer?.files ?? null);
	}

	// ── the run ──
	async function run() {
		if (!loaded || !question.trim()) return;
		resetRun();
		busy = true;
		started = true;
		const built = await buildDataScienceAgent(loaded, question.trim(), {
			onStep: (s) => (steps = s),
			onFigures: (f) => (figures = f),
			onProgress: (s) => {
				todos = s.todos;
				files = s.files;
				const r = s.files.find((f) => f.path === '/reports/report.md');
				if (r) report = r.content;
			}
		});
		agent = built.agent;
		thread = built.thread;
		agent.subscribe((s) => (msgs = [...s.messages]));
		try {
			settle(await agent.start({ input: built.input, thread }));
		} finally {
			busy = false;
		}
	}

	function settle(res: {
		status: string;
		interrupt?: HarnessInterrupt;
		state?: { files?: VirtualFile[] };
	}) {
		if (res.status === 'interrupted' && res.interrupt) {
			pending = res.interrupt;
		} else {
			pending = null;
			const f = res.state?.files ?? [];
			report = f.find((x) => x.path === '/reports/report.md')?.content ?? report;
		}
	}

	async function decide(decision: { type: string; message?: string }) {
		if (!agent || !pending) return;
		busy = true;
		if (decision.type === 'approve') approved = true;
		comment = '';
		pending = null;
		try {
			settle(await agent.resume(decision, thread));
		} finally {
			busy = false;
		}
	}

	function resetRun() {
		busy = false;
		started = false;
		approved = false;
		msgs = [];
		steps = [];
		figures = [];
		todos = [];
		files = [];
		report = '';
		pending = null;
		comment = '';
		agent = null;
	}

	function newDataset() {
		resetRun();
		loaded = null;
		question = '';
		dataError = '';
	}

	const harnessCode = `createDeepAgent({
  model, backend,
  tools: [compute, plot, present_plan],   // the Mill, the Plotter, the gate
  skills: ['/skills/'],                    // ds-tabular-eda · ds-statistics · ds-charting
  interruptOn: {
    present_plan: { allowedDecisions: ['approve', 'respond', 'reject'] }
  },
  compaction: { maxTokens: 32000 }         // a long analysis fills context
});`;

	const millCode = `// THE MILL — a sandboxed dataframe interpreter (no DOM, no network).
// In scope for every snippet the agent writes:
data    // the dataset as an array of row objects
table   // an Arquero dataframe of them: table.groupby('region').rollup({ … })
aq, op  // Arquero (aq.from, aq.desc; op.mean, op.corr, op.quantile)
ss      // simple-statistics (sampleCorrelation, linearRegression, quantile)

// e.g. — does income predict longevity? Compute it; never guess.
const xs = data.map(d => Math.log10(d.income));
const ys = data.map(d => d.health);
return { r: ss.sampleCorrelation(xs, ys) };`;
</script>

<Lesson
	title="Capstone — The Analytical Engine"
	eyebrow="Level 3 · Lesson 11 · Capstone"
	hero={{
		id: 'l3-capstone-data-science',
		alt: 'A brass automaton operates a Victorian Analytical Engine — punch-card decks feed a glowing geared Mill, memory columns form the Store, and a plotter inks a chart on parchment'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		Everything this level taught, pointed at data. A generalist data scientist that
		<Term t="Schema profiling">profiles</Term> a dataset, plans, waits for your
		<Term t="HITL">approval</Term>, writes TypeScript and <Term t="Code interpreter">runs it</Term>
		in a sandbox, and certifies a report — all in the browser.
	{/snippet}

	{#snippet intro()}
		<p>
			Load a famous dataset — or drop in your own CSV or JSON — and ask a question. The agent reads
			the data's shape, opens the <Term t="Skill">skill</Term> it needs, and shows you a plan. Once you
			sign off it goes to work: it writes real <Term t="Dataframe">dataframe</Term> code, runs it in a
			sandboxed interpreter (no arithmetic by guesswork), saves intermediate results to the
			<Term t="Virtual filesystem">filesystem</Term>, draws charts, and writes a cited report. No
			Python, no server — the whole pipeline runs here.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="The frame" title="Babbage's Engine, our harness" variant="dropcap">
			<p>
				The Analytical Engine of 1837 had two parts: the <strong>Store</strong>, where numbers
				waited, and the <strong>Mill</strong>, where they were worked. Our harness wears the same
				anatomy. The <a href="/3-deepagents/virtual-fs">virtual filesystem</a> is the Store —
				<code>/data</code> in, <code>/analysis</code> for working results, <code>/reports</code>
				out. The Mill is a <Term t="Code interpreter">sandboxed interpreter</Term> the agent writes TypeScript
				for. Datasets arrive as punch-card decks; charts print on a plotter.
			</p>
			<p>
				One agent composes the whole level: it <a href="/3-deepagents/todos">plans</a>, clears the
				plan with a <a href="/3-deepagents/hitl">human</a>, reaches for
				<a href="/3-deepagents/skills">skills</a> when it needs method, writes and runs code, and
				keeps its working memory in the filesystem — with
				<a href="/3-deepagents/compaction">compaction</a> for the long haul. It is the sibling of
				the
				<a href="/3-deepagents/capstone-research">research capstone</a>: same harness, pointed at
				numbers instead of prose.
			</p>
		</Slide>

		<Slide eyebrow="The Mill" title="It computes — it never guesses" variant="code-first">
			<p>
				Models are famously bad at arithmetic, sorting and aggregation — exactly the operations data
				science is made of. So the agent doesn't <em>reason</em> about the numbers; it
				<strong>computes</strong> them. The <code>compute</code> tool runs the agent's code in a Web
				Worker with no DOM and no network — our browser stand-in for the official code-interpreter
				middleware — with a real dataframe library (<Term t="Dataframe">Arquero</Term>) and a stats
				library (simple-statistics) in scope.
			</p>
			<CodeBlock
				code={millCode}
				caption="The Mill's scope — a dataframe toolkit, sandboxed. Every statistic is computed, then quoted."
			/>
		</Slide>

		<Slide
			eyebrow="The gate"
			title="You approve the plan before a single computation"
			variant="code-first"
		>
			<p>
				A serious analysis is a sequence of choices — which columns, which method, which chart. So
				the agent drafts a plan and calls <code>present_plan</code>; the run
				<Term t="Checkpointer">checkpoints</Term> and waits. You
				<a href="/3-deepagents/hitl">approve, or send comments</a> and it revises and re-presents. Nothing
				is computed until you say go — and skills supply the method, so the choices are sound.
			</p>
			<CodeBlock
				code={harnessCode}
				caption="The whole harness — the Mill and Plotter as tools, a skill shelf, a plan gate, and compaction."
			/>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-ds-engine"
				alt="An engraved cutaway of the Analytical Engine as a data-science pipeline: a deck, a plan with a wax seal, a card-catalog of skills, the glowing Mill, the Store's memory columns, and a plotter with a sealed report."
			/>
			<figcaption>
				The pipeline: the Deck feeds the Plan (you approve), Skills inform the Mill, the Store holds
				the work, the Plotter prints the report.
			</figcaption>
		</figure>

		<Slide eyebrow="The output" title="A report that shows its work">
			<p>
				The agent writes a markdown report to the Store: an executive summary, a section per
				question with the <strong>computed</strong> numbers, embedded charts, and an
				<strong>Insights</strong> section that has to contain at least one non-obvious finding — an
				outlier, a surprising correlation, or a
				<Term t="Simpson's paradox">reversal within groups</Term>. Quoting only numbers it computed
				is what keeps the result honest rather than merely fluent.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-ds-gapminder"
				alt="An engraved atlas plate: a scatter of countries by income (log) versus life expectancy, sized by population, coloured by region, with a trend curve, labelled outliers, and a certified wax seal."
			/>
			<figcaption>
				The flagship: income (log) vs. life expectancy across every nation — the kind of plate the
				Engine certifies.
			</figcaption>
		</figure>

		<Slide variant="pull-quote">
			<p>
				A data scientist's value isn't a confident answer — it's a reproducible one. Compute the
				number, cite the method, draw the honest chart.
			</p>
		</Slide>

		<Slide variant="ornament">profile · plan · compute · plot · certify</Slide>

		<ReadMore
			links={[
				{
					label: 'Deep Agents — interpreters (code execution)',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/interpreters'
				},
				{
					label: 'The official data-analysis (REPL) example',
					href: 'https://github.com/langchain-ai/deepagentsjs/tree/main/examples/repl'
				},
				{ label: 'Arquero — dataframes for JavaScript', href: 'https://idl.uw.edu/arquero/' }
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<!-- 1 · The deck -->
		<Panel title="The deck" subtitle="pick a dataset, or drop in your own CSV / JSON">
			<div class="gallery">
				{#each DATASETS as d (d.id)}
					<button
						class="dcard"
						class:selected={loaded?.id === d.id}
						disabled={busy || loadingId !== null}
						onclick={() => pick(d)}
					>
						<span class="dglyph">{d.glyph}</span>
						<span class="dbody">
							<span class="dname">{d.name}</span>
							<span class="dblurb">{d.blurb}</span>
							<span class="dshape">
								{d.rows.toLocaleString('en-US')} rows · {d.cols} cols{loadingId === d.id
									? ' · loading…'
									: ''}
							</span>
						</span>
					</button>
				{/each}
			</div>

			<label
				class="dropzone"
				class:dragging
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
			>
				<input
					type="file"
					accept=".csv,.json,.tsv,text/csv,application/json"
					onchange={(e) => onFileList(e.currentTarget.files)}
					disabled={busy}
				/>
				<span class="dz-icon">⬗</span>
				<span class="dz-text"
					>Drop a <strong>.csv</strong> or <strong>.json</strong> file here, or click to choose</span
				>
			</label>

			{#if dataError}
				<p class="err">{dataError}</p>
			{/if}
		</Panel>

		<!-- 2 · The loaded data -->
		{#if loaded && profile}
			<Panel title="The data" subtitle={loaded.spec ? loaded.provenance : 'your uploaded file'}>
				<div class="profile-strip">
					<span class="pchip">{profile.rows.toLocaleString('en-US')} rows</span>
					<span class="pchip">{profile.columns.length} columns</span>
					{#if typeCounts.quantitative}<span class="pchip q">{typeCounts.quantitative} numeric</span
						>{/if}
					{#if typeCounts.temporal}<span class="pchip t">{typeCounts.temporal} temporal</span>{/if}
					{#if typeCounts.nominal + typeCounts.identifier}<span class="pchip n"
							>{typeCounts.nominal + typeCounts.identifier} categorical</span
						>{/if}
				</div>
				<DataTable
					rows={loaded.rows}
					columns={profile.columns}
					title={loaded.name}
					maxHeight="20rem"
				/>
			</Panel>

			<!-- 3 · The question -->
			<Panel title="Your question" subtitle="ask anything, or let the Engine auto-analyze">
				<textarea
					class="q"
					bind:value={question}
					rows="2"
					spellcheck="false"
					disabled={busy || started}
				></textarea>
				<div class="examples">
					{#each suggestions as ex (ex)}
						<button class="ex" disabled={busy || started} onclick={() => (question = ex)}
							>{ex}</button
						>
					{/each}
				</div>
				<div class="actions">
					<RunButton
						onclick={run}
						running={busy && !pending}
						disabled={started || !question.trim()}
						label="Run the Engine"
					/>
					{#if started && !busy}
						<button class="reset" onclick={resetRun}>new question</button>
					{/if}
					<button class="reset" disabled={busy} onclick={newDataset}>change dataset</button>
				</div>
			</Panel>
		{/if}

		<!-- 4 · The Engine cockpit -->
		{#if started}
			<Panel title="The Engine" subtitle="profile → plan → compute → plot → certify">
				<AnalyticalEngine
					{phase}
					steps={steps.length}
					figures={figures.length}
					files={files.length}
				/>
			</Panel>
		{/if}

		<!-- 5 · Plan approval -->
		{#if proposedPlan}
			<Panel title="Approve the analysis plan" subtitle="nothing is computed until you sign off">
				<div class="plan-card">
					<h4 class="plan-title">{proposedPlan.title}</h4>
					<ol class="psteps">
						{#each proposedPlan.steps as s, i (i)}
							<li>
								<span class="pq">{s.question}</span>
								<span class="pm">{s.method}{s.chart ? ` · ${s.chart}` : ''}</span>
							</li>
						{/each}
					</ol>
					<label class="comment-field">
						<span>Comments (optional) — the Engine will revise the plan</span>
						<textarea
							bind:value={comment}
							rows="2"
							disabled={busy}
							placeholder="e.g. Also break income down by region, and add a regression."
						></textarea>
					</label>
					<div class="plan-actions">
						<button class="act approve" disabled={busy} onclick={() => decide({ type: 'approve' })}
							>Approve & run</button
						>
						<button
							class="act"
							disabled={busy || !comment.trim()}
							onclick={() => decide({ type: 'respond', message: comment.trim() })}
							>Request changes</button
						>
					</div>
				</div>
			</Panel>
		{/if}

		<!-- 6 · Plan board -->
		{#if todos.length}
			<Panel title="The plan board" subtitle="the Engine's live to-do list">
				<TodoListView {todos} />
			</Panel>
		{/if}

		<!-- 7 · The Mill (compute log) -->
		{#if steps.length}
			<Panel title="The Mill" subtitle="every computation, code and result">
				<div class="steps">
					{#each steps as s, i (i)}
						<details class="step" open={i === steps.length - 1}>
							<summary>
								<span class="step-n">#{i + 1}</span>
								<span class="step-label">{s.label || 'compute'}</span>
								<span class="step-status {s.ok ? 'ok' : 'err'}">{s.ok ? '✓' : '✗'}</span>
								{#if s.elapsedMs != null}<span class="step-ms">{s.elapsedMs}ms</span>{/if}
							</summary>
							<CodeBlock code={s.code} />
							<pre class="result" class:err={!s.ok}>{s.result}</pre>
						</details>
					{/each}
				</div>
			</Panel>
		{/if}

		<!-- 8 · The Plotter (figures) -->
		{#if figures.length}
			<Panel title="The Plotter" subtitle="charts inked to /reports/figures/">
				<div class="figures">
					{#each figures as f (f.path)}
						<figure class="fig">
							<div class="fig-svg">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own Observable Plot SVG over computed data -->
								{@html figureSvg(f.path)}
							</div>
							<figcaption>{f.caption}</figcaption>
						</figure>
					{/each}
				</div>
			</Panel>
		{/if}

		<!-- 9 · The Store -->
		{#if files.length}
			<Panel title="The Store" subtitle="the virtual filesystem: data, analysis, reports, skills">
				<FileTreeViewer {files} title="The Store" focus="/reports/report.md" />
			</Panel>
		{/if}

		<!-- 10 · Transcript -->
		<Panel title="The Engine's transcript" subtitle="inspecting, planning, computing, reporting">
			{#if msgs.length}
				<AgentFeed messages={msgs} maxHeight="20rem" />
			{:else}
				<div class="placeholder">{started ? 'starting…' : 'load a dataset and run the Engine'}</div>
			{/if}
		</Panel>

		<!-- 11 · The report — the final artifact, last on the page, charts embedded -->
		{#if report}
			<Panel
				title="The report"
				subtitle="the finished analysis — every number computed, every chart embedded"
			>
				<div class="report">
					{#each reportSegments as seg, i (i)}
						{#if seg.type === 'md'}
							{#if seg.text.trim()}<Markdown source={seg.text} />{/if}
						{:else}
							{@const svg = figureSvg(seg.path)}
							{#if svg}
								<figure class="report-fig">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own Observable Plot SVG over computed data -->
									<div class="fig-svg">{@html svg}</div>
									{#if seg.caption}<figcaption>{seg.caption}</figcaption>{/if}
								</figure>
							{/if}
						{/if}
					{/each}
				</div>
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	.gallery {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
	}
	@media (max-width: 560px) {
		.gallery {
			grid-template-columns: 1fr;
		}
	}
	.dcard {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		text-align: left;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg);
		cursor: pointer;
		transition: border-color 0.15s ease;
	}
	.dcard:hover:not(:disabled) {
		border-color: var(--accent-rule);
	}
	.dcard.selected {
		border-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 6%, transparent);
	}
	.dcard:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.dglyph {
		font-size: 1.5rem;
		line-height: 1;
	}
	.dbody {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.dname {
		font-weight: 600;
		font-size: 0.86rem;
		color: var(--color-fg);
	}
	.dblurb {
		font-size: 0.74rem;
		color: var(--color-fg-muted);
		line-height: 1.35;
	}
	.dshape {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
	}

	.dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.7rem;
		border: 1px dashed var(--color-border);
		border-radius: 0.5rem;
		color: var(--color-fg-faint);
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.dropzone:hover,
	.dropzone.dragging {
		border-color: var(--accent);
		background: color-mix(in oklch, var(--accent) 5%, transparent);
		color: var(--accent-ink);
	}
	.dropzone input {
		display: none;
	}
	.dz-icon {
		font-size: 1.1rem;
	}
	.err {
		color: var(--color-accent-danger);
		font-size: 0.8rem;
		margin: 0.5rem 0 0;
	}

	.profile-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
	}
	.pchip {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		color: var(--color-fg-muted);
	}
	.pchip.q {
		color: var(--accent-ink);
		border-color: color-mix(in oklch, var(--accent) 45%, var(--color-border));
	}
	.pchip.t {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, var(--color-border));
	}
	.pchip.n {
		color: var(--color-accent-success);
		border-color: color-mix(in oklch, var(--color-accent-success) 45%, var(--color-border));
	}

	.q {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		font: inherit;
		margin-bottom: 0.6rem;
	}
	.examples {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.ex {
		text-align: left;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font: inherit;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
		cursor: pointer;
	}
	.ex:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.ex:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.actions {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.reset {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-fg-faint);
		font: inherit;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.reset:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.plan-card {
		border: 1px solid color-mix(in oklch, var(--accent) 40%, var(--color-border));
		border-radius: 10px;
		padding: 0.9rem 1rem;
		background: color-mix(in oklch, var(--accent) 5%, transparent);
	}
	.plan-title {
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
	.psteps {
		margin: 0 0 0.8rem;
		padding-left: 1.3rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.psteps li {
		font-size: 0.86rem;
		line-height: 1.4;
	}
	.pq {
		display: block;
		color: var(--color-fg);
	}
	.pm {
		display: block;
		font-size: 0.76rem;
		color: var(--color-fg-faint);
		font-family: var(--font-mono);
	}
	.comment-field span {
		display: block;
		font-size: 0.74rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.3rem;
	}
	.comment-field textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
	}
	.plan-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.7rem;
		flex-wrap: wrap;
	}
	.act {
		font-size: 0.82rem;
		padding: 0.4rem 0.9rem;
		border-radius: 0.4rem;
		border: 1px solid var(--color-border);
		background: var(--color-paper);
		color: var(--color-fg-default);
		cursor: pointer;
	}
	.act.approve {
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.act:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.step {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg);
		padding: 0.3rem 0.5rem;
	}
	.step summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.8rem;
		list-style: none;
	}
	.step-n {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-fg-faint);
	}
	.step-label {
		flex: 1;
		color: var(--color-fg);
	}
	.step-status.ok {
		color: var(--color-accent-success);
	}
	.step-status.err {
		color: var(--color-accent-danger);
	}
	.step-ms {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
	}
	.result {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
		background: var(--color-bg-elev-2);
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		margin: 0.4rem 0 0.1rem;
		max-height: 12rem;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.result.err {
		color: var(--color-accent-danger);
	}

	.figures {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	.fig {
		margin: 0;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.6rem;
		background: var(--color-paper);
		color: var(--color-fg-muted);
	}
	.fig-svg {
		width: 100%;
		overflow: auto;
	}
	.fig-svg :global(svg),
	.fig-svg :global(figure) {
		max-width: 100%;
		height: auto;
		margin: 0;
	}
	.fig figcaption {
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		text-align: center;
	}

	.report {
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 1.1rem 1.3rem;
		background: var(--color-paper);
	}
	/* A chart embedded inline in the report's prose. */
	.report-fig {
		margin: 1.2rem 0;
		padding: 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-fg-muted);
	}
	.report-fig .fig-svg {
		width: 100%;
		overflow: auto;
	}
	.report-fig .fig-svg :global(svg),
	.report-fig .fig-svg :global(figure) {
		max-width: 100%;
		height: auto;
		margin: 0;
	}
	.report-fig figcaption {
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		text-align: center;
	}

	.placeholder {
		border: 1px dashed var(--color-border);
		border-radius: 8px;
		padding: 1.6rem 0.6rem;
		text-align: center;
		color: var(--color-fg-faint);
		font-size: 0.82rem;
	}

	.diagram {
		margin: 2.2rem 0;
	}
	.diagram :global(.hero) {
		height: auto;
		border-radius: 0.6rem;
		overflow: hidden;
		background: var(--color-paper);
		display: block;
	}
	.diagram :global(.hero img) {
		position: static;
		width: 100%;
		height: auto;
		display: block;
	}
	.diagram :global(.hero .caption) {
		display: none;
	}
	.diagram figcaption {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		text-align: center;
	}
</style>
