<script lang="ts">
	import type { ChainEvent } from '$lib/demos/runnables-pipe';

	let { events }: { events: ChainEvent[] } = $props();

	type Row =
		| { kind: 'mark'; event: string; name: string; ms: number }
		| { kind: 'stream'; name: string; tokens: number; text: string; ms: number };

	// In a pipe, every token is re-emitted by each Runnable (model → parser →
	// sequence). We keep the model's token stream as one growing row and drop the
	// duplicate propagation events, so the timeline reads as a clean lifecycle.
	const rows = $derived.by(() => {
		const out: Row[] = [];
		for (const e of events) {
			if (e.event === 'on_chat_model_stream') {
				const last = out[out.length - 1];
				if (last && last.kind === 'stream') {
					last.tokens += 1;
					last.text += e.chunk ?? '';
					last.ms = e.ms;
				} else {
					out.push({ kind: 'stream', name: e.name, tokens: 1, text: e.chunk ?? '', ms: e.ms });
				}
			} else if (e.event.endsWith('_stream')) {
				// duplicate of a model token flowing downstream — skip.
				continue;
			} else {
				out.push({ kind: 'mark', event: e.event, name: e.name, ms: e.ms });
			}
		}
		return out;
	});

	// on_chain_start → "start", on_chat_model_end → "end", etc.
	function shortEvent(event: string): string {
		return event.replace(/^on_/, '').replace(/_/g, ' ');
	}

	// The real compiled structure: the Runnables that fired, in order, minus the
	// outer RunnableSequence container — i.e. prompt → model → parser.
	const nodes = $derived.by(() => {
		const out: string[] = [];
		for (const e of events) {
			if (!e.event.endsWith('_start') || e.name === 'RunnableSequence') continue;
			if (out.includes(e.name)) continue;
			out.push(e.name);
		}
		return out;
	});
</script>

{#if nodes.length}
	<div class="structure">
		{#each nodes as n, i (n)}
			{#if i > 0}<span class="arrow">→</span>{/if}
			<span class="node">{n}</span>
		{/each}
	</div>
{/if}

<ol class="timeline">
	{#each rows as r, i (i)}
		{#if r.kind === 'mark'}
			<li class="ev">
				<span class="dot" class:start={r.event.endsWith('_start')} class:end={r.event.endsWith('_end')}></span>
				<span class="ev-name">{shortEvent(r.event)}</span>
				<span class="ev-src">{r.name}</span>
				<span class="ev-ms">{r.ms} ms</span>
			</li>
		{:else}
			<li class="ev stream">
				<span class="dot tok"></span>
				<span class="ev-name">{r.tokens} tokens</span>
				<span class="ev-src">{r.name}</span>
				<span class="ev-ms">{r.ms} ms</span>
				<div class="stream-text">{r.text}</div>
			</li>
		{/if}
	{/each}
</ol>

<style>
	.structure {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
	}
	.node {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.2rem 0.55rem;
		border-radius: 0.4rem;
		background: var(--color-paper);
		color: var(--color-ink-100);
		border: 1px solid var(--accent-rule);
	}
	.arrow {
		color: var(--accent);
		font-size: 0.8rem;
	}
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.ev {
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--color-ink-300);
	}
	.dot.start {
		background: color-mix(in oklch, var(--accent) 60%, transparent);
	}
	.dot.end {
		background: var(--accent);
	}
	.dot.tok {
		background: var(--color-ink-200);
	}
	.ev-name {
		color: var(--color-ink-100);
		white-space: nowrap;
	}
	.ev-src {
		color: var(--color-ink-300);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ev-ms {
		color: var(--accent);
		white-space: nowrap;
	}
	.stream-text {
		grid-column: 2 / -1;
		margin-top: 0.2rem;
		font-family: var(--font-prose);
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--color-ink-200);
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
