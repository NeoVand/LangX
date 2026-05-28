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
	import { createTracer } from '$lib/runtime/tracer';
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	let busy = $state(false);
	let waiting = $state(false);
	let pending = $state<{ tool: string; args: unknown } | null>(null);
	let files = $state<VirtualFile[]>([]);
	let events = $state<TraceEvent[]>([]);
	let resumeFn: ((decision: { decision: 'approve' | 'reject'; reason?: string }) => void) | null =
		null;

	function script(): ScriptedResponse[] {
		return [
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: { path: '/draft.md', content: '# First draft' }
					}
				]
			},
			{
				content: '',
				toolCalls: [
					{
						name: 'write_file',
						args: {
							path: '/published.md',
							content: '# Published\n\nReady for the team.'
						}
					}
				]
			},
			{ content: 'Done — first one published was approved, second rejected stays as draft.' }
		];
	}

	async function run() {
		busy = true;
		files = [];
		events = [];
		try {
			const tracer = createTracer();
			tracer.subscribe((ev) => (events = [...events, ev]));

			const interceptor = new MockChatModel({
				responses: script(),
				tokenDelayMs: 0
			});

			const interruptingTool = {
				name: 'pretend_publish',
				description: 'pretend',
				schema: { type: 'object', properties: {} }
			};

			const agent = createDeepAgent({
				model: interceptor,
				backend: new StateBackend(),
				interruptOn: ['write_file'],
				instructions: 'Use write_file freely. The harness will pause for human approval.',
				tracer
			});

			agent.subscribe((s) => (files = [...s.files]));

			await agent.invoke({
				input: 'Write two files: a draft, then publish.',
				thread: 'hitl-' + Math.random().toString(36).slice(2, 6)
			});
		} finally {
			busy = false;
		}
	}
</script>

<Lesson title="Human-in-the-loop" eyebrow="Phase 3 · Lesson 09">
	{#snippet intro()}
		<p>
			<code>interruptOn: ['write_file']</code> is enough to put any tool behind a
			<Term t="HITL" /> gate. The harness pauses the graph at the named tool, surfaces the
			proposed call to the host, and resumes only on a Command. Built directly on Phase 2's
			interrupt primitive.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="What gets surfaced">
			<p>
				When the agent calls a guarded tool, the harness throws an interrupt with the tool
				name, its arguments, and the call ID. The host is responsible for showing this to a
				human and resuming with <code>Command(&#123; resume: &#123; decision &#125; &#125;)</code>.
			</p>
			<CodeBlock
				code={`createDeepAgent({
  model,
  interruptOn: ['write_file', 'send_email', 'shell']
});

// On the host side:
let out = await agent.invoke({ input });
while (out.__interrupt__) {
  const { tool, args } = out.__interrupt__[0].value;
  const decision = await askHuman(tool, args);
  out = await agent.invoke(new Command({ resume: { decision } }));
}`}
				caption="The host loop for an interrupting harness."
			/>
		</Slide>

		<Slide title="Why this is the safe default">
			<p>
				For destructive tools — sending email, calling APIs that mutate things, deleting files,
				running shell commands — never trust the model alone. Wrap them. The cost is one human
				click per dangerous action; the upside is no surprises.
			</p>
		</Slide>

		<Slide title="A note on this demo">
			<p>
				This page wires the harness without the interactive resume loop (LangX is a static
				demo), so the trace shows that the harness <em>raised</em> an interrupt for each{' '}
				<code>write_file</code>. In production, the host would surface a UI like the email
				approval card from Phase 2's HITL lesson.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Run">
			<RunButton onclick={run} running={busy} label="Try two write_file calls" />
		</Panel>

		<Panel title="Filesystem (no writes commit while paused)">
			<FileTreeViewer files={files} />
		</Panel>

		<Panel title="Trace (look for 'pause for write_file')">
			<TraceLog events={events} />
		</Panel>
	{/snippet}
</Lesson>
