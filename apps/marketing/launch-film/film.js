// OpenPost launch film. Every frame is a pure function of time: render.mjs calls
// window.film.seek(t) and captures the stage. Sound cues come from the same timeline.
// The interface is drawn here in the app's Dither style so every part of it can move.
import { ditherThreshold, gradientSvg } from '../../../packages/dither/dist/paint.js';

export const FPS = 60;
export const BPM = 120;
export const DURATION = 32;
const BEAT = 60 / BPM;

const script = await (await fetch('./script.json')).json();
const icons = (await (await fetch('/node_modules/@iconify-json/lucide/icons.json')).json()).icons;
const avatar = '/tests/app/fixtures/product-screenshots/rodrigo-avatar.png';
const marks = (name) => `/assets/postiz-socials/${name}.svg`;

// Scene boundaries sit on bar lines (one bar = 2 s at 120 BPM). Music reads logo, features and end.
const T = {
	heroType: 0.3,
	assemble: 1.8,
	logo: 4,
	rewrite: 5.4,
	media: 6.5,
	editor: 8,
	timeline: 11.5,
	calendar: 14,
	sweep: 18,
	results: 20,
	inbox: 22.5,
	features: 24,
	end: 28
};

// --- Motion helpers ---------------------------------------------------------------------------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = {
	linear: (x) => x,
	out: (x) => 1 - (1 - x) ** 3,
	in: (x) => x ** 3,
	inOut: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
	expoOut: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
	expoIn: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
	expoInOut: (x) =>
		x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
	back: (x) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2
};
const prog = (t, a, b, e = ease.out) => e(clamp((t - a) / (b - a)));
const between = (t, a, b) => t >= a && t < b;

const stage = document.getElementById('stage');
const pending = new Set();

function icon(name, size) {
	const body = icons[name]?.body;
	if (!body) throw new Error(`Missing icon ${name}`);
	const style = size ? ` style="font-size:${size}px"` : '';
	return `<svg class="icon" viewBox="0 0 24 24"${style}>${body}</svg>`;
}

function make(parent, className, frame = {}, html = '') {
	const node = document.createElement('div');
	node.className = className;
	if (html) node.innerHTML = html;
	for (const key of ['x', 'y', 'w', 'h']) {
		if (frame[key] === undefined) continue;
		const property = { x: 'left', y: 'top', w: 'width', h: 'height' }[key];
		node.style[property] = `${frame[key]}px`;
	}
	parent.append(node);
	return node;
}

function image(parent, src, className = '') {
	const img = document.createElement('img');
	img.alt = '';
	img.className = className;
	img.src = src;
	const decoding = img.decode().catch(() => {
		throw new Error(`Could not load ${src}`);
	});
	pending.add(decoding);
	decoding.finally(() => pending.delete(decoding));
	parent.append(img);
	return img;
}

// Layout positions stay in left/top; motion is a transform on top, so alignment never drifts.
function anim(node, { x = 0, y = 0, s = 1, sx, sy, r = 0, rx = 0, ry = 0, o = 1, blur = 0 } = {}) {
	const scale = sx === undefined ? `scale(${s})` : `scale(${sx}, ${sy})`;
	node.style.transform = `translate(${x}px, ${y}px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${r}deg) ${scale}`;
	node.style.opacity = String(clamp(o));
	node.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
	node.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}

function layer(name) {
	const node = make(stage, 'layer');
	node.dataset.scene = name;
	return node;
}
const show = (node, visible) => {
	node.style.display = visible ? 'block' : 'none';
	return visible;
};

// --- Brand textures ---------------------------------------------------------------------------
const ditherButton = gradientSvg({ length: 56, kind: 'button', ink: 'rgb(42 18 6 / 0.16)' });
stage.style.setProperty(
	'--dither',
	`url("data:image/svg+xml,${encodeURIComponent(ditherButton)}")`
);

function ditherCanvas(width, height, glows, rgb, alpha) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	const pixels = context.createImageData(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let coverage = 0;
			for (const [cx, cy, radius, strength] of glows) {
				const dx = (x / width - cx) * (width / height);
				const dy = y / height - cy;
				coverage += strength * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
			}
			const index = (y * width + x) * 4;
			pixels.data.set([...rgb, coverage > ditherThreshold(x, y) ? alpha : 0], index);
		}
	}
	context.putImageData(pixels, 0, 0);
	return canvas.toDataURL();
}
const artBackground = ditherCanvas(
	240,
	135,
	[
		[0.95, 1.05, 0.62, 1.1],
		[0.1, -0.1, 0.35, 0.5]
	],
	[253, 151, 93],
	255
);
const thumbTextures = [
	[111, 207, 142],
	[129, 161, 255],
	[242, 180, 90],
	[240, 113, 103],
	[196, 148, 255]
].map((rgb, i) => ditherCanvas(96, 54, [[(i % 3) / 2, 1, 0.7, 1]], rgb, 200));

// Background: a slow dithered glow that flares on the two big hits.
const glow = document.createElement('canvas');
glow.id = 'glow';
glow.width = 480;
glow.height = 270;
stage.append(glow);
const glowContext = glow.getContext('2d');
const glowPixels = glowContext.createImageData(480, 270);
function drawGlow(t) {
	const flash = [T.logo, T.end].reduce(
		(sum, at) => sum + (t >= at ? Math.exp(-(t - at) * 2.6) : 0),
		0
	);
	const centers = [
		[0.18 + 0.06 * Math.sin(t / 2.4), 0.85, 0.42, 0.42],
		[0.85, 0.12 + 0.06 * Math.cos(t / 2.9), 0.36, 0.3],
		[0.5, 0.55, 0.32 + 0.2 * flash, 0.9 * flash]
	];
	const data = glowPixels.data;
	for (let y = 0; y < 270; y++) {
		for (let x = 0; x < 480; x++) {
			let coverage = 0;
			for (const [cx, cy, radius, strength] of centers) {
				const dx = (x / 480 - cx) * 1.78;
				const dy = y / 270 - cy;
				coverage += strength * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
			}
			const index = (y * 480 + x) * 4;
			data[index] = 253;
			data[index + 1] = 151;
			data[index + 2] = 93;
			data[index + 3] =
				coverage * 0.6 > ditherThreshold(x, y) ? 22 + Math.min(38, coverage * 38) : 0;
		}
	}
	glowContext.putImageData(glowPixels, 0, 0);
}

