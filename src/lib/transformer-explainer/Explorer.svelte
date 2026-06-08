<!--
  The embedded Transformer Explainer (ported from poloclub/transformer-explainer,
  MIT). This is the original app's root composition — live GPT-2 running in-browser
  via onnxruntime-web, with the custom ONNX export that exposes per-head attention
  internals — minus the original site chrome (topbar, scrolly article, guided
  textbook, analytics). Written in legacy Svelte syntax (the folder is exempt from
  forced runes in svelte.config.js).

  Model bytes: the 63 × 10 MB chunks are fetched from MODEL_BASE, cached in the
  browser (Cache API, see utils/fetchChunks.js), merged and handed to ORT. In dev
  that's local static/model-v2; for prod, point MODEL_BASE at a Hugging Face Hub
  repo (same backend-free, cache-after-first-load mechanism the original uses).
-->
<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { base } from '$app/paths';
	import * as ort from 'onnxruntime-web';
	import { AutoTokenizer } from '@huggingface/transformers';
	import classNames from 'classnames';

	import {
		tokens,
		expandedBlock,
		vectorHeight,
		inputText,
		rootRem,
		sampling,
		maxVectorHeight,
		minVectorHeight,
		maxVectorScale,
		headContentHeight,
		temperature,
		modelData,
		modelSession,
		isFetchingModel,
		selectedExampleIdx,
		isOnBlockTransition,
		blockIdx
	} from '$lib/transformer-explainer/store';

	import Sankey from '$lib/transformer-explainer/components/Sankey.svelte';
	import Attention from '$lib/transformer-explainer/components/Attention.svelte';
	import SubsequentBlocks from '$lib/transformer-explainer/components/SubsequentBlocks.svelte';
	import LinearSoftmax from '$lib/transformer-explainer/components/LinearSoftmax.svelte';
	import Embedding from '$lib/transformer-explainer/components/Embedding.svelte';
	import Mlp from '$lib/transformer-explainer/components/Mlp.svelte';
	import QKV from '$lib/transformer-explainer/components/QKV.svelte';
	import WeightPopovers from '$lib/transformer-explainer/components/WeightPopovers.svelte';
	import BlockTransition from '$lib/transformer-explainer/components/BlockTransition.svelte';
	import InputForm from '$lib/transformer-explainer/components/InputForm.svelte';

	import { adjustTemperature, runModel, fakeRunWithCachedData } from '$lib/transformer-explainer/utils/data';
	import { fetchAndMergeChunks } from '$lib/transformer-explainer/utils/fetchChunks';
	import { ex0 } from '$lib/transformer-explainer/constants/examples';

	// onnxruntime-web wasm runtime (pinned to our onnxruntime-web@1.23.0). Loaded
	// from the CDN (no backend) and browser-cached on first use.
	ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/';
	ort.env.logLevel = 'error';

	// Where the 63 model chunks live. Dev = local static; for prod set this to a
	// Hugging Face Hub repo, e.g.
	//   'https://huggingface.co/<user>/transformer-explainer-gpt2-onnx/resolve/main/model-v2'
	const MODEL_BASE = `${base}/model-v2`;

	let active = false;
	let appStartTime = Date.now();

	onMount(async () => {
		const gpt2Tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt2');
		active = true;

		const unsubscribe = subscribeInputs(gpt2Tokenizer);
		await fetchModel();

		return unsubscribe;
	});

	const fetchModel = async () => {
		const chunkNum = 63;
		const chunkUrls = Array(chunkNum)
			.fill(0)
			.map((d, i) => `${MODEL_BASE}/gpt2.onnx.part${i}`);

		const { mergedArray } = await fetchAndMergeChunks(chunkUrls);
		const blob = new Blob([mergedArray], { type: 'application/octet-stream' });
		const url = URL.createObjectURL(blob);
		const session = await ort.InferenceSession.create(url);

		modelSession.set(session);
		isFetchingModel.set(false);
	};

	const cachedDataMap = [ex0];
	const subscribeInputs = (tokenizer) => {
		const runModelOrCache = () => {
			if ($isFetchingModel || !$modelSession) {
				const cachedData = cachedDataMap[$selectedExampleIdx] ?? ex0;
				fakeRunWithCachedData({
					cachedData,
					tokenizer,
					temperature: $temperature,
					sampling: $sampling
				});
				return;
			}
			runModel({
				tokenizer,
				input: $inputText.trim(),
				temperature: $temperature,
				sampling: $sampling
			});
		};

		const unsubscribeInputText = inputText.subscribe(() => runModelOrCache());

		let initialTemperature = true;
		const unsubscribeTemperature = temperature.subscribe((value) => {
			if (initialTemperature) {
				initialTemperature = false;
				return;
			}
			adjustTemperature({ tokenizer, logits: $modelData.logits, temperature: value, sampling: $sampling });
		});

		let initialSampling = true;
		const unsubscribeSampling = sampling.subscribe((value) => {
			if (initialSampling) {
				initialSampling = false;
				return;
			}
			adjustTemperature({ tokenizer, logits: $modelData.logits, temperature: $temperature, sampling: value });
		});

		return () => {
			unsubscribeInputText();
			unsubscribeTemperature();
			unsubscribeSampling();
		};
	};

	// visual sizing
	let vizHeight = 0;
	let titleHeight = rootRem * 5;

	const calculateVectorHeight = () => {
		const gaps = rootRem * 0.5 * ($tokens.length - 1);
		const vectorHeightVal = Math.min(
			Math.max((vizHeight - titleHeight - gaps) / $tokens.length / maxVectorScale, minVectorHeight),
			maxVectorHeight
		);
		vectorHeight.set(vectorHeightVal);
		headContentHeight.set(Math.max($tokens.length * vectorHeightVal * 3 + gaps, rootRem * 20));
	};

	$: if (vizHeight || $tokens.length) {
		calculateVectorHeight();
	}
