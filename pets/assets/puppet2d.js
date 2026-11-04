// 2D cut-out puppets (docs/pets/ASSET_BRIEF_2D.md): each piece is a flat textured plane on a group
// at its pivot, parented like the art map says. Animations are generated here as ordinary
// AnimationClips, so the Pet engine drives a puppet exactly like a glTF model.
import * as THREE from 'three';

const PX = 0.01;                       // model units per art pixel
const FPS = 30;
const Z = new THREE.Vector3(0, 0, 1);
const FACE = /^(eye_|lid_|brow_|mouth_)/;   // driven by the engine's face code, not by clips
const SOCKET_PARENT = { head: 'head', face: 'head', mouth: 'muzzle', overhead: 'head' };

const loadImage = src => new Promise((ok, fail) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = fail;
  im.src = src;
});

export async function loadPuppet(url) {
  const map = await fetch(url).then(r => r.json());
  const dir = url.replace(/[^/]*$/, '');
  const P = map.pieces, H = map.canvas[1];
  const shown = Object.values(P).filter(p => !p.hidden).map(p => p.bbox);
  const cx = (Math.min(...shown.map(b => b[0])) + Math.max(...shown.map(b => b[2]))) / 2;
  const at = (x, y) => new THREE.Vector3((x - cx) * PX, (H - y) * PX, 0);   // art px -> model units, y up
  const local = (n, x, y) => at(x, y).sub(P[n] ? at(...P[n].pivot) : new THREE.Vector3());

  const scene = new THREE.Group();
  scene.name = 'puppet';
  const nodes = {};
  const node = n => {
    if (nodes[n]) return nodes[n];
    const g = nodes[n] = new THREE.Group();
    g.name = n;
    const par = P[n].parent;
    g.position.copy(local(par, ...P[n].pivot));
    (par ? node(par) : scene).add(g);
    return g;
  };

  const images = Object.fromEntries(await Promise.all(Object.keys(P).map(async n =>
    [n, await loadImage(`${dir}pieces/${n}.png`)])));
  map.order_back_to_front.forEach((n, i) => {
    const [x0, y0, x1, y1] = P[n].bbox;
    const c = Object.assign(document.createElement('canvas'), { width: x1 - x0, height: y1 - y0 });
    c.getContext('2d').drawImage(images[n], x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    const map_ = new THREE.CanvasTexture(c);
    map_.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width * PX, c.height * PX),
      new THREE.MeshBasicMaterial({ map: map_, transparent: true, depthWrite: false, side: THREE.DoubleSide, name: `piece_${n}` }));
    mesh.name = `${n}_art`;
    mesh.position.copy(local(n, (x0 + x1) / 2, (y0 + y1) / 2));
    mesh.renderOrder = 10 + i;          // layer order is draw order
    const g = node(n);
    g.add(mesh);
    g.visible = !P[n].hidden;
  });
  for (const [name, [x, y]] of Object.entries(map.sockets)) {
    const par = SOCKET_PARENT[name.slice(7)] || 'torso';
    const s = new THREE.Object3D();
    s.name = name;
    s.position.copy(local(par, x, y));
    nodes[par].add(s);
  }

  // leg length from hip pivot to the bottom of the hoof, for the no-slide walk speed
  const legs = Object.keys(P).filter(n => /^leg_.*_upper$/.test(n));
  const legLen = legs.reduce((s, n) => s + P[n.replace('upper', 'lower')].bbox[3] - P[n].pivot[1], 0) / legs.length;
  const rig = cowClips(legLen);
  const animated = Object.keys(P).filter(n => !FACE.test(n));
  scene.userData = { body: 'quad', walk_speed: rig.walk_speed * PX, run_speed: rig.run_speed * PX, height: (H - Math.min(...shown.map(b => b[1]))) * PX };
  const animations = Object.entries(rig.clips).map(([name, [dur, fn]]) => bake(name, dur, fn, animated, nodes));
  return { scene, animations, flat: true, map };
}

