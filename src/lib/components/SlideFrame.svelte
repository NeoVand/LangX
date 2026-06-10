<script lang="ts">
	interface Props {
		/** A self-contained HTML fragment designed for a width×height canvas. */
		html: string;
		width?: number;
		height?: number;
		title?: string;
		/** Allow pointer events inside the slide (for the expanded view). */
		interactive?: boolean;
	}
	let { html, width = 960, height = 540, title = 'slide', interactive = false }: Props = $props();

	let frameW = $state(0);
	const scale = $derived(frameW > 0 ? frameW / width : 0);
	// Sandbox: scripts may run, but the CSP meta blocks every network request —
	// a slide must be fully self-contained (the review node enforces the same rule).
	const doc = $derived(
		`<!doctype html><html><head><meta charset="utf-8">` +
			`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:;">` +
			`<style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:#0f1217}</style>` +
			`</head><body>${html}</body></html>`
	);
</script>

<div class="slide-frame" bind:clientWidth={frameW} style="aspect-ratio:{width}/{height}">
	{#if scale > 0}
		<iframe
			srcdoc={doc}
			sandbox="allow-scripts"
			{title}
			class:interactive
			style="width:{width}px;height:{height}px;transform:scale({scale})"
		></iframe>
	{/if}
</div>

<style>
	.slide-frame {
		position: relative;
		width: 100%;
		overflow: hidden;
		border-radius: 0.45rem;
		border: 1px solid var(--color-rule);
		background: var(--color-paper);
	}
	iframe {
		position: absolute;
		top: 0;
		left: 0;
		border: 0;
		transform-origin: top left;
		pointer-events: none;
	}
	iframe.interactive {
		pointer-events: auto;
	}
</style>
