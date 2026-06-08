<!-- Minimal drop-in for flowbite-svelte <ButtonGroup>: an inline flex wrapper.
     `size` is accepted for API parity but unused (sizing comes from the class). -->
<script>
	// @ts-nocheck
	let className = '';
	export { className as class };
	export let size = undefined;
	size;
</script>

<div class={`te-btn-group ${className}`} role="group">
	<slot />
</div>

<style>
	.te-btn-group {
		display: inline-flex;
		align-items: stretch;
	}
</style>
