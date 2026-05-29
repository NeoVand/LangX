<script lang="ts">
	import ChapterRecap from '$lib/components/ChapterRecap.svelte';
	import { harnessLayers } from '$lib/diagrams';
</script>

<ChapterRecap
	chapterId="deepagents"
	blurb="You built the cognitive harness end to end: the middleware-assembled agent, a virtual filesystem, externalized planning, swappable backends, filesystem permissions, subagent delegation, progressive-disclosure skills, context compaction, human-in-the-loop review, and two full capstones."
	diagram={harnessLayers}
	complete
/>
