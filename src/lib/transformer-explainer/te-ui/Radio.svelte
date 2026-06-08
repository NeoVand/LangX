<!-- Minimal drop-in for flowbite-svelte <Radio>: a labelled radio input.
     Forwards on:click / on:change; `inline` and `color` are accepted for API
     parity (styling comes from the consumer's class). -->
<script>
	// @ts-nocheck
	export let value = undefined;
	export let name = undefined;
	export let checked = false;
	export let disabled = false;
	export let inline = false;
	export let color = undefined;
	let className = '';
	export { className as class };
	inline;
	color;
</script>

<label class={`te-radio ${className}`} class:disabled>
	<input type="radio" {name} {value} {checked} {disabled} on:click on:change />
	<slot />
</label>

<style>
	.te-radio {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.te-radio.disabled {
		cursor: default;
		opacity: 0.6;
	}
</style>
