<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import Term from '$lib/components/Term.svelte';
	import { langgraphOverview } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="langgraph"
	diagram={langgraphOverview}
	next={{ href: '/3-deepagents', label: 'Continue to Phase 3 · Deep Agents' }}
>
	{#snippet blurb()}
		You took control of the runtime: <Term t="StateGraph" /> <Term t="Node">nodes</Term> and
		<Term t="Reducer">reducers</Term>, <Term t="Conditional edge">conditional edges</Term>,
		<Term t="Checkpointer">checkpointers</Term> and <Term t="Time travel">time travel</Term>,
		<Term t="Interrupt">interrupts</Term> for <Term t="HITL">human-in-the-loop</Term>, the three
		<Term t="streamMode">streaming modes</Term>, <Term t="Send">Send</Term>
		<Term t="Fan-out">fan-out</Term>, and <Term t="Subgraph">subgraph</Term> composition. This is
		the orchestration layer every <Term t="Deep Agent">Deep Agent</Term> runs on.
	{/snippet}
</ChapterRecap>
