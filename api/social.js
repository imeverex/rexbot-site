// Social post image generator for RexBot's Instagram / X posts.
//
//   /api/social?h=Headline&a=Blue+accent+line&s=Optional+subline&f=all
//
//   h  headline (white)                         required
//   a  accent line (Rex blue)                   optional
//   s  supporting line (muted grey)             optional
//   f  feature card: twitch | discord | widget | all | none   (default none)
//   size  square (1080x1080) | portrait (1080x1350, default)
//   t  template (default card), so the feed doesn't look like one post on repeat:
//        card   the original dark branded card (uses h, a, s, f)
//        meme   white caption on top (h), Rex on a gameplay shot, outlined punchline (a)
//        chat   fake Twitch chat: m=user:msg|user:msg  (h = optional caption, RexBot gets a BOT badge)
//        pop    solid colour block, giant left-aligned text (h, a, s), c=blue|twitch|discord|spotify|black (real brand colours only)
//        notes  monospace patch notes / receipt on paper: h = title, m = items separated by |
//        shot   real product screenshot: img=chat|discord|overlay, h = headline, s = subline
//        step   carousel slide: n = step number, h = title, s = body
//   p  carousel page, e.g. 2/5 (shown as a pill; page 1 also gets a "swipe" hint)
//   In h and a, "|" starts a new line.
//
// Renders a PNG in the same style as rexbotapp.com, so every automated post
// uses the real logo, colours and Inter type instead of AI-generated art.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Node runtime; the asset files are bundled via "includeFiles" in vercel.json.
const ASSET_DIR = path.join(process.cwd(), 'api', '_social');

const C = {
  bg: '#08090b', surface: '#131417', text: '#f4f4f6', muted: '#9d9da4',
  blue: '#00C6FF', twitch: '#9146FF', discord: '#5865F2', widget: '#1db954',
};

const asset = async (name) => { const b = await readFile(path.join(ASSET_DIR, name)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const toDataUri = (buf, mime) => {
  const bytes = new Uint8Array(buf);
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
};

// Tiny element helper so this file needs no JSX build step.
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) },
});
const img = (src, w, hgt, style = {}) => ({ type: 'img', props: { src, width: w, height: hgt, style } });

const FEATURES = {
  twitch: { title: 'Twitch Chatbot', desc: 'Commands, timers and song requests for your chat.', color: C.twitch, icon: 'twitch' },
  discord: { title: 'Discord Bot', desc: 'Music in your voice channel, on request.', color: C.discord, icon: 'discord' },
  widget: { title: 'Now Playing Widget', desc: 'A clean now-playing overlay for OBS.', color: C.widget, icon: 'spotify' },
};

function card(key, icons, compact) {
  const f = FEATURES[key];
  const iconBox = compact ? 64 : 88;
  return h('div', {
    display: 'flex', flexDirection: 'column', flex: 1, gap: compact ? 16 : 20,
    padding: compact ? 26 : 40, borderRadius: 28,
    border: `3px solid ${f.color}`, background: `linear-gradient(160deg, ${f.color}33 0%, ${C.surface} 55%)`,
  },
    h('div', { display: 'flex', alignItems: 'center', gap: 18 },
      h('div', {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: iconBox, height: iconBox, borderRadius: 20, background: f.color, flexShrink: 0,
      }, img(icons[f.icon], iconBox * 0.58, iconBox * 0.58, { objectFit: 'contain' })),
      h('div', { display: 'flex', fontSize: compact ? 30 : 46, fontWeight: 700, color: C.text, lineHeight: 1.1, letterSpacing: -0.5 }, f.title),
    ),
    h('div', { display: 'flex', fontSize: compact ? 23 : 32, fontWeight: 500, color: C.muted, lineHeight: 1.35 }, f.desc),
  );
}

export async function GET(req) {
  try {
    return await render(req);
  } catch (err) {
    console.error('social image failed', err);
    return new Response(`social image failed: ${err && err.message}`, { status: 500 });
  }
}

