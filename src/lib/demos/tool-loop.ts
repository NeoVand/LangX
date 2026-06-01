import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

/**
 * The agent loop, by hand — this is exactly what a prebuilt agent does under the hood.
 *
 * Each turn: invoke the model; if it answered, stop; if it asked for tool calls, run
 * every call, feed each result back as a ToolMessage (linked by tool_call_id), and
 * loop. The model sees the results and decides what to do next. The loop is fully
 * tool-agnostic — swap the bound tools and the seed messages and it just works.
 *
 * This is the exact source the demos run.
 */
export async function runToolLoop(opts: {
	/** A chat model with tools already bound via .bindTools([...]). */
	model: { invoke: (messages: BaseMessage[]) => Promise<unknown> };
	/** The same tools, for executing the calls the model requests. */
	tools: StructuredToolInterface[];
	/** Seed conversation (system + human); mutated in place as the loop runs. */
	messages: BaseMessage[];
	onMessages?: (messages: BaseMessage[]) => void;
	onStep?: OnStep;
	/** Safety cap on round-trips. */
	maxTurns?: number;
}): Promise<BaseMessage[]> {
	const { model, tools, messages, onMessages, onStep, maxTurns = 6 } = opts;
	const byName = new Map(tools.map((t) => [t.name, t]));
	onMessages?.([...messages]);

	let turns = 0;
	while (turns++ < maxTurns) {
		// 1. Ask the model. It replies with content, tool_calls, or both.
		const ai = (await model.invoke(messages)) as AIMessage;
		messages.push(ai);
		onMessages?.([...messages]);

		// 2. No tool calls → the model is answering. We're done.
		if (!ai.tool_calls?.length) {
			onStep?.({
				label: 'Model · final answer',
				kind: 'model',
				detail: displayContent(ai.content).slice(0, 90),
				payload: displayContent(ai.content)
			});
			break;
		}

		onStep?.({
			label: `Model · called ${ai.tool_calls.map((t) => t.name).join(', ')}`,
			kind: 'model',
			detail: ai.tool_calls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join('   '),
			payload: ai.tool_calls
		});

		// 3. Run each requested call (the model may ask for several at once) and
		//    return each result as a ToolMessage the model can correlate by id.
		for (const tc of ai.tool_calls) {
			const fn = byName.get(tc.name);
			const result = fn ? await fn.invoke(tc.args) : `No tool named "${tc.name}".`;
			const content = typeof result === 'string' ? result : JSON.stringify(result);
			messages.push(new ToolMessage({ tool_call_id: tc.id ?? '', name: tc.name, content }));
			onMessages?.([...messages]);
			onStep?.({
				label: `Tool · ${tc.name}`,
				kind: 'tool',
				detail: content.slice(0, 90),
				payload: { args: tc.args, result: content }
			});
		}
	}

	return messages;
}

/** Total token usage across every model turn in a finished conversation. */
export function sumUsage(messages: BaseMessage[]): { input: number; output: number; total: number } {
	let input = 0;
	let output = 0;
	let total = 0;
	for (const m of messages) {
		if (m instanceof AIMessage && m.usage_metadata) {
			input += m.usage_metadata.input_tokens ?? 0;
			output += m.usage_metadata.output_tokens ?? 0;
			total += m.usage_metadata.total_tokens ?? 0;
		}
	}
	return { input, output, total };
}
