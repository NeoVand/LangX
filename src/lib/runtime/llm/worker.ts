/// <reference lib="webworker" />
import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';

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

self.addEventListener('message', async (ev: MessageEvent<IncomingMsg>) => {
	const msg = ev.data;
	try {
		if (msg.type === 'init') {
			await ensureModel(msg.model, msg.dtype, msg.device ?? 'webgpu');
			postMessage({ type: 'ready', id: msg.id });
		} else if (msg.type === 'generate') {
			if (!generator) {
				postMessage({ type: 'error', id: msg.id, message: 'Model not initialized.' });
				return;
			}

			let buffer = '';
			const callback = (text: string) => {
				const piece = text.slice(buffer.length);
				if (piece) {
					buffer = text;
					postMessage({ type: 'token', id: msg.id, text: piece });
				}
			};

			let stopOnEvents: { token_callback_function?: typeof callback } = {};
			if (msg.stream !== false) {
				stopOnEvents = { token_callback_function: callback };
			}

			// With tools, pre-render the prompt through the model's own chat template so
			// the tools are advertised in its native format (Hermes-style for Qwen3 /
			// SmolLM3). `enable_thinking:false` suppresses Qwen3's <think> blocks — faster
			// and easier to parse for tool loops. Templates that don't know the option
			// ignore it. Without tools, keep passing the message array (template applied
			// internally as before).
			let input: unknown = msg.messages;
			if (msg.tools && msg.tools.length) {
				input = generator.tokenizer.apply_chat_template(msg.messages as never, {
					tools: msg.tools,
					add_generation_prompt: true,
					tokenize: false,
					enable_thinking: false
				} as never) as unknown as string;
			}

			const result = (await generator(input as never, {
				max_new_tokens: msg.max_new_tokens ?? 512,
				temperature: msg.temperature ?? 0.7,
				do_sample: (msg.temperature ?? 0.7) > 0,
				return_full_text: false,
				...stopOnEvents
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
		}
	} catch (err) {
		postMessage({
			type: 'error',
			id: (msg as { id: string }).id,
			message: (err as Error).message
		});
	}
});

postMessage({ type: 'boot' });
