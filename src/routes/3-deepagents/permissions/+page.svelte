<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import {
		createDeepAgent,
		StateBackend,
		type FilesystemPermission,
		type VirtualFile
	} from '$lib/deepagents';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	const permissions: FilesystemPermission[] = [
		{ operations: ['write'], paths: ['**/.env', 'secrets/**'], mode: 'deny' },
		{ operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
		{ operations: ['read', 'write'], paths: ['**'], mode: 'deny' }
	];

	interface RunPayload {
		files: VirtualFile[];
		events: TraceEvent[];
		finalText: string;
	}

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let finalText = $state<string>('');

	const INSTRUCTIONS = `You are auditing the harness's permission system. Your task is to attempt
five file writes in this exact order, all via write_file, then call ls() once. You MUST attempt
all five even if some are denied — the point is to see which are denied. Do not skip any.

After ls(), reply with one sentence summarising which writes succeeded and which were denied.

The five writes to attempt (in order):
1. write_file('src/util.ts',     '// utility')
2. write_file('docs/intro.md',   '# Intro')
3. write_file('secrets/keys.txt','should be denied')
4. write_file('.env',            'API_KEY=foo')
5. write_file('random.md',       'catch-all denied')`;

	async function run() {
		busy = true;
		files = [];
		events = [];
		finalText = '';
		try {
			const result = await withRunCache<RunPayload>(
				{ demoId: 'l3-permissions-run' },
				async () => {
					const localEvents: TraceEvent[] = [];
					const tracer = createTracer();
					tracer.subscribe((ev) => {
						localEvents.push(ev);
						events = [...localEvents];
					});

					const model = await getModel({ temperature: 0, maxTokens: 800 });
					const backend = new StateBackend();
					const agent = createDeepAgent({
						model,
						backend,
						permissions,
						instructions: INSTRUCTIONS,
						tracer,
						maxIterations: 16
					});
					agent.subscribe((s) => (files = [...s.files]));
					const out = await agent.invoke({
						input:
							'Run the five-write audit described in your instructions and report what was blocked.',
						thread: `perms-${Math.random().toString(36).slice(2, 6)}`
					});
					const last = out.messages[out.messages.length - 1];
					const text =
						typeof last?.content === 'string'
							? last.content
							: JSON.stringify(last?.content ?? '');
					const finalFiles = await backend.list();
					return { files: finalFiles, events: localEvents, finalText: text };
				}
			);
			files = result.files;
			events = result.events;
			finalText = result.finalText;
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		(async () => {
			const cached = await loadCachedRun<RunPayload>({ demoId: 'l3-permissions-run' });
			if (cached) {
				files = cached.payload.files;
				events = cached.payload.events;
				finalText = cached.payload.finalText;
			}
		})();
	});

	const code = `const permissions = [
  // Most specific first. First match wins.
  { operations: ['write'], paths: ['**/.env', 'secrets/**'],     mode: 'deny'  },
  { operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
  // Default catch-all: deny everything else.
  { operations: ['read', 'write'], paths: ['**'],                mode: 'deny'  }
];`;
</script>

<Lesson
	title="Filesystem permissions"
	eyebrow="Phase 3 · Lesson 05"
	motivation="An agent that can write to your filesystem is a feature; one that can write to /etc is a CVE. Permissions are the smallest, sharpest tool for that distinction."
	hero={{
		id: 'l3-permissions',
		alt: 'Ornate doors with unique glyphs and tiny padlocks set into a stone wall'
	}}
>
	{#snippet intro()}
		<p>
			Permissions are declarative: a list of <code>{'{ operations, paths, mode }'}</code>
			rules evaluated first-match-wins. Order matters — put deny rules at the top, then
			specific allows, and end with a catch-all.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this shape" title="Prompts ask; rules enforce" variant="dropcap">
			<p>
				Telling a model "do not write to <code>.env</code>" works some of the time.
				Code-level enforcement works every time. The harness layers them in the right order:
				the prompt explains intent, the permission list is the ground truth, and the agent
				gets a clear error message when it crosses a line — so it can adapt instead of
				silently failing.
			</p>
			<p>
				Concretely, every read or write is evaluated against the rule list before it
				executes. The first matching rule wins. Specific deny rules pin the dangerous
				ground; specific allows open the rest; a final catch-all deny is the safety net.
			</p>
		</Slide>

		<Slide title="The shape" variant="code-first">
			<CodeBlock code={code} lang="ts" caption="The exact rules used in this demo." />
			<p>
				A failed check throws, and the model sees the error message in the next
				ToolMessage — so it knows what was blocked and can adapt.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The smallest production-safe agent is one whose dangerous moves are described in
				config, not in a paragraph of polite instructions.
			</p>
		</Slide>

		<Slide title="Watch the trace">
			<p>
				The agent attempts five writes. Two succeed (<code>src/util.ts</code>,
				<code>docs/intro.md</code>); three are blocked (<code>secrets/keys.txt</code>,
				<code>.env</code>, <code>random.md</code>). The trace logs both successful filesystem
				operations and the permission-denied errors, with the matched rule.
			</p>
		</Slide>

		<Slide ornament>
			<p>· allow · deny · audit ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Active permissions" subtitle="first match wins">
			<ol class="rules">
				{#each permissions as p, i (i)}
					<li data-mode={p.mode}>
						<code>{p.mode.toUpperCase()}</code>
						<span class="ops">{p.operations.join(', ')}</span>
						<span class="paths">{p.paths.join(' · ')}</span>
					</li>
				{/each}
			</ol>
			<RunButton onclick={run} running={busy} label="Try 5 writes" />
		</Panel>

		<Panel title="Files that survived">
			<FileTreeViewer {files} />
		</Panel>

		{#if finalText}
			<Panel title="Final response">
				<p class="finaltext">{finalText}</p>
			</Panel>
		{/if}

		<Panel title="Trace (errors → permission denials)">
			<TraceLog {events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.rules {
		list-style: none;
		padding: 0;
		margin: 0 0 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.rules li {
		display: grid;
		grid-template-columns: 5rem 7rem 1fr;
		gap: 0.55rem;
		align-items: center;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}
	.rules li[data-mode='deny'] code {
		color: var(--color-accent-danger);
	}
	.rules li[data-mode='allow'] code {
		color: var(--color-accent-success);
	}
	.ops {
		color: var(--color-ink-300);
	}
	.paths {
		color: var(--color-ink-100);
		word-break: break-all;
	}
	.finaltext {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
</style>
