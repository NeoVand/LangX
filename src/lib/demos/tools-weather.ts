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
	const baseModel = await getModel({ temperature: 0, maxTokens: 256 });
	const model = baseModel.bindTools!([weatherTool]);

	const messages: BaseMessage[] = [new HumanMessage(`What's the weather in ${city}?`)];
	onMessages([...messages]);
	onStep({ label: 'User prompt', kind: 'note', detail: `weather in ${city}` });

	let safety = 0;
	while (safety++ < 4) {
		const ai = (await model.invoke(messages)) as AIMessage;
		messages.push(ai);
		onMessages([...messages]);

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

		for (const tc of ai.tool_calls) {
			const result = await weatherTool.invoke(tc.args as { city: string });
			const content = typeof result === 'string' ? result : JSON.stringify(result);
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
