<script lang="ts">
	import type { TraceEvent } from '$lib/runtime/tracer/types';

	interface Props {
		events: TraceEvent[];
	}

	let { events }: Props = $props();

	interface Span {
		name: string;
		start: number;
		end: number | null;
		summary?: string;
	}

	const spans = $derived.by(() => {
		const out: Span[] = [];
		const open = new Map<string, Span>();
		for (const ev of events) {
			if (ev.kind === 'subagent_spawn') {
				const name = (ev.data?.name as string) ?? ev.label;
				const span: Span = { name, start: ev.t, end: null };
				out.push(span);
				open.set(name, span);
			} else if (ev.kind === 'subagent_return') {
				const name = (ev.data?.name as string) ?? ev.label;
				const span = open.get(name);
				if (span) {
					span.end = ev.t;
					span.summary = (ev.data?.summary as string) ?? '';
					open.delete(name);
				}
			}
		}
		return out;
	});

	const t0 = $derived(spans.length ? spans[0].start : Date.now());
	const tNow = $derived.by(() => {
		const last = events[events.length - 1];
		return last ? last.t : t0;
	});
	const span = $derived(Math.max(1, tNow - t0));
</script>

<div class="timeline">
	<header>
		<h4>Subagent timeline</h4>
		<span class="figure">{spans.length} {spans.length === 1 ? 'spawn' : 'spawns'}</span>
	</header>
	{#if !spans.length}
		<p class="empty">No subagents have been spawned yet.</p>
	{:else}
		<ul>
			{#each spans as s, i (i)}
				{@const left = ((s.start - t0) / span) * 100}
				{@const widthPct =
					(((s.end ?? tNow) - s.start) / span) * 100}
				<li>
					<span class="name">{s.name}</span>
					<div class="track">
						<div
							class="bar"
							class:open={!s.end}
							style:left="{left}%"
							style:width="max(2%, {widthPct}%)"
						></div>
					</div>
					<span class="dur">
						{((s.end ?? tNow) - s.start)}ms{!s.end ? '…' : ''}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.timeline {
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

	.figure {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
	}

	.empty {
		font-size: 0.82rem;
		color: var(--color-fg-faint);
		padding: 0.85rem 1rem;
		margin: 0;
		font-style: italic;
	}

	ul {
		list-style: none;
		padding: 0.4rem 0.7rem;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	li {
		display: grid;
		grid-template-columns: 7rem 1fr 4rem;
		gap: 0.5rem;
		align-items: center;
		font-size: 0.78rem;
	}

	.name {
		font-family: var(--font-mono);
		color: var(--color-fg);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track {
		position: relative;
		height: 10px;
		background: var(--color-bg-elev-2);
		border-radius: 0.3rem;
		overflow: hidden;
	}

	.bar {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent);
		border-radius: 0.3rem;
	}

	.bar.open {
		background: linear-gradient(
			90deg,
			var(--accent),
			color-mix(in oklch, var(--accent) 50%, var(--color-bg))
		);
	}

	.dur {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-fg-faint);
		text-align: right;
	}
</style>
