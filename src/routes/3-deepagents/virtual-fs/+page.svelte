<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import HeroImage from '$lib/components/HeroImage.svelte';
	import ReadMore from '$lib/components/ReadMore.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer, { type FileMark } from '$lib/components/FileTreeViewer.svelte';
	import AgentFeed from '$lib/components/AgentFeed.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import Diff from '$lib/components/Diff.svelte';
	import { totalMessageTokens } from '$lib/deepagents/tokens';
	import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
	import { displayContent } from '$lib/runtime/messages';
	import type { Todo, VirtualFile, DeepAgentStateType } from '$lib/deepagents';
	import {
		buildBugHunt,
		TICKETS,
		type TicketId,
		type TestResult,
		type FileEdit
	} from '$lib/demos/da-virtual-fs';
	import bugHuntSrc from '$lib/demos/da-virtual-fs.ts?raw';
	import vfsSkill from '$lib/demos/skills/deepagents-virtual-fs.md?raw';
	import type { DemoManifest } from '$lib/demos/download';

	const demoSource: DemoManifest = {
		id: 'da-virtual-fs',
		title: 'The virtual filesystem — The Bug Hunt',
		summary:
			'An agent fixes a real bug in a 15-file codebase it has never seen: reproduce with the project’s own tests, locate with glob + grep, read only the evidence, diagnose to /notes, fix with one surgical edit, verify until green.',
		entries: [{ path: 'lib/demos/da-virtual-fs.ts', code: bugHuntSrc }],
		runner: `import { buildBugHunt, TICKETS } from './lib/demos/da-virtual-fs';

const ticket = TICKETS[0];
console.log('Ticket:', ticket.tag, '—', ticket.title);

const hunt = await buildBugHunt(ticket.id, {
	onTests: (results) => {
		const fails = results.filter((r) => !r.pass).length;
		console.log('  · run_tests →', fails ? fails + ' failing' : 'all green');
	}
});

const state = await hunt.start();
console.log('\\nDiagnosis:\\n' + ((await hunt.readFile('/notes/diagnosis.md')) ?? '(none)'));
console.log('\\n' + hunt.finalText(state));`,
		skill: vfsSkill
	};

	// ── Run state ─────────────────────────────────────────────────────────────
	type Phase = 'idle' | 'hunting' | 'done' | 'error';
	let phase = $state<Phase>('idle');
	let busy = $state(false);
	let error = $state('');
	let ticketId = $state<TicketId>('coupon-stack');

	let todos = $state<Todo[]>([]);
	let files = $state<VirtualFile[]>([]);
	let msgs = $state<BaseMessage[]>([]);
	let tests = $state<TestResult[]>([]);
	let edits = $state<FileEdit[]>([]);
	let finalWord = $state('');
	let contextTokens = $state(0);
	let compactions = $state(0);

	const ticket = $derived(TICKETS.find((t) => t.id === ticketId) ?? TICKETS[0]);
	const diagnosis = $derived(files.find((f) => f.path === '/notes/diagnosis.md')?.content ?? '');
	const failCount = $derived(tests.filter((t) => !t.pass).length);

	const phaseLabel = $derived(
		phase === 'idle'
			? 'three open bugs — pick one'
			: phase === 'hunting'
				? 'the engineer is on it — watch the workspace'
				: phase === 'done'
					? failCount
						? 'the run ended with a red suite — assign it again'
						: 'ticket closed — suite green'
					: 'something broke (see below)'
	);

	// Group test results by file for the bench.
	const testGroups = $derived.by(() => {
		const order: string[] = [];
		const byFile: Record<string, TestResult[]> = {};
		for (const r of tests) {
			if (!byFile[r.file]) {
				byFile[r.file] = [];
				order.push(r.file);
			}
			byFile[r.file].push(r);
		}
		return order.map((f) => [f, byFile[f]] as const);
	});

	// How the agent touched each file — derived straight from the message
	// stream: grep hits from grep tool results, reads and edits from tool
	// calls. Stronger marks win: edited > read > hit.
	const MARK_RANK: Record<FileMark, number> = { hit: 0, read: 1, edited: 2 };
	const marks = $derived.by(() => {
		const m: Record<string, FileMark> = {};
		const set = (path: string, kind: FileMark) => {
			if (!path) return;
			const p = path.startsWith('/') ? path : '/' + path;
			const cur = m[p];
			if (!cur || MARK_RANK[kind] > MARK_RANK[cur]) m[p] = kind;
		};
		for (const msg of msgs) {
			if (msg instanceof AIMessage) {
				for (const tc of msg.tool_calls ?? []) {
					const p = (tc.args as { path?: string })?.path ?? '';
					if (tc.name === 'read_file') set(p, 'read');
					else if (tc.name === 'edit_file' || tc.name === 'write_file') set(p, 'edited');
				}
			} else if (msg instanceof ToolMessage && msg.name === 'grep') {
				const text = displayContent(msg.content as never) ?? '';
				for (const line of text.split('\n')) {
					const hit = /^([^:\s]+):\d+:/.exec(line);
					if (hit) set(hit[1], 'hit');
				}
			}
		}
		return m;
	});

	const hooks = {
		onState: (s: DeepAgentStateType) => {
			todos = [...s.todos];
			files = [...s.files];
			msgs = [...(s.messages as BaseMessage[])];
			compactions = s.summarizationEvents.length;
			contextTokens = totalMessageTokens(s.messages as BaseMessage[]);
		},
		onTests: (r: TestResult[]) => (tests = r),
		onEdits: (e: FileEdit[]) => (edits = e)
	};

	// Bring the payoff into view when the ticket closes.
	let resultEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (phase === 'done' && resultEl)
			resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	async function run() {
		if (busy) return;
		busy = true;
		phase = 'hunting';
		error = '';
		todos = [];
		files = [];
		msgs = [];
		tests = [];
		edits = [];
		finalWord = '';
		contextTokens = 0;
		compactions = 0;
		try {
			const hunt = await buildBugHunt(ticketId, hooks);
			const state = await hunt.start();
			finalWord = hunt.finalText(state);
			phase = 'done';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			phase = 'error';
		} finally {
			busy = false;
		}
	}

	const TODO_GLYPH: Record<Todo['status'], string> = {
		pending: '○',
		in_progress: '◐',
		completed: '●'
	};

	// ── Narrative code ─────────────────────────────────────────────────────────
	const toolsCode = `// Six tools, one shared workspace — the whole filesystem API.
//   ls()                                   → every path in the workspace
//   glob('src/**/*.js')                    → find files by NAME
//   grep('couponDiscount')                 → find files by CONTENT → path:line: hits
//   read_file(path, offset?, limit?)       → read a WINDOW of a file, not all of it
//   write_file(path, content)              → new files (officially create-only)
//   edit_file(path, old, new, replaceAll?) → surgical replace; old must be UNIQUE`;

	const loopCode = `// The coding-agent work loop, in filesystem verbs:
//   1 REPRODUCE   run_tests — failures are ground truth, not the ticket prose
//   2 LOCATE      glob to map → grep to search → follow the evidence
//   3 READ        only what the evidence points at (offset/limit for long files)
//   4 DIAGNOSE    write /notes/diagnosis.md — memory that survives compaction
//   5 FIX         the smallest edit_file that kills the root cause
//   6 VERIFY      run_tests again. Green, or back to 2.`;

	const permsCode = `const agent = createDeepAgent({
  model, systemPrompt, backend,
  tools: [runTests],
  // The tests are the spec. Make cheating impossible, not just discouraged:
  permissions: [{ operations: ['write'], paths: ['/test/**'], mode: 'deny' }]
});
// "Deep Agents follows a 'trust the LLM' model… enforce boundaries at the
//  tool and sandbox level, not by expecting the model to self-police."`;
</script>

