// Social post image generator for RexBot's Instagram / X posts.
//
//   /api/social?h=Headline&a=Blue+accent+line&s=Optional+subline&f=all
//
//   h  headline (white)                         required
//   a  accent line (Rex blue)                   optional
//   s  supporting line (muted grey)             optional
//   f  feature card: twitch | discord | widget | all | none   (default none)
//   size  square (1080x1080) | portrait (1080x1350, default)
//
// Renders a PNG in the same style as rexbotapp.com, so every automated post
// uses the real logo, colours and Inter type instead of AI-generated art.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const C = {
  bg: '#08090b', surface: '#131417', text: '#f4f4f6', muted: '#9d9da4',
  blue: '#00C6FF', twitch: '#9146FF', discord: '#5865F2', widget: '#1db954',
};

const asset = (name) => fetch(new URL(`./_social/${name}`, import.meta.url)).then((r) => r.arrayBuffer());
const toDataUri = (buf, mime) => {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
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

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const headline = (q.get('h') || 'One login. Three tools.').slice(0, 120);
  const accent = (q.get('a') || '').slice(0, 60);
  const sub = (q.get('s') || '').slice(0, 180);
  const feature = (q.get('f') || 'none').toLowerCase();
  const square = q.get('size') === 'square';
  const W = 1080, H = square ? 1080 : 1350;

  const [f500, f700, f800, logo, twitchPng, spotifyPng, discordSvg] = await Promise.all([
    asset('inter-latin-500-normal.woff'), asset('inter-latin-700-normal.woff'), asset('inter-latin-800-normal.woff'),
    asset('rex-mark.png'), asset('twitch.png'), asset('spotify.png'), asset('discord.svg'),
  ]);
  const icons = {
    twitch: toDataUri(twitchPng, 'image/png'),
    spotify: toDataUri(spotifyPng, 'image/png'),
    discord: toDataUri(discordSvg, 'image/svg+xml'),
  };

  // Headline scales down as it gets longer so it always fits.
  const len = headline.length + accent.length;
  const big = len > 70 ? 76 : len > 45 ? 90 : 104;

  let cards = null;
  if (feature === 'all') {
    cards = h('div', { display: 'flex', gap: 22, width: '100%' },
      card('twitch', icons, true), card('discord', icons, true), card('widget', icons, true));
  } else if (FEATURES[feature]) {
    cards = h('div', { display: 'flex', width: '100%' }, card(feature, icons, false));
  }

  const tree = h('div', {
    width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: C.bg, fontFamily: 'Inter', color: C.text, position: 'relative',
    padding: '80px 70px 64px',
  },
    // Background glows, same idea as the site's hero.
    h('div', { display: 'flex', position: 'absolute', top: -260, left: -180, width: 760, height: 760, borderRadius: 760,
      background: `radial-gradient(circle, ${C.blue}40 0%, ${C.blue}00 70%)` }),
    h('div', { display: 'flex', position: 'absolute', bottom: -300, right: -220, width: 760, height: 760, borderRadius: 760,
      background: `radial-gradient(circle, ${C.blue}26 0%, ${C.blue}00 70%)` }),

    // Wordmark
    h('div', { display: 'flex', alignItems: 'center', gap: 22 },
      img(toDataUri(logo, 'image/png'), 112, 112),
      h('div', { display: 'flex', fontSize: 84, fontWeight: 800, letterSpacing: -2 },
        h('span', { color: C.blue }, 'REX'), h('span', { color: C.text }, 'BOT')),
    ),

    // Message
    h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', gap: 34 },
      h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center' },
        h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: big, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3 }, headline),
        accent ? h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: big, fontWeight: 800, lineHeight: 1.1, letterSpacing: -3, color: C.blue, marginTop: 8 }, accent) : null,
      ),
      sub ? h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 500, color: '#c9c9cf', lineHeight: 1.4, maxWidth: 900 }, sub) : null,
      cards,
    ),

    // Footer
    h('div', { display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, fontWeight: 700 },
      h('div', { display: 'flex', padding: '16px 36px', borderRadius: 999, color: '#021018',
        background: `linear-gradient(90deg, #33d2ff, ${C.blue})` }, 'rexbotapp.com'),
      h('div', { display: 'flex', color: C.muted }, 'Free. Runs in the cloud.'),
    ),
  );

  return new ImageResponse(tree, {
    width: W, height: H,
    fonts: [
      { name: 'Inter', data: f500, weight: 500, style: 'normal' },
      { name: 'Inter', data: f700, weight: 700, style: 'normal' },
      { name: 'Inter', data: f800, weight: 800, style: 'normal' },
    ],
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
