// Social post image generator for RexBot's Instagram / X posts.
//
// Standard post:
//   /api/social?k=Tip&h=Headline&a=Blue+punchline&s=Supporting+line&f=widget
//
//   k  kicker tag above the headline (e.g. New, Tip, Feature)     optional
//   h  headline (white)                                           required
//   a  punchline / second line (Rex blue)                         optional
//   s  supporting line (muted)                                    optional
//   f  feature card: twitch | discord | widget | all | none       default none
//
// Meme post (fake stream chat):
//   /api/social?t=chat&h=Caption+above+the+chat&m=viewer123:play+lofi~RexBot:queued+doom+metal
//
//   t=chat  switches to the chat meme layout
//   h       caption above the chat (optional)
//   m       chat lines, "name:message" separated by "~". A name of RexBot or
//           Rex renders as the bot, with the logo avatar. Up to 7 lines.
//
//   size  square (1080x1080) | portrait (1080x1350, default)
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
  bg: '#08090b', surface: '#131417', border: '#232327', text: '#f4f4f6', soft: '#c9c9cf', muted: '#9d9da4',
  blue: '#00C6FF', twitch: '#9146FF', discord: '#5865F2', widget: '#1db954',
};

const asset = async (name) => { const b = await readFile(path.join(ASSET_DIR, name)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
// The bundled font has no emoji glyphs, so strip them rather than render boxes.
const clean = (t) => t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
const toDataUri = (buf, mime) => `data:${mime};base64,${Buffer.from(new Uint8Array(buf)).toString('base64')}`;

// Tiny element helper so this file needs no JSX build step.
const h = (type, style, ...children) => ({
  type,
  props: { style, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false && c !== '') },
});
const img = (src, w, hgt, style = {}) => ({ type: 'img', props: { src, width: w, height: hgt, style } });

const FEATURES = {
  twitch: { title: 'Twitch Chatbot', desc: 'Commands, timers and song requests for your chat.', color: C.twitch, icon: 'twitch' },
  discord: { title: 'Discord Bot', desc: 'Music in your voice channel, on request.', color: C.discord, icon: 'discord' },
  widget: { title: 'Now Playing Widget', desc: 'A clean now-playing overlay for OBS.', color: C.widget, icon: 'spotify' },
};

// --- Balanced line breaking -------------------------------------------------
// Satori wraps greedily, which leaves one-word last lines ("yet?"). Instead we
// estimate text width, pick the largest size that fits in few lines, and split
// words so every line is about the same length.
function charEm(ch) {
  if (ch === ' ') return 0.26;
  if ('il.,:;!|\'`'.includes(ch)) return 0.28;
  if ('fjtr()[]/-'.includes(ch)) return 0.38;
  if ('mwMW@'.includes(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.7;
  if (/[0-9]/.test(ch)) return 0.62;
  return 0.57;
}
function textWidth(t, size, tracking) {
  let w = 0;
  for (const ch of t) w += charEm(ch) * size + tracking;
  return w;
}
// Split words into exactly n lines minimising the widest line.
function splitBalanced(words, n, size, tracking) {
  const W = (a, b) => textWidth(words.slice(a, b).join(' '), size, tracking);
  const memo = new Map();
  const best = (start, k) => {
    const key = start + ',' + k;
    if (memo.has(key)) return memo.get(key);
    let res;
    if (k === 1) { const w = W(start, words.length); res = { max: w, cost: w, breaks: [] }; }
    else {
      res = { max: Infinity, cost: Infinity, breaks: [] };
      for (let i = start + 1; i <= words.length - (k - 1); i++) {
        const rest = best(i, k - 1);
        const m = Math.max(W(start, i), rest.max);
        // Prefer breaking after punctuation ("Chat bot. / Discord music.").
        const cost = Math.max(W(start, i), rest.cost ?? rest.max) + (/[.,!?:;]$/.test(words[i - 1]) ? 0 : size * 1.6);
        if (cost < (res.cost ?? Infinity)) res = { max: m, cost, breaks: [i, ...rest.breaks] };
      }
    }
    memo.set(key, res);
    return res;
  };
  const { max, breaks } = best(0, n);
  const lines = [];
  let a = 0;
  for (const b of [...breaks, words.length]) { lines.push(words.slice(a, b).join(' ')); a = b; }
  return { lines, max };
}
// Fewest lines that fit maxWidth, balanced. Returns null if it can't fit in maxLines.
function layoutLines(text, size, tracking, maxWidth, maxLines, bySentence = true) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], max: 0 };
  // Multi-sentence copy ("Chat bot. Discord music. Overlay."): if it fits with
  // one sentence per line, do that rather than splitting a phrase.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (bySentence && sentences.length > 1 && sentences.length <= maxLines &&
      sentences.every((l) => textWidth(l, size, tracking) <= maxWidth)) {
    return { lines: sentences, max: Math.max(...sentences.map((l) => textWidth(l, size, tracking))) };
  }
  for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
    const r = splitBalanced(words, n, size, tracking);
    if (r.max <= maxWidth) return r;
  }
  return null;
}
// Largest size (from the list) where headline + accent fit in few balanced lines.
function fitHeadline(headline, accent, maxWidth) {
  for (const size of [116, 104, 96, 88, 80, 72, 64]) {
    const tr = -size * 0.035;
    const sentences = headline.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    const lim = Math.max(size >= 96 ? 2 : 3, Math.min(sentences, 3));
    const hl = layoutLines(headline, size, tr, maxWidth, lim);
    const al = accent ? layoutLines(accent, size, tr, maxWidth, lim) : { lines: [] };
    if (hl && al && hl.lines.length + al.lines.length <= (size >= 88 ? 4 : 5)) return { size, tr, hl: hl.lines, al: al.lines };
  }
  const size = 64, tr = -size * 0.035;
  return { size, tr, hl: splitBalanced(headline.split(/\s+/), 3, size, tr).lines, al: accent ? splitBalanced(accent.split(/\s+/), 2, size, tr).lines : [] };
}

