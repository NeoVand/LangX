<!-- Minimal drop-in for flowbite-svelte <Card>: a styled container div. -->
<script>
	// @ts-nocheck
	let className = '';
	export { className as class };
</script>

<div class={`te-card ${className}`} {...$$restProps}>
	<slot />
</div>

<style>
	.te-card {
		border-radius: 0.5rem;
	}
</style>
