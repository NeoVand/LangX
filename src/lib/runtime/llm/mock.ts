import {
	BaseChatModel,
	type BaseChatModelCallOptions,
	type BaseChatModelParams,
	type BindToolsInput
} from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { type Runnable, RunnableBinding } from '@langchain/core/runnables';

export interface ScriptedToolCall {
	name: string;
	args: Record<string, unknown>;
	id?: string;
}

export interface ScriptedResponse {
	content: string;
	toolCalls?: ScriptedToolCall[];
}

export type MockResponder = (
	messages: BaseMessage[],
	turn: number
) => ScriptedResponse | Promise<ScriptedResponse>;

export interface MockChatModelOptions extends BaseChatModelParams {
	responder?: MockResponder;
	responses?: ScriptedResponse[];
	tokenDelayMs?: number;
}

const DEFAULT_FALLBACK: ScriptedResponse = {
	content: 'I am a mock model. Provide responses or a responder function.'
};

export class MockChatModel extends BaseChatModel {
	private responder: MockResponder;
	private turn = 0;
	private tokenDelayMs: number;

	constructor(opts: MockChatModelOptions = {}) {
		super(opts);
		this.tokenDelayMs = opts.tokenDelayMs ?? 18;
		const list = opts.responses;
		if (opts.responder) {
			this.responder = opts.responder;
		} else if (list && list.length) {
			this.responder = (_msgs, turn) => list[Math.min(turn, list.length - 1)];
		} else {
			this.responder = () => DEFAULT_FALLBACK;
		}
	}

	_llmType() {
		return 'mock-chat';
	}

	async _generate(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		const turn = this.turn++;
		const response = await this.responder(messages, turn);

		if (this.tokenDelayMs > 0 && response.content) {
			const tokens = chunkText(response.content);
			for (const tok of tokens) {
				await sleep(this.tokenDelayMs);
				await runManager?.handleLLMNewToken(tok);
			}
		}

		const message = new AIMessage({
			content: response.content,
			tool_calls: (response.toolCalls ?? []).map((t, i) => ({
				name: t.name,
				args: t.args,
				id: t.id ?? `mock-call-${turn}-${i}`,
				type: 'tool_call' as const
			}))
		});

		return {
			generations: [
				{
					text: response.content,
					message
				}
			],
			llmOutput: { tokenUsage: { totalTokens: 0 } }
		};
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	) {
		const turn = this.turn++;
		const response = await this.responder(messages, turn);
		const tokens = chunkText(response.content);
		for (const tok of tokens) {
			await sleep(this.tokenDelayMs);
			await runManager?.handleLLMNewToken(tok);
			yield new ChatGenerationChunk({
				text: tok,
				message: new AIMessageChunk({ content: tok })
			});
		}
		if (response.toolCalls?.length) {
			const m = new AIMessageChunk({
				content: '',
				tool_call_chunks: response.toolCalls.map((t, i) => ({
					name: t.name,
					args: JSON.stringify(t.args),
					index: i,
					id: t.id ?? `mock-call-${turn}-${i}`
				}))
			});
			yield new ChatGenerationChunk({ text: '', message: m });
		}
	}

	resetTurn() {
		this.turn = 0;
	}

	override bindTools(
		tools: BindToolsInput[],
		kwargs?: Partial<BaseChatModelCallOptions>
	): Runnable<BaseMessage[], AIMessageChunk, BaseChatModelCallOptions> {
		return new RunnableBinding({
			bound: this,
			kwargs: { tools, ...(kwargs ?? {}) } as unknown as Partial<BaseChatModelCallOptions>,
			config: {}
		}) as unknown as Runnable<BaseMessage[], AIMessageChunk, BaseChatModelCallOptions>;
	}
}

function chunkText(s: string, size = 6): string[] {
	if (!s) return [];
	const words = s.split(/(\s+)/);
	const out: string[] = [];
	let buf = '';
	for (const w of words) {
		buf += w;
		if (buf.length >= size) {
			out.push(buf);
			buf = '';
		}
	}
	if (buf) out.push(buf);
	return out;
}

function sleep(ms: number) {
	return new Promise<void>((res) => setTimeout(res, ms));
}
