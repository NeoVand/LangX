<!--
  Minimal drop-in for flowbite-svelte <Popover>, as used by CommonPopover (the
  "help" popovers). Attaches to the preceding element (or a triggeredBy selector),
  shows on hover or click, renders an optional title + slot, and dispatches a
  `show` event with detail=true on open / detail=false on close (matching the
  flowbite event the ported code listens for). Portaled to <body>.
-->
<script>
	// @ts-nocheck
	import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';

	export let placement = 'right';
	export let title = undefined;
	export let trigger = 'hover';
	export let triggeredBy = undefined;
	export let offset = 8;
	export let arrow = true;
	export let reference = undefined;
	let className = '';
	export { className as class };
	// swallow unused-but-passed props so they don't land on the DOM
	reference;
	arrow;

	const dispatch = createEventDispatcher();

	let anchor;
	let pop;
	let visible = false;
	let current = null;
	const cleanups = [];

	function place() {
		if (!pop || !current) return;
		const r = current.getBoundingClientRect();
		const t = pop.getBoundingClientRect();
		const gap = Math.max(4, offset);
		let top, left;
		if (placement === 'right') {
			top = r.top + r.height / 2 - t.height / 2;
			left = r.right + gap;
		} else if (placement === 'left') {
			top = r.top + r.height / 2 - t.height / 2;
			left = r.left - t.width - gap;
		} else if (placement === 'bottom') {
			top = r.bottom + gap;
			left = r.left + r.width / 2 - t.width / 2;
		} else {
			top = r.top - t.height - gap;
			left = r.left + r.width / 2 - t.width / 2;
		}
		left = Math.min(Math.max(4, left), window.innerWidth - t.width - 4);
		top = Math.min(Math.max(4, top), window.innerHeight - t.height - 4);
		pop.style.top = `${top}px`;
		pop.style.left = `${left}px`;
	}

	async function open(target) {
		current = target;
		visible = true;
		dispatch('show', true);
		await tick();
		place();
	}
	function close() {
		if (!visible) return;
		visible = false;
		current = null;
		dispatch('show', false);
	}

	function attach(el) {
		if (trigger === 'click') {
			const onClick = () => (visible ? close() : open(el));
			el.addEventListener('click', onClick);
			cleanups.push(() => el.removeEventListener('click', onClick));
		} else {
			const enter = () => open(el);
			const leave = () => close();
			el.addEventListener('mouseenter', enter);
			el.addEventListener('mouseleave', leave);
			cleanups.push(() => {
				el.removeEventListener('mouseenter', enter);
				el.removeEventListener('mouseleave', leave);
			});
		}
	}

	function onOver(e) {
		const t = e.target instanceof Element ? e.target.closest(triggeredBy) : null;
		if (t) open(t);
	}
	function onOut(e) {
		const t = e.target instanceof Element ? e.target.closest(triggeredBy) : null;
		if (t) close();
	}

	onMount(() => {
		if (triggeredBy && trigger !== 'click') {
			document.addEventListener('mouseover', onOver, true);
			document.addEventListener('mouseout', onOut, true);
			cleanups.push(() => {
				document.removeEventListener('mouseover', onOver, true);
				document.removeEventListener('mouseout', onOut, true);
			});
		} else {
			const prev = anchor?.previousElementSibling;
			if (prev) attach(prev);
		}
		const onScroll = () => close();
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onScroll);
		cleanups.push(() => {
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onScroll);
		});
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

<span bind:this={anchor} class="te-pop-anchor" aria-hidden="true"></span>
{#if visible}
	<div bind:this={pop} use:portal class={`te-popover ${className}`} role="tooltip" {...$$restProps}>
		{#if title}<div class="te-popover-title">{title}</div>{/if}
		<slot />
	</div>
{/if}

<style>
	.te-popover {
		position: fixed;
		z-index: 99999;
		max-width: 24rem;
	}
	.te-pop-anchor {
		display: none;
	}
</style>
