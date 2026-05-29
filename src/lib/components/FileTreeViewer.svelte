<script lang="ts">
	import Markdown from '$lib/components/Markdown.svelte';

	export interface VirtualFile {
		path: string;
		content: string;
		backend?: string;
	}

	interface Props {
		files: VirtualFile[];
		title?: string;
		/** When set (and the file exists), auto-select this path. */
		focus?: string | null;
	}

	let { files, title = 'Virtual filesystem', focus = null }: Props = $props();

	let selected = $state<string | null>(null);
	let lastFocus = $state<string | null>(null);

	const sorted = $derived([...files].sort((a, b) => a.path.localeCompare(b.path)));
	const current = $derived(sorted.find((f) => f.path === selected) ?? sorted[0]);
	const isMarkdown = $derived(!!current && /\.(md|markdown)$/i.test(current.path));

	$effect(() => {
		// Honor an external focus request once per distinct value.
		if (focus && focus !== lastFocus && sorted.some((f) => f.path === focus)) {
			selected = focus;
			lastFocus = focus;
			return;
		}
		if (!current && sorted.length) selected = sorted[0].path;
		if (current && selected !== current.path) selected = current.path;
	});

	const tree = $derived.by(() => {
		const root: TreeNode = { name: '', path: '', children: new Map(), file: null };
		for (const f of sorted) {
			const parts = f.path.split('/').filter(Boolean);
			let node = root;
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (!node.children.has(part)) {
					node.children.set(part, {
						name: part,
						path: '/' + parts.slice(0, i + 1).join('/'),
						children: new Map(),
						file: null
					});
				}
				node = node.children.get(part)!;
				if (i === parts.length - 1) node.file = f;
			}
		}
		return root;
	});

	interface TreeNode {
		name: string;
		path: string;
		children: Map<string, TreeNode>;
		file: VirtualFile | null;
	}

	function flatten(node: TreeNode, depth = 0): { node: TreeNode; depth: number }[] {
		const out: { node: TreeNode; depth: number }[] = [];
		const sorted = Array.from(node.children.values()).sort((a, b) => {
			const aIsDir = a.children.size > 0 && !a.file;
			const bIsDir = b.children.size > 0 && !b.file;
			if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const c of sorted) {
			out.push({ node: c, depth });
			out.push(...flatten(c, depth + 1));
		}
		return out;
	}

	const flat = $derived(flatten(tree));
</script>

<div class="fs">
	<header>
		<h4>{title}</h4>
		<span class="count">{files.length} {files.length === 1 ? 'file' : 'files'}</span>
	</header>
	{#if !files.length}
		<p class="empty">No files yet.</p>
	{:else}
		<div class="layout">
			<ul class="tree scrollbar-slim">
				{#each flat as item (item.node.path)}
					{@const isFile = item.node.file !== null}
					{#if isFile}
						<li>
							<button
								class:selected={selected === item.node.path}
								style:padding-left="{0.5 + item.depth * 0.85}rem"
								onclick={() => (selected = item.node.path)}
							>
								<span class="icon">·</span>
								<span class="name">{item.node.name}</span>
								{#if item.node.file?.backend}
									<span class="backend">{item.node.file.backend}</span>
								{/if}
							</button>
						</li>
					{:else}
						<li class="dir" style:padding-left="{0.5 + item.depth * 0.85}rem">
							<span class="icon">▾</span>
							<span class="name">{item.node.name}</span>
						</li>
					{/if}
				{/each}
			</ul>
			<div class="content scrollbar-slim">
				{#if current}
					<div class="path">{current.path}</div>
					{#if isMarkdown}
						<Markdown source={current.content} />
					{:else}
						<pre>{current.content}</pre>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.fs {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-bg);
		overflow: hidden;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-bg-elev-2);
	}

	h4 {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-fg-faint);
		margin: 0;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}

	.empty {
		font-size: 0.85rem;
		color: var(--color-fg-faint);
		font-style: italic;
		text-align: center;
		padding: 1.25rem 0;
		margin: 0;
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 14rem) 1fr;
		min-height: 9rem;
		max-height: 22rem;
	}

	@media (max-width: 600px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}

	.tree {
		list-style: none;
		padding: 0.4rem 0;
		margin: 0;
		overflow-y: auto;
		border-right: 1px solid var(--color-border);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	.tree button,
	.tree .dir {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.6rem;
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		text-align: left;
	}

	.tree .dir {
		color: var(--color-fg-faint);
	}

	.tree button:hover {
		color: var(--color-fg);
	}

	.tree button.selected {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		color: var(--color-fg);
	}

	.icon {
		opacity: 0.5;
		width: 0.9rem;
		text-align: center;
	}

	.name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.backend {
		font-size: 0.65rem;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.content {
		overflow: auto;
		padding: 0.65rem 0.85rem 0.85rem;
	}

	.path {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent);
		margin-bottom: 0.4rem;
	}

	pre {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-fg);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
