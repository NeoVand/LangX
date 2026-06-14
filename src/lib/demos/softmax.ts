/**
 * Softmax with a temperature parameter, plus a Gaussian sampler — the maths
 * behind the Model lesson's temperature demo. Adapted from Neo Vandhana's
 * SoftMax Explainer (github.com/NeoVand/SoftMaxExplainer).
 */

/** softmax(xᵢ / T): higher T → flatter, lower T → peakier. Numerically stable. */
export function softmax(values: number[], temperature: number = 1.0): number[] {
	const scaled = values.map((v) => v / temperature);
	const max = Math.max(...scaled);
	const exps = scaled.map((v) => Math.exp(v - max));
	const sum = exps.reduce((a, b) => a + b, 0) || 1;
	return exps.map((v) => v / sum);
}

/** Random draws from a Gaussian (Box–Muller), for fresh example score sets. */
export function generateRandomData(count = 10, mean = 0, stdDev = 1.6): number[] {
	return Array.from({ length: count }, () => {
		const u1 = Math.random();
		const u2 = Math.random();
		const z = Math.sqrt(-2 * Math.log(u1 || 1e-9)) * Math.cos(2 * Math.PI * u2);
		return z * stdDev + mean;
	});
}
