/**
 * A tiny 2-component PCA — just enough to lay high-dimensional embeddings out on
 * a 2-D map so a learner can SEE that similar passages cluster and a query lands
 * near the chunks it retrieves.
 *
 * We never materialise the d×d covariance matrix (d = 384 for MiniLM). Instead we
 * run power iteration with an implicit covariance product Cu = Xᵀ(Xu), which is
 * cheap for the handful of chunks a demo indexes.
 */
export interface Pca2 {
	mean: number[];
	c1: number[];
	c2: number[];
}

function dot(a: number[], b: number[]): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	return s;
}

function norm(v: number[]): number {
	return Math.sqrt(dot(v, v));
}

// Deterministic seed so the map's orientation is stable across re-fits.
function seed(d: number, salt: number): number[] {
	const v = new Array(d);
	for (let i = 0; i < d; i++) v[i] = Math.sin((i + 1) * 12.9898 + salt * 78.233);
	const n = norm(v) || 1;
	return v.map((x) => x / n);
}

/**
 * Fit the top-2 principal directions of a set of vectors. `center` (default) maps
 * spread around the mean — best for laying out many points. With `center: false`
 * it projects onto the top-2 directions of the RAW vectors (an SVD plane through
 * the origin), which preserves direction-from-origin — so two vectors keep their
 * exact angle. Use the uncentered form when the angle itself is the point.
 */
export function fitPca2(vectors: number[][], center = true): Pca2 {
	const n = vectors.length;
	const d = vectors[0]?.length ?? 0;
	const mean = new Array(d).fill(0);
	if (center) {
		for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i];
		for (let i = 0; i < d; i++) mean[i] /= Math.max(1, n);
	}

	const X = vectors.map((v) => v.map((x, i) => x - mean[i])); // centered (or raw)

	// Implicit covariance product: C·u = Xᵀ(X·u).
	const cmul = (u: number[]): number[] => {
		const xu = X.map((row) => dot(row, u)); // n
		const out = new Array(d).fill(0);
		for (let r = 0; r < n; r++) {
			const s = xu[r];
			const row = X[r];
			for (let i = 0; i < d; i++) out[i] += row[i] * s;
		}
		return out;
	};

	const iterate = (salt: number, ortho: number[][]): number[] => {
		let v = seed(d, salt);
		for (let t = 0; t < 64; t++) {
			let w = cmul(v);
			for (const o of ortho) {
				const p = dot(w, o);
				for (let i = 0; i < d; i++) w[i] -= p * o[i];
			}
			const wn = norm(w);
			if (wn < 1e-9) break;
			v = w.map((x) => x / wn);
		}
		return v;
	};

	const c1 = d ? iterate(1, []) : [];
	const c2 = d ? iterate(2, [c1]) : [];
	return { mean, c1, c2 };
}

/** Project a vector into the fitted 2-D space. */
export function project(v: number[], pca: Pca2): [number, number] {
	const { mean, c1, c2 } = pca;
	const centered = v.map((x, i) => x - (mean[i] ?? 0));
	return [dot(centered, c1), dot(centered, c2)];
}
