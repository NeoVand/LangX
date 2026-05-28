<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import { calculatorTool, weatherTool, knownWeatherCities } from '$lib/runtime/tools';
	import { getModel } from '$lib/runtime/llm';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import {
		AIMessage,
		HumanMessage,
		SystemMessage,
		ToolMessage,
		type BaseMessage
	} from '@langchain/core/messages';
	import type { Runnable } from '@langchain/core/runnables';
	import type { BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
	import { onMount } from 'svelte';

	type BoundModel = Runnable<BaseMessage[], AIMessage, BaseChatModelCallOptions>;

	interface SerializedMsg {
		role: 'human' | 'system' | 'ai' | 'tool';
		content: string;
		tool_call_id?: string;
		tool_calls?: { name: string; args: Record<string, unknown>; id?: string }[];
	}

	function serializeMsg(m: BaseMessage): SerializedMsg {
		if (m instanceof HumanMessage) return { role: 'human', content: String(m.content) };
		if (m instanceof SystemMessage) return { role: 'system', content: String(m.content) };
		if (m instanceof ToolMessage)
			return { role: 'tool', content: String(m.content), tool_call_id: m.tool_call_id };
		if (m instanceof AIMessage) {
			return {
				role: 'ai',
				content: String(m.content ?? ''),
				tool_calls: (m.tool_calls ?? []).map((tc) => ({
					name: tc.name,
					args: tc.args as Record<string, unknown>,
					id: tc.id
				}))
			};
		}
		return { role: 'ai', content: String(m.content) };
	}

	function deserializeMsg(s: SerializedMsg): BaseMessage {
		switch (s.role) {
			case 'human':
				return new HumanMessage(s.content);
			case 'system':
				return new SystemMessage(s.content);
			case 'tool':
				return new ToolMessage({
					tool_call_id: s.tool_call_id ?? '',
					content: s.content
				});
			case 'ai':
			default:
				return new AIMessage({
					content: s.content,
					tool_calls: s.tool_calls?.map((tc) => ({ ...tc })) ?? []
				});
		}
	}

	type ConvoPayload = { messages: SerializedMsg[] };

	let weatherCity = $state('Tokyo');
	let weatherRun = $state(false);
	let weatherMessages = $state<BaseMessage[]>([]);

	async function runWeather() {
		weatherRun = true;
		weatherMessages = [];
		try {
			const cityForRun = weatherCity;
			const out = await withRunCache<ConvoPayload>(
				{ demoId: 'l1-tools-weather' },
				async () => {
					const baseModel = await getModel({ temperature: 0, maxTokens: 256 });
					const model = baseModel.bindTools!([weatherTool]) as unknown as BoundModel;
					const messages: BaseMessage[] = [
						new HumanMessage(`What's the weather in ${cityForRun}?`)
					];
					weatherMessages = [...messages];

					let safety = 0;
					while (safety++ < 4) {
						const ai = (await model.invoke(messages)) as AIMessage;
						messages.push(ai);
						weatherMessages = [...messages];
						if (!ai.tool_calls?.length) break;
						for (const tc of ai.tool_calls) {
							const result = await weatherTool.invoke(tc.args as { city: string });
							messages.push(
								new ToolMessage({
									tool_call_id: tc.id ?? '',
									content: typeof result === 'string' ? result : JSON.stringify(result)
								})
							);
							weatherMessages = [...messages];
						}
					}

					return { messages: messages.map(serializeMsg) };
				}
			);
			weatherMessages = out.messages.map(deserializeMsg);
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
			const out = await withRunCache<ConvoPayload>(
				{ demoId: 'l1-tools-calc' },
				async () => {
					const baseModel = await getModel({ temperature: 0, maxTokens: 256 });
					const model = baseModel.bindTools!([calculatorTool]) as unknown as BoundModel;
					const messages: BaseMessage[] = [new HumanMessage(`Compute ${exprForRun}.`)];
					calcMessages = [...messages];

					let safety = 0;
					while (safety++ < 4) {
						const ai = (await model.invoke(messages)) as AIMessage;
						messages.push(ai);
						calcMessages = [...messages];
						if (!ai.tool_calls?.length) break;
						for (const tc of ai.tool_calls) {
							const result = await calculatorTool.invoke(tc.args as { expression: string });
							messages.push(
								new ToolMessage({
									tool_call_id: tc.id ?? '',
									content: typeof result === 'string' ? result : JSON.stringify(result)
								})
							);
							calcMessages = [...messages];
						}
					}

					return { messages: messages.map(serializeMsg) };
				}
			);
			calcMessages = out.messages.map(deserializeMsg);
		} finally {
			calcRun = false;
		}
	}

	onMount(async () => {
		const cw = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-weather' });
		if (cw) weatherMessages = cw.payload.messages.map(deserializeMsg);
		const cc = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-calc' });
		if (cc) calcMessages = cc.payload.messages.map(deserializeMsg);
	});

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

const model = new ChatAnthropic({ model: 'claude-haiku-4-5' })
  .bindTools([weatherTool]);

const ai = await model.invoke('What is the weather in Tokyo?');
// ai.tool_calls = [{ name: 'get_weather', args: { city: 'Tokyo' }, id: 'call_...' }]`;
</script>

<Lesson
	title="Tools"
	eyebrow="Phase 1 · Lesson 04"
	motivation="A model that can call functions stops being a chat partner and becomes a participant in your system. Everything in agent design starts here."
	hero={{
		id: 'l1-tools',
		alt: 'A scholar reaches for a wall of pegboard tools'
	}}
>
	{#snippet intro()}
		<p>
			A <Term t="tool" /> is a typed function the model is allowed to call. The runtime handles
			the plumbing: a JSON schema goes to the model, the model emits a tool call, you execute
			it, the result returns as a tool message, and the loop continues.
		</p>
	{/snippet}

	{#snippet narrative()}
		<Slide
			eyebrow="Why this shape"
			title="From oracle to participant"
			variant="dropcap"
		>
			<p>
				Early language models were oracles. You asked a question, you got a paragraph back,
				and any real-world side-effect happened somewhere else, written by you, plumbed by
				you, debugged by you. The model never touched the world.
			</p>
			<p>
				Tool calling inverts that. You hand the model a small toolbox — typed functions with
				descriptions — and the model decides, turn by turn, which one to reach for. The
				oracle becomes a colleague. Every agent in this course is, at its heart, a
				well-designed toolbox plus a loop that lets the model use it.
			</p>
		</Slide>

		<Slide title="Defining a tool" variant="code-first">
			<CodeBlock code={codeTool} lang="ts" caption="A typed weather tool, then bound to a model." />
			<p>
				Use the <code>tool()</code> helper from <code>@langchain/core/tools</code>. You give
				it a function, a name, a description, and a Zod schema for its arguments. The schema
				doubles as the JSON schema sent to the model.
			</p>
		</Slide>

		<Slide title="bindTools, then invoke">
			<p>
				Call <code>model.bindTools([...])</code> to attach tools to a chat model. The model
				can now respond with either content or a list of <code>tool_calls</code>. Your job
				is to execute each call, return its output as a <code>ToolMessage</code>, and ask
				the model to continue.
			</p>
		</Slide>

		<Slide variant="pull-quote">
			<p>
				A tool definition is the smallest unit of agency a model is allowed to have. Choose
				its description carefully — that is the model's user manual.
			</p>
		</Slide>

		<Slide title="Two demos">
			<p>
				Demo 1 looks up the weather for a city. Demo 2 evaluates an arithmetic expression.
				Both tools run in the browser; the model is whichever provider you have configured.
				Watch the message timeline on the right grow:
				<em>human → assistant (tool_call) → tool → assistant (final)</em>.
			</p>
		</Slide>

		<Slide title="Why small in-browser models flake here">
			<p>
				Tool calling depends on the model emitting precisely-formatted JSON. Smaller models
				(under ~1B parameters) often hallucinate field names, miss required args, or skip
				the call entirely. That is why the LangX setup page recommends Qwen3 0.6B for tool
				demos, or a hosted provider via your own API key.
			</p>
		</Slide>

		<Slide ornament>
			<p>Typed in. Typed out. The loop does the rest.</p>
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
		color: var(--color-ink-300);
		font-family: var(--font-mono);
	}
	input {
		background: var(--color-bg);
		border: 1px solid var(--color-rule);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.88rem;
		color: var(--color-ink-100);
	}
	input:focus {
		outline: none;
		border-color: var(--accent-ink);
	}
	.stream {
		margin-top: 0.85rem;
	}
</style>
