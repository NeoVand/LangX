<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import Term from '$lib/components/Term.svelte';
	import { langchainOverview } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="langchain"
	diagram={langchainOverview}
	next={{ href: '/2-langgraph', label: 'Continue to Level 2 · LangGraph' }}
>
	{#snippet blurb()}
		You assembled the foundation layer: <Term t="Runnable">Runnables</Term> and
		<Term t="LCEL" />, <Term t="stream">streaming</Term> and
		<Term t="streamEvents">streamEvents</Term>, typed
		<Term t="Structured output">structured output</Term> with <Term t="Zod" />,
		<Term t="tool">tools</Term> and <Term t="Tool calling">tool calling</Term>,
		<Term t="RAG">retrieval-augmented generation</Term>, and finally a
		<Term t="ReAct" /> <Term t="Agent">agent</Term> loop (the pattern behind
		<Term t="create_agent"><code>createAgent</code></Term>). Every piece is a
		<Term t="Runnable" /> — and every agent you build later sits on exactly this base.
	{/snippet}
</ChapterRecap>
