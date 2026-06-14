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
				slug: 'model',
				title: 'The Model',
				subtitle: 'What an LLM is — and how LangChain wraps it.'
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
				slug: 'agent',
				title: 'createAgent',
				subtitle: 'A standard ReAct loop on top of a graph.'
			},
			{
				slug: 'middleware-hooks',
				title: 'Middleware & hooks',
				subtitle: 'Slotting behavior into the loop — before, around, and after.'
			},
			{
				slug: 'agentic-rag',
				title: 'Agentic RAG — the capstone',
				subtitle: 'A document agent that searches, cites, and clarifies — pure createAgent.'
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
				slug: 'overview',
				title: 'The whole graph',
				subtitle: 'A program, not a loop — see every primitive at once.'
			},
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
				subtitle: 'One node spawns N parallel workers.'
			},
			{
				slug: 'subgraphs',
				title: 'Subgraphs',
				subtitle: 'The capstone: a whole graph inside a node.'
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
				subtitle: 'The big picture: a brief becomes a playable game.'
			},
			{
				slug: 'virtual-fs',
				title: 'Virtual filesystem',
				subtitle: 'The Bug Hunt: grep, read, edit, verify.'
			},
			{
				slug: 'todos',
				title: 'The plan board',
				subtitle: 'Plan mode, recitation, live replanning.'
			},
			{
				slug: 'backends',
				title: 'Backends',
				subtitle: 'The Observatory: an atlas that outlives the thread.'
			},
			{
				slug: 'permissions',
				title: 'Filesystem permissions',
				subtitle: 'Allow, deny, or summon a human.'
			},
			{
				slug: 'subagents',
				title: 'Subagents',
				subtitle: 'The Clockwork Troupe: parallel wrights, one async arranger.'
			},
			{
				slug: 'skills',
				title: 'Skills (progressive disclosure)',
				subtitle: 'The Support Desk: one question, three wardrobes.'
			},
			{
				slug: 'compaction',
				title: 'Context compaction',
				subtitle: 'The Incident Room: read a mountain, keep the needle.'
			},
			{
				slug: 'hitl',
				title: 'Human-in-the-loop',
				subtitle: 'The Greenhouse: approve, edit, reject, respond.'
			},
			{
				slug: 'capstone-research',
				title: 'Capstone — Deep Research',
				subtitle: 'Plan, approve, research real sources, cite.'
			},
			{
				slug: 'capstone-data-science',
				title: 'Capstone — Data Science',
				subtitle: 'The Analytical Engine: data in, the Mill computes, a report out.'
			},
			{
				slug: 'beyond',
				title: 'Beyond this course',
				subtitle: 'The frontier: the real package, sandboxes, deployment, tuning.'
			}
		]
	}
];

export function chapterById(id: Chapter['id']) {
	return chapters.find((c) => c.id === id)!;
}
