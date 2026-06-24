/// <reference lib="webworker" />
import { pipeline, env, TextStreamer, type TextGenerationPipeline } from '@huggingface/transformers';

// Persist model weights in the browser's Cache Storage so a model is fetched from the
// network only once; every later load (including after a page refresh) reads from cache.
env.useBrowserCache = true;
env.allowLocalModels = false;

interface InitMsg {
	type: 'init';
	id: string;
	model: string;
	dtype?: string;
	device?: 'webgpu' | 'wasm' | 'auto';
}

interface GenerateMsg {
	type: 'generate';
	id: string;
	messages: { role: string; content: string }[];
	max_new_tokens?: number;
	temperature?: number;
	stream?: boolean;
	/** OpenAI-style tool schemas; when present the chat template advertises them. */
	tools?: unknown[];
}

type IncomingMsg = InitMsg | GenerateMsg;

let generator: TextGenerationPipeline | null = null;
let modelId: string | null = null;
let initPromise: Promise<void> | null = null;

async function ensureModel(model: string, dtype = 'q4', device: 'webgpu' | 'wasm' | 'auto' = 'webgpu') {
	if (generator && modelId === model) return;
	if (initPromise) return initPromise;
	initPromise = (async () => {
		generator = (await pipeline('text-generation', model, {
			device,
			dtype: dtype as never,
			progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
				postMessage({ type: 'progress', payload: p });
			}
		})) as TextGenerationPipeline;
		modelId = model;
	})();
	try {
		await initPromise;
	} finally {
		initPromise = null;
	}
}

async function runGenerate(msg: GenerateMsg) {
	try {
		if (!generator) {
			postMessage({ type: 'error', id: msg.id, message: 'Model not initialized.' });
			return;
		}

		// Real token streaming uses a TextStreamer — there is NO `token_callback_function`
		// option on transformers.js generate(), so the previous version streamed nothing and
		// `model.stream()` yielded zero chunks (the chat demos rendered an empty reply). The
		// streamer's callback fires with each newly-decoded piece (prompt + specials skipped).
		let streamerOpt: { streamer?: TextStreamer } = {};
		if (msg.stream !== false) {
			const streamer = new TextStreamer(generator.tokenizer, {
				skip_prompt: true,
				skip_special_tokens: true,
				callback_function: (text: string) => {
					if (text) postMessage({ type: 'token', id: msg.id, text });
				}
			});
			streamerOpt = { streamer };
		}

		// ALWAYS render the prompt through the model's own chat template with
		// `enable_thinking:false`. This is the critical bit for the chat demos:
		// reasoning models like Qwen3 default to emitting a long <think> block, and on
		// a small in-browser token budget they can burn the whole budget thinking and
		// return an empty visible answer — the chatbot looks broken. Disabling thinking
		// makes them answer directly. With tools present the same call advertises them
		// in the model's native format (Hermes-style for Qwen3 / SmolLM3). Templates
		// that don't know `enable_thinking`/`tools` (Llama, Phi, Gemma) just ignore them.
		const input = generator.tokenizer.apply_chat_template(msg.messages as never, {
			...(msg.tools && msg.tools.length ? { tools: msg.tools } : {}),
			add_generation_prompt: true,
			tokenize: false,
			enable_thinking: false
		} as never) as unknown as string;

		const result = (await generator(input as never, {
			max_new_tokens: msg.max_new_tokens ?? 512,
			temperature: msg.temperature ?? 0.7,
			do_sample: (msg.temperature ?? 0.7) > 0,
			return_full_text: false,
			...streamerOpt
		} as never)) as unknown;

		let final = '';
		if (Array.isArray(result) && result.length) {
			const first = result[0] as { generated_text?: unknown };
			const gen = first.generated_text;
			if (typeof gen === 'string') final = gen;
			else if (Array.isArray(gen)) {
				const last = gen[gen.length - 1] as { content?: string } | undefined;
				if (last && typeof last.content === 'string') final = last.content;
			}
		}
		postMessage({ type: 'done', id: msg.id, text: final });
	} catch (err) {
		postMessage({ type: 'error', id: msg.id, message: (err as Error).message });
	}
}

// Serialize all GPU work onto one promise chain. A single WebGPU/ONNX session can only
// run one inference at a time — issuing a second `OrtRun` while one is in flight corrupts
// the shared GPU buffers ("mapAsync ... invalid buffer due to a previous error"). Demos
// that fan out to parallel agents (the Deep Agents harness, subagents, Send/fan-out) post
// several `generate` messages to this one shared worker; without a queue they overlap and
// crash. Queuing makes them run back-to-back instead. This is not a capability trade-off:
// the GPU is serial regardless, and larger models need the same guarantee. Init is chained
// too so a generate can never start before (or during) model load.
let workChain: Promise<void> = Promise.resolve();

self.addEventListener('message', (ev: MessageEvent<IncomingMsg>) => {
	const msg = ev.data;
	if (msg.type === 'init') {
		workChain = workChain.then(async () => {
			try {
				await ensureModel(msg.model, msg.dtype, msg.device ?? 'webgpu');
				postMessage({ type: 'ready', id: msg.id });
			} catch (err) {
				postMessage({ type: 'error', id: msg.id, message: (err as Error).message });
			}
		});
	} else if (msg.type === 'generate') {
		workChain = workChain.then(() => runGenerate(msg));
	}
});

postMessage({ type: 'boot' });
