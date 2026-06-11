/**
 * Builds src/lib/data/sky.json from d3-celestial's data (BSD-3, Olaf Frohn,
 * https://github.com/ofrohn/d3-celestial): real star positions (HYG/Hipparcos)
 * and the official constellation figures.
 *
 *   node scripts/build-sky.mjs
 *
 * Output:
 *  - stars: every star to magnitude 5.0 as [ra, dec, mag] (RA 0..360, J2000)
 *  - constellations: for the Observatory's 11 chartable regions — the figure
 *    line segments and the figure's vertex stars matched back to the catalog
 *    for magnitude + proper name.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SRC = {
	stars: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.6.json',
	lines: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json',
	names: 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/starnames.json'
};

// The Observatory's chartable regions: our ids → IAU abbreviations.
const REGIONS = {
	lyra: 'Lyr',
	cygnus: 'Cyg',
	aquila: 'Aql',
	cassiopeia: 'Cas',
	perseus: 'Per',
	andromeda: 'And',
	'ursa-major': 'UMa',
	draco: 'Dra',
	delphinus: 'Del',
	corona: 'CrB',
	orion: 'Ori'
};

async function load(name, url) {
	const cache = `/tmp/sky-${name}.json`;
	if (existsSync(cache)) return JSON.parse(await readFile(cache, 'utf8'));
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	const text = await res.text();
	await writeFile(cache, text);
	return JSON.parse(text);
}

const ra360 = (ra) => ((ra % 360) + 360) % 360;
const rad = (d) => (d * Math.PI) / 180;
const vec = (ra, dec) => [
	Math.cos(rad(dec)) * Math.cos(rad(ra)),
	Math.cos(rad(dec)) * Math.sin(rad(ra)),
	Math.sin(rad(dec))
];
const angle = (a, b) => {
	const [x1, y1, z1] = vec(a.ra, a.dec);
	const [x2, y2, z2] = vec(b.ra, b.dec);
	return (Math.acos(Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2))) * 180) / Math.PI;
};

const [starsRaw, linesRaw, namesRaw] = await Promise.all([
	load('stars', SRC.stars),
	load('lines', SRC.lines),
	load('names', SRC.names)
]);

// Background field: everything to mag 5.0.
const all = starsRaw.features.map((f) => ({
	hip: f.id,
	ra: ra360(f.geometry.coordinates[0]),
	dec: f.geometry.coordinates[1],
	mag: f.properties.mag
}));
const background = all
	.filter((s) => s.mag <= 5.0)
	.map((s) => [Number(s.ra.toFixed(2)), Number(s.dec.toFixed(2)), Number(s.mag.toFixed(2))]);

const properName = (hip) => {
	const rec = namesRaw[String(hip)];
	return rec && rec.name ? rec.name : undefined;
};

const constellations = {};
for (const [id, abbr] of Object.entries(REGIONS)) {
	const feature = linesRaw.features.find((f) => f.id === abbr);
	if (!feature) throw new Error(`No constellation lines for ${abbr}`);

	// Flatten polylines into segments; collect unique figure vertices.
	const segments = [];
	const vertices = new Map();
	for (const line of feature.geometry.coordinates) {
		for (let i = 0; i < line.length; i++) {
			const p = { ra: ra360(line[i][0]), dec: line[i][1] };
			vertices.set(`${p.ra.toFixed(3)},${p.dec.toFixed(3)}`, p);
			if (i > 0) {
				const q = { ra: ra360(line[i - 1][0]), dec: line[i - 1][1] };
				segments.push([
					[Number(q.ra.toFixed(3)), Number(q.dec.toFixed(3))],
					[Number(p.ra.toFixed(3)), Number(p.dec.toFixed(3))]
				]);
			}
		}
	}

	// Match each figure vertex to the nearest real star (≤1.2°) for mag + name.
	const matched = [...vertices.values()].map((p) => {
		let best = null;
		for (const s of all) {
			if (Math.abs(s.dec - p.dec) > 1.5) continue;
			const d = angle(p, s);
			if (d <= 1.2 && (!best || d < best.d)) best = { ...s, d };
		}
		return { p, best };
	});
	// The same proper name can belong to several catalog stars (double-star
	// components, historical shared names) — the brightest match keeps it so
	// labels never render twice.
	const nameOwner = new Map();
	for (const m of matched) {
		const name = m.best ? properName(m.best.hip) : undefined;
		if (!name) continue;
		const cur = nameOwner.get(name);
		if (!cur || m.best.mag < cur.best.mag) nameOwner.set(name, m);
	}
	const stars = matched.map(({ p, best }) => {
		const name = best ? properName(best.hip) : undefined;
		return {
			ra: Number(p.ra.toFixed(3)),
			dec: Number(p.dec.toFixed(3)),
			mag: best ? Number(best.mag.toFixed(2)) : 4.5,
			...(name && nameOwner.get(name)?.p === p ? { name } : {})
		};
	});

	constellations[id] = { abbr, segments, stars };
}

const out = {
	license:
		'Derived from d3-celestial data (BSD-3-Clause, Olaf Frohn) — real HYG/Hipparcos positions, J2000.',
	stars: background,
	constellations
};

await writeFile('src/lib/data/sky.json', JSON.stringify(out));
console.log(
	`sky.json written: ${background.length} background stars · ${Object.keys(constellations).length} constellations`
);
for (const [id, c] of Object.entries(constellations)) {
	const named = c.stars.filter((s) => s.name).map((s) => s.name);
	console.log(
		`  ${id.padEnd(12)} ${c.stars.length} figure stars · ${c.segments.length} segments · named: ${named.slice(0, 4).join(', ')}${named.length > 4 ? '…' : ''}`
	);
}
