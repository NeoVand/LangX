/**
 * Tic-tac-toe against the graph — a worked example of the two things this lesson
 * teaches, in ONE graph:
 *
 *   START → referee → (router reads the board) ─┬─ game over ─────────────────▶ END
 *                                               ├─ AI's turn ─▶ [scan_win ∥ scan_block] ─▶ decide ─▶ (loop) referee
 *                                               └─ your turn ─────────────────────────────────────▶ END
 *
 * • CONDITIONAL EDGE — after every move a `referee` (plain code) node checks the
 *   board, and the conditional edge decides what runs next. The number of turns
 *   is unknown at build time, so this routing CAN'T be a static edge — only a
 *   function that reads the live state can express "stop when someone wins."
 *
 * • REDUCERS — when it's the AI's turn the router returns an ARRAY of node names,
 *   so `scan_win` and `scan_block` run in parallel and BOTH write `analysis` in
 *   the same super-step. Concurrent writes to one field need a reducer (here a
 *   concat) or LangGraph raises INVALID_CONCURRENT_GRAPH_UPDATE. `moves` uses the
 *   same append style; `board`/`status` are last-write-wins.
 *
 * You play ✕ (and always move first); the graph plays ◯. Each click of yours is
 * one graph run: the board (with your move already applied) goes in, the graph
 * decides whether the game is over and, if not, makes ◯'s move. The lesson
 * streams every run into <LiveGraph> via `runGraphTurn`.
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import { getModel } from '$lib/runtime/llm';
import { runGraphTurn, type StreamableGraph } from './graph-run';

export type Mark = 'x' | 'o';
export type Cell = '' | Mark;
export type Board = Cell[]; // length 9, indices 0-8 left→right, top→bottom
export type Status = 'continue' | 'x' | 'o' | 'draw';

/** One move that landed on the board. `moves` accumulates these (append reducer). */
export interface Move {
	mark: Mark;
	cell: number;
	rationale?: string;
}
/** A tactical finding written in parallel by scan_win / scan_block (concat reducer). */
export interface ScanNote {
	kind: 'win' | 'block';
	cell: number; // -1 when nothing found
	found: boolean;
}

/** The graph's state, snapshotted per step for the live graph. */
export interface GameSnapshot {
	board: Board;
	moves: Move[];
	analysis: ScanNote[];
	status: Status;
	aiMove: number;
}

// ── Board helpers (plain functions — reused by the code nodes) ───────────────
const LINES = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
	[0, 4, 8], [2, 4, 6] // diagonals
];

export function emptyBoard(): Board {
	return Array(9).fill('') as Board;
}
export function emptyCells(b: Board): number[] {
	return b.map((c, i) => (c === '' ? i : -1)).filter((i) => i >= 0);
}
/** Who has three in a row, if anyone. */
export function winner(b: Board): Mark | null {
	for (const [a, c, d] of LINES) {
		if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a] as Mark;
	}
	return null;
}
/** The empty cell where `mark` would complete a line, or -1 if none. */
export function findWinningCell(b: Board, mark: Mark): number {
	for (const i of emptyCells(b)) {
		const probe = b.slice();
		probe[i] = mark;
		if (winner(probe) === mark) return i;
	}
	return -1;
}
/** Whose turn it is. ✕ moves first, so equal counts ⇒ ✕ to move. */
export function turnOf(b: Board): Mark {
	const xs = b.filter((c) => c === 'x').length;
	const os = b.filter((c) => c === 'o').length;
	return xs > os ? 'o' : 'x';
}
/** Fall-back preference when neither a win nor a block is forced. */
function preferredCell(empties: number[]): number {
	for (const c of [4, 0, 2, 6, 8, 1, 3, 5, 7]) if (empties.includes(c)) return c;
	return empties[0];
}
function renderBoard(b: Board): string {
	const g = b.map((c, i) => (c === '' ? String(i) : c.toUpperCase()));
	return `${g[0]} | ${g[1]} | ${g[2]}\n${g[3]} | ${g[4]} | ${g[5]}\n${g[6]} | ${g[7]} | ${g[8]}`;
}

