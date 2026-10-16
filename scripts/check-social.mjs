// Layout check for /api/social: renders every text block and every picture on its own and fails if
//   - two text blocks overlap,
//   - text sits on top of Rex or a screenshot (full-bleed background photos are allowed),
//   - text is clipped by its box or runs within 16px of the canvas edge.
// Usage: node scripts/check-social.mjs ["t=pop&h=..." ...]   (no args = built-in stress cases)
import { buildTree, renderPng } from '../api/social.js';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const CASES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'h=Rex says hi&a=Exceeds expectations&s=A normal sentence for the subline.&f=all&p=1/3',
  'h=One login. Three tools.&f=twitch',
  't=meme&h=Me: one more game then bed|The clock: 4:12am&a=Rex: queue again',
  't=meme&h=nobody:|absolutely nobody:|Rex at 4am deleting your timers for fun&a=It was a feature request from chat',
  't=chat&h=Day 47 of chat asking the same thing&m=GGWarden: what song is this|LunaBytes: song?|OrbitFox: SONG NAME??|PixelPilot: what song is this|RexBot: Now playing: Midnight City by M83|CozyCrit: what song is this',
  't=chat&m=' + Array.from({ length: 14 }, (_, i) => `User${i}: this is a fairly long chat message number ${i} that wraps`).join('|'),
  't=pop&h=Your own|Spotify app&a=2 minutes&s=Rex timed it. Swipe for the steps.&c=spotify&p=1/4',
  't=pop&h=Unmute|your mic&a=please&c=twitch',
  't=pop&h=Your mod has been|AFK since the|dawn of time&a=and counting&s=Rex never logs off, never sleeps, never forgets a command.&c=black&p=1/5',
  't=notes&h=REX PATCH NOTES v6.6.6&s=hotfix, deployed at 4am&m=Fixed: chat asking what song this is|Fixed: timers forgot your socials|Added: Rex|Known issue: Rex',
  't=notes&h=REX\'S TERMS OF SERVICE AND OTHER LEGALLY BINDING THREATS&s=by streaming you agree to all of the following, forever&m=' + Array.from({ length: 10 }, (_, i) => `Clause ${i + 1}: Rex reserves the right to do whatever Rex wants, whenever`).join('|'),
  't=shot&img=overlay&h=Your score,|on screen,|updated by chat.&s=Wins counter, scoreboard and key overlays for OBS.',
  't=shot&img=discord&h=Button roles that actually get clicked by your whole community&s=Self-assign game roles from one message. Rex hands them out and never forgets who picked what.',
  't=shot&img=chat&h=Song requests&p=2/3',
  't=step&n=2&h=Paste the redirect URL&s=Copy it from your RexBot dashboard.&p=3/4',
  't=step&n=10&h=Drop your client ID and secret into the RexBot settings page&s=Both live in the Spotify developer dashboard under your app. Paste them in, hit save, and song requests plus the now-playing overlay start working straight away.&p=10/10',
];

const TRANSPARENT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Walk the tree, giving every node a path so we can switch individual pieces on and off.
function collect(node, path = 'r', out = { texts: [], imgs: [] }) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'img') { out.imgs.push({ path, w: node.props.width, h: node.props.height }); return out; }
  const kids = [].concat(node.props?.children ?? []);
  if (kids.some((k) => typeof k === 'string' || typeof k === 'number')) out.texts.push({ path, text: kids.filter((k) => typeof k !== 'object').join('') });
  kids.forEach((k, i) => collect(k, `${path}.${i}`, out));
  return out;
}

// Copy of the tree where only `keep` is visible. clip=false also lifts every overflow:hidden.
function isolate(node, keep, clip = true, path = 'r') {
  if (!node || typeof node !== 'object') return node;
  const on = path === keep;
  const style = { ...(node.props?.style || {}) };
  if (node.type === 'img') {
    return { ...node, props: { ...node.props, src: on ? node.props.src : TRANSPARENT, style: { ...style, opacity: 1 } } };
  }
  // Delete (not 'none') decorations: satori turns boxShadow:'none' into a broken filter.
  for (const k of ['boxShadow', 'border', 'borderLeft', 'borderTop', 'borderBottom', 'borderRight', 'filter']) delete style[k];
  Object.assign(style, { background: 'transparent', backgroundColor: 'transparent' });
  if (!clip) style.overflow = 'visible';
  if (on) Object.assign(style, { color: '#000000' });
  else { style.color = 'transparent'; delete style.WebkitTextStroke; delete style.textShadow; }
  const kids = [].concat(node.props?.children ?? []).map((k, i) => (typeof k === 'object' ? isolate(k, keep, clip, `${path}.${i}`) : k));
  return { ...node, props: { ...node.props, style, children: kids } };
}

const S = 3; // masks are rendered at 1/3 size; plenty to catch real collisions and much faster
async function mask(tree, fonts, W, H) {
  const svg = await satori(tree, { width: W, height: H, fonts });
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(W / S) } }).render();
  const px = img.pixels, w = img.width, h = img.height;
  const m = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 60) { m[i] = 1; n++; }
  return { m, n, w, h };
}

let failures = 0;
const ONLY = process.env.ONLY; // run one case by index, e.g. ONLY=3
const RUN = CASES.filter((_, i) => ONLY === undefined || String(i) === ONLY);
for (const qs of RUN) {
  const url = 'https://x/api/social?' + qs.split('&').map((kv) => { const i = kv.indexOf('='); return kv.slice(0, i) + '=' + encodeURIComponent(kv.slice(i + 1)); }).join('&');
  const { tree, fonts, W, H } = await buildTree(url);
  const { texts, imgs } = collect(tree);
  const problems = [];
  const tm = [];
  for (const t of texts) {
    const a = await mask(isolate(tree, t.path, true), fonts, W, H);
    const b = await mask(isolate(tree, t.path, false), fonts, W, H);
    if (b.n - a.n > Math.max(15, b.n * 0.08)) problems.push(`clipped text: "${t.text.slice(0, 40)}"`);
    let edge = false;
    const e = Math.ceil(16 / S);
    for (let y = 0; y < b.h && !edge; y++) for (let x = 0; x < b.w; x++) if (b.m[y * b.w + x] && (x < e || y < e || x >= b.w - e || y >= b.h - e)) { edge = true; break; }
    if (edge) problems.push(`text touches canvas edge: "${t.text.slice(0, 40)}"`);
    tm.push({ ...t, m: b.m });
  }
  for (let i = 0; i < tm.length; i++) for (let j = i + 1; j < tm.length; j++) {
    let n = 0; for (let k = 0; k < tm[i].m.length; k++) if (tm[i].m[k] && tm[j].m[k]) n++;
    if (n > 4) problems.push(`text overlaps text: "${tm[i].text.slice(0, 30)}" x "${tm[j].text.slice(0, 30)}" (~${n * S * S}px)`);
  }
  for (const im of imgs) {
    if (im.w >= W * 0.95) continue; // full-bleed background photo: text on it is the point
    const { m } = await mask(isolate(tree, im.path, false), fonts, W, H);
    for (const t of tm) {
      let n = 0; for (let k = 0; k < m.length; k++) if (t.m[k] && m[k]) n++;
      if (n > 4) problems.push(`text over picture (${im.w}x${im.h}): "${t.text.slice(0, 40)}" (~${n * S * S}px)`);
    }
  }
  if (problems.length) failures++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${qs.slice(0, 90)}`);
  for (const p of problems) console.log('      - ' + p);
}
console.log(failures ? `\n${failures} case(s) failed` : '\nall cases passed');
process.exit(failures ? 1 : 0);