const lines = (t) => String(t || '').split('|').map((x) => x.trim()).filter(Boolean);
const mimeOf = (name) => (name.endsWith('.png') ? 'image/png' : name.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
const dataUri = async (name) => toDataUri(await asset(name), mimeOf(name));

// Only real brand colours: Rex blue, Twitch purple, Discord blurple, Spotify green, black.
const POP = {
  blue: { bg: C.blue, ink: '#04121a', hi: '#ffffff' },
  twitch: { bg: C.twitch, ink: '#ffffff', hi: '#0b0b10' },
  discord: { bg: C.discord, ink: '#ffffff', hi: '#0b0b10' },
  spotify: { bg: C.widget, ink: '#000000', hi: '#ffffff' },
  black: { bg: '#000000', ink: '#ffffff', hi: C.blue },
};
POP.purple = POP.twitch; // old name

// Largest font size (px) at which these lines, wrapped to `width`, fit in `height`.
// cw = average glyph width as a fraction of font size, lh = line height.
function fit(textLines, { width, height, max, min, cw = 0.6, lh = 1.1 }) {
  for (let size = max; size > min; size -= 2) {
    const rows = textLines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * cw * size) / width)), 0);
    const longestWord = Math.max(...textLines.flatMap((l) => l.split(/\s+/)).map((w) => w.length), 1);
    if (rows * size * lh <= height && longestWord * cw * size <= width) return size;
  }
  return min;
}

const CHAT_COLORS = ['#ff6b6b', '#b388ff', '#2ee6a6', '#ffb347', '#5ec8ff', '#ff79c6', '#f1fa8c'];
const SHOTS = {
  chat: { file: 'shots/chat.jpg', bg: C.twitch, label: 'Twitch chatbot' },
  discord: { file: 'shots/discord.jpg', bg: C.discord, label: 'Discord bot' },
  overlay: { file: 'shots/overlay.jpg', bg: C.blue, label: 'OBS overlays' },
};

// Small "2/5" pill, plus a swipe hint on the first slide of a carousel.
function pagePill(page, dark) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(page || '');
  if (!m) return null;
  const fg = dark ? '#ffffff' : '#000000';
  return h('div', { display: 'flex', position: 'absolute', top: 44, right: 48, alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 700, color: fg },
    m[1] === '1' ? h('div', { display: 'flex', opacity: 0.75 }, 'SWIPE >>') : null,
    h('div', { display: 'flex', padding: '8px 20px', borderRadius: 999, border: `3px solid ${fg}` }, `${m[1]}/${m[2]}`),
  );
}

// Builds the element tree and fonts for a request URL. Exported so scripts/check-social.mjs can
// test every template for overlapping or clipped text.
export async function buildTree(url) {
  const q = new URL(url).searchParams;
  const headline = (q.get('h') || 'One login. Three tools.').slice(0, 160);
  const accent = (q.get('a') || '').slice(0, 80);
  const sub = (q.get('s') || '').slice(0, 220);
  const feature = (q.get('f') || 'none').toLowerCase();
  const template = (q.get('t') || 'card').toLowerCase();
  const page = q.get('p') || '';
  const msgs = (q.get('m') || '').slice(0, 900);
  const square = q.get('size') === 'square';
  const W = 1080, H = square ? 1080 : 1350;

  const [f500, f700, f800, mono, logo] = await Promise.all([
    asset('inter-latin-500-normal.woff'), asset('inter-latin-700-normal.woff'), asset('inter-latin-800-normal.woff'),
    asset('jetbrains-mono-latin-700-normal.woff'), dataUri('rex-mark.png'),
  ]);

  const ctx = { q, headline, accent, sub, feature, page, msgs, W, H, logo };
  const builders = { card: cardTemplate, meme: memeTemplate, chat: chatTemplate, pop: popTemplate, notes: notesTemplate, shot: shotTemplate, step: stepTemplate };
  const tree = await (builders[template] || cardTemplate)(ctx);
  const fonts = [
    { name: 'Inter', data: f500, weight: 500, style: 'normal' },
    { name: 'Inter', data: f700, weight: 700, style: 'normal' },
    { name: 'Inter', data: f800, weight: 800, style: 'normal' },
    { name: 'Mono', data: mono, weight: 700, style: 'normal' },
  ];
  return { tree, fonts, W, H };
}

