<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="langgraph"
	heroId="chapter-langgraph-hero"
	heroAlt="Topographic map of an imaginary city — nodes as temples, paths as edges, checkpoints at bridges"
	heroFocal="32% 48%"
>
	{#snippet intro()}
		<p>
			A <Term t="StateGraph" /> is a small state machine you can read like a diagram and step
			through like a debugger. Level 2 swaps the linear pipe of <Term t="LangChain" /> for explicit
			<Term t="Node">nodes</Term>, explicit <Term t="Edge">edges</Term>, and explicit shared
			<Term t="State">state</Term> — the substrate every serious agent eventually grows into.
		</p>
	{/snippet}
</ChapterIntro>