// --- Shared pieces ----------------------------------------------------------------------------
const cues = [];
function cue(t, role, pitch) {
	const entry = { t: Math.round(t * 1000) / 1000, role };
	if (pitch) entry.pitch = pitch;
	cues.push(entry);
}
// Key sounds follow typing, thinned to the kit's run spacing.
function typingCues(start, end, text) {
	let last = -1;
	[...text].forEach((character, i) => {
		const at = start + ((end - start) * i) / text.length;
		if (at - last < 0.16) return;
		last = at;
		cue(at, character === ' ' ? 'key.space' : 'key');
	});
}
const typed = (t, start, end, text) =>
	text.slice(0, Math.round(clamp((t - start) / (end - start)) * text.length));

function title(parent, text, accent = []) {
	const node = make(parent, 'box title', { y: 112 });
	const words = text.split(' ').map((word, i, all) => {
		const wrap = make(node, 'word');
		const inner = document.createElement('span');
		inner.textContent = word;
		if (accent.includes(word)) inner.className = 'accent';
		wrap.append(inner);
		if (i < all.length - 1) node.append(' ');
		return inner;
	});
	return (t, start, end) => {
		const visible = t >= start - 0.02 && t < end + 0.5;
		node.style.display = visible ? 'block' : 'none';
		if (!visible) return;
		words.forEach((word, i) => {
			const enter = prog(t, start + i * 0.05, start + i * 0.05 + 0.5, ease.expoOut);
			const leave = prog(t, end + i * 0.02, end + i * 0.02 + 0.28, ease.in);
			word.style.transform = `translateY(${(1 - enter) * 110 - leave * 110}%)`;
		});
	};
}

