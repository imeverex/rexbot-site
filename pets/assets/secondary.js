// Bone-chain secondary motion for tails and fur locks. Contract: PETS_SECONDARY_MOTION.md.
// The animation pose is the target; this adds gravity, lag and settling as joint ROTATIONS only.
import * as THREE from 'three';

const H = 1 / 120, MAX_STEPS = 4, ITERS = 6, EASE = 0.12, G = 9.81, TELEPORT_M = 1;
const DEFAULTS = { frequencyHz: 4, dampingRatio: 0.8, gravityScale: 1, motionInheritance: 0.5,
  maxSwingRadians: 1, particleRadiusMeters: 0.03, blend: 1 };
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vd = new THREE.Vector3();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qi = new THREE.Quaternion();

export class SecondaryMotion {
  constructor(model, meta) {
    this.problems = [];
    this.profiles = meta.clipProfiles || {};
    this.acc = 0;
    if (!/^1(\.\d+)?$/.test(meta.schemaVersion ?? '')) {
      this.problems.push(`unknown schemaVersion ${meta.schemaVersion}`);
      this.chains = [];
      return;
    }
    const node = name => model.getObjectByName(name) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

    this.colliders = {};
    for (const c of meta.colliders || []) {
      const n = node(c.node);
      if (!n) { this.problems.push(`collider ${c.id}: no node "${c.node}"`); continue; }
      this.colliders[c.id] = { ...c, n,
        a: new THREE.Vector3(...(c.center || c.start)), b: c.end ? new THREE.Vector3(...c.end) : null };
    }

    const owned = new Set();
    this.chains = [];
    for (const c of meta.chains || []) {
      const joints = c.joints.map(node);
      const bad = joints.findIndex((j, i) => !j || owned.has(j) || (i && j.parent !== joints[i - 1]));
      if (bad >= 0) { this.problems.push(`chain ${c.id}: joint "${c.joints[bad]}" missing, reused or not a child of the one before`); continue; }
      const tip = new THREE.Vector3(...c.tipOffset);
      // rest lengths in model units (meters) from the bind pose, never from a simulated pose
      model.updateMatrixWorld(true);
      const pts = joints.map(j => model.worldToLocal(j.getWorldPosition(new THREE.Vector3())));
      pts.push(model.worldToLocal(joints.at(-1).localToWorld(tip.clone())));
      const len = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
      if (len.some(l => !(l > 1e-6))) { this.problems.push(`chain ${c.id}: zero-length link or tip`); continue; }
      joints.forEach(j => owned.add(j));
      const n = pts.length, vec = () => Array.from({ length: n }, () => new THREE.Vector3());
      this.chains.push({ id: c.id, kind: c.kind, joints, tip, len, s: { ...DEFAULTS, ...c.settings },
        colliders: (c.colliders || []).map(id => this.colliders[id]).filter(Boolean),
        rest: joints.map(j => j.quaternion.clone()),
        pos: vec(), vel: vec(), tgt: vec(), last: vec(), cur: vec(), blendNow: 0, live: false });
    }
  }

  reset() { for (const c of this.chains) c.live = false; }

  // Bones no clip animates would otherwise keep last frame's simulated rotation as "animation".
  beforeAnimation() {
    for (const c of this.chains) c.joints.forEach((j, i) => j.quaternion.copy(c.rest[i]));
  }

  // Normalized animation-weighted average of per-clip multipliers; uncovered weight counts as 1.
  multiplier(c, actions) {
    let sum = 0, total = 0;
    for (const a of actions) {
      const w = a.isRunning() || a.clampWhenFinished ? a.getEffectiveWeight() : 0;
      if (!w) continue;
      const p = this.profiles[a.getClip().name];
      sum += w * (p?.[c.kind + 'BlendMultiplier'] ?? 1) * (p?.chainBlendMultipliers?.[c.id] ?? 1);
      total += w;
    }
    if (total < 1) { sum += 1 - total; total = 1; }
    return sum / total;
  }

