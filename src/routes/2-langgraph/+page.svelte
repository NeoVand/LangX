<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="langgraph"
	heroId="chapter-langgraph-hero"
	heroAlt="Topographic map of an imaginary city — nodes as temples, paths as edges, checkpoints at bridges"
	heroFocal="32% 48%"
	tagline="Nodes, edges, and shared state — the runtime every serious agent grows into."
>
	{#snippet intro()}
		<p>
			<Term t="LangGraph" /> is the orchestration runtime beneath every serious agent. It trades the straight-line
			pipe of <Term t="LangChain" /> for an explicit
			<Term t="StateGraph">graph</Term> you can read like a diagram and step through like a debugger:
			you declare the <Term t="Node">nodes</Term>, the <Term t="Edge">edges</Term> between them, and the
			shared <Term t="State">state</Term> they all read and write — and LangGraph runs the loop.
		</p>
		<p>
			That graph is what makes an agent durable and steerable: state persists at
			<Term t="Checkpointer">checkpoints</Term>, a run can pause for a human and resume, and
			branches fan out and merge back. Level 2 builds it up one piece at a time — the substrate
			<Term t="Deep Agent">Deep Agents</Term> (Level 3) is assembled from. We open with a whole-graph
			demo, then take each part apart.
		</p>
	{/snippet}
</ChapterIntro>
