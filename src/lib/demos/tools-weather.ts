import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { weatherTool } from '$lib/runtime/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

/**
 * The tool-calling loop: bind one tool, let the model decide when to call it,
 * run the call, feed the result back, and repeat until the model answers.
 * This is the exact source shown in the demo's Code tab.
 */
export async function runWeatherDemo(
	city: string,
	onMessages: (messages: BaseMessage[]) => void,
	onStep: OnStep
): Promise<BaseMessage[]> {
	// ── Model + tool binding ────────────────────────────────────────────────
	// bindTools registers JSON schemas so the model can emit structured tool_calls.
	const baseModel = await getModel({ temperature: 0, maxTokens: 256 });
	const model = baseModel.bindTools!([weatherTool]);

	// ── Conversation seed ───────────────────────────────────────────────────
	const messages: BaseMessage[] = [new HumanMessage(`What's the weather in ${city}?`)];
	onMessages([...messages]);
	onStep({ label: 'User prompt', kind: 'note', detail: `weather in ${city}` });

	// ── Tool-calling loop (ReAct without a graph) ───────────────────────────
	// Each turn: model → optional tool_calls → ToolMessages → model again.
	let safety = 0;
	while (safety++ < 4) {
		const ai = (await model.invoke(messages)) as AIMessage;
		messages.push(ai);
		onMessages([...messages]);

		// No tool_calls means the model chose to answer directly — exit the loop.
		if (!ai.tool_calls?.length) {
			onStep({
				label: 'Model · final answer',
				kind: 'model',
				detail: displayContent(ai.content).slice(0, 80),
				payload: displayContent(ai.content)
			});
			break;
		}

		onStep({
			label: 'Model · requested tool',
			kind: 'model',
			detail: ai.tool_calls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', '),
			payload: ai.tool_calls
		});

		// Execute every tool call the model requested, then append ToolMessages.
		for (const tc of ai.tool_calls) {
			const result = await weatherTool.invoke(tc.args as { city: string });
			const content = typeof result === 'string' ? result : JSON.stringify(result);
			// ToolMessage links back via tool_call_id so the model can correlate results.
			messages.push(new ToolMessage({ tool_call_id: tc.id ?? '', content }));
			onMessages([...messages]);
			onStep({
				label: `Tool · ${tc.name}`,
				kind: 'tool',
				detail: content.slice(0, 80),
				payload: { args: tc.args, result: content }
			});
		}
	}

	return messages;
}