  // Call after the animation pose and the pet's root transform are final for this frame.
  update(dt, actions, unitsPerMeter) {
    this.acc += dt;
    let steps = Math.floor(this.acc / H);
    this.acc -= steps * H;
    if (steps > MAX_STEPS) { this.reset(); steps = 0; }   // stalled frame: restart from the pose, no catch-up

    for (const c of this.chains) {
      const want = c.s.blend * this.multiplier(c, actions);
      c.blendNow += THREE.MathUtils.clamp(want - c.blendNow, -dt / EASE, dt / EASE);   // linear ease over 0.12s
      if (want === 0 && c.blendNow < 1e-3) { c.live = false; c.blendNow = 0; continue; }  // exact animation

      const n = c.pos.length;
      c.joints.forEach((j, i) => j.getWorldPosition(c.tgt[i]));
      c.joints.at(-1).localToWorld(c.tgt[n - 1].copy(c.tip));
      if (!c.live || c.tgt[0].distanceTo(c.last[0]) > TELEPORT_M * unitsPerMeter) {
        c.tgt.forEach((t, i) => { c.pos[i].copy(t); c.last[i].copy(t); c.vel[i].set(0, 0, 0); });
        c.live = true;
        c.since = 0;
      }

      // time since the targets were last simulated (frames above 120 fps can run zero steps)
      c.since = (c.since || 0) + dt;
      const w = 2 * Math.PI * c.s.frequencyHz, z = c.s.dampingRatio, g = G * c.s.gravityScale * unitsPerMeter;
      const cur = c.cur, prevAnchor = vd.copy(c.last[0]);
      for (let k = 0; k < steps; k++) {
        // targets move smoothly across the display frame instead of jumping once per frame
        cur.forEach((p, i) => p.lerpVectors(c.last[i], c.tgt[i], (k + 1) / steps));
        // carry part of the attachment's movement into the history (1 = no lag from it)
        va.subVectors(cur[0], prevAnchor).multiplyScalar(c.s.motionInheritance);
        prevAnchor.copy(cur[0]);
        for (let i = 1; i < n; i++) c.pos[i].add(va);
        for (let i = 1; i < n; i++) {
          const tv = vb.subVectors(c.tgt[i], c.last[i]).divideScalar(Math.max(c.since, 1e-4));
          const acc = va.subVectors(cur[i], c.pos[i]).multiplyScalar(w * w)
            .addScaledVector(vc.subVectors(c.vel[i], tv), -2 * z * w);
          acc.y -= g;
          c.vel[i].addScaledVector(acc, H);
          vc.copy(c.pos[i]);                                   // position before this step
          c.pos[i].addScaledVector(c.vel[i], H);
          c.vel[i].copy(vc);                                   // stash; becomes velocity below
        }
        c.pos[0].copy(cur[0]);
        for (let it = 0; it < ITERS; it++) this.constrain(c, unitsPerMeter, cur);
        for (let i = 1; i < n; i++) c.vel[i].subVectors(c.pos[i], c.vel[i]).divideScalar(H);
      }
      if (!steps) { this.apply(c); continue; }   // keep last frame's simulated pose; targets carry over

      if (c.pos.some(p => !Number.isFinite(p.x + p.y + p.z))) {
        console.warn('secondary motion: non-finite state, reset', c.id);
        c.live = false;
        continue;
      }
      c.tgt.forEach((t, i) => c.last[i].copy(t));
      c.since = 0;
      this.apply(c);
    }
  }

  constrain(c, s, tgt) {
    const { pos } = c, r = c.s.particleRadiusMeters * s;
    for (let i = 1; i < pos.length; i++) {
      for (const col of c.colliders) {
        const a = col.n.localToWorld(va.copy(col.a));
        const center = col.b ? closestOnSegment(pos[i], a, col.n.localToWorld(vb.copy(col.b))) : a;
        const d = vc.subVectors(pos[i], center), dist = d.length(), min = col.radiusMeters * s + r;
        if (dist >= min) continue;
        if (dist < 1e-9) d.subVectors(tgt[i], tgt[i - 1]); // stable normal at zero distance
        pos[i].copy(center).addScaledVector(d.normalize(), min);
      }
      // length, then swing limit around the ANIMATED direction
      const anim = va.subVectors(tgt[i], tgt[i - 1]).normalize();
      const dir = vb.subVectors(pos[i], pos[i - 1]);
      if (dir.lengthSq() < 1e-12) dir.copy(anim); else dir.normalize();
      const ang = anim.angleTo(dir);
      if (ang > c.s.maxSwingRadians) {
        qa.setFromUnitVectors(anim, dir);
        dir.copy(anim).applyQuaternion(qi.identity().slerp(qa, c.s.maxSwingRadians / ang));
      }
      pos[i].copy(pos[i - 1]).addScaledVector(dir, c.len[i - 1] * s);
    }
  }

  // Swing each joint from its animated direction to the simulated one, proximal to distal;
  // twist stays as animated, translations and scales are untouched.
  apply(c) {
    c.joints.forEach((j, i) => {
      const jw = j.getWorldPosition(va);
      const child = i + 1 < c.joints.length ? c.joints[i + 1].getWorldPosition(vb) : j.localToWorld(vb.copy(c.tip));
      const animDir = child.sub(jw).normalize();
      const simDir = vc.subVectors(c.pos[i + 1], c.pos[i]).normalize();
      const world = j.getWorldQuaternion(qb).premultiply(qa.setFromUnitVectors(animDir, simDir));
      const local = j.parent.getWorldQuaternion(qa).invert().multiply(world);
      j.quaternion.slerp(local, c.blendNow);
      j.updateMatrixWorld(true);
    });
  }

  // Debug: chain lines + collider spheres (capsules drawn as their end spheres).
  debug(scene, on) {
    if (!this.gizmo) {
      this.gizmo = new THREE.Group();
      this.lines = this.chains.map(c => {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.pos),
          new THREE.LineBasicMaterial({ color: 0xff4fd8, depthTest: false }));
        this.gizmo.add(l);
        return l;
      });
      this.balls = Object.values(this.colliders).flatMap(col => [col.a, col.b].filter(Boolean).map(p => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0x7fd6e5, wireframe: true, depthTest: false }));
        m.userData = { col, p };
        this.gizmo.add(m);
        return m;
      }));
      scene.add(this.gizmo);
    }
    this.gizmo.visible = on;
  }
  drawDebug(unitsPerMeter) {
    if (!this.gizmo?.visible) return;
    this.chains.forEach((c, i) => this.lines[i].geometry.setFromPoints(c.pos));
    for (const m of this.balls) {
      m.userData.col.n.localToWorld(m.position.copy(m.userData.p));
      m.scale.setScalar(m.userData.col.radiusMeters * unitsPerMeter);
    }
  }
  dispose() { this.gizmo?.removeFromParent(); }
}

function closestOnSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0, 1);
  return a.addScaledVector(ab, t);
}
