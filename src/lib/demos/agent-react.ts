import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { getModel } from '$lib/runtime/llm';
import { weatherTool, calculatorTool } from '$lib/runtime/tools';
import { displayContent } from '$lib/runtime/messages';
import type { OnStep } from './types';

type LooseTool = { name: string; invoke: (args: unknown) => Promise<unknown> };

const allTools = [weatherTool, calculatorTool] as unknown as LooseTool[];
const toolByName = Object.fromEntries(allTools.map((t) => [t.name, t]));

/**
 * The ReAct loop that powers create_agent: call the model, run any tool calls,
 * feed the results back, repeat until the model stops requesting tools. We track
 * the node path (agent ↔ tools ↔ end) so the live graph can highlight it.
 * This is the exact source shown in the demo's Code tab.
 */
export async function runAgentScenario(
	mode: 'weather' | 'multi',
	onMessages: (messages: BaseMessage[]) => void,
	onPath: (path: string[], active: string) => void,
	onStep: OnStep
): Promise<{ messages: BaseMessage[]; path: string[] }> {
	const baseModel = await getModel({ temperature: 0, maxTokens: 320 });
	const model = baseModel.bindTools!(allTools as unknown as never[]);

	const live: BaseMessage[] = [];
	const log: string[] = [];
	const push = (node: 'agent' | 'tools' | 'end') => {
		log.push(node === 'end' ? '__end__' : node);
		onPath([...log], node === 'end' ? '__end__' : node);
	};

	live.push(
		new HumanMessage(
			mode === 'weather'
				? "What's the weather like in San Francisco today?"
				: "Compare today's weather in Tokyo and London, and tell me the temperature difference in °C."
		)
	);
	onMessages([...live]);

	let safety = 0;
	while (safety++ < 6) {
		push('agent');
		const ai = (await model.invoke(live)) as AIMessage;
		live.push(ai);
		onMessages([...live]);

		if (!ai.tool_calls?.length) {
			push('end');
			onStep({
				label: 'Agent · final answer',
				kind: 'model',
				detail: displayContent(ai.content).slice(0, 80),
				payload: displayContent(ai.content)
			});
			break;
		}

		onStep({
			label: 'Agent · tool calls',
			kind: 'model',
			detail: ai.tool_calls.map((t) => t.name).join(', '),
			payload: ai.tool_calls
		});

		push('tools');
		for (const tc of ai.tool_calls) {
			const t = toolByName[tc.name];
			let content: string;
			if (!t) {
				content = `Error: unknown tool "${tc.name}"`;
			} else {
				const result = await t.invoke(tc.args);
				content = typeof result === 'string' ? result : JSON.stringify(result);
			}
			live.push(new ToolMessage({ tool_call_id: tc.id ?? '', content }));
			onMessages([...live]);
			onStep({
				label: `Tool · ${tc.name}`,
				kind: 'tool',
				detail: content.slice(0, 80),
				payload: { args: tc.args, result: content }
			});
		}
	}

	return { messages: live, path: [...log] };
}