</script>

<div class="te-shell" class:active>
	<div class="te-portal-root"></div>

	<header class="te-topbar">
		<div class="te-input-wrap"><InputForm /></div>
		<a
			class="te-repo"
			href="https://github.com/poloclub/transformer-explainer"
			target="_blank"
			rel="noreferrer noopener"
			title="Based on poloclub/transformer-explainer (MIT)">GPT-2 · source</a
		>
	</header>

	<div
		class="main-section h-full w-full"
		style={`--vector-height: ${$vectorHeight}px;--title-height: ${titleHeight}px;--content-height:${vizHeight - titleHeight}px;`}
	>
		{#if !!$expandedBlock.id}
			<div class={classNames('dim', `${$expandedBlock.id || ''}`)} transition:fade={{ duration: 100 }}></div>
			<div class={classNames('dim-partial left', `${$expandedBlock.id || ''}`)} transition:fade={{ duration: 100 }}></div>
			<div class={classNames('dim-partial right', `${$expandedBlock.id || ''}`)} transition:fade={{ duration: 100 }}></div>
		{/if}
		<div class="sankey opacity-100" class:attention={$expandedBlock.id === 'attention'}>
			<Sankey />
		</div>
		<div class="nodes resize-watch">
			<div class="steps" class:expanded={!!$expandedBlock.id} bind:offsetHeight={vizHeight}>
				<Embedding className="step" />
				<div class="blocks relative">
					<div class="block-steps main" class:initial={$blockIdx === 0}>
						<QKV className="step" />
						<Attention className="step" />
						<Mlp className="step" />
					</div>
					<div class="block-steps next" class:hide={!$isOnBlockTransition} class:initial={$blockIdx === 0}>
						<QKV className="step" />
						<Attention className="step" />
						<Mlp className="step" />
					</div>
					<div class="transition-watch" class:hide={!$isOnBlockTransition}></div>
				</div>
				<SubsequentBlocks className="step" />
				<LinearSoftmax className="step" />
			</div>
			<WeightPopovers />
			<BlockTransition />
		</div>
	</div>
</div>

<style lang="scss">
	/* ── shell + control bar (LangX-side chrome replacing the original topbar) ── */
	.te-shell {
		position: relative;
		height: 100%;
		width: 100%;
		min-width: 900px;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		color: var(--color-fg);
		opacity: 0;
		transition: opacity 0.25s;
	}
	.te-shell.active {
		opacity: 1;
	}
	.te-shell :global(svg) {
		overflow: visible;
	}

	.te-topbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.4rem 1.5rem 0.5rem;
	}
	.te-input-wrap {
		flex: 1 1 auto;
		min-width: 0;
	}
	.te-repo {
		flex-shrink: 0;
		font-size: 0.8rem;
		color: var(--color-gray-500);
		text-decoration: none;
	}
	.te-repo:hover {
		color: var(--color-gray-800);
	}

	.te-portal-root {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 990;
	}

	/* ── viz layout (ported verbatim from the original +page.svelte, with
	   theme('colors.…') → var(--color-…) and z-index $vars inlined) ── */
	.main-section {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}
	.nodes {
		height: 100%;
		width: 100%;
		padding: 1rem 0 3rem 0;
		position: relative;
	}
	.steps {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-columns: auto 3.5fr 0.5fr 0.5fr;

		&.expanded {
			:global(.step > .title) {
				padding-bottom: 3rem;
			}
		}

		.blocks {
			position: relative;
			width: 100%;
			height: 100%;

			.block-steps {
				height: 100%;
				width: 100%;
				position: absolute;
				display: grid;
				grid-template-columns: 0.5fr 2fr 1fr;
			}
			.block-steps.main {
				transform-origin: 3rem center;
				top: 0;
				left: 0;
			}
			.block-steps.next {
				transform-origin: right center;
				justify-content: end;
				top: 0;
				right: 0;
				pointer-events: none;
			}

			.transition-watch {
				position: absolute;
				top: 0;
				left: 0;
				height: 100%;
				width: 100%;
				pointer-events: none;
			}

			.hide {
				display: none;
			}
			&.animate-forward {
				.block-steps,
				.transition-watch {
					animation-duration: 800ms;
					animation-timing-function: ease-in;
				}
				.block-steps.main {
					animation-name: collapse;
					&.initial {
						transform-origin: left center;
					}
				}
				.block-steps.next {
					animation-name: expand;
				}
				.transition-watch {
					animation-name: width-collapse;
				}
			}

			&.animate-backward {
				.block-steps,
				.transition-watch {
					animation-duration: 800ms;
					animation-timing-function: ease-in;
				}
				.block-steps.main {
					animation-name: expand;
					&.initial {
						transform-origin: left center;
					}
				}
				.block-steps.next {
					animation-name: collapse;
				}
				.transition-watch {
					animation-name: width-collapse;
				}
			}
		}
	}
	@keyframes width-collapse {
		0% {
			width: 100%;
		}
		100% {
			width: 0%;
		}
	}
	@keyframes expand {
		0% {
			transform: scaleX(0);
		}
		100% {
			transform: scaleX(1);
		}
	}
	@keyframes collapse {
		0% {
			transform: scaleX(1);
		}
		100% {
			transform: scaleX(0);
		}
	}

	.te-shell :global(.step) {
		height: 100%;
		display: grid;
		grid-template-rows: var(--title-height) 1fr;
	}

	.te-shell :global(.step > .title) {
		z-index: 102;
		display: flex;
		flex-direction: column;
		justify-content: end;
		grid-row: 1;
		color: var(--color-gray-400);
		white-space: nowrap;
		padding-bottom: 2rem;
		overflow: visible;
		min-width: 0;
		transition: all 0.5s;
		cursor: default;

		&:hover {
			color: var(--color-gray-600);
		}
	}

	.te-shell :global(.step > .title.expandable) {
		cursor: pointer;
	}

	.te-shell :global(.step .content) {
		grid-row: 2;
		height: fit-content;
	}

	.te-shell :global(.column) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;

		:global(.cell) {
			height: var(--vector-height);
			display: flex;
			gap: 1rem;
			align-items: center;
			position: relative;
		}

		:global(.subtitle) {
			position: absolute;
			top: 0;
			transform: translateY(calc(-100% - 1rem));
			text-align: center;
			font-size: 0.8rem;
			color: var(--color-gray-400);
			width: 100%;
			z-index: 102;
		}
	}

	.te-shell :global(.vector),
	.te-shell :global(.sub-vector) {
		position: relative;
		z-index: 101;
		width: 12px;
		height: var(--vector-height);
		flex-shrink: 0;
		justify-content: start;
	}
	.te-shell :global(.cell.x1-12),
	.te-shell :global(.vector.x1-12),
	.te-shell :global(.sub-vector.x1-12) {
		height: calc(var(--vector-height) / 12);
	}

	.te-shell :global(.cell.x3),
	.te-shell :global(.vector.x3),
	.te-shell :global(.sub-vector.x3) {
		height: calc(var(--vector-height) * 3);
	}
	.te-shell :global(.cell.x4),
	.te-shell :global(.vector.x4),
	.te-shell :global(.sub-vector.x4) {
		height: calc(var(--vector-height) * 3.1);
	}

	.te-shell :global(.vector.vocab),
	.te-shell :global(.sub-vector.vocab) {
		height: 100%;
		width: 0;
	}

	.te-shell :global(.sub-vector.head-rest) {
		flex: 1 0 0;
	}

	.te-shell :global(.label) {
		font-size: 0.9rem;
		color: var(--color-gray-700);
		z-index: 101;
		display: inline;
		max-width: 7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: right;
		line-height: var(--vector-height);
		height: var(--vector-height);
		flex-shrink: 0;
	}
	.te-shell :global(.label.float) {
		position: absolute;
		left: -0.8rem;
		transform: translateX(-100%);
	}
	.te-shell :global(.label.float-right) {
		position: absolute;
		left: -0.8rem;
	}

	.te-shell :global(.ellipsis) {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.te-shell :global(.bounding) {
		position: absolute;
		box-sizing: content-box;
		top: -0.5rem;
		padding: 0.5rem 0;
		left: 0;
		height: 100%;
		border: 2px dashed var(--color-gray-300);
		border-radius: 0.5rem;
		transition: opacity 0.5s;
		opacity: 0;
		pointer-events: none;
	}
	.te-shell :global(.bounding.active) {
		opacity: 0.8;
	}

	.te-shell :global(.popover) {
		z-index: 998;
		width: max-content;
	}

	.te-shell :global(.tooltip) {
		z-index: 999;
		background-color: var(--color-bg-elev-2) !important;
		color: var(--color-fg) !important;
		border: 1px solid var(--color-border) !important;
		padding: 0.2rem 0.5rem !important;
		font-size: 0.8rem !important;
		white-space: nowrap;
		font-weight: 300 !important;
		border-radius: 0.35rem;
	}
	.dim {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 800;
		background-color: var(--color-bg);
		opacity: 0.7;
		user-select: none;

		&.attention {
			z-index: 0;
		}
	}
	.dim-partial {
		user-select: none;
		z-index: 850;
		position: absolute;
		top: 0;
		height: 100%;

		&.right {
			right: 0;
			background: linear-gradient(90deg, rgba(22, 19, 15, 0) 0%, rgba(22, 19, 15, 1) 80%);
		}
		&.left {
			left: 0;
			background: linear-gradient(-90deg, rgba(22, 19, 15, 0) 0%, rgba(22, 19, 15, 1) 80%);
		}

		&.embedding {
			&.left {
				display: none;
			}
			&.right {
				width: 60%;
			}
		}
		&.attention {
			&.left {
				width: 20%;
			}
			&.right {
				width: 20%;
			}
		}
		&.softmax {
			&.left {
				width: 60%;
			}
			&.right {
				display: none;
			}
		}
	}
	.sankey {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;

		&.attention {
			:global(.sankey-top) {
				z-index: 810 !important;
				pointer-events: none;
			}
		}
	}

	.te-shell :global(svg g.path-group) {
		transition: opacity 0.5s;
	}
	.te-shell :global(div.step > div) {
		transition: opacity 0.5s;
	}
	.te-shell :global(div.step .column) {
		transition: opacity 0.5s;
	}
</style>
