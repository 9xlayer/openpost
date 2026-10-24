// OpenPost launch film. Every frame is a pure function of time: render.mjs calls
// window.film.seek(t) and captures the stage. Sound cues come from the same timeline.
import { ditherThreshold } from '../../../packages/dither/dist/paint.js';

export const FPS = 60;
export const BPM = 120;
export const DURATION = 48;
const BEAT = 60 / BPM;

const capture = '/tmp/launch-film/capture';
const shots = '/assets/screenshots';
// The capture types the same post, one screenshot per character.
const launchPost = (await (await fetch('./script.json')).json()).post;

// Scene boundaries sit on bar lines (one bar = 2 s at 120 BPM).
const T = {
	intro: 0,
	everywhere: 1.5,
	converge: 3.55,
	logo: 4,
	write: 8,
	typeStart: 8.75,
	typeEnd: 12.75,
	preview: 14,
	create: 20,
	video: 23,
	schedule: 26,
	clickTomorrow: 27.25,
	clickSchedule: 28.5,
	calendar: 30,
	results: 32,
	inbox: 35,
	features: 38,
	end: 42
};

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = {
	linear: (x) => x,
	out: (x) => 1 - (1 - x) ** 3,
	in: (x) => x ** 3,
	inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
	expoOut: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
	expoInOut: (x) =>
		x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
	back: (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2
};
const prog = (t, a, b, e = ease.out) => e(clamp((t - a) / (b - a)));

const stage = document.getElementById('stage');
const pending = new Set();

function el(tag, className, parent = stage, html = '') {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (html) node.innerHTML = html;
	parent.append(node);
	return node;
}

function setSrc(img, src) {
	if (img.dataset.src === src) return;
	img.dataset.src = src;
	img.src = src;
	const decoding = img.decode().catch(() => {
		throw new Error(`Could not load ${src}`);
	});
	pending.add(decoding);
	decoding.finally(() => pending.delete(decoding));
}

function place(node, { x = 0, y = 0, s = 1, r = 0, o = 1, sx, sy } = {}) {
	const scale = sx !== undefined ? `scale(${sx}, ${sy})` : `scale(${s})`;
	node.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) ${scale}`;
	node.style.opacity = String(clamp(o));
	node.style.display = o <= 0.001 ? 'none' : '';
}

// ---------------------------------------------------------------------------
// Background: a slow Bayer-dithered glow in the brand accent, 4 px cells.
const glow = el('canvas', 'abs', stage);
glow.id = 'glow';
glow.width = 480;
glow.height = 270;
const glowContext = glow.getContext('2d');
const glowPixels = glowContext.createImageData(480, 270);
const flashes = [T.logo, T.end];

function drawGlow(t) {
	const flash = flashes.reduce((sum, at) => sum + (t >= at ? Math.exp(-(t - at) * 2.2) : 0), 0);
	const centers = [
		[0.22 + 0.05 * Math.sin(t / 3.1), 0.78 + 0.04 * Math.cos(t / 2.3), 0.42],
		[0.86 + 0.04 * Math.cos(t / 2.7), 0.12 + 0.05 * Math.sin(t / 3.7), 0.34],
		[0.5, 0.5, 0.3 + 0.25 * flash]
	];
	const strength = [0.5, 0.36, 0.85 * flash];
	const data = glowPixels.data;
	for (let y = 0; y < 270; y++) {
		for (let x = 0; x < 480; x++) {
			const u = x / 480;
			const v = y / 270;
			let coverage = 0;
			for (let i = 0; i < centers.length; i++) {
				const [cx, cy, radius] = centers[i];
				const dx = (u - cx) * 1.78;
				const dy = v - cy;
				coverage += strength[i] * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
			}
			const lit = coverage * 0.62 > ditherThreshold(x, y);
			const index = (y * 480 + x) * 4;
			data[index] = 253;
			data[index + 1] = 151;
			data[index + 2] = 93;
			data[index + 3] = lit ? 26 + Math.min(40, coverage * 40) : 0;
		}
	}
	glowContext.putImageData(glowPixels, 0, 0);
}

// ---------------------------------------------------------------------------
// Kinetic headlines: words rise out of a mask, then leave upward.
function headline(lines, { accent = [], size = 86, align = 'left', parent = stage } = {}) {
	const node = el('div', 'abs headline', parent);
	node.style.fontSize = `${size}px`;
	node.style.textAlign = align;
	const words = [];
	for (const line of lines) {
		const row = el('div', '', node);
		for (const [index, word] of line.split(' ').entries()) {
			const wrap = el('span', 'word', row);
			const inner = el('span', accent.includes(word) ? 'accent' : '', wrap, word);
			words.push(inner);
			if (index < line.split(' ').length - 1) row.append(' ');
		}
	}
	return {
		node,
		update(t, start, end, stagger = 0.06) {
			words.forEach((word, i) => {
				const enter = prog(t, start + i * stagger, start + i * stagger + 0.55, ease.expoOut);
				const leave = prog(t, end + i * 0.025, end + i * 0.025 + 0.32, ease.in);
				word.style.transform = `translateY(${(1 - enter) * 110 - leave * 110}%)`;
			});
			node.style.display = t >= start - 0.01 && t <= end + 0.6 ? '' : 'none';
		}
	};
}

function fadeText(className, text, parent = stage) {
	const node = el('div', `abs ${className}`, parent, text);
	return {
		node,
		update(t, start, end, at) {
			const enter = prog(t, start, start + 0.6, ease.expoOut);
			const leave = prog(t, end, end + 0.3, ease.in);
			place(node, {
				...at,
				y: at.y + (1 - enter) * 24 - leave * 16,
				o: enter - leave
			});
		}
	};
}

// ---------------------------------------------------------------------------
// App window: a browser frame around real 2x captures, with a camera inside.
function appWindow(parent = stage) {
	const node = el('div', 'abs window', parent);
	const bar = el('div', 'bar', node, '<i></i><i></i><i></i><span>app.openpo.st</span>');
	bar.style.position = 'relative';
	const viewport = el('div', 'viewport', node);
	const content = el('div', 'abs', viewport);
	const image = el('img', '', content);
	image.alt = '';
	return {
		node,
		content,
		image,
		show(src, camera = { x: 720, y: 450, z: 1 }) {
			setSrc(image, src);
			const z = camera.z;
			place(content, { x: 720 - camera.x * z, y: 450 - camera.y * z, s: z });
		},
		toStage(frame, camera, x, y) {
			const z = camera.z;
			const cx = 720 - camera.x * z + x * z;
			const cy = 450 - camera.y * z + y * z;
			return { x: frame.x + cx * frame.s, y: frame.y + (44 + cy) * frame.s };
		}
	};
}

const lerpCamera = (a, b, p) => ({
	x: lerp(a.x, b.x, p),
	y: lerp(a.y, b.y, p),
	z: lerp(a.z, b.z, p)
});

// ---------------------------------------------------------------------------
// Scenes.
const cues = [];
function cue(t, role, pitch) {
	const entry = { t: Math.round(t * 1000) / 1000, role };
	if (pitch) entry.pitch = pitch;
	cues.push(entry);
}

// 1. Intro: the founder's problem, in sixteen real integrations.
const introLayer = el('div', 'layer');
const introA = headline(['You shipped something.'], {
	size: 104,
	align: 'center',
	parent: introLayer
});
const introB = headline(['Now post it everywhere.'], {
	size: 104,
	align: 'center',
	accent: ['everywhere.'],
	parent: introLayer
});
const networks = [
	'X',
	'Linkedin',
	'Bluesky',
	'Threads',
	'Mastodon',
	'Instagram',
	'Youtube',
	'TikTok',
	'Facebook',
	'Pinterest',
	'Telegram',
	'Discord',
	'Pixelfed',
	'Peertube',
	'Lemmy',
	'PieFed'
];
const tiles = networks.map((name, i) => {
	const tile = el('div', 'abs tile', introLayer);
	const img = el('img', '', tile);
	img.alt = '';
	setSrc(img, `/assets/postiz-socials/${name}.svg`);
	const angle = (i / networks.length) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.08 : -0.05);
	const radius = i % 2 ? 1 : 0.8;
	return {
		tile,
		x: 960 + Math.cos(angle) * 760 * radius - 56,
		y: 540 + Math.sin(angle) * 400 * radius - 56,
		r: ((i * 37) % 17) - 8,
		at: 1.6 + i * 0.115
	};
});
const rules = [
	['<b>280</b> characters', 440, 340],
	['<b>3,000</b> characters', 1170, 340],
	['Alt text', 560, 690],
	['Thread replies', 1110, 690],
	['Link previews', 830, 250]
].map(([html, x, y], i) => ({
	node: el('div', 'abs chip', introLayer, html),
	x,
	y,
	at: 2.4 + i * 0.15
}));

for (const tile of tiles) cue(tile.at, 'pop');
for (const rule of rules) cue(rule.at, 'tick.crisp');
cue(T.logo, 'riser');

function intro(t) {
	introLayer.style.display = t < T.logo + 0.1 ? 'block' : 'none';
	if (t >= T.logo + 0.1) return;
	introA.update(t, 0.1, T.everywhere - 0.35, 0.09);
	place(introA.node, { x: 0, y: 470, o: 1 });
	introA.node.style.width = '1920px';
	introB.update(t, T.everywhere, T.converge - 0.05, 0.08);
	place(introB.node, { x: 0, y: 470, o: 1 });
	introB.node.style.width = '1920px';
	const suck = prog(t, T.converge, T.logo, ease.in);
	for (const tile of tiles) {
		const enter = prog(t, tile.at, tile.at + 0.45, ease.back);
		const drift = Math.sin(t * 1.3 + tile.r) * 6;
		place(tile.tile, {
			x: lerp(tile.x, 904, suck),
			y: lerp(tile.y + drift, 484, suck),
			r: tile.r * (1 - suck),
			s: enter * (1 - suck * 0.8),
			o: prog(t, tile.at, tile.at + 0.12) * (1 - prog(t, T.logo - 0.08, T.logo))
		});
	}
	for (const rule of rules) {
		const enter = prog(t, rule.at, rule.at + 0.4, ease.back);
		place(rule.node, {
			x: lerp(rule.x, 900, suck),
			y: lerp(rule.y, 520, suck),
			s: enter * (1 - suck * 0.8),
			o: prog(t, rule.at, rule.at + 0.1) * (1 - prog(t, T.logo - 0.1, T.logo))
		});
	}
}

// 2. Logo: the four Converge modules converge on the downbeat.
const markPaths = [
	'M 24,4 H 60 V 32 L 32,60 H 4 V 24 A 20,20 0 0 1 24,4 Z',
	'm 68,4 h 36 a 20,20 0 0 1 20,20 V 60 H 96 L 68,32 Z',
	'm 4,68 h 28 l 28,28 v 28 H 24 A 20,20 0 0 1 4,104 Z',
	'M 68,96 96,68 h 28 v 36 a 20,20 0 0 1 -20,20 H 68 Z'
];
const directions = [
	[-1, -1],
	[1, -1],
	[-1, 1],
	[1, 1]
];
function lockup(parent) {
	const group = el('div', 'abs', parent);
	const svg = el(
		'div',
		'abs mark',
		group,
		`<svg width="256" height="256" viewBox="0 0 128 128">${markPaths
			.map((d) => `<path d="${d}"/>`)
			.join('')}</svg>`
	);
	const paths = [...svg.querySelectorAll('path')];
	const word = el('div', 'abs wordmark', group, 'OpenPost');
	return { group, svg, paths, word };
}
const logoLayer = el('div', 'layer');
const logo = lockup(logoLayer);
const tagline = fadeText('sub', 'The all-in-one content team for solo founders.', logoLayer);
tagline.node.style.fontSize = '40px';
tagline.node.style.width = '1920px';
tagline.node.style.textAlign = 'center';
cue(T.logo, 'hit');
cue(T.logo, 'drop');
cue(T.logo + 0.62, 'whoosh.short');

function drawLockup(target, t, start, settle) {
	const converge = prog(t, start - 0.12, start + 0.38, ease.back);
	target.paths.forEach((path, i) => {
		const [dx, dy] = directions[i];
		const distance = (1 - converge) * 46;
		path.setAttribute('transform', `translate(${dx * distance} ${dy * distance})`);
	});
	const slide = prog(t, settle, settle + 0.7, ease.expoInOut);
	const markSize = lerp(256, 168, slide);
	const totalWidth = 168 + 36 + 640;
	const markX = lerp(960 - markSize / 2, 960 - totalWidth / 2, slide);
	const pop = 1 + 0.08 * Math.exp(-(t - start) * 7) * (t >= start ? 1 : 0);
	place(target.svg, {
		x: markX - ((pop - 1) * markSize) / 2,
		y: 400 - markSize / 2 + lerp(140, 84, slide) - ((pop - 1) * markSize) / 2,
		s: (markSize / 256) * pop,
		o: prog(t, start - 0.15, start)
	});
	const wordReveal = prog(t, settle + 0.2, settle + 0.9, ease.expoOut);
	place(target.word, {
		x: 960 - totalWidth / 2 + 168 + 36 + (1 - wordReveal) * -40,
		y: 400 - 4,
		o: wordReveal
	});
	target.word.style.clipPath = `inset(-20% ${(1 - wordReveal) * 100}% -20% 0)`;
}

function logoScene(t) {
	const visible = t >= T.logo - 0.2 && t < T.write + 0.2;
	logoLayer.style.display = visible ? 'block' : 'none';
	if (!visible) return;
	drawLockup(logo, t, T.logo, T.logo + 0.55);
	tagline.update(t, T.logo + 1.4, T.write - 0.55, { x: 0, y: 640 });
	const leave = prog(t, T.write - 0.4, T.write, ease.in);
	place(logo.group, { x: -leave * 120, y: 0, s: 1, o: 1 - leave });
}

// 3-7. Product scenes share one window and a left text column.
const productLayer = el('div', 'layer');
const mainWindow = appWindow(productLayer);
const sideWindow = appWindow(productLayer);
const frame = { x: 650, y: 134, s: 0.86 };
const chapter = (text) => fadeText('chapter', text, productLayer);
const textColumn = (lines, accent, sub) => ({
	chapter: chapter(lines.chapter),
	title: headline(lines.title, { accent, size: 76, parent: productLayer }),
	sub: sub ? fadeText('sub', sub, productLayer) : null
});
function drawColumn(column, t, start, end, subAt) {
	column.chapter.update(t, start, end, { x: 120, y: 360 });
	column.title.update(t, start + 0.1, end);
	place(column.title.node, { x: 120, y: 410, o: 1 });
	if (column.sub) {
		column.sub.update(t, subAt, end, { x: 120, y: 620 });
		column.sub.node.style.width = '520px';
		column.sub.node.style.whiteSpace = 'normal';
	}
}

const writeText = textColumn(
	{ chapter: '01  Write', title: ['Write it', 'once.'] },
	['once.'],
	'One draft for every account you post to.'
);
const previewText = textColumn(
	{ chapter: '02  Preview', title: ['See it on', 'every network.'] },
	['every', 'network.'],
	'Native previews for each account, before anything goes out.'
);
const createText = textColumn(
	{ chapter: '03  Create', title: ['Design.', 'Cut. Caption.'] },
	['Design.', 'Cut.', 'Caption.'],
	'An image editor and a video editor, built in.'
);
const scheduleText = textColumn(
	{ chapter: '04  Schedule', title: ['Pick a time.', 'Done.'] },
	['Done.'],
	'A visible queue: scheduled, published, failed or retrying.'
);
const resultsText = textColumn(
	{ chapter: '05  Learn', title: ['See what', 'landed.'] },
	['landed.'],
	'Analytics and replies from every account, in one inbox.'
);

const typingFrames = [...launchPost].map(
	(_, i) => `${capture}/typing/${String(i).padStart(4, '0')}.png`
);
const typeAt = (i) => T.typeStart + (i / launchPost.length) * (T.typeEnd - T.typeStart);
{
	let lastKey = -1;
	[...launchPost].forEach((character, i) => {
		const at = typeAt(i);
		if (character === '\n') {
			if (launchPost[i - 1] !== '\n') cue(at, 'key.return');
			return;
		}
		if (at - lastKey < 0.115) return;
		lastKey = at;
		cue(at, character === ' ' ? 'key.space' : 'key');
	});
}

const cameras = {
	wide: { x: 720, y: 450, z: 1 },
	composer: { x: 850, y: 250, z: 1.9 },
	imageEditor: { x: 700, y: 420, z: 1.55 },
	videoTimeline: { x: 700, y: 640, z: 1.6 },
	dialog: { x: 760, y: 500, z: 1.3 },
	chart: { x: 820, y: 440, z: 1.45 },
	calendar: { x: 880, y: 520, z: 1.35 }
};

const cards = [
	['linkedin', 'Linkedin'],
	['threads', 'Threads'],
	['x', 'X'],
	['mastodon', 'Mastodon'],
	['bluesky', 'Bluesky']
].map(([platform, mark], i) => {
	const group = el('div', 'abs', productLayer);
	const card = el('div', 'card', group);
	const image = el('img', '', card);
	image.alt = '';
	setSrc(image, `${capture}/preview-${platform}.png`);
	const badge = el('div', 'abs badge', group);
	const badgeImage = el('img', '', badge);
	badgeImage.alt = '';
	setSrc(badgeImage, `/assets/postiz-socials/${mark}.svg`);
	place(badge, { x: -28, y: -28 });
	return { group, at: T.preview + 0.5 + i * 0.5 };
});
for (const card of cards) cue(card.at, 'land');

const confetti = Array.from({ length: 70 }, (_, i) => {
	const node = el('div', 'abs confetti', productLayer);
	node.style.background = ['#fd975d', '#c96d32', '#f6efe9', '#e9b48a'][i % 4];
	const angle = -Math.PI / 2 + (((i * 47) % 100) / 100) * 2.6 - 1.3;
	const speed = 520 + ((i * 89) % 100) * 9;
	return {
		node,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		spin: ((i * 53) % 40) - 20
	};
});
const cursor = el(
	'div',
	'abs cursor',
	productLayer,
	`<svg viewBox="0 0 24 24" width="40" height="40"><path d="M4 2.5 19.5 12l-7 1.6L9 20.5z" fill="#fff" stroke="#110d0b" stroke-width="1.4" stroke-linejoin="round"/></svg>`
);
cue(T.clickTomorrow, 'click');
cue(T.clickSchedule, 'click');
cue(T.clickSchedule + 0.08, 'click.confirm');
cue(T.clickSchedule + 0.3, 'bell', 'E5');
cue(T.clickSchedule + 0.55, 'bell', 'A5');

const chartMask = el('div', 'abs', mainWindow.content);
chartMask.style.background = '#110d0b';

cue(T.write, 'whoosh.short');
cue(T.create, 'whoosh.short');
cue(T.video, 'snap');
cue(T.schedule, 'whoosh.short');
cue(T.calendar, 'whoosh.short');
cue(T.results, 'whoosh.short');
cue(T.inbox, 'land');
cue(T.preview, 'whoosh.short');

const zoom = (target, from, to) => (t) =>
	lerpCamera(cameras.wide, target, prog(t, from, to, ease.inOut));
function typingShot(t) {
	const p =
		prog(t, T.typeStart - 0.4, T.typeStart + 0.8, ease.inOut) *
		(1 - prog(t, T.typeEnd + 0.4, T.preview - 0.1, ease.inOut));
	const typed = Math.floor(((t - T.typeStart) / (T.typeEnd - T.typeStart)) * launchPost.length);
	let src = `${capture}/composer-empty.png`;
	if (t >= T.typeEnd + 0.4) src = `${capture}/composer-blurred.png`;
	else if (t >= T.typeStart) src = typingFrames[Math.min(launchPost.length - 1, typed)];
	return { src, camera: lerpCamera(cameras.wide, cameras.composer, p) };
}
// What the main window shows, chapter by chapter.
const windowShots = [
	{ until: T.preview, shot: typingShot },
	{
		until: T.create,
		shot: () => ({
			src: `${capture}/composer-blurred.png`,
			camera: cameras.wide
		})
	},
	{
		until: T.video,
		shot: (t) => ({
			src: `${shots}/image-editor-dark.png`,
			camera: zoom(cameras.imageEditor, T.create + 0.6, T.video - 0.2)(t)
		})
	},
	{
		until: T.schedule,
		shot: (t) => ({
			src: `${shots}/video-editor-dark.png`,
			camera: zoom(cameras.videoTimeline, T.video + 0.3, T.schedule - 0.2)(t)
		})
	},
	{
		until: T.calendar,
		shot: (t) =>
			t >= T.clickSchedule + 0.05
				? { src: `${capture}/scheduled/023.png`, camera: cameras.wide }
				: { src: `${capture}/schedule-dialog.png`, camera: cameras.dialog }
	},
	{
		until: T.results,
		shot: (t) => ({
			src: `${capture}/calendar.png`,
			camera: zoom(cameras.calendar, T.calendar + 0.3, T.results)(t)
		})
	},
	{
		until: Infinity,
		shot: (t) => ({
			src: `${capture}/analytics.png`,
			camera: zoom(cameras.chart, T.results + 0.2, T.inbox)(t)
		})
	}
];
const swaps = [T.create, T.video, T.calendar, T.results];

function drawMainWindow(t, leave) {
	const enter = prog(t, T.write - 0.15, T.write + 0.6, ease.expoOut);
	const previewAway =
		prog(t, T.preview - 0.1, T.preview + 0.5, ease.expoInOut) *
		(1 - prog(t, T.create - 0.25, T.create + 0.35, ease.expoOut));
	const frameNow = {
		x: frame.x + previewAway * 1300 + leave * 200,
		y: frame.y + (1 - enter) * 500,
		s: frame.s
	};
	place(mainWindow.node, { ...frameNow, o: enter * (1 - leave) });
	const { src, camera } = windowShots.find((entry) => t < entry.until).shot(t);
	mainWindow.show(src, camera);
	// Each new surface arrives with a short focus pull.
	const swap = swaps.find((at) => t >= at - 0.2 && t < at + 0.25);
	const blur = swap === undefined ? 0 : (1 - prog(t, swap - 0.2, swap + 0.25, ease.expoOut)) * 8;
	mainWindow.content.style.filter = blur ? `blur(${blur}px)` : 'none';
	return frameNow;
}

function drawResults(t, leave) {
	// The analytics chart draws from left to right.
	const chartReveal = prog(t, T.results + 0.5, T.results + 2.2, ease.inOut);
	const charting = t >= T.results && t < T.features;
	place(chartMask, {
		x: 302 + chartReveal * 1090,
		y: 345,
		o: charting ? 1 : 0
	});
	chartMask.style.width = `${(1 - chartReveal) * 1090}px`;
	chartMask.style.height = '300px';
	// The inbox overlaps analytics as a second window.
	const inboxIn = prog(t, T.inbox - 0.1, T.inbox + 0.55, ease.expoOut);
	sideWindow.show(`${capture}/inbox.png`, { x: 900, y: 360, z: 1.15 });
	place(sideWindow.node, {
		x: 880 + (1 - inboxIn) * 900 + leave * 200,
		y: 300,
		s: 0.68,
		o: t >= T.inbox - 0.1 ? 1 - leave : 0
	});
}

function drawCards(t) {
	// Destination previews deal in like cards; earlier ones step back.
	const out = prog(t, T.create - 0.35, T.create + 0.1, ease.in);
	const dealt = cards.filter((other) => t >= other.at).length;
	cards.forEach((card, i) => {
		const appear = prog(t, card.at - 0.05, card.at + 0.45, ease.back);
		const depth = Math.max(0, dealt - 1 - i);
		place(card.group, {
			x: 860 + depth * 26 + out * 1100,
			y: 470 - depth * 58 + (1 - appear) * 620,
			r: (i % 2 ? 1.6 : -1.8) * (1 - appear * 0.6),
			s: 1.42 - depth * 0.06,
			o: t >= card.at - 0.05 ? (1 - out) * (1 - depth * 0.16) : 0
		});
		card.group.style.zIndex = String(10 + i);
	});
}

function drawScheduling(t, frameNow) {
	const tomorrow = mainWindow.toStage(frameNow, cameras.dialog, 596, 271);
	const button = mainWindow.toStage(frameNow, cameras.dialog, 1007, 765);
	const start = { x: 1500, y: 980 };
	const toTomorrow = prog(t, T.clickTomorrow - 0.7, T.clickTomorrow - 0.05, ease.inOut);
	const toButton = prog(t, T.clickSchedule - 0.75, T.clickSchedule - 0.05, ease.inOut);
	const pressed = [T.clickTomorrow, T.clickSchedule].some((at) => t >= at && t < at + 0.12);
	place(cursor, {
		x: lerp(lerp(start.x, tomorrow.x, toTomorrow), button.x, toButton),
		y: lerp(lerp(start.y, tomorrow.y, toTomorrow), button.y, toButton),
		s: pressed ? 0.85 : 1,
		o:
			prog(t, T.schedule + 0.3, T.schedule + 0.5) *
			(1 - prog(t, T.clickSchedule + 0.25, T.clickSchedule + 0.45))
	});
	const burst = t - T.clickSchedule;
	const origin = mainWindow.toStage(frameNow, cameras.wide, 720, 820);
	const fade = 1 - prog(t, T.clickSchedule + 1.2, T.clickSchedule + 1.8);
	for (const piece of confetti) {
		place(piece.node, {
			x: origin.x + piece.vx * burst * 1.1,
			y: origin.y + piece.vy * burst * 1.1 + 1400 * burst * burst,
			r: piece.spin * burst * 30,
			o: burst < 0 || burst > 1.8 ? 0 : fade
		});
	}
}

function productScene(t) {
	const visible = t >= T.write - 0.2 && t < T.features + 0.3;
	productLayer.style.display = visible ? 'block' : 'none';
	if (!visible) return;
	const leave = prog(t, T.features - 0.35, T.features + 0.1, ease.in);
	const frameNow = drawMainWindow(t, leave);
	drawResults(t, leave);
	drawCards(t);
	drawScheduling(t, frameNow);
	drawColumn(writeText, t, T.write + 0.15, T.preview - 0.45, T.typeEnd + 0.1);
	drawColumn(previewText, t, T.preview + 0.15, T.create - 0.45, T.preview + 3);
	drawColumn(createText, t, T.create + 0.15, T.schedule - 0.45, T.create + 1.5);
	drawColumn(scheduleText, t, T.schedule + 0.15, T.results - 0.45, T.clickSchedule + 0.5);
	drawColumn(resultsText, t, T.results + 0.15, T.features - 0.45, T.inbox + 0.4);
}

// 8. Feature burst: more of the workspace, eight beats.
const featureLayer = el('div', 'layer');
const featureTitle = headline(['And everything around it.'], {
	size: 72,
	align: 'center',
	accent: ['everything'],
	parent: featureLayer
});
const features = [
	['workflows', 'Workflows'],
	['media', 'Media library'],
	['memes', 'Meme maker'],
	['recorder', 'Recorder'],
	['repost', 'Auto repost'],
	['ideas', 'AI ideas'],
	['automation', 'API and MCP'],
	['workspaces', 'Workspaces']
].map(([icon, label], i) => {
	const node = el('div', 'abs feature', featureLayer);
	const img = el('img', '', node);
	img.alt = '';
	setSrc(img, `/assets/brand/features/${icon}.svg`);
	el('span', '', node, label);
	return {
		node,
		at: T.features + 0.5 + i * 0.25,
		x: 260 + (i % 4) * 360,
		y: 330 + Math.floor(i / 4) * 270
	};
});
for (const feature of features) cue(feature.at, 'pop');
cue(T.end, 'riser');

function featureScene(t) {
	const visible = t >= T.features - 0.1 && t < T.end + 0.1;
	featureLayer.style.display = visible ? 'block' : 'none';
	if (!visible) return;
	featureTitle.update(t, T.features + 0.05, T.end - 0.5, 0.05);
	place(featureTitle.node, { x: 0, y: 150 });
	featureTitle.node.style.width = '1920px';
	const suck = prog(t, T.end - 0.45, T.end, ease.in);
	for (const feature of features) {
		const appear = prog(t, feature.at, feature.at + 0.45, ease.back);
		place(feature.node, {
			x: lerp(feature.x, 810, suck),
			y: lerp(feature.y + (1 - appear) * 60, 425, suck),
			s: appear * (1 - suck * 0.7),
			o: prog(t, feature.at, feature.at + 0.1) * (1 - prog(t, T.end - 0.1, T.end))
		});
	}
}

// 9. End card.
const endLayer = el('div', 'layer');
const endLogo = lockup(endLayer);
const endUrl = fadeText('url', 'openpo.st', endLayer);
endUrl.node.style.width = '1920px';
endUrl.node.style.textAlign = 'center';
const endLine = fadeText('sub', 'Open source. Use Hosted, or self-host it.', endLayer);
endLine.node.style.width = '1920px';
endLine.node.style.textAlign = 'center';
cue(T.end, 'hit');
cue(T.end, 'drop');
cue(T.end + 1.2, 'text', 'E4');
cue(T.end + 1.7, 'text', 'G4');

function endScene(t) {
	const visible = t >= T.end - 0.2;
	endLayer.style.display = visible ? 'block' : 'none';
	if (!visible) return;
	drawLockup(endLogo, t, T.end, T.end + 0.45);
	endUrl.update(t, T.end + 1.2, DURATION + 1, { x: 0, y: 620 });
	endLine.update(t, T.end + 1.7, DURATION + 1, { x: 0, y: 700 });
	place(endLogo.group, { x: 0, y: -40, o: 1 });
}

const sampleLabel = el('div', 'label', stage, 'Sample workspace data');

export async function seek(t) {
	drawGlow(t);
	intro(t);
	logoScene(t);
	productScene(t);
	featureScene(t);
	endScene(t);
	sampleLabel.style.opacity = t >= T.write && t < T.features ? '1' : '0';
	await document.fonts.ready;
	while (pending.size) await Promise.all(pending);
}

cues.sort((a, b) => a.t - b.t);
window.film = { seek, cues, FPS, BPM, BEAT, DURATION, sections: T };
