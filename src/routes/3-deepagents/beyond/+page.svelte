<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<svelte:head>
	<title>Beyond V1 · LangX</title>
</svelte:head>

{#snippet narrative()}
	<Slide title="What we built — and where the road continues">
		<p>
			LangX V1 covers the full conceptual surface of LangChain, LangGraph, and Deep Agents,
			but it makes a few deliberate trade-offs to keep everything running in a single static
			tab. This page names them so you know which dotted lines in the architecture are still
			worth crossing.
		</p>
	</Slide>

	<Slide title="Real sandboxes (Modal · Daytona · Runloop)">
		<p>
			Production Deep Agents pair with a remote sandbox for code execution: a
			containerized VM the agent can spin up, run a shell or notebook in, and tear down.
			LangX swaps that for a Web Worker — a <Term t="Scoped interpreter" /> with no
			DOM and no network. That's the same shape (postMessage in, results out) but a
			tighter sandbox.
		</p>
		<ul>
			<li>Modal sandboxes for full-language stacks.</li>
			<li>Daytona / Runloop dev containers with persistent volumes.</li>
			<li>QuickJS for pure-JS evaluation without a process.</li>
		</ul>
	</Slide>

	<Slide title="Persistent backends">
		<p>
			In LangX, <code>StoreBackend</code> is Dexie/IndexedDB. In production, it's typically
			Postgres (via the LangGraph Postgres checkpointer) or a managed store. The
			<code>BackendProtocol</code> doesn't change — only the implementation does.
		</p>
		<ul>
			<li><strong>Postgres checkpoints</strong> — durable graph state across processes.</li>
			<li><strong>FilesystemBackend</strong> — root the virtual FS on a real disk for code agents.</li>
			<li><strong>LocalShellBackend</strong> — let the agent talk to a real shell, gated by permissions.</li>
		</ul>
	</Slide>

	<Slide title="Managed Deep Agents (private preview)">
		<p>
			LangSmith's <code>/v1/deepagents</code> hosts the harness as a service: you ship an
			agent file tree (<code>AGENTS.md</code>, <code>skills/</code>, <code>subagents/</code>,
			<code>tools.json</code>), point at an MCP server, and the platform runs threads with
			interrupts and streaming over HTTP. The harness shape is identical; only the deploy
			target differs.
		</p>
	</Slide>

	<Slide title="Background async subagents">
		<p>
			In a long-lived deployment, subagents can run in the background over the
			<a href="https://github.com/langchain-ai/agent-protocol" target="_blank" rel="noopener">Agent Protocol</a>:
			the parent doesn't block on a child's full transcript, it just receives a final
			report. Static-site LangX runs them inline so you can watch the trace; the
			delegation pattern is the same either way.
		</p>
	</Slide>

	<Slide title="Tool ecosystem">
		<p>
			Real agents use <Term t="MCP" /> servers and integrations (Tavily, Browserbase,
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
			Read the source: every harness piece in this app lives in <code>src/lib/deepagents/</code>.
			Re-implementing the harness is a great way to learn it.
		</p>
	</Slide>
{/snippet}

{#snippet demo()}
	<div class="card">
		<h3>You finished LangX V1</h3>
		<p>
			Three layers, two capstones, one harness — built entirely in your browser. From
			here it's plain LangChain, LangGraph, and Deep Agents. The patterns you've seen
			are exactly the ones you'll meet in production.
		</p>
		<p class="hint">
			Press <kbd>P</kbd> to read this as slides, or jump back to the
			<a href="/">landing page</a> to revisit a chapter.
		</p>
	</div>
{/snippet}

<Lesson
	title="Beyond V1"
	eyebrow="PHASE 3 · WHAT'S NEXT"
	{narrative}
	{demo}
/>

<style>
	.card {
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		padding: 1.5rem;
		background: var(--color-bg-elev);
	}
	.card h3 {
		font-family: var(--font-serif);
		font-size: 1.4rem;
		margin: 0 0 0.75rem;
	}
	.card p {
		font-family: var(--font-serif);
		color: var(--color-fg-muted);
		font-size: 1rem;
		line-height: 1.6;
	}
	.card p + p {
		margin-top: 0.75rem;
	}
	.hint {
		font-size: 0.9rem;
		color: var(--color-fg-faint);
	}
	kbd {
		font-family: var(--font-mono);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.3rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.8em;
	}
	a {
		color: var(--accent);
	}
</style>