export async function renderPng(tree, fonts, W, H) {
  const svg = await satori(tree, { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

async function render(req) {
  const { tree, fonts, W, H } = await buildTree(req.url);
  const png = await renderPng(tree, fonts, W, H);
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

// ---------- card: the original look ----------
async function cardTemplate({ headline, accent, sub, feature, page, W, H, logo }) {
  const [twitchPng, spotifyPng, discordSvg] = await Promise.all([asset('twitch.png'), asset('spotify.png'), asset('discord.svg')]);
  const icons = {
    twitch: toDataUri(twitchPng, 'image/png'),
    spotify: toDataUri(spotifyPng, 'image/png'),
    discord: toDataUri(discordSvg, 'image/svg+xml'),
  };
  const len = headline.length + accent.length;
  const big = len > 70 ? 76 : len > 45 ? 90 : 104;

  let cards = null;
  if (feature === 'all') {
    cards = h('div', { display: 'flex', gap: 22, width: '100%' },
      card('twitch', icons, true), card('discord', icons, true), card('widget', icons, true));
  } else if (FEATURES[feature]) {
    cards = h('div', { display: 'flex', width: '100%' }, card(feature, icons, false));
  }

  return h('div', {
    width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: C.bg, fontFamily: 'Inter', color: C.text, position: 'relative',
    padding: '80px 70px 64px',
  },
    h('div', { display: 'flex', position: 'absolute', top: -260, left: -180, width: 760, height: 760, borderRadius: 760,
      background: `radial-gradient(circle, ${C.blue}40 0%, ${C.blue}00 70%)` }),
    h('div', { display: 'flex', position: 'absolute', bottom: -300, right: -220, width: 760, height: 760, borderRadius: 760,
      background: `radial-gradient(circle, ${C.blue}26 0%, ${C.blue}00 70%)` }),
    h('div', { display: 'flex', alignItems: 'center', gap: 22 },
      img(logo, 112, 112),
      h('div', { display: 'flex', fontSize: 84, fontWeight: 800, letterSpacing: -2 },
        h('span', { color: C.blue }, 'REX'), h('span', { color: C.text }, 'BOT')),
    ),
    h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', gap: 34 },
      h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center' },
        ...lines(headline).map((l) => h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: big, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3 }, l)),
        ...lines(accent).map((l) => h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: big, fontWeight: 800, lineHeight: 1.1, letterSpacing: -3, color: C.blue, marginTop: 8 }, l)),
      ),
      sub ? h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 500, color: '#c9c9cf', lineHeight: 1.4, maxWidth: 900 }, sub) : null,
      cards,
    ),
    h('div', { display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, fontWeight: 700 },
      h('div', { display: 'flex', padding: '16px 36px', borderRadius: 999, color: '#021018',
        background: `linear-gradient(90deg, #33d2ff, ${C.blue})` }, 'rexbotapp.com'),
      h('div', { display: 'flex', color: C.muted }, 'Free. Runs in the cloud.'),
    ),
    pagePill(page, true),
  );
}

// ---------- meme: white caption + picture + outlined punchline ----------
async function memeTemplate({ headline, accent, page, W, H }) {
  const [scene, rex] = await Promise.all([dataUri('scene.jpg'), dataUri('rex-full.png')]);
  const top = lines(headline);
  const capH = Math.round(H * 0.34);
  const picH = H - capH;
  const topSize = fit(top, { width: W - 128, height: capH - 80, max: 72, min: 36, cw: 0.55, lh: 1.18 });
  const bottom = lines(accent).slice(0, 2);
  const bandH = 220; // punchline zone at the bottom of the picture; Rex stays above it
  const bSize = fit(bottom, { width: W - 100, height: bandH - 40, max: 88, min: 44, cw: 0.68, lh: 1.05 });
  const rexH = picH - bandH - 30, rexW = Math.round(rexH * 900 / 678);
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', background: '#ffffff', fontFamily: 'Inter', position: 'relative' },
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', height: capH, padding: '40px 64px', gap: 6 },
      ...top.map((l) => h('div', { display: 'flex', fontSize: topSize, fontWeight: 700, color: '#0a0a0a', lineHeight: 1.18, letterSpacing: -0.5 }, l)),
    ),
    h('div', { display: 'flex', position: 'relative', width: W, height: picH, overflow: 'hidden' },
      img(scene, W, picH, { objectFit: 'cover', position: 'absolute', top: 0, left: 0, filter: 'saturate(0.8)' }),
      h('div', { display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: picH, background: 'linear-gradient(180deg, #00000010 0%, #00000070 100%)' }),
      img(rex, rexW, rexH, { position: 'absolute', left: Math.round((W - rexW) / 2), top: 20 }),
      h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: 0, bottom: 0, width: W, height: bandH, padding: '0 50px' },
        ...bottom.map((l) => h('div', {
          display: 'flex', textAlign: 'center', fontSize: bSize, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase',
          lineHeight: 1.05, letterSpacing: -1, WebkitTextStroke: '5px #000000', textShadow: '0 6px 0 #000000',
        }, l)),
      ),
      h('div', { display: 'flex', position: 'absolute', right: 26, top: 22, fontSize: 24, fontWeight: 700, color: '#ffffffcc' }, 'rexbotapp.com'),
    ),
    pagePill(page, false),
  );
}

