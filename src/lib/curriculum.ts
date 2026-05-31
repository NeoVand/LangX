export interface LessonLink {
	slug: string;
	title: string;
	subtitle: string;
	/** Listed on the chapter intro but the lesson page isn't built yet (no link). */
	comingSoon?: boolean;
}

export interface Chapter {
	id: 'langchain' | 'langgraph' | 'deepagents';
	number: 1 | 2 | 3;
	title: string;
	tagline: string;
	accent: string;
	base: string;
	intro: LessonLink;
	lessons: LessonLink[];
}

export const chapters: Chapter[] = [
	{
		id: 'langchain',
		number: 1,
		title: 'LangChain',
		tagline: 'Foundations: Runnables, prompts, models, tools, RAG.',
		accent: 'var(--color-accent-langchain)',
		base: '/1-langchain',
		intro: { slug: '', title: 'Level 1 — LangChain', subtitle: 'The foundation layer.' },
		lessons: [
			{
				slug: 'overview',
				title: 'Overview — the whole picture',
				subtitle: 'One hand-built chatbot: memory, documents, and images.'
			},
			{
				slug: 'runnables',
				title: 'Runnables & LCEL',
				subtitle: 'The pipe operator and the Runnable protocol.'
			},
			{
				slug: 'streaming',
				title: 'Streaming',
				subtitle: 'invoke vs stream vs streamEvents.'
			},
			{
				slug: 'structured-output',
				title: 'Structured output',
				subtitle: 'Typed JSON via Zod schemas.'
			},
			{
				slug: 'tools',
				title: 'Tools',
				subtitle: 'Letting the model call functions.'
			},
			{
				slug: 'rag',
				title: 'RAG',
				subtitle: 'Retrieval-augmented generation, in your browser.'
			},
			{
				slug: 'agent',
				title: 'createAgent',
				subtitle: 'A standard ReAct loop on top of a graph.'
			},
			{
				slug: 'middleware-hooks',
				title: 'Middleware & hooks',
				subtitle: 'Slotting behavior into the loop — before, around, and after.'
			}
		]
	},
	{
		id: 'langgraph',
		number: 2,
		title: 'LangGraph',
		tagline: 'Stateful runtimes: graphs, loops, checkpoints, interrupts.',
		accent: 'var(--color-accent-langchain)',
		base: '/2-langgraph',
		intro: { slug: '', title: 'Level 2 — LangGraph', subtitle: 'The orchestration layer.' },
		lessons: [
			{
				slug: 'stategraph',
				title: 'StateGraph',
				subtitle: 'Nodes, edges, and the chat-tool loop.'
			},
			{
				slug: 'conditional-edges',
				title: 'Conditional edges & reducers',
				subtitle: 'Routers and merging concurrent updates.'
			},
			{
				slug: 'checkpointers',
				title: 'Checkpointers & time travel',
				subtitle: 'Resume and fork past runs.'
			},
			{
				slug: 'interrupts',
				title: 'Interrupts & HITL',
				subtitle: 'Pause, ask the human, resume.'
			},
			{
				slug: 'streaming-modes',
				title: 'Streaming modes',
				subtitle: 'values, updates, and messages compared live.'
			},
			{
				slug: 'send-fanout',
				title: 'Send & fan-out',
				subtitle: 'Map-reduce inside a graph.'
			},
			{
				slug: 'subgraphs',
				title: 'Subgraphs',
				subtitle: 'Compose graphs as nodes.'
			}
		]
	},
	{
		id: 'deepagents',
		number: 3,
		title: 'Deep Agents',
		tagline: 'Cognitive harness: planning, virtual FS, subagents, memory.',
		accent: 'var(--color-accent-langchain)',
		base: '/3-deepagents',
		intro: {
			slug: '',
			title: 'Level 3 — Deep Agents',
			subtitle: 'Where the harness takes over.'
		},
		lessons: [
			{
				slug: 'harness',
				title: 'The harness',
				subtitle: 'createDeepAgent and middleware assembly.'
			},
			{
				slug: 'virtual-fs',
				title: 'Virtual filesystem',
				subtitle: 'ls, read, write, edit, glob, grep.'
			},
			{
				slug: 'todos',
				title: 'Planning with write_todos',
				subtitle: 'Externalized to-do lists.'
			},
			{
				slug: 'backends',
				title: 'Backends',
				subtitle: 'State, Store, and Composite.'
			},
			{
				slug: 'permissions',
				title: 'Filesystem permissions',
				subtitle: 'First-match-wins allow / deny.'
			},
			{
				slug: 'subagents',
				title: 'Subagents',
				subtitle: 'Delegation via the task tool.'
			},
			{
				slug: 'skills',
				title: 'Skills (progressive disclosure)',
				subtitle: 'SKILL.md catalogs.'
			},
			{
				slug: 'compaction',
				title: 'Context compaction',
				subtitle: 'Eviction, summarization, overflow recovery.'
			},
			{
				slug: 'hitl',
				title: 'Human-in-the-loop',
				subtitle: 'interruptOn and the approval queue.'
			},
			{
				slug: 'capstone-research',
				title: 'Capstone — Deep Research',
				subtitle: 'Plan, delegate, summarize, publish.'
			},
			{
				slug: 'capstone-data-science',
				title: 'Capstone — Data Science',
				subtitle: 'CSV in, scoped JS interpreter, report out.'
			},
			{
				slug: 'beyond',
				title: 'Beyond V1',
				subtitle: 'Production sandboxes, managed deployments, what we skipped.'
			}
		]
	}
];

export function chapterById(id: Chapter['id']) {
	return chapters.find((c) => c.id === id)!;
}
