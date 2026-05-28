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
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	const permissions: FilesystemPermission[] = [
		{ operations: ['write'], paths: ['**/.env', 'secrets/**'], mode: 'deny' },
		{ operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
		{ operations: ['read', 'write'], paths: ['**'], mode: 'deny' }
	];

	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{ name: 'write_file', args: { path: 'src/util.ts', content: '// allowed' } }
				]
			},
			{
				content: '',
				toolCalls: [
					{ name: 'write_file', args: { path: 'docs/intro.md', content: '# Intro' } }
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: 'secrets/keys.txt', content: 'secret-stuff' }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{ name: 'write_file', args: { path: '.env', content: 'API_KEY=foo' } }
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: 'random.md',
							content: 'unrelated path — should be denied by the catch-all'
						}
					}
				]
			},
			{ content: '', toolCalls: [{ name: 'ls', args: {} }] },
			{ content: 'Two writes succeeded; three were denied.' }
		];
	}

	async function run() {
		busy = true;
		files = [];
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));
			const model = new MockChatModel({ responses: script(), tokenDelayMs: 0 });
			const backend = new StateBackend();
			const agent = createDeepAgent({
				model,
				backend,
				permissions,
				instructions:
					'Try to write 5 files, including ones that violate permissions, so we can see denials.',
				tracer
			});
			agent.subscribe((s) => (files = [...s.files]));
			await agent.invoke({
				input: 'Create the project files I listed.',
				thread: 'perms-' + Math.random().toString(36).slice(2, 6)
			});
			files = await backend.list();
		} finally {
			busy = false;
		}
	}

	const code = `const permissions = [
  // Most specific first. First match wins.
  { operations: ['write'], paths: ['**/.env', 'secrets/**'],   mode: 'deny'  },
  { operations: ['read', 'write'], paths: ['src/**', 'docs/**'], mode: 'allow' },
  // Default catch-all: deny everything else.
  { operations: ['read', 'write'], paths: ['**'],              mode: 'deny'  }
];`;
</script>

<Lesson title="Filesystem permissions" eyebrow="Phase 3 · Lesson 05">
	{#snippet intro()}
		<p>
			Permissions are declarative: a list of <code>{'{ operations, paths, mode }'}</code> rules
			evaluated first-match-wins. Order matters — put deny rules at the top, then specific
			allows, and end with a catch-all.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="The shape">
			<CodeBlock code={code} caption="The exact rules used in this demo." />
			<p>
				The harness checks the rule list before executing any read or write tool. A failed
				check throws and the model sees the error message in the next ToolMessage — so it
				knows what was blocked and can adapt.
			</p>
		</Slide>

		<Slide title="Why declarative beats prompt-only">
			<p>
				Telling a model "do not write to .env" works some of the time. Code-level enforcement
				works every time. Combine both: the prompt explains intent; permissions are the
				ground truth.
			</p>
		</Slide>

		<Slide title="Watch the trace">
			<p>
				The agent attempts five writes. Two succeed, three are blocked. The trace below logs
				both successful filesystem operations and the failures (as <code>error</code> events
				with the matched rule).
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Active permissions" subtitle="First match wins">
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
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Trace (errors → permission denials)">
			<TraceLog events={events} compact />
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
		gap: 0.3rem;
	}
	.rules li {
		display: grid;
		grid-template-columns: 5rem 7rem 1fr;
		gap: 0.55rem;
		align-items: center;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 0.35rem;
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
		color: var(--color-fg-faint);
	}
	.paths {
		color: var(--color-fg);
		word-break: break-all;
	}
</style>