// ---------- chat: fake Twitch chat ----------
async function chatTemplate({ headline, msgs, page, W, H, logo }) {
  const rows = lines(msgs).slice(0, 14).map((row) => {
    const i = row.indexOf(':');
    return i > 0 ? { user: row.slice(0, i).trim(), text: row.slice(i + 1).trim() } : { user: 'chat', text: row };
  });
  const users = [...new Set(rows.map((r) => r.user))];
  const colorOf = (u) => (/^rexbot$/i.test(u) ? C.blue : CHAT_COLORS[users.indexOf(u) % CHAT_COLORS.length]);
  const cap = lines(headline);
  const showCap = cap.length && cap.join('') !== 'One login. Three tools.';
  const capSize = showCap ? fit(cap, { width: W - 120, height: 200, max: 56, min: 34, cw: 0.56, lh: 1.12 }) : 0;
  const capH = showCap ? 92 + cap.reduce((n, l) => n + Math.ceil((l.length * 0.56 * capSize) / (W - 120)), 0) * capSize * 1.12 : 0;
  // Fit the messages into the panel: shrink the type first, then drop the oldest messages (like a real chat scrolling).
  const room = H - capH - 86 - 122 - 56 - 70;
  const rowW = W - 96 - 38;
  const height = (list, fs) => list.reduce((t, r) => t + Math.ceil(((r.user.length + 2 + r.text.length + (/^rexbot$/i.test(r.user) ? 5 : 0)) * 0.58 * fs) / rowW) * fs * 1.3 + (/^rexbot$/i.test(r.user) ? 20 : 0), 0) + 18 * (list.length - 1);
  let fs = 48;
  while (fs > 30 && height(rows, fs) > room) fs -= 2;
  while (rows.length > 1 && height(rows, fs) > room) rows.shift();
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0e0e10', fontFamily: 'Inter', color: '#efeff1', position: 'relative' },
    showCap ? h('div', { display: 'flex', flexDirection: 'column', padding: '56px 60px 36px', background: '#ffffff', gap: 4 },
      ...cap.map((l) => h('div', { display: 'flex', fontSize: capSize, fontWeight: 800, color: '#0a0a0a', lineHeight: 1.12, letterSpacing: -1 }, l))) : null,
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 48px', borderBottom: '2px solid #2a2a2e', background: '#18181b' },
      h('div', { display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: 2, color: '#adadb8' }, 'STREAM CHAT'),
      h('div', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 700, color: '#ff4f4f' },
        h('div', { display: 'flex', width: 16, height: 16, borderRadius: 16, background: '#ff4f4f' }), 'LIVE'),
    ),
    h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1, padding: '28px 48px', gap: 18, background: '#18181b', overflow: 'hidden' },
      ...rows.map((r) => {
        const bot = /^rexbot$/i.test(r.user);
        return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: fs, fontWeight: 500, lineHeight: 1.3,
          padding: bot ? '10px 16px' : '0 16px', borderLeft: bot ? `6px solid ${C.blue}` : '6px solid transparent', background: bot ? '#00c6ff1a' : 'transparent' },
          bot ? h('div', { display: 'flex', fontSize: fs * 0.6, fontWeight: 800, background: C.blue, color: '#021018', padding: '3px 10px', borderRadius: 6, marginRight: 12 }, 'BOT') : null,
          h('span', { fontWeight: 800, color: colorOf(r.user) }, r.user),
          h('span', { color: '#efeff1', marginRight: 12 }, ':'),
          h('span', { color: '#efeff1' }, r.text),
        );
      }),
    ),
    h('div', { display: 'flex', alignItems: 'center', gap: 14, padding: '22px 48px 30px', background: '#18181b', borderTop: '2px solid #2a2a2e' },
      h('div', { display: 'flex', flex: 1, padding: '18px 24px', borderRadius: 10, background: '#2a2a2e', fontSize: 28, color: '#7d7d86' }, 'Send a message'),
      img(logo, 56, 56),
      h('div', { display: 'flex', fontSize: 26, fontWeight: 800 }, h('span', { color: C.blue }, 'REX'), h('span', {}, 'BOT')),
    ),
    pagePill(page, !showCap),
  );
}