// Viewer name colours, like Twitch chat.
const NAME_COLORS = ['#ff7eb6', '#ffb86b', '#7fe8a5', '#caa4ff', '#ffd866', '#78dce8'];

function card(key, icons, compact) {
  const f = FEATURES[key];
  const iconBox = compact ? 60 : 84;
  return h('div', {
    display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'center',
    flex: compact ? 1 : 'none', gap: compact ? 16 : 28, padding: compact ? 26 : '30px 36px', borderRadius: 26,
    border: `2px solid ${f.color}`, background: `linear-gradient(160deg, ${f.color}30 0%, ${C.surface} 60%)`,
  },
    h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: iconBox, height: iconBox, borderRadius: 18, background: f.color, flexShrink: 0,
    }, img(icons[f.icon], iconBox * 0.58, iconBox * 0.58, { objectFit: 'contain' })),
    h('div', { display: 'flex', flexDirection: 'column', gap: compact ? 8 : 6 },
      h('div', { display: 'flex', fontSize: compact ? 28 : 38, fontWeight: 700, color: C.text, lineHeight: 1.1, letterSpacing: -0.5 }, f.title),
      h('div', { display: 'flex', fontSize: compact ? 21 : 28, fontWeight: 500, color: C.muted, lineHeight: 1.35 }, f.desc),
    ),
  );
}

function chatPanel(lines, logoUri) {
  let viewer = 0;
  const colorFor = {};
  const rows = lines.map(({ name, msg }) => {
    const isBot = /^rex(bot)?$/i.test(name);
    if (!isBot && !colorFor[name]) colorFor[name] = NAME_COLORS[viewer++ % NAME_COLORS.length];
    return h('div', { display: 'flex', alignItems: 'flex-start', gap: 18, padding: isBot ? '18px 22px' : '10px 22px',
      borderRadius: 18, background: isBot ? `${C.blue}14` : 'transparent', border: isBot ? `1px solid ${C.blue}40` : '1px solid transparent' },
      isBot ? img(logoUri, 48, 48, { flexShrink: 0, marginTop: 2 }) : null,
      h('div', { display: 'flex', flexWrap: 'wrap', fontSize: 36, lineHeight: 1.35, fontWeight: 500, color: C.text },
        h('span', { color: isBot ? C.blue : colorFor[name], fontWeight: 700, marginRight: 14 }, isBot ? 'RexBot' : name),
        h('span', {}, msg),
      ),
    );
  });
  return h('div', { display: 'flex', flexDirection: 'column', width: '100%', borderRadius: 28, overflow: 'hidden',
    border: `2px solid ${C.border}`, background: '#0e0f12' },
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 30px',
      borderBottom: `2px solid ${C.border}`, background: C.surface },
      h('div', { display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 3, color: C.muted }, 'STREAM CHAT'),
      h('div', { display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, color: '#ff4f5e' },
        h('div', { display: 'flex', width: 14, height: 14, borderRadius: 14, background: '#ff4f5e' }), 'LIVE'),
    ),
    h('div', { display: 'flex', flexDirection: 'column', gap: 10, padding: '26px 16px' }, rows),
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

