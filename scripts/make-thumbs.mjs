/**
 * Generate small WebP thumbnails for the lesson banners + level posters.
 *
 * Sources (static/images): every lesson banner (`l1-*`, `l2-*`, `l3-*`,
 * `lc-overview-hero`) and the three level posters (`chapter-*-hero`).
 * Output: static/images/thumbs/<id>.webp at WIDTH px wide (aspect preserved).
 *
 * Re-runnable: drop in regenerated PNGs under the same ids and run again —
 *   node scripts/make-thumbs.mjs
 */
import sharp from 'sharp';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'static/images';
const OUT = 'static/images/thumbs';
const WIDTH = 640; // crisp for the level cards, downscales cleanly for the TOC chips
const QUALITY = 82;

const isBanner = (f) =>
	/^(l1|l2|l3)-.*\.png$/.test(f) ||
	f === 'lc-overview-hero.png' ||
	/^chapter-.*-hero\.png$/.test(f);

const files = (await readdir(SRC)).filter(isBanner).sort();
await mkdir(OUT, { recursive: true });

let ok = 0;
for (const f of files) {
	const id = f.replace(/\.png$/, '');
	const src = path.join(SRC, f);
	const meta = await sharp(src).metadata();
	await sharp(src)
		.resize({ width: WIDTH, withoutEnlargement: true })
		.webp({ quality: QUALITY })
		.toFile(path.join(OUT, `${id}.webp`));
	console.log(`  ${id.padEnd(26)} ${meta.width}×${meta.height} → thumbs/${id}.webp`);
	ok++;
}
console.log(`\n${ok} thumbnail(s) written to ${OUT}/ (width ${WIDTH}px, webp q${QUALITY}).`);