// ---------- pop: colour block, giant type ----------
async function popTemplate({ q, headline, accent, sub, page, W, H }) {
  const pal = POP[(q.get('c') || 'blue').toLowerCase()] || POP.blue;
  const rex = await dataUri('rex-full.png');
  const head = lines(headline), acc = lines(accent);
  const subSize = 36;
  const subH = sub ? Math.max(1, Math.ceil((sub.length * 0.55 * subSize) / (W - 128))) * subSize * 1.3 + 36 : 0;
  // Fixed zones: 64 pad + 40 header + 50 gap | text | Rex (400 tall) + 64 pad. Text gets what's left.
  const rexH = 400, rexW = Math.round(rexH * 900 / 678);
  const textH = H - 64 - 40 - 50 - rexH - 64 - subH;
  const size = fit(head.concat(acc), { width: W - 128, height: textH, max: 170, min: 56, cw: 0.66, lh: 1.0 });
  const line = (l, color) => h('div', { display: 'flex', fontSize: size, fontWeight: 800, lineHeight: 1.0, letterSpacing: -4, textTransform: 'uppercase', color }, l);
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', background: pal.bg, fontFamily: 'Inter', color: pal.ink, position: 'relative', overflow: 'hidden', padding: '64px 64px 0' },
    h('div', { display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 6, height: 40 }, 'REXBOT'),
    h('div', { display: 'flex', flexDirection: 'column', marginTop: 50, height: textH, overflow: 'hidden' },
      ...head.map((l) => line(l, pal.ink)), ...acc.map((l) => line(l, pal.hi))),
    sub ? h('div', { display: 'flex', fontSize: subSize, fontWeight: 700, lineHeight: 1.3, marginTop: 36, width: W - 128 }, sub) : null,
    h('div', { display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: 'space-between', marginRight: -64 - 120 },
      h('div', { display: 'flex', fontSize: 30, fontWeight: 800, marginBottom: 56 }, 'rexbotapp.com'),
      img(rex, rexW, rexH, { marginBottom: -30 }),
    ),
    pagePill(page, pal.ink === '#ffffff'),
  );
}

