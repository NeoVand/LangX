<script lang="ts">
	interface Props {
		code: string;
		lang?: string;
		caption?: string;
	}

	let { code, lang = 'ts', caption }: Props = $props();

	let copied = $state(false);

	function copy() {
		navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<figure class="code">
	<pre><code class="lang-{lang}">{code}</code></pre>
	<button class="copy" onclick={copy} aria-label="Copy code">
		{copied ? 'copied' : 'copy'}
	</button>
	{#if caption}
		<figcaption>{caption}</figcaption>
	{/if}
</figure>

<style>
	.code {
		position: relative;
		margin: 1.25rem 0;
	}

	pre {
		background: var(--color-bg-elev-2);
		border: 1px solid var(--color-border);
		border-radius: 0.55rem;
		padding: 0.85rem 1rem;
		overflow-x: auto;
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--color-fg);
	}

	code {
		font-family: var(--font-mono);
	}

	.copy {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.3rem;
		background: var(--color-bg-elev);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border);
		font-family: var(--font-mono);
		opacity: 0;
		transition: opacity 0.15s;
	}

	.code:hover .copy,
	.copy:focus {
		opacity: 1;
	}

	figcaption {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
		margin-top: 0.4rem;
		text-align: right;
	}
</style>
