<script lang="ts">
	import Accordion from './Accordion.svelte';

	// The sixteen Runnables in the poster, in the same order. Each explanation is
	// educational (what it is + why you'd reach for it), not implementation trivia.
	interface Entry {
		name: string;
		sig: string;
		body: string;
	}
	const entries: Entry[] = [
		{
			name: 'Runnable',
			sig: 'invoke · batch · stream · streamEvents',
			body: 'The base interface every piece implements. If your object speaks these four methods (plus their async variants), it composes with everything else in LangChain — no adapters, no special cases.'
		},
		{
			name: 'RunnableSequence',
			sig: 'a.pipe(b).pipe(c)',
			body: 'Runs steps left-to-right, each output feeding the next. This is what `.pipe()` builds and the backbone of LCEL. The output type of every step must match the next step’s input type.'
		},
		{
			name: 'RunnableParallel',
			sig: 'RunnableParallel.from({ x, y })',
			body: 'Runs several Runnables on the SAME input at once and gathers their results into a keyed object `{ x, y }`. Because they start together, wall-clock ≈ the slowest branch, not the sum.'
		},
		{
			name: 'RunnablePassthrough',
			sig: 'RunnablePassthrough.assign({ … })',
			body: 'Passes its input through unchanged. `.assign({…})` adds computed keys while keeping the original — the usual way to carry the question alongside retrieved context.'
		},
		{
			name: 'RunnableLambda',
			sig: 'RunnableLambda.from((x) => …)',
			body: 'Wraps any plain function as a Runnable, so your custom code (formatting, glue, side calls) composes in a pipe like everything else. May be sync or async.'
		},
		{
			name: 'RunnableMap',
			sig: '{ a: chainA, b: chainB }',
			body: 'The keyed-parallel form: a plain object of Runnables inside a pipe becomes a map that builds a dictionary of results in one step. (RunnableParallel is the explicit constructor for it.)'
		},
		{
			name: 'RunnableBranch',
			sig: 'RunnableBranch.from([[cond, a], fallback])',
			body: 'Routes the input to the first branch whose condition returns true, else the default — an if/else for chains. Useful for picking a prompt or model by input type.'
		},
		{
			name: 'withFallbacks',
			sig: 'primary.withFallbacks([backup])',
			body: 'If the primary Runnable throws, the next one is tried with the same input. Resilience against a flaky model or provider, or a cheaper-then-stronger escalation.'
		},
		{
			name: 'withRetry',
			sig: 'runnable.withRetry({ stopAfterAttempt: 3 })',
			body: 'Automatically retries on transient errors with backoff. Wraps any Runnable, so retries apply uniformly to a single step or a whole chain.'
		},
		{
			name: 'bind',
			sig: "model.bind({ stop: ['\\n'], tools })",
			body: 'Pre-sets call-time arguments (tools, stop sequences, temperature) so the composed step always uses them. Returns a RunnableBinding that behaves like the original.'
		},
		{
			name: 'map',
			sig: 'runnable.map()',
			body: 'Turns a Runnable into one that applies itself to EACH item of a list input, returning a list. Different from `.batch()`, which you call with a list of separate inputs.'
		},
		{
			name: 'configurable',
			sig: 'runnable.configurableFields({ … })',
			body: 'Exposes fields — or whole alternative Runnables (`configurableAlternatives`) — that callers swap at run time via `config.configurable`, without rebuilding the chain. Great for A/B-ing models or prompts.'
		},
		{
			name: 'ChatPromptTemplate',
			sig: 'ChatPromptTemplate.fromMessages([...])',
			body: 'Turns variables like `{topic}` and message roles into a `ChatPromptValue` (a list of messages) ready for a model. A Runnable like any other — the first stop in most chains.'
		},
		{
			name: 'Chat model',
			sig: 'ChatAnthropic / ChatOpenAI / …',
			body: 'The model itself is a Runnable: messages in, an `AIMessage` out. It is the expensive step — almost all the latency and token cost live here; everything else is glue.'
		},
		{
			name: 'Output parser',
			sig: 'new StringOutputParser()',
			body: 'Takes the model’s `AIMessage` and extracts a usable value: a string, or with structured parsers a typed object. The last stop that turns a model reply into data your code can use.'
		},
		{
			name: 'Retriever',
			sig: 'retriever.invoke(query) → Document[]',
			body: 'A Runnable you drop into a chain to pull in external knowledge by similarity — the heart of RAG. Returns the most relevant documents for a query so the model can ground its answer.'
		}
	];

	const items = entries.map((e) => ({ title: e.name, meta: e.sig, body: e.body }));
</script>

<Accordion {items} heading="The sixteen, explained" />
