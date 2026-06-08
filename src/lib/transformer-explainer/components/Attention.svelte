<script lang="ts">
	// @ts-nocheck
	import HeadStack from '$lib/transformer-explainer/components/HeadStack.svelte';
	import {
		tokens,
		modelMeta,
		headContentHeight,
		expandedBlock,
		headGap,
		hoveredMatrixCell,
		attentionHeadIdx
	} from '$lib/transformer-explainer/store';
	import classNames from 'classnames';
	import AttentionMatrix from '$lib/transformer-explainer/components/AttentionMatrix.svelte';

	import { setContext, getContext } from 'svelte';
	import { Tooltip } from '$lib/transformer-explainer/te-ui';
	import { onClickReadMore } from '$lib/transformer-explainer/utils/event';
	import TextbookTooltip from './common/TextbookTooltip.svelte';

	export let className: string | undefined = undefined;

	setContext('block-id', 'attention');
	const blockId = getContext('block-id');
	$: isAttentionExpanded = $expandedBlock.id === blockId;

	const queryHeadVectorColor = 'bg-blue-400';
	const keyHeadVectorColor = 'bg-red-400';
	const valHeadVectorColor = 'bg-green-400';

	const outputVectorColor = 'bg-purple-500';

	let isHovered = false;

	function handleMouseEnter() {
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
	}
</script>

<div
	class={classNames('attention', className, {
		expanded: isAttentionExpanded
	})}
	data-click="attention-step"
>
	<div
		class="title"
		on:mouseenter={handleMouseEnter}
		on:mouseleave={handleMouseLeave}
		role="group"
		data-click="attention-step-title"
	>
		<div class="w-max">
			<TextbookTooltip id="self-attention">Multi-head Self Attention</TextbookTooltip>
		</div>
	</div>
	<div class="content relative">
		<div
			class="bounding attention-bounding"
			class:active={isHovered && !isAttentionExpanded}
			style={`padding-bottom:${$modelMeta.attention_head_num * headGap.y}px`}
		></div>
		<div class="heads">
			<HeadStack>
				<div
					class="head-block flex w-full items-center justify-between px-2"
					style={`height:${$headContentHeight}px;`}
				>
					<div class="qkv flex h-full flex-col justify-center gap-[5rem] pl-[6rem]">
						<div class="column key">
							<div class="head1 title"><TextbookTooltip id="qkv">Key</TextbookTooltip></div>

							{#each $tokens as token, index}
								<div
									class="head1 key cell x1-12 text-xs"
									class:last={index === $tokens.length - 1}
									class:active={$hoveredMatrixCell.col === index}
								>
									<span class="label float">{token}</span>
									<div class={`vector x1-12 ${keyHeadVectorColor}`}></div>
								</div>
							{/each}
							<Tooltip class="popover" triggeredBy={'.step.attention .key .cell'} placement="right"
								>Key, Head {$attentionHeadIdx + 1}, vector({$modelMeta.dimension /
									$modelMeta.attention_head_num})</Tooltip
							>
						</div>
						<div class="column query">
							<div class="head1 title"><TextbookTooltip id="qkv">Query</TextbookTooltip></div>
							{#each $tokens as token, index}
								<div
									class="head1 cell x1-12 query text-xs"
									class:last={index === $tokens.length - 1}
									class:active={$hoveredMatrixCell.row === index}
								>
									<span class="label float">{token}</span>
									<div class={`vector x1-12  ${queryHeadVectorColor}`}></div>
								</div>
							{/each}
							<Tooltip
								class="popover"
								triggeredBy={'.step.attention .query .cell'}
								placement="right"
								>Query, Head {$attentionHeadIdx + 1}, vector({$modelMeta.dimension /
									$modelMeta.attention_head_num})</Tooltip
							>
						</div>
						<div class="column value">
							<div class="head1 title"><TextbookTooltip id="qkv">Value</TextbookTooltip></div>
							{#each $tokens as token, index}
								<div class="head1 cell x1-12 text-xs" class:last={index === $tokens.length - 1}>
									<span class="label float">{token}</span>
									<div class={`vector x1-12 ${valHeadVectorColor}`}></div>
								</div>
							{/each}
							<Tooltip
								class="popover"
								triggeredBy={'.step.attention .value .cell'}
								placement="right"
								>Value, Head {$attentionHeadIdx + 1}, vector({$modelMeta.dimension /
									$modelMeta.attention_head_num})</Tooltip
							>
						</div>
					</div>
					<div class="resize-watch attention-matrix flex">
						<AttentionMatrix />
					</div>
					<div class="head-out mx-[2rem]">
						<div class="column out">
							<div class="head1 title">
								<TextbookTooltip id="output-concatenation">Out</TextbookTooltip>
							</div>
							{#each $tokens as token, index}
								<div class="head1 cell x1-12" class:last={index === $tokens.length - 1}>
									<div class={`vector x1-12 ${outputVectorColor}`}></div>
								</div>
							{/each}
							<Tooltip class="popover" triggeredBy={'.step.attention .out .cell'} placement="right"
								>Attention Out, Head 1, vector({$modelMeta.dimension /
									$modelMeta.attention_head_num})</Tooltip
							>
						</div>
					</div>
				</div>
			</HeadStack>
		</div>
	</div>
</div>

<style lang="scss">
	.attention-matrix,
	.head-title {
		z-index: 102;
	}
	.attention {
		> .title > div {
			// cursor: help;
		}
		&.expanded {
			.title,
			:global(.head-content) {
				z-index: 900;
			}
			:global(.multi-head .head-card:first-child) {
				z-index: 900 !important;
			}
		}

		.attention-bounding {
			top: -0.5rem;
			padding: 0.5rem 0;
			left: -0.3rem;
			width: calc(100% + 1rem);
			height: calc(100%);
		}
		.column {
			.label {
				font-size: 0.7rem;
				color: var(--color-gray-600);
			}
			.title {
				z-index: 102;
				position: absolute;
				top: -1.7rem;
				left: 50%;
				transform: translateX(-50%);
				font-size: 0.9rem;
				transition: none;
			}
			&.query .title {
				color: var(--color-blue-400);
			}
			&.key .title {
				color: var(--color-red-400);
			}
			&.value .title {
				color: var(--color-green-400);
			}
			&.out .title {
				color: var(--color-purple-400);
			}
		}
		.content {
			display: grid;
			grid-template-columns: auto 0;

			.tokens {
				gap: 0.6rem;
			}
		}
		.heads {
			padding: 0 7rem 0 8rem;

			.head1.cell {
				.label {
					height: auto;
					line-height: 1;
				}
				&.active {
					&.query {
						.label {
							background-color: var(--color-blue-100);
							color: var(--color-blue-700);
							font-size: 1rem;
							z-index: 100;
							padding: 0.2rem;
						}
					}
					&.key {
						.label {
							background-color: var(--color-red-100);
							color: var(--color-red-700);
							font-size: 1rem;
							z-index: 100;
							padding: 0.2rem;
						}
					}
				}
			}
		}
	}
</style>
