<script lang="ts">
	import { ICONS, type IconName } from './icons';

	interface Props {
		name: IconName;
		size?: number;
		stroke?: number;
		class?: string;
		label?: string;
	}

	let { name, size = 18, stroke = 1.7, class: cls = '', label }: Props = $props();
</script>

<svg
	class="icon {cls}"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html ICONS[name]}
</svg>

<style>
	.icon {
		display: inline-block;
		flex-shrink: 0;
		vertical-align: middle;
	}
</style>