<Lesson
	title="The virtual filesystem"
	eyebrow="Level 3 · Lesson 02 · Files as memory"
	hero={{
		id: 'l3-virtual-fs',
		alt: 'A brass archive wall of card-catalog drawers; a clockwork arm holds a magnifying loupe over one open, glowing drawer'
	}}
	source={demoSource}
>
	{#snippet motivation()}
		The <Term t="Context window">context window</Term> is RAM — rented, finite, and eventually
		compacted. The <Term t="Virtual filesystem">virtual filesystem</Term> is the agent's disk:
		written once, searchable forever, untouched by summarization. Agents that do long work live in
		files, not in chat.
	{/snippet}
	{#snippet intro()}
		<p>
			The demo is <strong>The Bug Hunt</strong>: a real bug ticket against a 15-file codebase the
			agent has never seen. Too many files to read whole — so it has to work like a professional:
			<Term t="glob"><code>glob</code></Term> to map, <Term t="grep"><code>grep</code></Term> to
			search, <Term t="read_file"><code>read_file</code></Term> only what the evidence points at,
			one surgical <Term t="edit_file"><code>edit_file</code></Term>, and the project's own test
			suite as the judge.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why files" title="The context window is RAM. Files are disk." variant="dropcap">
			<p>
				Everything an agent keeps in its <Term t="Context window">context window</Term> is rented
				space: every token is re-sent — and re-billed — on every model call, and when the window
				fills, <Term t="Context compaction">compaction</Term> evicts or summarizes the middle of
				the conversation. Files are <em>owned</em> space. A note written to
				<code>/notes/diagnosis.md</code> costs nothing while it sits there, survives any number of
				summarization passes, and comes back verbatim with one
				<Term t="read_file"><code>read_file</code></Term>.
			</p>
			<p>
				The official harness is built around this asymmetry. A tool result longer than ~20,000
				tokens never even enters the context: it is <Term t="Eviction">offloaded</Term> to the
				filesystem, and the model sees the path plus a ten-line preview. When summarization fires
				(at ~85% of the model's input budget), the structured summary keeps <em>file paths</em> —
				so anything that lives in a file is still one tool call away after the chat history around
				it is gone. That is why the base prompt pushes the agent to take notes: the workspace
				<em>is</em> the memory.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-fs-memory"
				alt="An infographic poster: a small, nearly-full porthole (the context window) connected by OFFLOAD and RECALL pneumatic tubes to a vast archive cabinet of files below."
			/>
			<figcaption>
				The small porthole is the context window; the cabinet is the filesystem. Offload what you
				might need later; recall exactly what you need now — a window at a time.
			</figcaption>
		</figure>

		<Slide title="Six tools, one discipline" variant="code-first">
			<p>
				The <Term t="Harness">harness</Term> installs six filesystem tools, and they are
				deliberately <em>boring</em> — the same six verbs Claude Code runs on, pointed at whatever
				<Term t="Backend">backend</Term> you configure (graph state here; disk, durable stores, or
				sandboxes in production — next lesson).
			</p>
			<CodeBlock
				code={toolsCode}
				caption="Two tools find (glob by name, grep by content), two read, two write."
			/>
			<p>
				The pairs matter. <Term t="glob"><code>glob</code></Term> and
				<Term t="grep"><code>grep</code></Term> exist so the agent never has to read a file just to
				learn it was the wrong file — grep returns <code>path:line:</code> hits across the whole
				workspace for a few hundred tokens. <Term t="read_file"><code>read_file</code></Term> takes
				<code>offset</code> and <code>limit</code> because real files don't fit in context — the
				agent pages through a long file the way you'd scroll it. And
				<Term t="edit_file"><code>edit_file</code></Term> demands a <em>unique</em>
				<code>oldString</code>: a surgical replace that cannot silently land in the wrong place,
				for a fraction of the tokens a whole-file rewrite would burn.
			</p>
			<p class="aside">
				Two official details our glass-box build simplifies: the real
				<Term t="write_file"><code>write_file</code></Term> is <strong>create-only</strong> —
				changing an existing file must go through <code>edit_file</code>, so overwrites are always
				deliberate — and the real <Term t="read_file"><code>read_file</code></Term> is
				<strong>multimodal</strong>: images, PDFs, and audio come back as typed content blocks with
				a <code>mimeType</code>, not as mangled text. Underneath all six sits one small contract —
				<code>BackendProtocolV2</code>: <code>ls · read · readRaw · grep · glob · write · edit</code>
				— so you can swap where files live without touching the tools.
			</p>
		</Slide>

		<figure class="diagram">
			<HeroImage
				id="da-fs-toolbelt"
				alt="An infographic poster of the six filesystem tools as engraved brass instruments in a leather tool roll: ls, read_file, write_file, edit_file, glob, grep."
			/>
			<figcaption>
				The toolbelt: an inventory ledger (<code>ls</code>), a paged loupe (<code>read_file</code>),
				a stylus (<code>write_file</code>), watchmaker tweezers (<code>edit_file</code>), a chart of
				paths (<code>glob</code>), and a pattern sieve (<code>grep</code>).
			</figcaption>
		</figure>

		<Slide title="How a professional reads a repo" variant="code-first">
			<p>
				Watch the demo and you'll see a fixed rhythm — the same loop every serious coding agent
				runs, and the reason the six tools are shaped the way they are:
			</p>
			<CodeBlock code={loopCode} caption="Reproduce → locate → read → diagnose → fix → verify." />
			<p>
				Two beats deserve attention. <strong>Reproduce first:</strong> the agent runs the tests
				before touching anything, because failing tests are ground truth and ticket prose is not.
				<strong>Diagnose in writing:</strong> before fixing, it must write the root cause to
				<code>/notes/diagnosis.md</code>. That isn't ceremony — it's the agent
				<Term t="Eviction">offloading</Term> its own reasoning to disk, where no
				<Term t="Context compaction">compaction</Term> pass can take it away mid-job. If the first
				fix misses, the diagnosis is still there to re-read and revise.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>An agent that can grep doesn't need to remember. The workspace is the memory.</p>
		</Slide>

		<Slide title="The spec is law" variant="code-first" ornament>
			<p>
				One more thing the demo enforces: the agent <em>cannot</em> close the ticket by editing the
				tests, because <Term t="Permissions">permissions</Term> deny every write under
				<code>/test/**</code> before the tool even runs. The system prompt also says the tests are
				read-only — but a prompt is advice, and the permission rule is a wall.
			</p>
			<CodeBlock
				code={permsCode}
				caption="Boundaries live in the tool layer. The prompt is advice; the rule is a wall."
			/>
			<p class="aside">
				That's the docs' security model in one line, and it gets a whole lesson —
				<a href="/3-deepagents/permissions">filesystem permissions</a> — including the official
				<code>interrupt</code> mode that routes a matched write to a human instead of refusing it
				outright.
			</p>
		</Slide>

		<ReadMore
			links={[
				{
					label: 'Backends — the filesystem & BackendProtocolV2',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/backends',
					kind: 'docs'
				},
				{
					label: 'Context engineering — offloading & summarization',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/context-engineering',
					kind: 'docs'
				},
				{
					label: 'Filesystem permissions',
					href: 'https://docs.langchain.com/oss/javascript/deepagents/permissions',
					kind: 'docs'
				},
				{
					label: 'deepagents on GitHub (Python + JS)',
					href: 'https://github.com/langchain-ai/deepagents',
					kind: 'api'
				}
			]}
		/>
	{/snippet}

	{#snippet demo()}
		<Panel title="Try it" subtitle="one ticket, fifteen files, six tools">
			<ol class="howto">
				<li>
					<strong>Pick a ticket.</strong> A real bug report against a codebase the agent has never
					seen — three bugs, three different hunts.
				</li>
				<li>
					<strong>Watch the investigation.</strong> The feed shows every grep and read; dots in the
					workspace mark what was searched, read, and changed; the test bench flips red → green.
				</li>
				<li>
					<strong>Read the artifacts.</strong> The written diagnosis, and the surgical diff that
					closed the ticket.
				</li>
			</ol>
		</Panel>

		<Panel title="The ticket" subtitle={phaseLabel}>
			<div class="tickets">
				{#each TICKETS as t (t.id)}
					<button
						class="ticket"
						class:selected={t.id === ticketId}
						onclick={() => (ticketId = t.id)}
						disabled={busy}
					>
						<span class="tag">{t.tag}</span>
						<span class="t-title">{t.title}</span>
						<span class="t-blurb">{t.blurb}</span>
					</button>
				{/each}
			</div>
			<div class="report">
				<div class="report-head">{ticket.tag} · {ticket.title}</div>
				<pre>{ticket.report}</pre>
			</div>
			<RunButton
				onclick={run}
				running={busy}
				label={phase === 'done' ? 'Assign another ticket' : 'Assign the ticket'}
			/>
			{#if error}<div class="err">{error}</div>{/if}
		</Panel>

		{#if msgs.length}
			<Panel
				title="The investigation"
				subtitle="the run itself — every word, tool call, and result, live"
			>
				{#snippet actions()}
					<span class="meter" title="estimated tokens currently in the agent's context">
						ctx ≈ {contextTokens.toLocaleString()} tok{compactions
							? ` · ${compactions} compaction${compactions === 1 ? '' : 's'}`
							: ''}
					</span>
				{/snippet}
				<AgentFeed messages={msgs} />
			</Panel>
		{/if}

		{#if todos.length}
			<Panel title="The plan board" subtitle="write_todos — reproduce, locate, diagnose, fix, verify">
				<ul class="todos">
					{#each todos as t, i (i)}
						<li class={t.status}><span class="glyph">{TODO_GLYPH[t.status]}</span>{t.content}</li>
					{/each}
				</ul>
			</Panel>
		{/if}

		{#if files.length}
			<Panel
				title="The workspace"
				subtitle="the seeded codebase — dots show how the agent touched each file"
			>
				<FileTreeViewer {files} {marks} title="" />
				<div class="legend">
					<span><i class="dot hit"></i> grep hit</span>
					<span><i class="dot read"></i> read</span>
					<span><i class="dot edited"></i> edited</span>
				</div>
			</Panel>
		{/if}

		{#if tests.length}
			<Panel
				title="The test bench"
				subtitle="run_tests — the project's own suite, executed in a sandboxed worker"
			>
				{#snippet actions()}
					<span class="bench-badge {failCount ? 'bad' : 'ok'}">
						{failCount
							? `${failCount} failing · ${tests.length - failCount} passing`
							: `all ${tests.length} passing`}
					</span>
				{/snippet}
				<div class="bench">
					{#each testGroups as [file, rows] (file)}
						<div class="suite">
							<div class="suite-name">{file}</div>
							{#each rows as r, i (i)}
								<div class="case {r.pass ? 'pass' : 'fail'}">
									<span class="case-glyph">{r.pass ? '✓' : '✗'}</span>
									<span class="case-name">{r.name}</span>
								</div>
								{#if !r.pass && r.detail}
									<div class="case-detail">{r.detail}</div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</Panel>
		{/if}

		{#if edits.length}
			<div class="anchor" bind:this={resultEl}></div>
			<Panel title="The fix" subtitle="edit_file — before → after, straight from the workspace">
				<div class="diffs">
					{#each edits as e (e.path)}
						<Diff before={e.before} after={e.after} path={e.path} />
					{/each}
				</div>
			</Panel>
		{/if}

		{#if diagnosis || (phase === 'done' && finalWord)}
			<Panel title="The diagnosis" subtitle="/notes/diagnosis.md — written BEFORE the fix, by rule">
				{#if diagnosis}
					<div class="note"><Markdown source={diagnosis} /></div>
				{/if}
				{#if phase === 'done' && finalWord}
					<div class="final"><Markdown source={finalWord} /></div>
				{/if}
			</Panel>
		{/if}
	{/snippet}
</Lesson>

<style>
	.diagram {
		margin: 1.8rem 0;
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
		margin-top: 0.55rem;
		text-align: center;
		font-style: italic;
		font-size: 0.8rem;
		color: var(--color-fg-muted);
	}
	.aside {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
	}

	.howto {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.howto strong {
		color: var(--color-fg);
	}

	/* Tickets */
	.tickets {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.45rem;
		margin-bottom: 0.65rem;
	}
	.ticket {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: left;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-bg-elev);
		cursor: pointer;
	}
	.ticket:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.ticket.selected {
		border-color: var(--accent-rule);
		background: color-mix(in oklch, var(--accent) 7%, transparent);
	}
	.ticket .tag {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--accent-ink);
	}
	.ticket .t-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-fg);
		line-height: 1.3;
	}
	.ticket .t-blurb {
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		line-height: 1.4;
	}
	.report {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		margin-bottom: 0.7rem;
		overflow: hidden;
	}
	.report-head {
		padding: 0.4rem 0.7rem;
		border-bottom: 1px solid var(--color-rule);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent-ink);
	}
	.report pre {
		margin: 0;
		padding: 0.55rem 0.7rem 0.7rem;
		font-family: inherit;
		font-size: 0.8rem;
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--color-fg-muted);
	}
	.err {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		color: var(--color-accent-warning);
	}

	/* Plan board */
	.todos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.todos li {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.84rem;
		color: var(--color-fg-muted);
		line-height: 1.4;
	}
	.todos li.completed {
		color: var(--color-fg-faint);
		text-decoration: line-through;
	}
	.todos li.in_progress {
		color: var(--color-fg);
	}
	.glyph {
		font-family: var(--font-mono);
		color: var(--accent);
		flex-shrink: 0;
	}

	/* Workspace legend */
	.legend {
		display: flex;
		gap: 1rem;
		margin-top: 0.45rem;
		font-size: 0.68rem;
		font-family: var(--font-mono);
		color: var(--color-fg-faint);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.dot {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		display: inline-block;
	}
	.dot.hit {
		background: color-mix(in oklch, var(--accent) 45%, transparent);
	}
	.dot.read {
		background: var(--accent);
	}
	.dot.edited {
		background: var(--color-accent-warning);
	}

	/* Test bench */
	.bench {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.suite {
		border: 1px solid var(--color-rule);
		border-radius: 0.5rem;
		background: var(--color-paper);
		padding: 0.45rem 0.6rem;
	}
	.suite-name {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-fg-faint);
		margin-bottom: 0.3rem;
	}
	.case {
		display: flex;
		gap: 0.45rem;
		align-items: baseline;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-fg-muted);
	}
	.case-glyph {
		font-family: var(--font-mono);
		flex-shrink: 0;
	}
	.case.pass .case-glyph {
		color: var(--color-accent-success, #4caf6e);
	}
	.case.fail {
		color: var(--color-fg);
	}
	.case.fail .case-glyph {
		color: var(--color-accent-warning);
	}
	.case-detail {
		margin: 0.1rem 0 0.25rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-accent-warning);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.bench-badge {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-rule);
	}
	.bench-badge.ok {
		color: var(--color-accent-success, #4caf6e);
		border-color: color-mix(in oklch, var(--color-accent-success, #4caf6e) 45%, transparent);
	}
	.bench-badge.bad {
		color: var(--color-accent-warning);
		border-color: color-mix(in oklch, var(--color-accent-warning) 45%, transparent);
	}

	.anchor {
		height: 0;
	}
	.diffs {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	/* Diagnosis & final word */
	.note {
		border: 1px solid var(--color-rule);
		border-radius: 0.55rem;
		background: var(--color-paper);
		padding: 0.6rem 0.75rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.final {
		margin-top: 0.6rem;
		font-size: 0.82rem;
		color: var(--color-fg-muted);
	}
	.note :global(p),
	.final :global(p) {
		margin: 0 0 0.4rem;
		line-height: 1.55;
	}
	.note :global(p:last-child),
	.final :global(p:last-child) {
		margin-bottom: 0;
	}
	.note :global(ul),
	.note :global(ol),
	.final :global(ul),
	.final :global(ol) {
		margin: 0 0 0.4rem;
		padding-left: 1.2rem;
	}
	.note :global(h1),
	.note :global(h2),
	.note :global(h3),
	.final :global(h1),
	.final :global(h2),
	.final :global(h3) {
		font-size: 0.9rem;
		margin: 0.5rem 0 0.3rem;
		color: var(--color-fg);
	}
	.note :global(code),
	.final :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}

	.meter {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--accent-ink);
		border: 1px solid var(--accent-rule);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
</style>