async function render(req) {
  const q = new URL(req.url).searchParams;
  const type = (q.get('t') || 'post').toLowerCase();
  const kicker = clean(q.get('k') || '').slice(0, 24);
  const headline = clean(q.get('h') || (type === 'chat' ? '' : 'One login. Three tools.')).slice(0, 120);
  const accent = clean(q.get('a') || '').slice(0, 60);
  const sub = clean(q.get('s') || '').slice(0, 180);
  const feature = (q.get('f') || 'none').toLowerCase();
  const chatLines = (q.get('m') || '').split('~').map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? { name: l.slice(0, i).trim().slice(0, 20), msg: clean(l.slice(i + 1)).slice(0, 110) } : null;
  }).filter(Boolean).slice(0, 7);
  const square = q.get('size') === 'square';
  const W = 1080, H = square ? 1080 : 1350;

  const [f500, f700, f800, logo, twitchPng, spotifyPng, discordSvg] = await Promise.all([
    asset('inter-latin-500-normal.woff'), asset('inter-latin-700-normal.woff'), asset('inter-latin-800-normal.woff'),
    asset('rex-mark.png'), asset('twitch.png'), asset('spotify.png'), asset('discord.svg'),
  ]);
  const logoUri = toDataUri(logo, 'image/png');
  const icons = {
    twitch: toDataUri(twitchPng, 'image/png'),
    spotify: toDataUri(spotifyPng, 'image/png'),
    discord: toDataUri(discordSvg, 'image/svg+xml'),
  };
  const tint = FEATURES[feature] ? FEATURES[feature].color : C.blue;

  // Top bar: small wordmark left, optional kicker tag right.
  const topBar = h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    h('div', { display: 'flex', alignItems: 'center', gap: 14 },
      img(logoUri, 64, 64),
      h('div', { display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: -1 },
        h('span', { color: C.blue }, 'REX'), h('span', { color: C.text }, 'BOT')),
    ),
    kicker ? h('div', { display: 'flex', padding: '12px 26px', borderRadius: 999, fontSize: 24, fontWeight: 700,
      letterSpacing: 3, color: tint, border: `2px solid ${tint}`, background: `${tint}1f` }, kicker.toUpperCase()) : null,
  );

  // Footer: divider, then URL left and tagline right.
  const footer = h('div', { display: 'flex', flexDirection: 'column', width: '100%', gap: 30 },
    h('div', { display: 'flex', width: '100%', height: 2, background: C.border }),
    h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
      h('div', { display: 'flex', fontSize: 32, fontWeight: 700, color: C.blue }, 'rexbotapp.com'),
      h('div', { display: 'flex', fontSize: 26, fontWeight: 500, color: C.muted }, 'Free · Runs in the cloud'),
    ),
  );

  let body;
  if (type === 'chat') {
    body = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, width: '100%', gap: 44 },
      headline ? h('div', { display: 'flex', flexDirection: 'column' },
        (layoutLines(headline, 68, -2, 900, 2) || splitBalanced(headline.split(/\s+/), 2, 56, -2)).lines
          .map((l) => h('div', { display: 'flex', fontSize: headline.length > 50 ? 56 : 68, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2, whiteSpace: 'nowrap' }, l))) : null,
      chatPanel(chatLines.length ? chatLines : [{ name: 'viewer123', msg: '!sr lofi beats' }, { name: 'RexBot', msg: 'Added to the queue: Lofi Beats' }], logoUri),
    );
  } else {
    // Headline sizing + balanced line breaks (content width = 1080 - 2*80).
    const fit = fitHeadline(headline, accent, 900);
    const lineStyle = (color) => ({ display: 'flex', fontSize: fit.size, fontWeight: 800, lineHeight: 1.02, letterSpacing: fit.tr, color, whiteSpace: 'nowrap' });
    const subLines = sub ? (layoutLines(sub, 34, 0, 860, 3, false) || splitBalanced(sub.split(/\s+/), 3, 34, 0)).lines : [];
    let cards = null;
    if (feature === 'all') {
      cards = h('div', { display: 'flex', gap: 20, width: '100%' },
        card('twitch', icons, true), card('discord', icons, true), card('widget', icons, true));
    } else if (FEATURES[feature]) {
      cards = card(feature, icons, false);
    }
    body = h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1, width: '100%', gap: 52, paddingBottom: 56 },
      h('div', { display: 'flex', flexDirection: 'column', gap: 34 },
        h('div', { display: 'flex', flexDirection: 'column' },
          fit.hl.map((l) => h('div', lineStyle(C.text), l)),
          fit.al.map((l, i) => h('div', { ...lineStyle(C.blue), marginTop: i === 0 ? 6 : 0 }, l)),
        ),
        subLines.length ? h('div', { display: 'flex', flexDirection: 'column' },
          subLines.map((l) => h('div', { display: 'flex', fontSize: 34, fontWeight: 500, color: C.soft, lineHeight: 1.4, whiteSpace: 'nowrap' }, l))) : null,
      ),
      cards,
    );
  }

  const tree = h('div', {
    width: W, height: H, display: 'flex', flexDirection: 'column',
    background: C.bg, fontFamily: 'Inter', color: C.text, position: 'relative',
    padding: '72px 80px 64px',
  },
    // Background glows, same idea as the site's hero.
    h('div', { display: 'flex', position: 'absolute', top: -300, right: -240, width: 820, height: 820, borderRadius: 820,
      background: `radial-gradient(circle, ${tint}38 0%, ${tint}00 70%)` }),
    h('div', { display: 'flex', position: 'absolute', bottom: -320, left: -260, width: 760, height: 760, borderRadius: 760,
      background: `radial-gradient(circle, ${C.blue}1f 0%, ${C.blue}00 70%)` }),
    topBar,
    body,
    footer,
  );

  const svg = await satori(tree, {
    width: W, height: H,
    fonts: [
      { name: 'Inter', data: f500, weight: 500, style: 'normal' },
      { name: 'Inter', data: f700, weight: 700, style: 'normal' },
      { name: 'Inter', data: f800, weight: 800, style: 'normal' },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
