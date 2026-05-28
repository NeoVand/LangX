<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import FileTreeViewer from '$lib/components/FileTreeViewer.svelte';
	import TraceLog from '$lib/components/TraceLog.svelte';
	import { createDeepAgent, StateBackend, type VirtualFile } from '$lib/deepagents';
	import { MockChatModel, type ScriptedResponse } from '$lib/runtime/llm/mock';
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let scenario = $state<'organize' | 'edit'>('organize');
	let busy = $state(false);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);

	function organizeScript(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/scratch/raw.md',
							content:
								'shopping: milk, eggs, bread\nideas: drone delivery for groceries\ntodo: respond to alex'
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: '/notes/shopping.md', content: '- milk\n- eggs\n- bread' }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: '/notes/ideas.md', content: '- drone delivery for groceries' }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/notes/todo.md',
							content: '- respond to alex'
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [{ name: 'ls', args: {} }]
			},
			{
				content:
					'Sorted three categories of notes from /scratch/raw.md into /notes/. The originals stay in /scratch/ for traceability.'
			}
		];
	}

	function editScript(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/code/util.ts',
							content: `export function greet(name: string) {
  return 'Hello, ' + name;
}`
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'edit_file',
						args: {
							path: '/code/util.ts',
							oldString: "'Hello, ' + name",
							newString: '`Hi, ${name}!`'
						}
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{ name: 'read_file', args: { path: '/code/util.ts' } }
				]
			},
			{
				content: 'Replaced the concatenation with a template literal and re-read to verify.'
			}
		];
	}

	async function run() {
		busy = true;
		files = [];
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));

			const model = new MockChatModel({
				responses: scenario === 'organize' ? organizeScript() : editScript(),
				tokenDelayMs: 0
			});
			const backend = new StateBackend();
			const agent = createDeepAgent({
				model,
				backend,
				instructions: 'Operate on the virtual filesystem to organize the user\'s notes.',
				tracer
			});

			agent.subscribe((s) => {
				files = [...s.files];
			});

			const userMsg =
				scenario === 'organize'
					? 'Take this raw note dump and split it into separate files under /notes/.'
					: 'Update /code/util.ts to use a template literal instead of string concatenation.';

			await agent.invoke({ input: userMsg, thread: 'fs-' + Math.random().toString(36).slice(2, 6) });

			files = await backend.list();
		} finally {
			busy = false;
		}
	}

	const code = `// 6 tools, all backed by a pluggable backend protocol.
//   ls()                                     → list files
//   read_file(path, offset?, limit?)         → read up to {limit} lines
//   write_file(path, content)                → create or overwrite
//   edit_file(path, oldString, newString)    → unique-replace surgery
//   glob(pattern)                             → "src/**/*.ts" style search
//   grep(pattern, ignoreCase?)                → regex over file contents`;
</script>

<Lesson title="Virtual filesystem" eyebrow="Phase 3 · Lesson 02">
	{#snippet intro()}
		<p>
			The harness gives the agent a six-tool API for working with files. There's no real disk —
			files live in graph state (or a Store) — but the model thinks like a coder, and that mental
			model unlocks long-horizon work.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Six tools is enough">
			<CodeBlock code={code} caption="The full filesystem surface." />
			<p>
				Why give the model files at all? Because long outputs and accumulating notes shouldn't
				live in the conversation. A virtual filesystem turns "render in chat" into "write to a
				path, reference by name."
			</p>
		</Slide>

		<Slide title="edit_file is surgical">
			<p>
				<code>edit_file</code> requires <code>oldString</code> to be unique in the file (or you
				pass <code>replaceAll: true</code>). This trades expressiveness for safety — the agent
				can't accidentally clobber an unrelated occurrence. Demo 2 below uses it.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 takes a free-form note dump and spreads it across <code>/notes/*.md</code>.
				Demo 2 writes a tiny utility, edits it precisely, then reads it back to verify. The
				right pane shows the resulting filesystem and the trace of every tool call.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Pick a scenario">
			<div class="modes">
				<label class:selected={scenario === 'organize'}>
					<input type="radio" bind:group={scenario} value="organize" />
					<span>Organize notes</span>
					<small>Spread a raw note dump across /notes/.</small>
				</label>
				<label class:selected={scenario === 'edit'}>
					<input type="radio" bind:group={scenario} value="edit" />
					<span>Edit code</span>
					<small>Write, edit precisely, verify.</small>
				</label>
			</div>
			<RunButton onclick={run} running={busy} label="Run agent" />
		</Panel>

		<Panel title="Filesystem (live)">
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Trace">
			<TraceLog events={events} compact />
		</Panel>
	{/snippet}
</Lesson>

<style>
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}
	.modes label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-bg);
		cursor: pointer;
	}
	.modes label.selected {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.modes input {
		display: none;
	}
	.modes span {
		font-weight: 500;
		font-size: 0.88rem;
	}
	.modes small {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
	}
</style>
