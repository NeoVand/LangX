<!--
  Minimal drop-in for flowbite-svelte <Dropdown bind:open>. Attaches to the
  element immediately preceding it (the trigger button), toggling on click, and
  closes on outside-click. The menu is portaled to <body> and positioned under
  the trigger. Items are passed as the default slot (see DropdownItem).
-->
<script>
	// @ts-nocheck
	import { onMount, onDestroy, tick } from 'svelte';

	export let open = false;
	let className = '';
	export { className as class };

	let anchor;
	let menu;
	let trigger;
	const cleanups = [];

	function place() {
		if (!menu || !trigger) return;
		const r = trigger.getBoundingClientRect();
		menu.style.top = `${r.bottom + 4}px`;
		menu.style.left = `${r.left}px`;
		menu.style.minWidth = `${r.width}px`;
	}

	function onDocClick(e) {
		if (!open) return;
		if (menu && menu.contains(e.target)) return;
		if (trigger && trigger.contains(e.target)) return;
		open = false;
	}

	$: if (open) tick().then(place);

	onMount(() => {
		trigger = anchor?.previousElementSibling;
		const toggle = (e) => {
			e.stopPropagation();
			open = !open;
		};
		if (trigger) {
			trigger.addEventListener('click', toggle);
			cleanups.push(() => trigger.removeEventListener('click', toggle));
		}
		document.addEventListener('click', onDocClick, true);
		const onScroll = () => {
			if (open) place();
		};
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onScroll);
		cleanups.push(() => document.removeEventListener('click', onDocClick, true));
		cleanups.push(() => window.removeEventListener('scroll', onScroll, true));
		cleanups.push(() => window.removeEventListener('resize', onScroll));
	});

	onDestroy(() => cleanups.forEach((off) => off()));

	function portal(node) {
		(document.querySelector('.te-portal-root') ?? document.body).appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}
</script>

<span bind:this={anchor} class="te-dd-anchor" aria-hidden="true"></span>
{#if open}
	<div bind:this={menu} use:portal class={`te-dropdown ${className}`} role="menu">
		<slot />
	</div>
{/if}

<style>
	.te-dropdown {
		position: fixed;
		z-index: 99999;
		max-height: 60vh;
		overflow-y: auto;
	}
	.te-dd-anchor {
		display: none;
	}
</style>
