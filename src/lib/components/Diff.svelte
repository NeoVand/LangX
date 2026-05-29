<script lang="ts">
	import { diffLines } from 'diff';

	interface Props {
		before: string;
		after: string;
		path?: string;
	}

	let { before, after, path }: Props = $props();

	type Row = { type: 'add' | 'del' | 'ctx'; text: string };

	const rows = $derived.by<Row[]>(() => {
		const parts = diffLines(before ?? '', after ?? '');
		const out: Row[] = [];
		for (const part of parts) {
			const type: Row['type'] = part.added ? 'add' : part.removed ? 'del' : 'ctx';
			const lines = part.value.replace(/\n$/, '').split('\n');
			for (const line of lines) out.push({ type, text: line });
		}
		return out;
	});

	const stats = $derived.by(() => {
		let add = 0;
		let del = 0;
		for (const r of rows) {
			if (r.type === 'add') add += 1;
			else if (r.type === 'del') del += 1;
		}
		return { add, del };
	});
</script>

<figure class="diff code-surface">
	<figcaption class="code-surface-footer">
		<span class="path">{path ?? 'diff'}</span>
		<span class="stat add">+{stats.add}</span>
		<span class="stat del">−{stats.del}</span>
	</figcaption>
	<pre class="scrollbar-slim"><code>{#each rows as r, i (i)}<span class="line {r.type}"
				><span class="gutter">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span
				>{r.text}
</span>{/each}</code></pre>
</figure>

<style>
	.diff {
		margin: 0;
	}

	figcaption {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.55rem 1.3rem 0.65rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.path {
		color: var(--color-fg-muted);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stat.add {
		color: #4caf7d;
	}
	.stat.del {
		color: #e07a72;
	}
	pre {
		margin: 0;
		padding: 1rem 1.3rem 1.15rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		max-height: 20rem;
		overflow: auto;
	}
	.line {
		display: block;
		padding: 0 0.15rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.line .gutter {
		display: inline-block;
		width: 1rem;
		color: var(--color-fg-faint);
		user-select: none;
	}
	.line.add {
		background: color-mix(in oklch, #4caf7d 16%, transparent);
	}
	.line.del {
		background: color-mix(in oklch, #e07a72 16%, transparent);
	}
	.line.add .gutter {
		color: #4caf7d;
	}
	.line.del .gutter {
		color: #e07a72;
	}
</style>
