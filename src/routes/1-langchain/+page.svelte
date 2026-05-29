<script lang="ts">
	import ChapterIntro from '$lib/components/ChapterIntro.svelte';
	import Term from '$lib/components/Term.svelte';
</script>

<ChapterIntro
	id="langchain"
	heroId="chapter-langchain-hero"
	heroAlt="Cross-section of a brass pipe organ — LangChain, the pipeline"
	heroFocal="28% 50%"
>
	{#snippet intro()}
		<p>
			<Term t="LangChain" /> is the foundation layer: small, composable primitives —
			<Term t="Prompt">prompts</Term>, <Term t="Model">models</Term>,
			<Term t="Parser">parsers</Term>, <Term t="tool">tools</Term>,
			<Term t="Retriever">retrievers</Term> — that all speak the same
			<Term t="Runnable" /> protocol (<Term t="LCEL" />). Master these six lessons and every
			later chapter — <Term t="LangGraph" />, <Term t="Deep Agent">Deep Agents</Term> — is a
			recombination of <Term t="Chain">chains</Term>, <Term t="RAG" />, and
			<Term t="Agent">agents</Term>.
		</p>
	{/snippet}
</ChapterIntro>
