<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import { calculatorTool, weatherTool, knownWeatherCities } from '$lib/runtime/tools';
	import { MockChatModel } from '$lib/runtime/llm/mock';
	import { AIMessage, HumanMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;

	let weatherCity = $state('Tokyo');
	let weatherRun = $state(false);
	let weatherMessages = $state<BaseMessage[]>([]);

	async function runWeather() {
		weatherRun = true;
		weatherMessages = [];
		try {
			const cityForRun = weatherCity;
			const model = new MockChatModel({
				responder: (_msgs, turn) => {
					if (turn === 0) {
						return {
							content: '',
							toolCalls: [{ name: 'get_weather', args: { city: cityForRun }, id: 'call_1' }]
						};
					}
					return { content: 'Got it — see the tool result above.' };
				}
			}).bindTools([weatherTool]) as unknown as BoundModel;

			const messages: BaseMessage[] = [new HumanMessage(`What's the weather in ${cityForRun}?`)];
			weatherMessages = [...messages];

			const ai = (await model.invoke(messages)) as AIMessage;
			messages.push(ai);
			weatherMessages = [...messages];

			for (const tc of ai.tool_calls ?? []) {
				const result = await weatherTool.invoke(
					tc.args as { city: string }
				);
				const toolMsg = new ToolMessage({
					tool_call_id: tc.id ?? '',
					content: typeof result === 'string' ? result : JSON.stringify(result)
				});
				messages.push(toolMsg);
				weatherMessages = [...messages];
			}

			const final = await model.invoke(messages);
			messages.push(final as AIMessage);
			weatherMessages = [...messages];
		} finally {
			weatherRun = false;
		}
	}

	let calcExpr = $state('(7 + 3) * 12 / 4');
	let calcRun = $state(false);
	let calcMessages = $state<BaseMessage[]>([]);

	async function runCalc() {
		calcRun = true;
		calcMessages = [];
		try {
			const exprForRun = calcExpr;
			const model = new MockChatModel({
				responder: (_msgs, turn) => {
					if (turn === 0) {
						return {
							content: '',
							toolCalls: [
								{ name: 'calculator', args: { expression: exprForRun }, id: 'call_1' }
							]
						};
					}
					const cleaned = exprForRun.replace(/[^0-9+\-*/(). ]/g, '');
					const value = Function(`"use strict"; return (${cleaned});`)();
					return { content: `The result is ${value}.` };
				}
			}).bindTools([calculatorTool]) as unknown as BoundModel;

			const messages: BaseMessage[] = [new HumanMessage(`Compute ${exprForRun}.`)];
			calcMessages = [...messages];

			const ai = (await model.invoke(messages)) as AIMessage;
			messages.push(ai);
			calcMessages = [...messages];

			for (const tc of ai.tool_calls ?? []) {
				const result = await calculatorTool.invoke(tc.args as { expression: string });
				messages.push(
					new ToolMessage({
						tool_call_id: tc.id ?? '',
						content: typeof result === 'string' ? result : JSON.stringify(result)
					})
				);
				calcMessages = [...messages];
			}

			const final = await model.invoke(messages);
			messages.push(final as AIMessage);
			calcMessages = [...messages];
		} finally {
			calcRun = false;
		}
	}

	const codeTool = `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const weatherTool = tool(
  async ({ city }) => {
    return await getWeatherFor(city);
  },
  {
    name: 'get_weather',
    description: 'Get current weather for a city.',
    schema: z.object({ city: z.string() })
  }
);

const model = new ChatOpenAI({ model: 'gpt-4o-mini' })
  .bindTools([weatherTool]);

const ai = await model.invoke('What is the weather in Tokyo?');
// ai.tool_calls = [{ name: 'get_weather', args: { city: 'Tokyo' }, id: 'call_...' }]`;
</script>

<Lesson title="Tools" eyebrow="Phase 1 · Lesson 04">
	{#snippet intro()}
		<p>
			A tool is a typed function the model is allowed to call. The runtime handles the
			plumbing: a JSON schema goes to the model, the model emits a tool call, you execute it,
			the result goes back as a tool message, and the loop continues.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide title="Defining a tool">
			<p>
				Use the <code>tool()</code> helper from <code>@langchain/core/tools</code>. You give it
				a function, a name, a description, and a Zod schema for its arguments. The schema is
				also what's sent to the model as a JSON schema.
			</p>
			<CodeBlock code={codeTool} caption="A typed weather tool." />
		</Slide>

		<Slide title="bindTools, then invoke">
			<p>
				Call <code>model.bindTools([...])</code> to attach tools to a chat model. The model can
				now respond with either content or a list of <code>tool_calls</code>. Your job is to
				execute each call, return its output as a <code>ToolMessage</code>, and ask the model
				to continue.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 looks up the weather. Demo 2 evaluates an arithmetic expression. Both are
				deterministic so the lesson always works — but the tool execution and message routing
				are real LangChain code. Watch the message timeline on the right grow:
				<em>human → assistant (tool_call) → tool → assistant (final)</em>.
			</p>
		</Slide>

		<Slide title="Why small in-browser models flake here">
			<p>
				Tool calling depends on the model emitting precisely-formatted JSON. Smaller models
				(under ~1B) often hallucinate field names, miss required args, or skip the call
				entirely. That's why the LangX setup page recommends Qwen3 0.6B for tool demos, or a
				hosted provider via your own API key.
			</p>
		</Slide>
	{/snippet}

	{#snippet demo()}
		<Panel title="Demo 1 · Weather tool" subtitle="model → ToolMessage → model">
			<label class="row">
				<span>City (try {knownWeatherCities.slice(0, 4).join(', ')}, …)</span>
				<input type="text" bind:value={weatherCity} />
			</label>
			<RunButton onclick={runWeather} running={weatherRun} />
			<div class="stream">
				<MessageStream messages={weatherMessages} compact />
			</div>
		</Panel>

		<Panel title="Demo 2 · Calculator tool" subtitle="Pure arithmetic, sandboxed">
			<label class="row">
				<span>Expression</span>
				<input type="text" bind:value={calcExpr} />
			</label>
			<RunButton onclick={runCalc} running={calcRun} />
			<div class="stream">
				<MessageStream messages={calcMessages} compact />
			</div>
		</Panel>
	{/snippet}
</Lesson>

<style>
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.row span {
		font-size: 0.78rem;
		color: var(--color-fg-faint);
	}
	input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-fg);
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.stream {
		margin-top: 0.85rem;
	}
</style>