const logoPaths = [
	'M 24,4 H 60 V 32 L 32,60 H 4 V 24 A 20,20 0 0 1 24,4 Z',
	'm 68,4 h 36 a 20,20 0 0 1 20,20 V 60 H 96 L 68,32 Z',
	'm 4,68 h 28 l 28,28 v 28 H 24 A 20,20 0 0 1 4,104 Z',
	'M 68,96 96,68 h 28 v 36 a 20,20 0 0 1 -20,20 H 68 Z'
];
const logoSvg = (size) =>
	`<svg viewBox="0 0 128 128" width="${size}" height="${size}">${logoPaths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;

// The launch image: built at 960x540, placed anywhere by scale.
function artwork(parent, frame, scale, final = true) {
	const holder = make(parent, 'box', frame);
	holder.style.transformOrigin = '0 0';
	const art = make(holder, 'art');
	art.style.transform = `scale(${scale})`;
	image(art, artBackground, 'bg');
	const headline = make(art, 'headline', {}, 'Workflows');
	const tag = make(art, 'tag', {}, 'GitHub release in. Posts out.');
	const sticker = make(art, 'sticker mark', {}, logoSvg(180));
	if (final) headline.style.color = 'var(--accent)';
	else sticker.style.display = 'none';
	return { holder, art, headline, tag, sticker };
}

const cursor = make(
	stage,
	'box cursor',
	{ x: 0, y: 0 },
	`<svg viewBox="0 0 24 24" width="46" height="46"><path d="M4 2.5 19.5 12l-7 1.6L9 20.5z" fill="#fff" stroke="#110d0b" stroke-width="1.4" stroke-linejoin="round"/></svg>`
);
cursor.style.zIndex = '50';
cursor.style.transformOrigin = '0 0';
// Cursor path: [time, x, y]; clicks press it down for a moment.
const cursorPath = [
	[8.85, 1600, 980],
	[9.05, 760, 345],
	[9.6, 860, 365],
	[9.85, 1270, 300],
	[10.3, 1330, 330],
	[10.55, 1040, 962],
	[11.1, 1100, 1000],
	[23.05, 1520, 1000],
	[23.75, 1384, 940],
	[24, 1450, 1060]
];
const clicks = [9.05, 10.55, 23.75];
for (const at of clicks) cue(at, 'click');
function drawCursor(t) {
	const visible = between(t, 8.85, 11.2) || between(t, 23.05, 24);
	if (!visible) return anim(cursor, { o: 0 });
	let x = cursorPath[0][1];
	let y = cursorPath[0][2];
	for (let i = 1; i < cursorPath.length; i++) {
		const [t0, x0, y0] = cursorPath[i - 1];
		const [t1, x1, y1] = cursorPath[i];
		if (t >= t0 && t <= t1) {
			const p = ease.inOut(clamp((t - t0) / (t1 - t0)));
			x = lerp(x0, x1, p);
			y = lerp(y0, y1, p);
		} else if (t > t1) {
			x = x1;
			y = y1;
		}
	}
	const pressed = clicks.some((at) => between(t, at - 0.02, at + 0.1));
	anim(cursor, { x, y, s: pressed ? 0.85 : 1, o: 1 });
}

// --- 1. Cold open: the headline types, then the composer assembles around it ------------------
const openLayer = layer('open');
const composer = { x: 360, y: 410, w: 1200, h: 430 };
const composerPanel = make(openLayer, 'box panel', composer);
const border = make(
	openLayer,
	'box',
	composer,
	`<svg width="${composer.w}" height="${composer.h}"><rect x="1" y="1" width="${composer.w - 2}" height="${composer.h - 2}" rx="28" fill="none" stroke="#fd975d" stroke-width="2" pathLength="1000"/></svg>`
);
const borderRect = border.querySelector('rect');
borderRect.setAttribute('stroke-dasharray', '1000');

const accounts = [
	['Linkedin', 'Rodrigo'],
	['Bluesky', '@rgo.pt'],
	['X', '@rodrgds'],
	['Threads', 'rodrgds'],
	['Mastodon', '@rgo']
];
const tabs = make(openLayer, 'box row', { x: composer.x + 40, y: composer.y + 34 });
tabs.style.gap = '12px';
const pills = accounts.map(([mark, handle]) => {
	const pill = make(tabs, 'pill');
	const face = make(pill, 'avatar');
	image(face, avatar);
	image(face, marks(mark));
	pill.append(handle);
	return pill;
});
pills.forEach((_, i) => cue(T.assemble + 0.575 + i * 0.125, 'pop'));

const body = make(openLayer, 'box', { x: composer.x + 44, y: composer.y + 222, w: 1100 });
body.style.fontSize = '36px';
body.style.color = 'var(--muted)';
const footer = make(openLayer, 'box row', {
	x: composer.x + 40,
	y: composer.y + composer.h - 92,
	w: composer.w - 80,
	h: 56
});
footer.style.justifyContent = 'space-between';
const toolRow = make(
	footer,
	'row tool',
	{},
	['image', 'list-checks', 'smile', 'sparkles'].map((name) => icon(name)).join('')
);
toolRow.style.gap = '26px';
const rightRow = make(footer, 'row');
rightRow.style.gap = '28px';
const counter = make(rightRow, 'counter');
make(rightRow, 'button', {}, `${icon('calendar', 24)} Schedule`);

const hero = make(openLayer, 'box hero');
const heroText = document.createElement('span');
const caret = make(hero, 'caret');
hero.prepend(heroText);
typingCues(T.heroType, T.heroType + 1.15, script.hero);
const bodyStart = T.assemble + 1.25;
typingCues(bodyStart, bodyStart + 0.75, script.body);
cue(T.assemble + 0.2, 'whoosh.short');
cue(T.logo, 'riser');

let heroBox;
function measureHero() {
	heroText.textContent = script.hero;
	const width = hero.offsetWidth;
	heroBox = { x: 960 - width / 2, y: 540 - 62 };
	hero.style.left = `${heroBox.x}px`;
	hero.style.top = `${heroBox.y}px`;
}

function openScene(t) {
	if (!show(openLayer, t < T.logo + 0.3)) return;
	const fullText = `${script.hero} ${script.body}`;
	heroText.textContent = typed(t, T.heroType, T.heroType + 1.15, script.hero);
	const blinkOn = Math.floor(t / (BEAT / 2)) % 2 === 0;
	caret.style.opacity = t < 1.5 || (t < T.assemble && blinkOn) ? '1' : '0';
	// The headline settles into the composer's first line.
	const settle = prog(t, T.assemble, T.assemble + 0.55, ease.expoInOut);
	const target = { x: composer.x + 44, y: composer.y + 120 };
	const burst = prog(t, T.logo - 0.03, T.logo + 0.12, ease.out);
	anim(hero, {
		x: lerp(0, target.x - heroBox.x, settle),
		y: lerp(0, target.y - heroBox.y, settle),
		s: lerp(1, 54 / 104, settle) * (1 + burst * 0.12),
		o: 1 - burst
	});
	// Composer: the border draws, then the surface and controls arrive.
	const draw = prog(t, T.assemble + 0.15, T.assemble + 0.6, ease.inOut);
	borderRect.setAttribute('stroke-dashoffset', String(1000 - draw * 1000));
	const fill = prog(t, T.assemble + 0.45, T.assemble + 0.75);
	const push = 1 + prog(t, T.assemble + 1, T.logo, ease.linear) * 0.035;
	const leave = { s: push * (1 + burst * 0.12), o: 1 - burst };
	anim(border, { ...leave, o: (1 - fill * 0.85) * (1 - burst) });
	anim(composerPanel, { ...leave, o: fill * (1 - burst) });
	pills.forEach((pill, i) => {
		const at = T.assemble + 0.575 + i * 0.125;
		anim(pill, { s: prog(t, at, at + 0.4, ease.back), o: prog(t, at, at + 0.08) });
	});
	anim(tabs, leave);
	body.textContent = typed(t, bodyStart, bodyStart + 0.75, script.body);
	anim(body, leave);
	const tools = prog(t, T.assemble + 0.9, T.assemble + 1.3, ease.expoOut);
	anim(footer, { y: (1 - tools) * 20, s: leave.s, o: tools * (1 - burst) });
	const length =
		t < bodyStart ? script.hero.length : body.textContent.length + script.hero.length + 1;
	counter.innerHTML = `${icon('circle-check', 22)} ${Math.min(length, fullText.length)} / 280`;
}

// --- 2. One post, every network -----------------------------------------------------------------
const networkLayer = layer('networks');
const networkTitle = title(networkLayer, 'One post. Every network.', ['Every', 'network.']);
const cardTop = 380;
const networks = [
	{
		mark: 'Linkedin',
		name: 'Rodrigo Dias',
		handle: 'Now',
		limit: 3000,
		bg: '#1b1f23',
		actions: ['thumbs-up', 'message-circle', 'repeat-2']
	},
	{
		mark: 'Bluesky',
		name: 'Rodrigo',
		handle: '@rgo.pt',
		limit: 300,
		bg: '#161e27',
		actions: ['message-circle', 'repeat-2', 'heart']
	},
	{
		mark: 'X',
		name: 'Rodrigo',
		handle: '@rodrgds',
		limit: 280,
		bg: '#000000',
		actions: ['message-circle', 'repeat-2', 'heart']
	},
	{
		mark: 'Threads',
		name: 'rodrgds',
		handle: '1m',
		limit: 500,
		bg: '#101010',
		actions: ['heart', 'message-circle', 'repeat-2']
	},
	{
		mark: 'Mastodon',
		name: 'Rodrigo',
		handle: '@rgo@masto.pt',
		limit: 500,
		bg: '#282c37',
		actions: ['corner-up-left', 'repeat-2', 'star']
	}
].map((network, i) => {
	const frame = { x: 140 + i * 332, y: cardTop, w: 312, h: 452 };
	const card = make(networkLayer, 'box network', frame);
	card.style.background = network.bg;
	const head = make(card, 'head');
	image(head, avatar, 'face');
	make(
		head,
		'',
		{},
		`<div class="name">${network.name}</div><div class="handle">${network.handle}</div>`
	);
	image(head, marks(network.mark), 'mark').style.marginLeft = 'auto';
	const text = make(card, 'body');
	text.style.height = '112px';
	const media = make(card, 'media');
	media.style.border = '2px dashed rgb(255 255 255 / 18%)';
	make(media, 'row', {}, icon('image', 34)).style.cssText =
		'position:absolute;inset:0;justify-content:center;color:rgb(255 255 255 / 35%)';
	const art = artwork(media, { x: -2, y: -2 }, 268 / 960, false);
	art.holder.style.transformOrigin = '134px 77px';
	const foot = make(card, 'foot');
	make(foot, 'row', {}, network.actions.map((name) => icon(name)).join('')).style.gap = '22px';
	const limitNode = make(foot, 'limit');
	return { ...network, frame, card, text, art, limitNode };
});
cue(T.logo, 'hit');
cue(T.logo, 'drop');
networks.forEach((_, i) => cue(T.media + i * 0.125, 'pop'));
typingCues(T.rewrite + 0.45, T.rewrite + 0.85, script.short);
cue(T.editor, 'whoosh.long');

// Zoom-through: the X card's image becomes the editor canvas.
const zoomFrom = { x: 960, y: cardTop + 22 + 44 + 16 + 112 + 16 + 77 };
const zoomScale = 960 / 268;
const canvasCenter = { x: 960, y: 640 };
const zoom = (t) => prog(t, T.editor - 0.4, T.editor + 0.25, ease.expoInOut);

function networkText(i, t) {
	const full = `${script.hero} ${script.body}`;
	// X gets its own shorter version; the others keep the shared post.
	if (i !== 2 || t < T.rewrite) return full;
	if (t < T.rewrite + 0.4) {
		const kept = 1 - prog(t, T.rewrite, T.rewrite + 0.4, ease.linear);
		return full.slice(0, Math.round(kept * full.length));
	}
	return typed(t, T.rewrite + 0.45, T.rewrite + 0.85, script.short);
}

function networkScene(t) {
	if (!show(networkLayer, between(t, T.logo - 0.05, T.editor + 0.3))) return;
	networkTitle(t, T.logo + 0.25, T.editor - 0.65);
	const k = zoom(t);
	networkLayer.style.transformOrigin = `${zoomFrom.x}px ${zoomFrom.y}px`;
	anim(networkLayer, {
		x: (canvasCenter.x - zoomFrom.x) * k,
		y: (canvasCenter.y - zoomFrom.y) * k,
		s: lerp(1, zoomScale, k),
		o: 1 - prog(t, T.editor + 0.05, T.editor + 0.25)
	});
	const focus = prog(t, T.rewrite - 0.2, T.rewrite + 0.2) * (1 - prog(t, T.media - 0.3, T.media));
	networks.forEach((network, i) => {
		const delay = Math.abs(i - 2) * 0.06;
		const fly = prog(t, T.logo + delay, T.logo + delay + 0.6, ease.back);
		const lifted = i === 2 ? focus : 0;
		anim(network.card, {
			x: lerp(960 - (network.frame.x + 156), 0, fly),
			y: lerp(620 - (cardTop + 226), 0, fly) - lifted * 14,
			s: lerp(0.45, 1, fly) * (1 + lifted * 0.04),
			r: lerp((i - 2) * 8, 0, fly),
			o: prog(t, T.logo + delay, T.logo + delay + 0.1) * (1 - (i === 2 ? 0 : focus) * 0.45)
		});
		network.card.style.borderColor = i === 2 && focus > 0.5 ? 'var(--accent)' : '';
		const text = networkText(i, t);
		network.text.textContent = text;
		network.limitNode.textContent = `${text.length} / ${network.limit.toLocaleString('en-US')}`;
		const at = T.media + i * 0.125;
		const drop = prog(t, at, at + 0.45, ease.back);
		anim(network.art.holder, {
			y: (1 - drop) * -40,
			s: lerp(0.6, 1, drop),
			o: prog(t, at, at + 0.1)
		});
	});
}

// --- 3. Image editor ------------------------------------------------------------------------------
const editorLayer = layer('editor');
const editorTitle = title(editorLayer, 'Design the visuals.', ['visuals.']);
const canvas = { x: 480, y: 370 };
const editorPanel = make(editorLayer, 'box panel', { x: 140, y: 290, w: 1640, h: 700 });
const rail = make(
	editorLayer,
	'box rail',
	{ x: 160, y: 300, w: 80, h: 600 },
	['move', 'type', 'image', 'pen-tool', 'wand-sparkles', 'layers']
		.map((name) => icon(name))
		.join('')
);
const layersPanel = make(editorLayer, 'box', { x: 1470, y: 310, w: 290, h: 560 });
make(
	layersPanel,
	'',
	{},
	'<div style="font-size:20px;color:var(--muted);padding:6px 16px 14px">Layers</div>'
);
const layerRows = [
	['image', 'Background'],
	['type', 'Headline'],
	['type', 'Tagline'],
	['square', 'Sticker']
].map(([name, label]) =>
	make(layersPanel, 'layer-row', {}, `${icon(name, 22)}<span>${label}</span>`)
);
const swatches = make(editorLayer, 'box row', { x: 480, y: 930, w: 960, h: 50 });
swatches.style.justifyContent = 'center';
swatches.style.gap = '16px';
const swatchNodes = ['#f6efe9', '#fd975d', '#6fcf8e', '#81a1ff', '#c494ff'].map((color) => {
	const node = make(swatches, 'swatch');
	node.style.background = color;
	return node;
});
const editorArt = artwork(editorLayer, canvas, 1, false);
editorArt.sticker.style.display = '';
editorArt.art.style.borderRadius = '6px';
editorArt.holder.style.transformOrigin = '480px 270px';
const selection = make(
	editorArt.art,
	'selection',
	{},
	'<i style="left:-8px;top:-8px"></i><i style="right:-8px;top:-8px"></i><i style="left:-8px;bottom:-8px"></i><i style="right:-8px;bottom:-8px"></i>'
);
const layerCues = [8.5, 8.625, 8.75, 8.875];
layerCues.forEach((at) => cue(at, 'pop'));
cue(9.75, 'land');
cue(10.55, 'tick.crisp');
const monitor = { x: 640, y: 330, w: 640 };

function placeSelection(t, grow) {
	let target = '';
	if (between(t, 9.05, 9.75) || between(t, 10.5, T.timeline)) target = 'headline';
	else if (between(t, 9.75, 10.5)) target = 'sticker';
	const frames = {
		headline: { left: 60, top: 134, width: 520 * (1 + grow * 0.1), height: 165 * (1 + grow * 0.1) },
		sticker: { left: 710, top: 280, width: 200, height: 200 }
	};
	selection.style.display = target ? 'block' : 'none';
	if (!target) return;
	for (const [key, value] of Object.entries(frames[target])) selection.style[key] = `${value}px`;
}

function editorScene(t) {
	if (!show(editorLayer, between(t, T.editor - 0.4, T.timeline + 0.6))) return;
	editorTitle(t, T.editor + 0.25, T.timeline - 0.4);
	const k = zoom(t);
	const shrink = prog(t, T.timeline, T.timeline + 0.5, ease.expoInOut);
	// The canvas arrives in the X card's media slot and grows into place, then becomes the monitor.
	anim(editorArt.holder, {
		x: lerp(zoomFrom.x - 960, 0, k) + shrink * (monitor.x + monitor.w / 2 - 960),
		y: lerp(zoomFrom.y - 640, 0, k) + shrink * (monitor.y + 180 - 640),
		s: lerp(268 / 960, 1, k) * lerp(1, monitor.w / 960, shrink),
		o: t >= T.timeline + 0.5 ? 0 : 1
	});
	const chrome =
		prog(t, T.editor + 0.15, T.editor + 0.6, ease.expoOut) *
		(1 - prog(t, T.timeline, T.timeline + 0.3));
	anim(editorPanel, { s: lerp(0.96, 1, chrome), o: chrome });
	anim(rail, { x: (1 - chrome) * -40, o: chrome });
	anim(layersPanel, { x: (1 - chrome) * 40, o: chrome });
	anim(swatches, { y: (1 - chrome) * 20, o: chrome });
	layerRows.forEach((row, i) => {
		const at = layerCues[i];
		anim(row, { x: (1 - prog(t, at, at + 0.35, ease.expoOut)) * 30, o: prog(t, at, at + 0.15) });
		const active =
			(i === 1 && (between(t, 9.05, 9.75) || t >= 10.5)) || (i === 3 && between(t, 9.75, 10.5));
		row.style.background = active ? 'rgb(253 151 93 / 16%)' : 'transparent';
	});
	// Edits: resize the headline, drop the sticker, recolor the headline.
	const grow = prog(t, 9.1, 9.6, ease.inOut);
	anim(editorArt.headline, { s: 1 + grow * 0.1 });
	const stick = prog(t, 9.75, 10.2, ease.back);
	anim(editorArt.sticker, {
		s: Math.max(0.0001, stick),
		r: lerp(-30, -8, stick),
		o: prog(t, 9.75, 9.85)
	});
	const recolored = t >= 10.65;
	editorArt.headline.style.color = recolored ? 'var(--accent)' : 'var(--ink)';
	swatchNodes[1].style.borderColor = recolored ? 'var(--ink)' : '';
	placeSelection(t, grow);
}

// --- 4. Video timeline ------------------------------------------------------------------------
const timelineLayer = layer('timeline');
const timelineTitle = title(timelineLayer, 'Cut the video.', ['video.']);
const monitorFrame = make(timelineLayer, 'box panel', { x: 628, y: 318, w: 664, h: 384 });
const monitorArt = artwork(timelineLayer, { x: monitor.x, y: monitor.y }, monitor.w / 960);
monitorArt.art.style.borderRadius = '10px';
const captionLine = make(timelineLayer, 'box', { x: monitor.x, y: 628, w: monitor.w });
captionLine.style.textAlign = 'center';
const captionWords = ['Releases', 'become', 'posts.'].map((word) =>
	make(captionLine, 'caption-word', {}, word)
);
const timecode = make(timelineLayer, 'box counter', { x: 1310, y: 676 });
const trackRows = [
	['film', 740],
	['captions', 818],
	['music', 896]
].map(([name, y]) => ({
	head: make(timelineLayer, 'box row tool', { x: 150, y: y + 16, w: 60, h: 32 }, icon(name, 28)),
	track: make(timelineLayer, 'box track', { x: 220, y, w: 1560 })
}));
const videoClips = [
	[0, 520, '#3a2418', 'Intro'],
	[528, 400, '#2c2a3d', 'Demo'],
	[936, 560, '#1f3327', 'Outro']
].map(([x, w, color, label], i) => {
	const clip = make(trackRows[0].track, 'clip', { x, w }, `${icon('film', 20)}${label}`);
	clip.style.background = color;
	clip.style.border = '1px solid rgb(255 255 255 / 14%)';
	return { clip, at: T.timeline + 0.4 + i * 0.15 };
});
videoClips.forEach(({ at }) => cue(at, 'tock'));
const captionClips = captionWords.map((word, i) => {
	const clip = make(trackRows[1].track, 'clip', { x: 140 + i * 230, w: 210 }, word.textContent);
	clip.style.background = 'rgb(253 151 93 / 22%)';
	clip.style.color = 'var(--accent)';
	return { clip, at: T.timeline + 1 + i * 0.25 };
});
captionClips.forEach(({ at }, i) => cue(at, 'text', ['C4', 'E4', 'G4'][i]));
const wave = make(trackRows[2].track, 'clip', { x: 0, w: 1560 });
wave.style.background = 'rgb(129 161 255 / 14%)';
wave.style.gap = '3px';
wave.innerHTML = Array.from({ length: 150 }, (_, i) => {
	const h = 8 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 34;
	return `<i style="display:block;width:7px;height:${h.toFixed(0)}px;border-radius:2px;background:#81a1ff;flex:none"></i>`;
}).join('');
const playhead = make(timelineLayer, 'box', { x: 220, y: 726, w: 3, h: 248 });
playhead.style.background = 'var(--accent)';
cue(T.calendar, 'whoosh.short');

function timelineScene(t) {
	if (!show(timelineLayer, between(t, T.timeline, T.calendar + 0.15))) return;
	timelineTitle(t, T.timeline + 0.2, T.calendar - 0.35);
	const enter = prog(t, T.timeline + 0.35, T.timeline + 0.7, ease.expoOut);
	const leave = prog(t, T.calendar - 0.15, T.calendar + 0.1, ease.in);
	anim(monitorFrame, { s: lerp(0.94, 1, enter), o: enter * (1 - leave) });
	// The monitor image is the editor's canvas; it flies to the calendar next.
	anim(monitorArt.holder, { o: between(t, T.timeline + 0.5, T.calendar) ? 1 : 0 });
	trackRows.forEach(({ head, track }, i) => {
		const rise = prog(t, T.timeline + 0.25 + i * 0.08, T.timeline + 0.65 + i * 0.08, ease.expoOut);
		anim(track, { y: (1 - rise) * 40 + leave * 60, o: rise * (1 - leave) });
		anim(head, { o: rise * (1 - leave) });
	});
	videoClips.forEach(({ clip, at }) => {
		const snap = prog(t, at, at + 0.35, ease.expoOut);
		anim(clip, { x: (1 - snap) * 300, o: prog(t, at, at + 0.08) });
	});
	captionClips.forEach(({ clip, at }, i) => {
		anim(clip, { s: prog(t, at, at + 0.3, ease.back), o: prog(t, at, at + 0.06) });
		anim(captionWords[i], {
			y: (1 - prog(t, at, at + 0.3, ease.expoOut)) * 16,
			o: prog(t, at, at + 0.1) * (1 - leave)
		});
	});
	const waveIn = prog(t, T.timeline + 0.5, T.timeline + 1.2, ease.inOut);
	wave.style.clipPath = `inset(0 ${(1 - waveIn) * 100}% 0 0)`;
	const head = prog(t, T.timeline + 0.6, T.calendar - 0.1, ease.linear);
	anim(playhead, { x: head * 1300, o: enter * (1 - leave) });
	timecode.textContent = `00:${String(Math.floor(head * 12)).padStart(2, '0')} / 00:12`;
	anim(timecode, { o: enter * (1 - leave) });
}

// --- 5. Calendar and the publishing sweep ------------------------------------------------------
const calendarLayer = layer('calendar');
const calendarTitle = title(calendarLayer, 'Plan the week.', ['week.']);
const sweepTitle = title(calendarLayer, 'Watch it publish.', ['publish.']);
const columns = { x: 230, w: 1550 / 7 };
const rows = [360, 570, 780];
const dayHeads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) =>
	make(
		calendarLayer,
		'box day-head',
		{ x: columns.x + i * columns.w, y: 280, w: columns.w },
		`${day}<b>${17 + i}</b>`
	)
);
const timeLabels = ['09:00', '13:00', '17:00'].map((label, i) =>
	make(calendarLayer, 'box counter', { x: 140, y: rows[i] + 8 }, label)
);
const gridLines = [
	...Array.from({ length: 8 }, (_, i) =>
		make(calendarLayer, 'box', { x: columns.x + i * columns.w, y: 360, w: 1, h: 620 })
	),
	...rows.map((y) => make(calendarLayer, 'box', { x: columns.x, y: y - 5, w: 1550, h: 1 }))
];
for (const line of gridLines) line.style.background = 'var(--line)';

const posts = [
	{
		day: 4,
		row: 0,
		label: 'Just shipped Workflows',
		marks: ['Linkedin', 'Bluesky', 'X', 'Threads', 'Mastodon'],
		ours: true
	},
	{ day: 0, row: 1, label: 'Release notes thread', marks: ['X', 'Bluesky'], tone: 1 },
	{ day: 1, row: 0, label: 'Lesson: ship smaller', marks: ['Linkedin'], tone: 0 },
	{ day: 2, row: 2, label: 'The deploy, as a meme', marks: ['X', 'Threads'], tone: 3, fails: true },
	{ day: 3, row: 1, label: 'Changelog video', marks: ['Youtube', 'TikTok'], tone: 2 },
	{ day: 5, row: 0, label: 'Weekend AMA', marks: ['Mastodon', 'Bluesky'], tone: 4 },
	{ day: 6, row: 2, label: 'Behind the build', marks: ['Instagram'], tone: 0 },
	{ day: 1, row: 2, label: 'Customer story', marks: ['Linkedin', 'Threads'], tone: 1 },
	{ day: 3, row: 0, label: 'Docs walkthrough', marks: ['Youtube'], tone: 2 }
].map((post, i) => {
	const frame = {
		x: columns.x + post.day * columns.w + 8,
		y: rows[post.row] + 2,
		w: columns.w - 16,
		h: 196
	};
	const chip = make(calendarLayer, 'box chip', frame);
	const thumb = make(chip, 'thumb');
	if (post.ours) thumb.style.background = 'transparent';
	else {
		thumb.style.background = '#1d130e';
		image(thumb, thumbTextures[post.tone]).style.cssText =
			'width:100%;height:100%;image-rendering:pixelated';
	}
	make(chip, 'label', {}, post.label);
	const meta = make(chip, 'meta');
	const markRow = make(meta, 'marks');
	for (const mark of post.marks) image(markRow, marks(mark));
	const status = make(meta, 'status');
	const passAt = T.sweep + ((frame.x + frame.w / 2 - columns.x) / 1550) * 1.8;
	const popAt = post.ours ? T.calendar + 0.5 : T.calendar + 1 + (i - 1) * 0.25;
	return { ...post, frame, chip, status, passAt, popAt };
});
const ours = posts[0];
cue(ours.popAt, 'land');
for (const post of posts.slice(1)) cue(post.popAt, 'pop');
for (const post of posts) {
	if (post.fails) {
		cue(post.passAt, 'tock');
		cue(post.passAt + 0.45, 'tick.crisp');
	} else if (!post.ours) cue(post.passAt, 'tick.crisp');
}
cue(ours.passAt, 'bell', 'E5');
cue(ours.passAt + 0.2, 'bell', 'A5');
const nowLine = make(calendarLayer, 'box', { x: columns.x, y: 350, w: 3, h: 640 });
nowLine.style.background = 'var(--accent)';
nowLine.style.boxShadow = '0 0 24px var(--accent)';
// Our chip's thumbnail: the video lands in Friday 09:00.
const flyingArt = artwork(stage, { x: 0, y: 0 }, 1);
flyingArt.holder.style.zIndex = '20';
cue(T.results, 'whoosh.short');

function statusFor(post, t) {
	if (t < post.passAt) return ['Scheduled', 'var(--accent)'];
	if (post.fails && t < post.passAt + 0.45) return ['Failed', 'var(--red)'];
	if (post.fails && t < post.passAt + 0.9) return ['Retrying', 'var(--amber)'];
	return ['Published', 'var(--green)'];
}

function drawFlyingArt(t, whip) {
	const fly = prog(t, T.calendar, T.calendar + 0.5, ease.expoInOut);
	const target = { x: ours.frame.x + 10, y: ours.frame.y + 10, w: ours.frame.w - 20 };
	const scale = lerp(monitor.w / 960, target.w / 960, fly);
	anim(flyingArt.holder, {
		x: lerp(monitor.x, target.x, fly) - whip * 2200,
		y: lerp(monitor.y, target.y, fly),
		o: between(t, T.calendar, T.results + 0.2) ? 1 : 0,
		blur: whip * 10
	});
	flyingArt.art.style.transform = `scale(${scale})`;
	flyingArt.art.style.borderRadius = `${10 / scale}px`;
	flyingArt.art.style.height = `${lerp(540, 92 / scale, fly)}px`;
}

function calendarScene(t) {
	const whip = prog(t, T.results - 0.3, T.results + 0.05, ease.expoIn);
	drawFlyingArt(t, whip);
	if (!show(calendarLayer, between(t, T.calendar, T.results + 0.4))) return;
	calendarTitle(t, T.calendar + 0.2, T.sweep - 0.35);
	sweepTitle(t, T.sweep + 0.05, T.results - 0.4);
	anim(calendarLayer, {
		x: -whip * 2200,
		blur: whip * 10,
		rx: lerp(14, 0, prog(t, T.calendar, T.calendar + 0.7, ease.expoOut))
	});
	dayHeads.forEach((head, i) => {
		const at = T.calendar + 0.12 + i * 0.04;
		anim(head, { y: (1 - prog(t, at, at + 0.4, ease.expoOut)) * 24, o: prog(t, at, at + 0.2) });
	});
	const grid = prog(t, T.calendar + 0.15, T.calendar + 0.55);
	for (const node of [...timeLabels, ...gridLines]) anim(node, { o: grid });
	for (const post of posts) {
		const appear = prog(t, post.popAt - 0.05, post.popAt + 0.35, ease.back);
		const published = t >= post.passAt && !(post.fails && t < post.passAt + 0.9);
		const pulse = post.ours && t >= post.passAt ? Math.exp(-Math.max(0, t - post.passAt) * 4) : 0;
		anim(post.chip, {
			s: lerp(0.6, 1, appear) * (1 + pulse * 0.06),
			o: prog(t, post.popAt - 0.05, post.popAt + 0.05)
		});
		post.chip.style.borderColor = published ? 'rgb(111 207 142 / 55%)' : '';
		post.chip.style.boxShadow =
			pulse > 0.02 ? `0 0 ${40 * pulse}px rgb(111 207 142 / ${0.6 * pulse})` : '';
		const [label, color] = statusFor(post, t);
		post.status.innerHTML = `<i></i>${label}`;
		post.status.style.color = color;
	}
	const sweep = prog(t, T.sweep, T.sweep + 1.8, ease.linear);
	anim(nowLine, { x: sweep * 1550, o: between(t, T.sweep, T.sweep + 1.85) ? 1 : 0 });
}

// --- 6. Results and inbox -------------------------------------------------------------------------
const resultsLayer = layer('results');
const resultsTitle = title(resultsLayer, 'See what lands.', ['lands.']);
const stats = [
	['eye', 'Views', 12400, (v) => `${(v / 1000).toFixed(1)}K`],
	['heart', 'Engagement', 1284, (v) => Math.round(v).toLocaleString('en-US')],
	['users', 'New followers', 312, (v) => `+${Math.round(v)}`]
].map(([name, label, value, format], i) => {
	const card = make(resultsLayer, 'box panel stat', { x: 140 + i * 555, y: 290, w: 530, h: 160 });
	make(card, 'k', {}, `${icon(name, 24)}${label}`);
	return { card, number: make(card, 'v'), value, format };
});
const chartPanel = make(resultsLayer, 'box panel', { x: 140, y: 480, w: 1640, h: 500 });
const heights = [120, 150, 110, 180, 160, 210, 190, 170, 230, 220, 260, 380, 300, 270];
const bars = heights.map((height, i) => {
	const bar = make(chartPanel, 'bar', { x: 122 + i * 102, w: 70, h: height });
	bar.style.bottom = '50px';
	bar.style.background = i === 11 ? 'var(--accent)' : 'rgb(253 151 93 / 28%)';
	return bar;
});
const launchTag = make(chartPanel, 'box pill', { x: 122 + 11 * 102 - 58, y: 500 - 50 - 380 - 70 });
launchTag.innerHTML = `${icon('sparkles', 22)} Launch day`;
launchTag.style.padding = '0 18px';
const sample = make(stage, 'label', {}, 'Sample data');
cue(T.results + 1.4, 'pop');
cue(T.inbox, 'whoosh.short');

const inboxLayer = layer('inbox');
const inboxTitle = title(inboxLayer, 'Reply in one place.', ['one', 'place.']);
make(inboxLayer, 'box panel', { x: 410, y: 290, w: 1100, h: 700 });
const messages = [
	['Bluesky', 'Marta Silva', 'Can a workflow wait for my approval?'],
	['Threads', 'Alex Chen', 'Release notes to posts is exactly what I needed.'],
	['Mastodon', 'Sam Taylor', 'Does it work with self-hosted GitLab too?'],
	['Linkedin', 'Priya Nair', 'Congrats on the launch!']
].map(([mark, name, text], i) => {
	const row = make(inboxLayer, 'box message', { x: 410, y: 300 + i * 118, w: 1100 });
	image(row, marks(mark), 'mark');
	make(row, '', {}, `<div class="who"><b>${name}</b>just now</div><div class="text">${text}</div>`);
	return { row, at: T.inbox + 0.15 + i * 0.12 };
});
for (const { at } of messages) cue(at, 'pop');
const replyBar = make(inboxLayer, 'box row', { x: 440, y: 900, w: 1040, h: 72 });
replyBar.style.cssText +=
	';gap:16px;padding:0 10px 0 24px;border-radius:16px;background:var(--raised);border:1px solid var(--line-strong);font-size:24px';
const replyText = make(replyBar, '');
replyText.style.flex = '1';
make(replyBar, 'button', {}, `${icon('send', 22)} Reply`).style.height = '52px';
typingCues(T.inbox + 0.6, T.inbox + 1.15, script.reply);
cue(23.81, 'click.confirm');

function resultsScene(t) {
	const visible = show(resultsLayer, between(t, T.results - 0.2, T.inbox + 0.5));
	sample.style.opacity = between(t, T.results, T.features) ? '1' : '0';
	if (!visible) return;
	resultsTitle(t, T.results + 0.15, T.inbox - 0.35);
	const enter = prog(t, T.results - 0.05, T.results + 0.4, ease.expoOut);
	const up = prog(t, T.inbox - 0.15, T.inbox + 0.25, ease.expoIn);
	anim(resultsLayer, { x: (1 - enter) * 2200, y: -up * 1200, blur: (1 - enter) * 10 + up * 6 });
	stats.forEach(({ card, number, value, format }, i) => {
		number.textContent = format(
			value * prog(t, T.results + 0.25 + i * 0.1, T.results + 1.3, ease.expoOut)
		);
		anim(card, {
			y: (1 - prog(t, T.results + i * 0.08, T.results + 0.5 + i * 0.08, ease.expoOut)) * 30
		});
	});
	bars.forEach((bar, i) => {
		const grow = prog(t, T.results + 0.4 + i * 0.07, T.results + 0.9 + i * 0.07, ease.back);
		anim(bar, { sy: Math.max(0.001, grow), sx: 1 });
	});
	anim(launchTag, {
		s: prog(t, T.results + 1.4, T.results + 1.8, ease.back),
		o: prog(t, T.results + 1.4, T.results + 1.5)
	});
}

function inboxScene(t) {
	if (!show(inboxLayer, between(t, T.inbox - 0.2, T.features + 0.4))) return;
	inboxTitle(t, T.inbox + 0.1, T.features - 0.3);
	const enter = prog(t, T.inbox - 0.1, T.inbox + 0.35, ease.expoOut);
	const leave = prog(t, T.features - 0.1, T.features + 0.25, ease.in);
	anim(inboxLayer, {
		y: (1 - enter) * 1200,
		s: 1 - leave * 0.2,
		o: 1 - leave,
		blur: (1 - enter) * 6
	});
	for (const { row, at } of messages) {
		anim(row, { x: (1 - prog(t, at, at + 0.4, ease.expoOut)) * 120, o: prog(t, at, at + 0.1) });
	}
	if (t >= 23.8) {
		replyText.innerHTML = `<span class="row" style="gap:10px;color:var(--green)">${icon('check', 24)} Replied on Bluesky</span>`;
	} else replyText.textContent = typed(t, T.inbox + 0.6, T.inbox + 1.15, script.reply);
}

// --- 7. Feature roll ------------------------------------------------------------------------------
const featureLayer = layer('features');
const features = [
	['workflows', 'Workflows'],
	['media', 'Media library'],
	['memes', 'Memes'],
	['recorder', 'Recorder'],
	['repost', 'Auto repost'],
	['ideas', 'AI ideas'],
	['automation', 'API and MCP'],
	['workspaces', 'Teams']
].map(([name, label], i) => {
	const art = make(featureLayer, 'box', { x: 885, y: 300, w: 150, h: 150 });
	image(art, `/assets/brand/features/${name}.svg`).style.cssText = 'width:150px;height:150px';
	const word = make(featureLayer, 'box feature-word', { y: 500 }, label);
	return { art, word, at: T.features + i * 0.5 };
});
const bellNotes = ['G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6'];
features.forEach(({ at }, i) => cue(at, 'bell', bellNotes[i]));
cue(T.end, 'riser');

function featureScene(t) {
	if (!show(featureLayer, between(t, T.features - 0.1, T.end + 0.1))) return;
	features.forEach(({ art, word, at }, i) => {
		const last = i === features.length - 1;
		const enter = prog(t, at, at + 0.3, ease.expoOut);
		const leave = last
			? prog(t, T.end - 0.3, T.end, ease.in)
			: prog(t, at + 0.46, at + 0.66, ease.in);
		const shown = t >= at ? 1 : 0;
		anim(art, {
			s: prog(t, at, at + 0.35, ease.back) * (1 - leave * 0.5),
			y: -leave * 40,
			o: shown * (1 - leave)
		});
		anim(word, {
			y: (1 - enter) * 90 - leave * 70,
			o: shown * enter * (1 - leave),
			blur: (1 - enter) * 8 + leave * 8
		});
	});
}

// --- 8. End card ----------------------------------------------------------------------------------
const endLayer = layer('end');
const markNode = make(endLayer, 'box mark', { x: 0, y: 0, w: 256, h: 256 }, logoSvg(256));
markNode.style.transformOrigin = '0 0';
const markParts = [...markNode.querySelectorAll('path')];
const wordmark = make(endLayer, 'box wordmark', { x: 0, y: 0 }, 'OpenPost');
const url = make(endLayer, 'box closing url', { y: 650 }, 'openpo.st');
const closing = make(
	endLayer,
	'box closing line',
	{ y: 736 },
	'Open source. Use Hosted, or self-host it.'
);
cue(T.end, 'hit');
cue(T.end, 'drop');
cue(T.end + 1.2, 'text', 'E4');
cue(T.end + 1.7, 'text', 'G4');

function endScene(t) {
	if (!show(endLayer, t >= T.end - 0.2)) return;
	const converge = prog(t, T.end - 0.12, T.end + 0.38, ease.back);
	markParts.forEach((path, i) => {
		const distance = (1 - converge) * 50;
		path.setAttribute(
			'transform',
			`translate(${(i % 2 ? 1 : -1) * distance} ${(i < 2 ? -1 : 1) * distance})`
		);
	});
	const slide = prog(t, T.end + 0.5, T.end + 1.1, ease.expoInOut);
	const size = lerp(256, 168, slide);
	const total = 168 + 40 + wordmark.offsetWidth;
	const pop = t >= T.end ? 1 + 0.08 * Math.exp(-(t - T.end) * 7) : 1;
	anim(markNode, {
		x: lerp(960 - size / 2, 960 - total / 2, slide) - ((pop - 1) * size) / 2,
		y: lerp(540 - 128, 470 - 84, slide) - ((pop - 1) * size) / 2,
		s: (size / 256) * pop,
		o: prog(t, T.end - 0.15, T.end)
	});
	const reveal = prog(t, T.end + 0.7, T.end + 1.3, ease.expoOut);
	anim(wordmark, { x: 960 - total / 2 + 208 - (1 - reveal) * 40, y: 470 - 78, o: reveal });
	wordmark.style.clipPath = `inset(-20% ${(1 - reveal) * 100}% -20% 0)`;
	const urlIn = prog(t, T.end + 1.2, T.end + 1.8, ease.expoOut);
	anim(url, { y: (1 - urlIn) * 24, o: urlIn });
	const lineIn = prog(t, T.end + 1.7, T.end + 2.3, ease.expoOut);
	anim(closing, { y: (1 - lineIn) * 24, o: lineIn });
}

// --- Seek ---------------------------------------------------------------------------------------
await document.fonts.load('600 104px Geist');
await document.fonts.load('400 30px Geist');
await document.fonts.load('600 150px Manrope');
await document.fonts.load('700 132px Manrope');
measureHero();

export async function seek(t) {
	drawGlow(t);
	openScene(t);
	networkScene(t);
	editorScene(t);
	timelineScene(t);
	calendarScene(t);
	resultsScene(t);
	inboxScene(t);
	featureScene(t);
	endScene(t);
	drawCursor(t);
	while (pending.size) await Promise.all(pending);
}

cues.sort((a, b) => a.t - b.t);
window.film = { seek, cues, FPS, BPM, BEAT, DURATION, sections: T };
