<!-- Minimal drop-in for flowbite-svelte <DropdownItem>: a clickable menu row.
     Forwards on:click and any rest props (e.g. data-click). -->
<script>
	// @ts-nocheck
	let className = '';
	export { className as class };
</script>

<button type="button" class={`te-dropdown-item ${className}`} on:click {...$$restProps}>
	<slot />
</button>

<style>
	.te-dropdown-item {
		display: block;
		width: 100%;
		text-align: left;
		cursor: pointer;
		background: none;
		border: none;
	}
</style>