// ---------- notes: monospace patch notes on paper ----------
async function notesTemplate({ headline, sub, msgs, page, W, H, logo }) {
  const items = lines(msgs).slice(0, 10);
  const title = lines(headline);
  const paperW = W - 160 - 120;
  const tSize = fit(title, { width: paperW, height: 150, max: 54, min: 30, cw: 0.62, lh: 1.15 });
  const titleH = title.reduce((n, l) => n + Math.ceil((l.length * 0.62 * tSize) / paperW), 0) * tSize * 1.15;
  const subH = sub ? Math.ceil((sub.length * 0.62 * 28) / paperW) * 28 * 1.2 + 12 : 0;
  // Paper height minus logo row, title block, gaps and footer = room for the list.
  const room = H - 140 - 128 - 54 - 34 - titleH - subH - 26 - 44 - 60 - 30;
  const listH = (list, f) => list.reduce((t, it) => t + Math.ceil((it.length * 0.62 * f) / (paperW - f * 0.62 - 18)) * f * 1.3, 0) + Math.round(f * 0.7) * (list.length - 1);
  let fs = 44;
  while (fs > 24 && listH(items, fs) > room) fs -= 2;
  while (items.length > 1 && listH(items, fs) > room) items.pop();
  return h('div', { width: W, height: H, display: 'flex', background: '#2b2b2b', fontFamily: 'Mono', position: 'relative', padding: '70px 80px' },
    h('div', { display: 'flex', flexDirection: 'column', flex: 1, background: '#f4f1e8', color: '#151515', padding: '64px 60px', boxShadow: '0 30px 60px #00000080', transform: 'rotate(-1.2deg)' },
      h('div', { display: 'flex', alignItems: 'center', gap: 18, fontSize: 26, color: '#6b6b6b' },
        img(logo, 54, 54), 'REXBOT // OFFICIAL DOCUMENT'),
      h('div', { display: 'flex', flexDirection: 'column', marginTop: 34, paddingBottom: 26, borderBottom: '4px dashed #151515' },
        ...title.map((l) => h('div', { display: 'flex', fontSize: tSize, lineHeight: 1.15, letterSpacing: -1 }, l)),
        sub ? h('div', { display: 'flex', fontSize: 28, color: '#6b6b6b', marginTop: 12 }, sub) : null,
      ),
      h('div', { display: 'flex', flexDirection: 'column', gap: Math.round(fs * 0.7), marginTop: 44, flex: 1 },
        ...items.map((it) => h('div', { display: 'flex', fontSize: fs, lineHeight: 1.3 },
          h('span', { color: '#0090bb', marginRight: 18 }, '-'), h('span', {}, it))),
      ),
      h('div', { display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#6b6b6b', borderTop: '4px dashed #151515', paddingTop: 22 },
        h('span', {}, 'signed, rex'), h('span', {}, 'rexbotapp.com')),
    ),
    pagePill(page, true),
  );
}

// ---------- shot: real product screenshot ----------
async function shotTemplate({ q, headline, sub, page, W, H }) {
  const s = SHOTS[(q.get('img') || 'chat').toLowerCase()] || SHOTS.chat;
  const shot = await dataUri(s.file);
  const head = lines(headline);
  const hSize = fit(head, { width: W - 120, height: 230, max: 70, min: 40, cw: 0.56, lh: 1.05 });
  const headH = Math.max(1, head.reduce((n, l) => n + Math.ceil((l.length * 0.56 * hSize) / (W - 120)), 0)) * hSize * 1.05;
  const subH = sub ? Math.ceil((sub.length * 0.5 * 32) / (W - 120)) * 32 * 1.35 + 18 : 0;
  // Everything above and below the screenshot is measured, so the screenshot gets only the space that's left.
  const ratio = (s.file.includes('overlay') ? 904 : s.file.includes('discord') ? 1090 : 1038) / 1120;
  const roomH = H - 72 - 34 - 16 - headH - subH - 30 - 46 - 56 - 20;
  const shotW = Math.min(W - 120, Math.floor(roomH / ratio));
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', background: `linear-gradient(165deg, ${s.bg} 0%, #0b0b0f 70%)`, fontFamily: 'Inter', color: '#ffffff', position: 'relative', padding: '72px 60px 56px' },
    h('div', { display: 'flex', fontSize: 28, fontWeight: 800, letterSpacing: 4, color: '#ffffffb3' }, s.label.toUpperCase()),
    h('div', { display: 'flex', flexDirection: 'column', marginTop: 16 },
      ...head.map((l) => h('div', { display: 'flex', fontSize: hSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2.5 }, l))),
    sub ? h('div', { display: 'flex', fontSize: 32, fontWeight: 500, color: '#ffffffcc', marginTop: 18, lineHeight: 1.35 }, sub) : null,
    h('div', { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
      h('div', { display: 'flex', borderRadius: 22, overflow: 'hidden', border: '3px solid #ffffff26', boxShadow: '0 40px 80px #000000a0' },
        img(shot, shotW, Math.round(shotW * ratio), { objectFit: 'cover' })),
    ),
    h('div', { display: 'flex', justifyContent: 'space-between', fontSize: 26, fontWeight: 700, color: '#ffffff99', marginTop: 20 },
      h('span', {}, 'rexbotapp.com'), h('span', {}, 'Free for streamers')),
    pagePill(page, true),
  );
}

// ---------- step: carousel slide ----------
async function stepTemplate({ q, headline, sub, page, W, H, logo }) {
  const n = String(q.get('n') || '1').slice(0, 3);
  const head = lines(headline);
  const tSize = fit(head, { width: W - 160, height: 330, max: 80, min: 44, cw: 0.56, lh: 1.05 });
  const sSize = sub ? fit([sub], { width: W - 160, height: 300, max: 40, min: 26, cw: 0.5, lh: 1.4 }) : 40;
  return h('div', { width: W, height: H, display: 'flex', flexDirection: 'column', background: '#f4f4f6', fontFamily: 'Inter', color: '#0a0a0a', position: 'relative', padding: '80px 80px 64px' },
    h('div', { display: 'flex', fontSize: 340, fontWeight: 800, lineHeight: 0.9, letterSpacing: -16, color: C.blue }, n.padStart(2, '0')),
    h('div', { display: 'flex', flexDirection: 'column', marginTop: 50 },
      ...head.map((l) => h('div', { display: 'flex', fontSize: tSize, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }, l))),
    sub ? h('div', { display: 'flex', fontSize: sSize, fontWeight: 500, color: '#3a3a40', marginTop: 34, lineHeight: 1.4 }, sub) : null,
    h('div', { display: 'flex', flex: 1 }),
    h('div', { display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 800 },
      img(logo, 60, 60), h('span', { color: C.blue }, 'REX'), h('span', { marginLeft: -16 }, 'BOT'),
      h('span', { color: '#8a8a92', fontWeight: 700, marginLeft: 'auto' }, 'rexbotapp.com')),
    pagePill(page, false),
  );
}
