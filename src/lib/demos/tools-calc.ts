import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { calculatorTool } from '$lib/runtime/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

/**
 * Same tool-calling loop as the weather demo, but with a sandboxed arithmetic
 * tool. Shows that the control flow is tool-agnostic: only the bound tool and
 * the prompt change. This is the exact source shown in the demo's Code tab.
 */
export async function runCalcDemo(
	expression: string,
	onMessages: (messages: BaseMessage[]) => void,
	onStep: OnStep
): Promise<BaseMessage[]> {
	// ── Model + tool binding ────────────────────────────────────────────────
	// Swap the tool — the loop structure stays identical to runWeatherDemo.
	const baseModel = await getModel({ temperature: 0, maxTokens: 256 });
	const model = baseModel.bindTools!([calculatorTool]);

	// ── Conversation seed ───────────────────────────────────────────────────
	const messages: BaseMessage[] = [new HumanMessage(`Compute ${expression}.`)];
	onMessages([...messages]);
	onStep({ label: 'User prompt', kind: 'note', detail: `compute ${expression}` });

	// ── Tool-calling loop ───────────────────────────────────────────────────
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
			const result = await calculatorTool.invoke(tc.args as { expression: string });
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
