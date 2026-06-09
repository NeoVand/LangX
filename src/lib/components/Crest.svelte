<script lang="ts">
	import { PALETTES, CHARGES } from '$lib/demos/lg-interrupts';

	interface Props {
		palette?: string;
		pattern?: string;
		charge?: string;
		motto?: string;
		/** Pulse the shield while a proposal is pending review. */
		pulse?: boolean;
		size?: number;
	}
	let { palette = '', pattern = '', charge = '', motto = '', pulse = false, size = 216 }: Props = $props();

	const primary = $derived((PALETTES[palette] ?? { primary: '#3a3f47' }).primary);
	const secondary = $derived((PALETTES[palette] ?? { secondary: '#5a616b' }).secondary);
	const emoji = $derived(CHARGES[charge] ?? '');

	// Heater-shield outline (viewBox 0 0 100 120).
	const SHIELD = 'M12 6 L88 6 L88 58 Q88 92 50 114 Q12 92 12 58 Z';
	const clipId = 'crest-clip-' + Math.random().toString(36).slice(2, 8);
</script>

<div class="crest" class:pulse style="--sz:{size}px">
	<svg viewBox="0 0 100 120" role="img" aria-label="heraldic crest">
		<defs>
			<clipPath id={clipId}><path d={SHIELD} /></clipPath>
		</defs>

		<g clip-path="url(#{clipId})">
			{#if !palette}
				<rect x="0" y="0" width="100" height="120" fill="#2a2e35" />
			{:else if pattern === 'per pale'}
				<rect x="0" y="0" width="50" height="120" fill={primary} />
				<rect x="50" y="0" width="50" height="120" fill={secondary} />
			{:else if pattern === 'per fess'}
				<rect x="0" y="0" width="100" height="60" fill={primary} />
				<rect x="0" y="60" width="100" height="60" fill={secondary} />
			{:else if pattern === 'quarterly'}
				<rect x="0" y="0" width="50" height="60" fill={primary} />
				<rect x="50" y="0" width="50" height="60" fill={secondary} />
				<rect x="0" y="60" width="50" height="60" fill={secondary} />
				<rect x="50" y="60" width="50" height="60" fill={primary} />
			{:else if pattern === 'chevron'}
				<rect x="0" y="0" width="100" height="120" fill={primary} />
				<polygon points="50,40 92,82 92,98 50,56 8,98 8,82" fill={secondary} />
			{:else if pattern === 'bordure'}
				<rect x="0" y="0" width="100" height="120" fill={secondary} />
				<path d={SHIELD} fill={primary} transform="translate(50 56) scale(0.82) translate(-50 -56)" />
			{:else}
				<rect x="0" y="0" width="100" height="120" fill={primary} />
			{/if}
		</g>

		<path class="rim" d={SHIELD} fill="none" />

		{#if emoji}
			<text class="charge" x="50" y="56" text-anchor="middle" dominant-baseline="central">{emoji}</text>
		{/if}
	</svg>

	{#if motto}
		<div class="ribbon"><span>{motto}</span></div>
	{:else}
		<div class="ribbon empty"><span>—</span></div>
	{/if}
</div>

<style>
	.crest {
		width: var(--sz);
		max-width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.5));
	}
	.rim {
		stroke: var(--accent);
		stroke-width: 3;
		stroke-linejoin: round;
	}
	.charge {
		font-size: 38px;
	}
	.crest.pulse svg {
		animation: crest-pulse 1.4s ease-in-out infinite;
	}
	@keyframes crest-pulse {
		50% {
			filter: drop-shadow(0 0 10px var(--accent));
		}
	}

	.ribbon {
		position: relative;
		margin-top: -10px;
		padding: 0.28rem 1.5rem;
		background: linear-gradient(180deg, color-mix(in oklch, var(--accent) 88%, #fff 12%), var(--accent));
		color: #1a1206;
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-align: center;
		max-width: 132%;
		clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
		box-shadow: 0 4px 10px -4px rgba(0, 0, 0, 0.6);
	}
	.ribbon.empty {
		background: var(--color-bg-elev-2);
		color: var(--color-fg-faint);
	}
	.ribbon span {
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