// One clip: sample fn(t in 0..1) -> { r: {piece: degrees}, o: {piece: [dx, dy] px} } into tracks.
function bake(name, dur, fn, pieces, nodes) {
  const n = Math.max(1, Math.round(dur * FPS)), times = [], q = {}, p = {}, tmp = new THREE.Quaternion();
  for (const k of pieces) { q[k] = []; p[k] = []; }
  for (let i = 0; i <= n; i++) {
    times.push(i / n * dur);
    const { r = {}, o = {} } = fn(i / n);
    for (const k of pieces) {
      q[k].push(...tmp.setFromAxisAngle(Z, THREE.MathUtils.degToRad(r[k] || 0)).toArray());
      const b = nodes[k].position, [dx, dy] = o[k] || [0, 0];
      p[k].push(b.x + dx * PX, b.y + dy * PX, b.z);
    }
  }
  const tracks = pieces.flatMap(k => [
    new THREE.QuaternionKeyframeTrack(`${k}.quaternion`, times, q[k]),
    new THREE.VectorKeyframeTrack(`${k}.position`, times, p[k]),
  ]);
  return new THREE.AnimationClip(name, dur, tracks);
}

// ---- Highland cow (hoofed quad) clip set -------------------------------------------
// Degrees are counter-clockwise on screen with the cow facing left: + lowers the head,
// + swings a hoof backward, + lifts the tail. Offsets are px, + is up.
const s = (t, period = 1, phase = 0) => Math.sin(2 * Math.PI * (t / period + phase));
const ease = t => t * t * (3 - 2 * t);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const bump = (t, a, b) => Math.sin(Math.PI * seg(t, a, b));          // 0 -> 1 -> 0 across [a, b]
const LEGS = ['front_near', 'front_far', 'back_near', 'back_far'];

function add(...poses) {
  const out = { r: {}, o: {} };
  for (const p of poses) {
    for (const [k, v] of Object.entries(p.r || {})) out.r[k] = (out.r[k] || 0) + v;
    for (const [k, [x, y]] of Object.entries(p.o || {})) {
      const c = out.o[k] || [0, 0];
      out.o[k] = [c[0] + x, c[1] + y];
    }
  }
  return out;
}
function scale(p, f) { return add({ r: Object.fromEntries(Object.entries(p.r || {}).map(([k, v]) => [k, v * f])),
  o: Object.fromEntries(Object.entries(p.o || {}).map(([k, [x, y]]) => [k, [x * f, y * f]])) }); }

// legs swing as pendulums; the lower leg folds while the leg comes forward so the hoof clears
function gait(t, phases, A, B) {
  const r = {};
  for (const [leg, ph] of Object.entries(phases)) {
    const u = 2 * Math.PI * (t + ph);
    r[`leg_${leg}_upper`] = A * Math.sin(u);
    r[`leg_${leg}_lower`] = B * Math.max(0, -Math.cos(u));
  }
  return { r };
}
function tail(t, amp, period = 1, lift = 0) {
  const r = {};
  ['tail_01', 'tail_02', 'tail_03', 'tail_tuft'].forEach((k, i) => r[k] = (i ? 0 : lift) + amp * (0.5 + 0.2 * i) * s(t, period, -0.08 * i));
  return { r };
}
function fold(f, front = 1, back = 1) {   // knees bend, body sinks by about what the legs lose
  const r = {};
  for (const leg of LEGS) {
    const k = leg.startsWith('front') ? front : back;
    r[`leg_${leg}_upper`] = 14 * f * k * (leg.startsWith('front') ? 1 : -1);
    r[`leg_${leg}_lower`] = -28 * f * k * (leg.startsWith('front') ? 1 : -1);
  }
  return { r, o: { torso: [0, -9 * f] } };
}
function tuck(a) {
  return { r: { leg_front_near_upper: -22 * a, leg_front_far_upper: -22 * a, leg_front_near_lower: 48 * a, leg_front_far_lower: 48 * a,
                leg_back_near_upper: 22 * a, leg_back_far_upper: 22 * a, leg_back_near_lower: -44 * a, leg_back_far_lower: -44 * a } };
}

const LIE = { r: { leg_front_near_upper: -48, leg_front_far_upper: -48, leg_front_near_lower: 118, leg_front_far_lower: 118,
                   leg_back_near_upper: 58, leg_back_far_upper: 58, leg_back_near_lower: -120, leg_back_far_lower: -120 },
              o: { torso: [0, -44] } };
const SLEEP_HEAD = { r: { head: 14, ear_near: 10, ear_far: -10, tail_01: -8 }, o: { head: [0, -10] } };
const SAD = { r: { head: 12, ear_near: 20, ear_far: -20, tail_01: -10, fringe_front: 2 }, o: { head: [0, -6] } };

