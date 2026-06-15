export interface LessonLink {
	slug: string;
	title: string;
	subtitle: string;
	/** Banner image id → `static/images/<banner>.png` + `static/images/thumbs/<banner>.webp`. */
	banner: string;
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
	/** Level poster image id → `static/images/<poster>.png` + `static/images/thumbs/<poster>.webp`. */
	poster: string;
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
		poster: 'chapter-langchain-hero',
		intro: {
			slug: '',
			title: 'Level 1 — LangChain',
			subtitle: 'The foundation layer.',
			banner: 'chapter-langchain-hero'
		},
		lessons: [
			{
				slug: 'overview',
				title: 'Overview — the whole picture',
				subtitle: 'One hand-built chatbot: memory, documents, and images.',
				banner: 'lc-overview-hero'
			},
			{
				slug: 'model',
				title: 'The Model',
				subtitle: 'What an LLM is — and how LangChain wraps it.',
				banner: 'l1-model'
			},
			{
				slug: 'runnables',
				title: 'Runnables & LCEL',
				subtitle: 'The pipe operator and the Runnable protocol.',
				banner: 'l1-runnables'
			},
			{
				slug: 'streaming',
				title: 'Streaming',
				subtitle: 'invoke vs stream vs streamEvents.',
				banner: 'l1-streaming'
			},
			{
				slug: 'structured-output',
				title: 'Structured output',
				subtitle: 'Typed JSON via Zod schemas.',
				banner: 'l1-structured-output'
			},
			{
				slug: 'tools',
				title: 'Tools',
				subtitle: 'Letting the model call functions.',
				banner: 'l1-tools'
			},
			{
				slug: 'agent',
				title: 'createAgent',
				subtitle: 'A standard ReAct loop on top of a graph.',
				banner: 'l1-agent'
			},
			{
				slug: 'middleware-hooks',
				title: 'Middleware & hooks',
				subtitle: 'Slotting behavior into the loop — before, around, and after.',
				banner: 'l1-middleware'
			},
			{
				slug: 'agentic-rag',
				title: 'Agentic RAG — the capstone',
				subtitle: 'A document agent that searches, cites, and clarifies — pure createAgent.',
				banner: 'l1-rag'
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
		poster: 'chapter-langgraph-hero',
		intro: {
			slug: '',
			title: 'Level 2 — LangGraph',
			subtitle: 'The orchestration layer.',
			banner: 'chapter-langgraph-hero'
		},
		lessons: [
			{
				slug: 'overview',
				title: 'The whole graph',
				subtitle: 'A program, not a loop — see every primitive at once.',
				banner: 'l2-overview'
			},
			{
				slug: 'stategraph',
				title: 'StateGraph',
				subtitle: 'Nodes, edges, and the chat-tool loop.',
				banner: 'l2-stategraph'
			},
			{
				slug: 'conditional-edges',
				title: 'Conditional edges & reducers',
				subtitle: 'Routers and merging concurrent updates.',
				banner: 'l2-conditional-edges'
			},
			{
				slug: 'checkpointers',
				title: 'Checkpointers & time travel',
				subtitle: 'Resume and fork past runs.',
				banner: 'l2-checkpointers'
			},
			{
				slug: 'interrupts',
				title: 'Interrupts & HITL',
				subtitle: 'Pause, ask the human, resume.',
				banner: 'l2-interrupts'
			},
			{
				slug: 'streaming-modes',
				title: 'Streaming modes',
				subtitle: 'values, updates, and messages compared live.',
				banner: 'l2-streaming-modes'
			},
			{
				slug: 'send-fanout',
				title: 'Send & fan-out',
				subtitle: 'One node spawns N parallel workers.',
				banner: 'l2-send-fanout'
			},
			{
				slug: 'subgraphs',
				title: 'Subgraphs',
				subtitle: 'The capstone: a whole graph inside a node.',
				banner: 'l2-subgraphs'
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
		poster: 'chapter-deepagents-hero',
		intro: {
			slug: '',
			title: 'Level 3 — Deep Agents',
			subtitle: 'Where the harness takes over.',
			banner: 'chapter-deepagents-hero'
		},
		lessons: [
			{
				slug: 'harness',
				title: 'The harness',
				subtitle: 'The big picture: a brief becomes a playable game.',
				banner: 'l3-harness'
			},
			{
				slug: 'virtual-fs',
				title: 'Virtual filesystem',
				subtitle: 'The Bug Hunt: grep, read, edit, verify.',
				banner: 'l3-virtual-fs'
			},
			{
				slug: 'todos',
				title: 'The plan board',
				subtitle: 'Plan mode, recitation, live replanning.',
				banner: 'l3-todos'
			},
			{
				slug: 'backends',
				title: 'Backends',
				subtitle: 'The Observatory: an atlas that outlives the thread.',
				banner: 'l3-backends'
			},
			{
				slug: 'permissions',
				title: 'Filesystem permissions',
				subtitle: 'Allow, deny, or summon a human.',
				banner: 'l3-permissions'
			},
			{
				slug: 'subagents',
				title: 'Subagents',
				subtitle: 'The Clockwork Troupe: parallel wrights, one async arranger.',
				banner: 'l3-subagents'
			},
			{
				slug: 'skills',
				title: 'Skills (progressive disclosure)',
				subtitle: 'The Support Desk: one question, three wardrobes.',
				banner: 'l3-skills'
			},
			{
				slug: 'compaction',
				title: 'Context compaction',
				subtitle: 'The Incident Room: read a mountain, keep the needle.',
				banner: 'l3-compaction'
			},
			{
				slug: 'hitl',
				title: 'Human-in-the-loop',
				subtitle: 'The Greenhouse: approve, edit, reject, respond.',
				banner: 'l3-hitl'
			},
			{
				slug: 'capstone-research',
				title: 'Capstone — Deep Research',
				subtitle: 'Plan, approve, research real sources, cite.',
				banner: 'l3-capstone-research'
			},
			{
				slug: 'capstone-data-science',
				title: 'Capstone — Data Science',
				subtitle: 'The Analytical Engine: data in, the Mill computes, a report out.',
				banner: 'l3-capstone-data-science'
			},
			{
				slug: 'beyond',
				title: 'Beyond this course',
				subtitle: 'The frontier: the real package, sandboxes, deployment, tuning.',
				banner: 'l3-beyond'
			}
		]
	}
];

export function chapterById(id: Chapter['id']) {
	return chapters.find((c) => c.id === id)!;
}
