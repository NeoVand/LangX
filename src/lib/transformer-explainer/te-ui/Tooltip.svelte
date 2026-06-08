<!--
  Minimal drop-in replacement for flowbite-svelte's <Tooltip>, covering the two
  ways the ported Transformer Explainer uses it:
    1. triggeredBy="<css selector>" — attaches (via event delegation, so it works
       for the dynamically re-rendered viz nodes) to every element matching the
       selector and shows the tooltip on hover.
    2. no triggeredBy — attaches to the element immediately preceding the tooltip
       in the DOM (flowbite's default behaviour).
  The floating element is portaled to <body> so transformed ancestors (the block
  animation uses CSS transforms) don't break `position: fixed`. Visual styling of
  the `.popover` / `.tooltip` / `.softmax-tooltip` classes comes from the global
  layout stylesheet (te-layout) — this component only positions + shows/hides.
-->
<script>
	// @ts-nocheck
	import { onMount, onDestroy, tick } from 'svelte';

	export let triggeredBy = undefined;
	export let placement = 'top';
	export let type = 'dark'; // 'light' | 'dark' — styling hook
	let className = '';
	export { className as class };

	let anchor; // hidden marker, used to find the previous sibling
	let tip; // the floating tooltip element
	let visible = false;
	let current = null; // element the tooltip is currently anchored to

	const cleanups = [];

	function place() {
		if (!tip || !current) return;
		const r = current.getBoundingClientRect();
		const t = tip.getBoundingClientRect();
		const gap = 8;
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
		tip.style.top = `${top}px`;
		tip.style.left = `${left}px`;
	}

	async function show(target) {
		current = target;
		visible = true;
		await tick();
		place();
	}
	function hide() {
		visible = false;
		current = null;
	}

	function onOver(e) {
		const t = e.target instanceof Element ? e.target.closest(triggeredBy) : null;
		if (t) show(t);
	}
	function onOut(e) {
		const t = e.target instanceof Element ? e.target.closest(triggeredBy) : null;
		if (t) hide();
	}

	function bindDirect(el) {
		const enter = () => show(el);
		const leave = () => hide();
		el.addEventListener('mouseenter', enter);
		el.addEventListener('mouseleave', leave);
		el.addEventListener('focusin', enter);
		el.addEventListener('focusout', leave);
		cleanups.push(() => {
			el.removeEventListener('mouseenter', enter);
			el.removeEventListener('mouseleave', leave);
			el.removeEventListener('focusin', enter);
			el.removeEventListener('focusout', leave);
		});
	}

	onMount(() => {
		if (triggeredBy) {
			document.addEventListener('mouseover', onOver, true);
			document.addEventListener('mouseout', onOut, true);
			cleanups.push(() => {
				document.removeEventListener('mouseover', onOver, true);
				document.removeEventListener('mouseout', onOut, true);
			});
		} else {
			const prev = anchor?.previousElementSibling;
			if (prev) bindDirect(prev);
		}
		const onScroll = () => hide();
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

<span bind:this={anchor} class="te-tip-anchor" aria-hidden="true"></span>
{#if visible}
	<div bind:this={tip} use:portal class={`te-tip ${className}`} data-type={type} role="tooltip">
		<slot />
	</div>
{/if}

<style>
	.te-tip {
		position: fixed;
		z-index: 99999;
		pointer-events: none;
		max-width: 22rem;
	}
	.te-tip-anchor {
		display: none;
	}
</style>