// ── The graph: state (with reducers), nodes, and the conditional edge ────────
const GameState = Annotation.Root({
	// last-write-wins: each node hands back the whole board.
	board: Annotation<Board>({ reducer: (_, b) => b, default: emptyBoard }),
	// append: a running history of moves (like the messages reducer).
	moves: Annotation<Move[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
	// CONCAT — scan_win & scan_block write this concurrently, so it MUST reduce.
	analysis: Annotation<ScanNote[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
	status: Annotation<Status>({ reducer: (_, b) => b, default: () => 'continue' as Status }),
	aiMove: Annotation<number>({ reducer: (_, b) => b ?? -1, default: () => -1 })
});

/** Build (and compile) the tic-tac-toe graph. Returns a compiled, streamable graph. */
export async function buildGameGraph() {
	const model = await getModel({ temperature: 0.4, maxTokens: 8 });

	return new StateGraph(GameState)
		// CODE node — judge the board after the last move.
		.addNode('referee', (s) => {
			const w = winner(s.board);
			const status: Status = w ? w : emptyCells(s.board).length === 0 ? 'draw' : 'continue';
			return { status };
		})
		// CODE node — is there a cell where ◯ wins right now?
		.addNode('scan_win', (s) => {
			const cell = findWinningCell(s.board, 'o');
			return { analysis: [{ kind: 'win', cell, found: cell >= 0 }] };
		})
		// CODE node — is there a cell where ✕ would win next, that ◯ must block?
		.addNode('scan_block', (s) => {
			const cell = findWinningCell(s.board, 'x');
			return { analysis: [{ kind: 'block', cell, found: cell >= 0 }] };
		})
		// MODEL node — choose ◯'s move: win > block > ask the model (validated).
		.addNode('decide', async (s) => {
			const win = s.analysis.find((a) => a.kind === 'win' && a.found);
			const block = s.analysis.find((a) => a.kind === 'block' && a.found);
			const empties = emptyCells(s.board);

			let cell: number;
			let rationale: string;
			if (win) {
				cell = win.cell;
				rationale = `Completing my line at ${cell} — that wins.`;
			} else if (block) {
				cell = block.cell;
				rationale = `Blocking your threat at ${cell}.`;
			} else {
				const prompt =
					`You are playing tic-tac-toe as O; the human is X. Board (cells 0-8, ` +
					`left→right, top→bottom):\n${renderBoard(s.board)}\n` +
					`Empty cells: ${empties.join(', ')}. Pick the strongest move for O. ` +
					`Reply with ONLY the cell number.`;
				const res = await model.invoke(prompt);
				const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
				const picked = Number(text.match(/\d/)?.[0] ?? NaN);
				cell = empties.includes(picked) ? picked : preferredCell(empties);
				rationale = `Open game — taking ${cell} to build a threat.`;
			}

			const board = s.board.slice();
			board[cell] = 'o';
			return { board, aiMove: cell, moves: [{ mark: 'o' as Mark, cell, rationale }] };
		})
		.addEdge(START, 'referee')
		// THE CONDITIONAL EDGE — read the board, decide what runs next.
		.addConditionalEdges(
			'referee',
			(s) => {
				if (s.status !== 'continue') return END; // someone won, or a draw
				// ◯'s turn → run both scans in parallel; ✕'s turn → hand back to the UI.
				return turnOf(s.board) === 'o' ? ['scan_win', 'scan_block'] : END;
			},
			['scan_win', 'scan_block', END]
		)
		// fan-in: decide runs once, after BOTH scans complete.
		.addEdge('scan_win', 'decide')
		.addEdge('scan_block', 'decide')
		// loop back so the referee can judge ◯'s move (then it's ✕'s turn → END).
		.addEdge('decide', 'referee')
		.compile();
}

/**
 * Stream one turn into <LiveGraph>. The board (with the human's ✕ already placed)
 * is the input; each node's streamed update is folded into the running snapshot
 * by `merge`, which mirrors the graph's reducers so the State tab stays accurate.
 */
export async function runGameTurn(
	graph: Awaited<ReturnType<typeof buildGameGraph>>,
	board: Board,
	config: { configurable: { thread_id: string } },
	onUpdate?: (node: string, snapshot: GameSnapshot) => void | Promise<void>
) {
	const seed = (): GameSnapshot => ({
		board: board.slice(),
		moves: [],
		analysis: [],
		status: 'continue',
		aiMove: -1
	});
	return runGraphTurn<GameSnapshot>(graph as unknown as StreamableGraph, seed(), config, {
		empty: seed,
		merge: (s, u) => {
			const up = u as Partial<GameSnapshot>;
			if (up.board) s.board = up.board;
			if (up.moves) s.moves = [...s.moves, ...up.moves];
			if (up.analysis) s.analysis = [...s.analysis, ...up.analysis];
			if (up.status !== undefined) s.status = up.status;
			if (typeof up.aiMove === 'number' && up.aiMove >= 0) s.aiMove = up.aiMove;
		},
		clone: (s) => ({ ...s, board: s.board.slice(), moves: s.moves.slice(), analysis: s.analysis.slice() }),
		onUpdate
	});
}
