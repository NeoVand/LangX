import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings';
import { browser } from '$app/environment';

type FeaturePipeline = (
	input: string | string[],
	options?: unknown
) => Promise<{ data: Float32Array; dims: number[] }>;

let _pipeline: FeaturePipeline | null = null;

async function getPipeline(): Promise<FeaturePipeline> {
	if (!browser) throw new Error('Embeddings only run in the browser.');
	if (_pipeline) return _pipeline;
	const { pipeline, env } = await import('@huggingface/transformers');
	// Serve the quantized weights bundled under static/models so the demo works
	// offline and never hits huggingface.co for the default provider.
	env.allowLocalModels = true;
	env.localModelPath = '/models/';
	// q8 on wasm is the reliable small build (q8-on-WebGPU is flaky).
	const featurePipe = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
		device: 'wasm',
		dtype: 'q8'
	})) as unknown as FeaturePipeline;
	_pipeline = featurePipe;
	return _pipeline;
}

export interface MiniLmEmbeddingsParams extends EmbeddingsParams {
	onProgress?: (msg: string) => void;
}

export class MiniLmEmbeddings extends Embeddings {
	constructor(params: MiniLmEmbeddingsParams = {}) {
		super(params);
	}

	async embedQuery(text: string): Promise<number[]> {
		const p = await getPipeline();
		const out = await p(text, { pooling: 'mean', normalize: true });
		return Array.from(out.data);
	}

	async embedDocuments(documents: string[]): Promise<number[][]> {
		const p = await getPipeline();
		const out: number[][] = [];
		for (const d of documents) {
			const v = await p(d, { pooling: 'mean', normalize: true });
			out.push(Array.from(v.data));
		}
		return out;
	}
}