function cowClips(L) {
  const WALK = { T: 1.1, A: 14, B: 26 }, RUN = { T: 0.6, A: 26, B: 42 };
  // planted hoof speed at mid-stance: leg length x angular speed, so feet don't skate
  const speed = g => L * THREE.MathUtils.degToRad(g.A) * 2 * Math.PI / g.T;
  const clips = {
    idle: [4, t => add(tail(t, 8, 0.5), { r: { head: 2 * s(t, 1, 0.1), fringe_back: s(t), ear_near: 3 * s(t, 1, 0.25), ear_far: -3 * s(t, 1, 0.25) },
      o: { chest_fur: [0, 1.2 * s(t)], fringe_back: [0, 1 * s(t)], head: [0, 1 * s(t, 1, 0.15)] } })],
    walk: [WALK.T, t => add(gait(t, { back_near: 0, front_near: 0.25, back_far: 0.5, front_far: 0.75 }, WALK.A, WALK.B), tail(t, 10),
      { r: { head: 2.5 * s(t, 0.5), torso: 0.8 * s(t, 0.5), ear_near: 4 * s(t, 0.5, 0.2), ear_far: -4 * s(t, 0.5, 0.2), fringe_front: 1.5 * s(t, 0.5, 0.3) },
        o: { torso: [0, 1.5 * Math.cos(4 * Math.PI * t)] } })],
    run: [RUN.T, t => add(gait(t, { back_near: 0, back_far: 0.08, front_near: 0.5, front_far: 0.58 }, RUN.A, RUN.B), tail(t, 12, 1, 18),
      { r: { torso: 3 * s(t), head: -4 * s(t, 1, 0.1), fringe_front: 3 * s(t, 1, 0.25), fringe_back: 2 * s(t, 1, 0.3), ear_near: -8, ear_far: 8 },
        o: { torso: [0, 9 * Math.abs(s(t, 1, 0.1))] } })],
    eat: [3, t => {
      const d = ease(seg(t, 0, 0.18)) * (1 - ease(seg(t, 0.84, 1)));
      const chew = s(t, 0.09) * seg(t, 0.18, 0.24) * (1 - seg(t, 0.78, 0.84));
      return add(tail(t, 6, 0.6), { r: { head: 24 * d + 2 * chew, muzzle: 3 * chew, ear_near: 8 * d, ear_far: -6 * d, fringe_front: 3 * d },
        o: { head: [-4 * d, -14 * d] } });
    }],
    rage: [2.2, t => {
      const c = ease(seg(t, 0, 0.12)) * (1 - ease(seg(t, 0.88, 1)));
      const stamp = bump(t, 0.14, 0.28) + bump(t, 0.3, 0.44);
      const shake = bump(t, 0.48, 0.8);
      return add(tail(t, 26, 0.12, 14 * c), {
        r: { head: 10 * c + 8 * s(t, 0.07) * shake, fringe_front: 4 * s(t, 0.07, 0.2) * shake, muzzle: -5 * bump(t, 0.8, 0.88),
             leg_front_near_upper: -16 * stamp, leg_front_near_lower: 34 * stamp, ear_near: -10 * c, ear_far: 10 * c },
        o: { head: [-7 * c, -5 * c], torso: [-4 * c, 0] } });
    }],
    jump: [1.3, t => {
      const crouch = ease(seg(t, 0, 0.2)) * (1 - seg(t, 0.2, 0.26)) + bump(t, 0.6, 0.76) * 0.8;
      const air = seg(t, 0.24, 0.6), h = 4 * air * (1 - air);
      return add(fold(crouch), tuck(bump(t, 0.24, 0.6)), tail(t, 10, 0.5, 25 * bump(t, 0.2, 0.7)),
        { r: { head: -7 * bump(t, 0.2, 0.45) + 5 * bump(t, 0.55, 0.75), ear_near: -10 * h, ear_far: 10 * h, fringe_front: 4 * bump(t, 0.55, 0.75) },
          o: { torso: [0, 75 * h] } });
    }],
    celebrate: [1.6, t => {
      const hop = x => 4 * x * (1 - x), h = hop(seg(t, 0.08, 0.38)) + hop(seg(t, 0.5, 0.8));
      const crouch = bump(t, 0, 0.1) + bump(t, 0.36, 0.52) + bump(t, 0.78, 0.94);
      return add(fold(0.6 * crouch), tuck(0.5 * h), tail(t, 14, 0.25, 22 * (1 - seg(t, 0.85, 1))),
        { r: { head: -6 * Math.min(1, h * 2), ear_near: -12 * h, ear_far: 12 * h }, o: { torso: [0, 32 * h] } });
    }],
    love: [2, t => {
      const e = ease(seg(t, 0, 0.12)) * (1 - ease(seg(t, 0.85, 1)));
      return add(tail(t, 28 * e, 0.14, 18 * e), { r: { torso: 2.5 * s(t, 0.33) * e, head: (-5 + 6 * s(t, 0.5)) * e,
        ear_near: 9 * s(t, 0.18) * e, ear_far: -9 * s(t, 0.18) * e, fringe_front: 2 * s(t, 0.33, 0.2) * e } });
    }],
    dance: [1, t => add(tail(t, 22), { r: { head: 8 * s(t), torso: 3 * s(t), fringe_front: 4 * s(t, 1, 0.2), ear_near: 10 * s(t, 0.5), ear_far: -10 * s(t, 0.5),
      leg_front_near_upper: -16 * Math.max(0, s(t)), leg_front_near_lower: 30 * Math.max(0, s(t)),
      leg_front_far_upper: -16 * Math.max(0, -s(t)), leg_front_far_lower: 30 * Math.max(0, -s(t)) },
      o: { torso: [0, 7 * Math.abs(s(t))] } })],
    sad_in: [0.8, t => scale(SAD, ease(t))],
    sad: [4, t => add(SAD, tail(t, 3, 1, 0), { r: { head: 3 * bump(t, 0.4, 0.7) }, o: { head: [0, s(t)], chest_fur: [0, s(t)] } })],
    // cows go down front first (kneel on the wrists), then drop the back end (PETS_BODY_PLANS.md)
    lie_in: [2.2, t => {
      const f = ease(seg(t, 0, 0.5)), b = ease(seg(t, 0.4, 1));
      const front = { r: Object.fromEntries(Object.entries(LIE.r).filter(([k]) => k.includes('front'))) };
      const back = { r: Object.fromEntries(Object.entries(LIE.r).filter(([k]) => k.includes('back'))) };
      const tilt = 8 * f * (1 - b);
      return add(scale(front, f), scale(back, b), { r: { torso: tilt, head: -tilt }, o: { torso: [0, -26 * f - 18 * b] } });
    }],
    lie: [6, t => add(LIE, tail(t, 5, 0.5), { r: { head: 3 * s(t, 1, 0.1) }, o: { chest_fur: [0, 1.2 * s(t)], fringe_back: [0, s(t)] } })],
    sleep_in: [1.5, t => add(LIE, scale(SLEEP_HEAD, ease(t)))],
    sleep: [6, t => add(LIE, SLEEP_HEAD, { r: { head: 1.5 * s(t) }, o: { chest_fur: [0, 1.5 * s(t)], fringe_back: [0, 1.2 * s(t)] } })],
    idle_tail_swish: [1.6, t => add(tail(t, 30 * bump(t, 0, 1), 0.5), { r: { head: -2 * bump(t, 0.2, 0.8) } })],
    idle_ear_flick: [1, t => ({ r: { ear_near: -18 * bump(t, 0.05, 0.3), ear_far: 16 * bump(t, 0.45, 0.7), head: -1.5 * bump(t, 0, 1) } })],
    idle_head_toss: [1.4, t => ({ r: { head: -8 * bump(t, 0.1, 0.45) + 4 * bump(t, 0.45, 0.8), fringe_front: 5 * bump(t, 0.4, 0.75),
      ear_near: -6 * bump(t, 0.1, 0.5), ear_far: 6 * bump(t, 0.1, 0.5) } })],
    idle_chew: [2.5, t => ({ r: { muzzle: 2.5 * s(t, 0.12) * bump(t, 0, 1), head: 1.5 * bump(t, 0, 1) } })],
    'idle_stamp@grumpy': [1.4, t => {
      const k = bump(t, 0.15, 0.45) + bump(t, 0.5, 0.8);
      return add(tail(t, 18, 0.2), { r: { leg_front_near_upper: -15 * k, leg_front_near_lower: 30 * k, head: 6 * bump(t, 0.1, 0.9) } });
    }],
  };
  return { clips, walk_speed: speed(WALK), run_speed: speed(RUN) };
}
