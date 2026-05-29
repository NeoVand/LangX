<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
</script>

<svelte:head>
	<title>Beyond V1 · LangX</title>
</svelte:head>

<Lesson
	title="Beyond V1"
	eyebrow="Phase 3 · what's next"
	hero={{
		id: 'l3-beyond',
		alt: 'A horizon view: finished workshop, half-built bridge, mountain peaks beyond'
	}}
>
	{#snippet motivation()}
		What we built is V1. Production lives beyond — managed sandboxes, <Term t="Subagent">multi-agent</Term> deployments, <Term t="LangSmith">observability</Term>. Here's the map.
	{/snippet}

	{#snippet intro()}
		<p>
			LangX V1 covers the full conceptual surface of <Term t="LangChain">LangChain</Term>, <Term t="LangGraph">LangGraph</Term>, and <Term t="Deep Agent">Deep Agents</Term>,
			but it makes a few deliberate trade-offs to keep everything running in a single static
			tab. This page names them so you know which dotted lines in the <Term t="Harness">harness</Term> architecture are still
			worth crossing.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide eyebrow="Why this slide deck exists" title="V1 is a map, not a destination" variant="dropcap">
			<p>
				A teaching environment is a deliberate simplification. Every "this is good enough"
				you have read in this chapter — a <Term t="Web Worker">Web Worker</Term> as a sandbox, <Term t="IndexedDB">IndexedDB</Term> as durable
				storage, deterministic stand-ins for browser <Term t="tool">tools</Term> — was the right call for a
				single static tab. None of them are the right call for a production deployment.
			</p>
			<p>
				The <Term t="Harness">harness</Term> shape, though, is. The pieces you have configured here — <Term t="createDeepAgent"><code>createDeepAgent</code></Term>, <Term t="Backend">backends</Term>, <Term t="Permissions">permissions</Term>, <Term t="Subagent">subagents</Term> — are the same
				pieces a production deployment ships. What changes is the substrate underneath
				each. Below is the substrate-by-substrate map.
			</p>
		</Slide>

		<Slide title="Real sandboxes (Modal · Daytona · Runloop)">
			<p>
				Production Deep Agents pair with a remote sandbox for code execution: a
				containerised VM the agent can spin up, run a shell or notebook in, and tear down.
				LangX swaps that for a Web Worker — a <Term t="Scoped interpreter" /> with no DOM
				and no network. Same shape (postMessage in, results out), tighter scope.
			</p>
			<ul>
				<li><strong><Term t="Modal">Modal</Term></strong> — sandboxes for full-language stacks (Python, Node, etc.).</li>
				<li><strong><Term t="Daytona">Daytona</Term> / <Term t="Runloop">Runloop</Term></strong> — dev containers with persistent volumes.</li>
				<li><strong><Term t="QuickJS">QuickJS</Term></strong> — pure-JS evaluation without a process.</li>
			</ul>
		</Slide>

		<Slide title="Persistent backends">
			<p>
				In LangX, <Term t="StoreBackend"><code>StoreBackend</code></Term> is <Term t="Dexie">Dexie</Term>/<Term t="IndexedDB">IndexedDB</Term>. In production, it is
				typically Postgres (via the LangGraph <Term t="PostgresSaver">Postgres</Term> checkpointer) or a managed store.
				The <Term t="BackendProtocol"><code>BackendProtocol</code></Term> does not change — only the implementation does.
			</p>
			<ul>
				<li><strong>Postgres checkpoints</strong> — durable graph state across processes.</li>
				<li><strong><Term t="FilesystemBackend">FilesystemBackend</Term></strong> — root the virtual FS on a real disk for code agents.</li>
				<li><strong><Term t="LocalShellBackend">LocalShellBackend</Term></strong> — let the agent talk to a real shell, gated by permissions.</li>
			</ul>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				The pieces you wired up in this chapter are the same pieces a production team ships
				— only the substrate underneath each one changes.
			</p>
		</Slide>

		<Slide title="Managed Deep Agents (private preview)">
			<p>
				<Term t="LangSmith">LangSmith</Term>'s <code>/v1/deepagents</code> hosts the harness as a service: you ship an
				agent file tree (<Term t="AGENTS.md"><code>AGENTS.md</code></Term>, <code>skills/</code>,
				<code>subagents/</code>, <Term t="tools.json"><code>tools.json</code></Term>), point at an <Term t="MCP">MCP</Term> server, and the
				platform runs threads with interrupts and streaming over HTTP. The harness shape is
				identical; only the deploy target differs.
			</p>
		</Slide>

		<Slide title="Background async subagents">
			<p>
				In a long-lived deployment, <Term t="Subagent">subagents</Term> can run in the background over the
				<Term t="Agent Protocol">Agent Protocol</Term>:
				the parent does not block on a child's full transcript; it just receives a final
				report. Static-site LangX runs them inline so you can watch the trace; the
				<Term t="task"><code>task</code></Term> delegation pattern is the same either way.
			</p>
		</Slide>

		<Slide title="Tool ecosystem">
			<p>
				Real agents use <Term t="MCP" /> servers and integrations (<Term t="Tavily">Tavily</Term>, <Term t="Browserbase">Browserbase</Term>,
				Linear, Slack, Datadog, GitHub). LangX includes deterministic stand-ins so the
				lessons stay reproducible. Drop a real client in behind the same <code>tool()</code>
				wrapper and the lesson code keeps working.
			</p>
		</Slide>

		<Slide title="Where to go next">
			<ul>
				<li><a href="https://docs.langchain.com" target="_blank" rel="noopener">LangChain docs</a> — start with create_agent.</li>
				<li><a href="https://langchain-ai.github.io/langgraph/" target="_blank" rel="noopener">LangGraph docs</a> — the graph reference.</li>
				<li><a href="https://github.com/langchain-ai/deepagents" target="_blank" rel="noopener">Deep Agents (Python)</a> — the harness LangX ports.</li>
				<li><a href="https://docs.smith.langchain.com" target="_blank" rel="noopener">LangSmith</a> — tracing, evals, deployments.</li>
			</ul>
			<p>
				Read the source: every harness piece in this app lives in
				<code>src/lib/deepagents/</code>. Re-implementing the harness is a great way to
				learn it.
			</p>
		</Slide>

		<Slide ornament>
			<p>· built · documented · onwards ·</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="You finished LangX V1" subtitle="three layers, two capstones, one harness">
			<p class="card">
				Built entirely in your browser. From here it is plain LangChain, LangGraph, and
				Deep Agents. The patterns you have seen are exactly the ones you'll meet in
				production.
			</p>
			<p class="hint">
				Press <kbd>P</kbd> to read this as slides, or jump back to the
				<a href="/">landing page</a> to revisit a chapter.
			</p>
		</Panel>
	{/snippet}
</Lesson>

<style>
	.card {
		margin: 0;
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-ink-100);
	}
	.hint {
		margin: 0.85rem 0 0;
		font-family: var(--font-prose);
		font-size: 0.9rem;
		color: var(--color-ink-300);
		font-style: italic;
	}
	kbd {
		font-family: var(--font-mono);
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.3rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.8em;
	}
	a {
		color: var(--accent-ink);
	}
</style>
