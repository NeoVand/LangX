<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import Term from '$lib/components/Term.svelte';
	import { deepagentsOverview } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="deepagents"
	diagram={deepagentsOverview}
	complete
>
	{#snippet blurb()}
		You built the cognitive <Term t="Harness">harness</Term> end to end: the <Term t="Middleware">middleware</Term>-assembled agent, a <Term t="Virtual filesystem">virtual filesystem</Term>, externalized <Term t="Planning">planning</Term> via <Term t="write_todos"><code>write_todos</code></Term>, swappable <Term t="Backend">backends</Term>, filesystem <Term t="Permissions">permissions</Term>, <Term t="Subagent">subagent</Term> delegation via <Term t="task"><code>task</code></Term>, <Term t="Progressive disclosure">progressive-disclosure</Term> <Term t="Skill">skills</Term>, <Term t="Context compaction">context compaction</Term>, <Term t="HITL">human-in-the-loop</Term> review, and two full <Term t="Capstone">capstones</Term>.
	{/snippet}
</ChapterRecap>
