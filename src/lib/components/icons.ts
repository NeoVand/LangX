/**
 * Inline SVG icon set. Each value is the inner markup of a 24×24 icon drawn with
 * `stroke="currentColor"; fill="none"` (set by the consumer's <g>). Keep paths
 * simple and geometric so they stay crisp at small sizes inside diagram nodes.
 */
export const ICONS: Record<string, string> = {
	play: `<path d="M8 5.5 18 12 8 18.5Z" fill="currentColor" stroke="none"/>`,
	flag: `<path d="M6 21V4"/><path d="M6 5h12l-3 3.5L18 12H6"/>`,
	message: `<path d="M4 5.5h16v9H10l-4 4v-4H4Z"/>`,
	cpu: `<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="3" height="3" rx="0.5"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/>`,
	filter: `<path d="M4 5.5h16l-6 7v6l-4-2v-4Z"/>`,
	search: `<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.5 14.5 20 20"/>`,
	database: `<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>`,
	bookmark: `<path d="M6 4h12v16l-6-4-6 4Z"/>`,
	wrench: `<path d="M15 4a4 4 0 0 0-5 5l-6 6 4 4 6-6a4 4 0 0 0 5-5l-3 3-2-2Z"/>`,
	bot: `<rect x="4.5" y="8" width="15" height="10" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1.4"/><circle cx="9.5" cy="13" r="1.1"/><circle cx="14.5" cy="13" r="1.1"/>`,
	loop: `<path d="M5 9a7 7 0 0 1 12-3l2 2"/><path d="M19 4v4h-4"/><path d="M19 15a7 7 0 0 1-12 3l-2-2"/><path d="M5 20v-4h4"/>`,
	branch: `<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="9" r="2"/><path d="M7 8v8"/><path d="M7 12h4a4 4 0 0 0 4-3"/>`,
	merge: `<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="12" r="2"/><path d="M7 8v8"/><path d="M15.5 13.5A8 8 0 0 1 9 18"/>`,
	box: `<path d="M12 3 20 7v10l-8 4-8-4V7Z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/>`,
	pause: `<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>`,
	user: `<circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
	layers: `<path d="M12 3 21 8l-9 5-9-5Z"/><path d="M3 13l9 5 9-5"/>`,
	scissors: `<circle cx="7" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><path d="M9 9l11 8"/><path d="M9 15 20 7"/>`,
	clock: `<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>`,
	file: `<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/>`,
	folder: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>`,
	sparkle: `<path d="M12 3l1.8 5.7L19.5 10l-5.7 1.8L12 17.5l-1.8-5.7L4.5 10l5.7-1.3Z"/>`,
	book: `<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>`,
	check: `<path d="M5 13l4 4L19 7"/>`,
	checkCircle: `<circle cx="12" cy="12" r="8"/><path d="M8 12l3 3 5-5"/>`,
	signpost: `<path d="M12 3v18"/><path d="M5 6h12l2.5 2.5L17 11H5Z"/>`,
	shield: `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6Z"/>`,
	list: `<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>`,
	send: `<path d="M4 12 20 4l-6 16-3-7Z"/><path d="M11 13 20 4"/>`,
	link: `<path d="M9 12h6"/><path d="M10 8H7a4 4 0 0 0 0 8h3"/><path d="M14 8h3a4 4 0 0 1 0 8h-3"/>`,
	stream: `<path d="M3 8h11M3 12h17M3 16h8"/>`,
	bracket: `<path d="M8 4H5v16h3"/><path d="M16 4h3v16h-3"/>`,
	home: `<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/>`,
	gauge: `<path d="M5 18a8 8 0 1 1 14 0"/><path d="M12 14l4-4"/>`,
	zap: `<path d="M13 3 5 13h6l-1 8 8-10h-6Z"/>`,
	arrowRight: `<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>`,
	download: `<path d="M12 4v10"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>`,
	copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>`,
	eye: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`
};

export type IconName = keyof typeof ICONS;
