<script lang="ts">
	import Lesson from '$lib/components/Lesson.svelte';
	import Slide from '$lib/components/Slide.svelte';
	import Term from '$lib/components/Term.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import RunButton from '$lib/components/RunButton.svelte';
	import MessageStream from '$lib/components/MessageStream.svelte';
	import DemoFrame from '$lib/components/DemoFrame.svelte';
	import { knownWeatherCities } from '$lib/runtime/tools';
	import { withRunCache, loadCachedRun } from '$lib/runtime/runs';
	import { type BaseMessage } from '@langchain/core/messages';
	import {
		serializeMessages,
		deserializeMessages,
		type SerializedMessage
	} from '$lib/runtime/messages';
	import { runWeatherDemo } from '$lib/demos/tools-weather';
	import weatherSrc from '$lib/demos/tools-weather.ts?raw';
	import { runCalcDemo } from '$lib/demos/tools-calc';
	import calcSrc from '$lib/demos/tools-calc.ts?raw';
	import type { DemoStep } from '$lib/demos/types';
	import type { DemoManifest } from '$lib/demos/download';
	import { onMount } from 'svelte';

	const demoSource: DemoManifest = {
		id: 'tools',
		title: 'Tool calling',
		summary: 'Bind typed tools to a chat model and run the tool-calling loop until it answers.',
		entries: [
			{ path: 'lib/demos/tools-weather.ts', code: weatherSrc },
			{ path: 'lib/demos/tools-calc.ts', code: calcSrc }
		],
		runner: `import { runWeatherDemo } from './lib/demos/tools-weather';
import { runCalcDemo } from './lib/demos/tools-calc';

const log = (s: { label: string; detail?: string }) =>
	console.log('  ·', s.label, s.detail ? '— ' + s.detail : '');

console.log('=== Weather tool ===');
const weather = await runWeatherDemo('Irving, Texas', () => {}, log);
console.log('Final:', weather.at(-1)?.content, '\\n');

console.log('=== Calculator tool ===');
const calc = await runCalcDemo('(3 + 4) * 12', () => {}, log);
console.log('Final:', calc.at(-1)?.content);
`
	};

	type ConvoPayload = { messages: SerializedMessage[]; steps: DemoStep[] };

	let weatherCity = $state('Tokyo');
	let weatherRun = $state(false);
	let weatherMessages = $state<BaseMessage[]>([]);
	let weatherSteps = $state<DemoStep[]>([]);

	async function runWeather() {
		weatherRun = true;
		weatherMessages = [];
		weatherSteps = [];
		try {
			const cityForRun = weatherCity;
			const out = await withRunCache<ConvoPayload>(
				{ demoId: 'l1-tools-weather' },
				async () => {
					const steps: DemoStep[] = [];
					const messages = await runWeatherDemo(
						cityForRun,
						(m) => (weatherMessages = m),
						(s) => {
							steps.push(s);
							weatherSteps = [...steps];
						}
					);
					return { messages: serializeMessages(messages), steps };
				}
			);
			weatherMessages = deserializeMessages(out.messages);
			weatherSteps = out.steps;
		} finally {
			weatherRun = false;
		}
	}

	let calcExpr = $state('(7 + 3) * 12 / 4');
	let calcRun = $state(false);
	let calcMessages = $state<BaseMessage[]>([]);
	let calcSteps = $state<DemoStep[]>([]);

	async function runCalc() {
		calcRun = true;
		calcMessages = [];
		calcSteps = [];
		try {
			const exprForRun = calcExpr;
			const out = await withRunCache<ConvoPayload>(
				{ demoId: 'l1-tools-calc' },
				async () => {
					const steps: DemoStep[] = [];
					const messages = await runCalcDemo(
						exprForRun,
						(m) => (calcMessages = m),
						(s) => {
							steps.push(s);
							calcSteps = [...steps];
						}
					);
					return { messages: serializeMessages(messages), steps };
				}
			);
			calcMessages = deserializeMessages(out.messages);
			calcSteps = out.steps;
		} finally {
			calcRun = false;
		}
	}

	onMount(async () => {
		const cw = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-weather' });
		if (cw) {
			weatherMessages = deserializeMessages(cw.payload.messages);
			weatherSteps = cw.payload.steps ?? [];
		}
		const cc = await loadCachedRun<ConvoPayload>({ demoId: 'l1-tools-calc' });
		if (cc) {
			calcMessages = deserializeMessages(cc.payload.messages);
			calcSteps = cc.payload.steps ?? [];
		}
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
	source={demoSource}
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
				Early language models were <Term t="oracle">oracles</Term>. You asked a question, you got a paragraph back,
				and any real-world side-effect happened somewhere else, written by you, plumbed by
				you, debugged by you. The model never touched the world.
			</p>
			<p>
				Tool calling inverts that. You hand the model a small toolbox — typed functions with
				descriptions — and the model decides, turn by turn, which one to reach for. The
				oracle becomes a <Term t="participant">participant</Term>. Every agent in this course is, at its heart, a
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
				Call <Term t="bindTools"><code>model.bindTools([...])</code></Term> to attach tools to a
				chat model. The model
				can now respond with either content or a list of <Term t="tool_calls"><code>tool_calls</code></Term>. Your job
				is to execute each call, return its output as a <Term t="ToolMessage"><code>ToolMessage</code></Term>, and ask
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
		<DemoFrame
			title="Demo 1 · Weather tool"
			subtitle="model → ToolMessage → model"
			code={weatherSrc}
			codeCaption="src/lib/demos/tools-weather.ts — exactly what runs"
			steps={weatherSteps}
		>
			{#snippet run()}
				<label class="row">
					<span>City — any city worldwide (e.g. {knownWeatherCities.slice(0, 3).join(', ')}, Irving TX)</span>
					<input type="text" bind:value={weatherCity} />
				</label>
				<RunButton onclick={runWeather} running={weatherRun} />
				<div class="stream">
					<MessageStream messages={weatherMessages} compact />
				</div>
			{/snippet}
		</DemoFrame>

		<DemoFrame
			title="Demo 2 · Calculator tool"
			subtitle="Pure arithmetic, sandboxed"
			code={calcSrc}
			codeCaption="src/lib/demos/tools-calc.ts — exactly what runs"
			steps={calcSteps}
		>
			{#snippet run()}
				<label class="row">
					<span>Expression</span>
					<input type="text" bind:value={calcExpr} />
				</label>
				<RunButton onclick={runCalc} running={calcRun} />
				<div class="stream">
					<MessageStream messages={calcMessages} compact />
				</div>
			{/snippet}
		</DemoFrame>
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
		width: 100%;
	}
	.stream {
		margin-top: 0.85rem;
	}
</style>
