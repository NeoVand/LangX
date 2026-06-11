<script lang="ts">
	import {
		TOTAL_STEPS,
		STEPS_PER_BAR,
		PART_RANGES,
		parsePitch,
		type ScoreNote,
		type DrumHit
	} from '$lib/demos/music';

	interface Props {
		label: string;
		melody?: ScoreNote[];
		bass?: ScoreNote[];
		bells?: ScoreNote[];
		drums?: DrumHit[];
		/** Current playback step (0–31) or null when silent. */
		playhead?: number | null;
	}
	let { label, melody = [], bass = [], bells = [], drums = [], playhead = null }: Props = $props();

	const STEP_W = 14;
	const LEFT = 10;
	const GRID_W = TOTAL_STEPS * STEP_W;
	const W = GRID_W + LEFT * 2;

	interface Lane {
		key: 'bells' | 'melody' | 'bass';
		title: string;
		wright: string;
		y: number;
		h: number;
		lo: number;
		hi: number;
		notes: ScoreNote[];
	}

	const TOP = 26;
	const laneDefs = $derived.by((): Lane[] => {
		const mk = (
			key: Lane['key'],
			title: string,
			wright: string,
			y: number,
			h: number,
			notes: ScoreNote[]
		): Lane => ({
			key,
			title,
			wright,
			y,
			h,
			lo: parsePitch(PART_RANGES[key].low)!.midi,
			hi: parsePitch(PART_RANGES[key].high)!.midi,
			notes
		});
		return [
			mk('bells', 'bells', 'arranger', TOP, 46, bells),
			mk('melody', 'melody', 'melody-wright', TOP + 50, 86, melody),
			mk('bass', 'bass', 'bass-wright', TOP + 140, 56, bass)
		];
	});

	const DRUM_Y = TOP + 200;
	const DRUM_H = 58;
	const H = DRUM_Y + DRUM_H + 10;
	const DRUM_ROWS = { hat: DRUM_Y + 12, snare: DRUM_Y + 28, kick: DRUM_Y + 44 } as const;

	function noteY(lane: Lane, pitch: string): number {
		const p = parsePitch(pitch);
		if (!p) return lane.y + lane.h / 2;
		const t = (p.midi - lane.lo) / (lane.hi - lane.lo);
		return lane.y + 6 + (1 - t) * (lane.h - 16);
	}
</script>

<figure class="roll">
	<figcaption>{label}</figcaption>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label="Piano roll of {label}">
		<!-- step grid -->
		{#each Array.from({ length: TOTAL_STEPS + 1 }, (_, i) => i) as i (i)}
			<line
				x1={LEFT + i * STEP_W}
				y1={TOP - 4}
				x2={LEFT + i * STEP_W}
				y2={H - 6}
				class="grid"
				class:beat={i % 4 === 0}
				class:bar={i % STEPS_PER_BAR === 0}
			/>
		{/each}

		{#each laneDefs as lane (lane.key)}
			<line x1={LEFT} y1={lane.y} x2={LEFT + GRID_W} y2={lane.y} class="rule" />
			<text x={LEFT + 2} y={lane.y + 11} class="lane-name">{lane.title}</text>
			{#if lane.notes.length === 0}
				<text x={LEFT + GRID_W / 2} y={lane.y + lane.h / 2 + 4} class="awaiting">
					{lane.key === 'bells' ? 'no bells — unless the arranger is asked' : `awaiting the ${lane.wright}…`}
				</text>
			{:else}
				{#each lane.notes as n, i (i)}
					<rect
						x={LEFT + n.step * STEP_W + 1}
						y={noteY(lane, n.pitch)}
						width={n.dur * STEP_W - 3}
						height="9"
						rx="2.5"
						class="note {lane.key}"
					/>
				{/each}
			{/if}
		{/each}

		<!-- drums -->
		<line x1={LEFT} y1={DRUM_Y} x2={LEFT + GRID_W} y2={DRUM_Y} class="rule" />
		<text x={LEFT + 2} y={DRUM_Y + 11} class="lane-name">clockwork</text>
		{#if drums.length === 0}
			<text x={LEFT + GRID_W / 2} y={DRUM_Y + DRUM_H / 2 + 4} class="awaiting">
				awaiting the drum-wright…
			</text>
		{:else}
			{#each drums as h, i (i)}
				{#if h.drum === 'kick'}
					<rect
						x={LEFT + h.step * STEP_W + 3}
						y={DRUM_ROWS.kick - 5}
						width={STEP_W - 6}
						height="10"
						rx="2"
						class="hit kick"
					/>
				{:else if h.drum === 'snare'}
					<path
						d="M {LEFT + h.step * STEP_W + 3} {DRUM_ROWS.snare - 4} l 8 8 m 0 -8 l -8 8"
						class="hit snare"
					/>
				{:else}
					<circle cx={LEFT + h.step * STEP_W + STEP_W / 2} cy={DRUM_ROWS.hat} r="2.6" class="hit hat" />
				{/if}
			{/each}
		{/if}

		{#if playhead != null && playhead >= 0 && playhead < TOTAL_STEPS}
			<rect
				x={LEFT + playhead * STEP_W}
				y={TOP - 4}
				width={STEP_W}
				height={H - TOP - 2}
				class="playhead"
			/>
		{/if}

		<!-- bar labels -->
		{#each Array.from({ length: TOTAL_STEPS / STEPS_PER_BAR }, (_, b) => b) as b (b)}
			<text x={LEFT + b * STEPS_PER_BAR * STEP_W} y={TOP - 10} class="bar-label">bar {b + 1}</text>
		{/each}
	</svg>
</figure>

<style>
	.roll {
		margin: 0;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-paper);
		padding: 0.6rem 0.7rem 0.4rem;
	}
	figcaption {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-fg-faint);
		margin-bottom: 0.35rem;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.grid {
		stroke: color-mix(in oklch, var(--color-rule) 35%, transparent);
		stroke-width: 1;
	}
	.grid.beat {
		stroke: color-mix(in oklch, var(--color-rule) 60%, transparent);
	}
	.grid.bar {
		stroke: var(--color-rule);
		stroke-width: 1.5;
	}
	.rule {
		stroke: var(--color-rule);
		stroke-width: 1;
	}
	.lane-name,
	.bar-label {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		fill: var(--color-fg-faint);
	}
	.awaiting {
		font-size: 11px;
		font-style: italic;
		fill: color-mix(in oklch, var(--color-fg-faint) 75%, transparent);
		text-anchor: middle;
	}
	.note {
		stroke: color-mix(in oklch, var(--color-ink-0) 70%, transparent);
		stroke-width: 0.5;
	}
	.note.melody {
		fill: var(--accent);
	}
	.note.bass {
		fill: var(--color-cream-3);
	}
	.note.bells {
		fill: color-mix(in oklch, var(--accent) 55%, var(--color-cream-0));
	}
	.hit.kick {
		fill: var(--color-cream-2);
	}
	.hit.snare {
		stroke: var(--color-cream-2);
		stroke-width: 2;
		fill: none;
	}
	.hit.hat {
		fill: var(--color-cream-4);
	}
	.playhead {
		fill: color-mix(in oklch, var(--accent) 22%, transparent);
		stroke: var(--accent);
		stroke-width: 0.75;
	}
</style>
