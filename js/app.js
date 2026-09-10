// app.js — DEXHAND: a dexterous robot hand solves a real Rubik's cube.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as C from './cubie.js';
import * as S from './solver.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status'), logEl = $('log'), movesEl = $('moves'), netEl = $('net'), clockEl = $('clock');

// ---------- audio ----------
let actx = null, muted = false;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function servo(dur = 0.4, dir = 1) {
  if (muted) return; try {
    const a = audio(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(dir > 0 ? 110 : 160, t);
    o.frequency.linearRampToValueAtTime(dir > 0 ? 175 : 95, t + dur);
    f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  } catch (e) {}
}
function click() {
  if (muted) return; try {
    const a = audio(), t = a.currentTime, n = a.createBufferSource(), g = a.createGain();
    const buf = a.createBuffer(1, 1200, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 90);
    n.buffer = buf; g.gain.value = 0.25; n.connect(g).connect(a.destination); n.start(t);
  } catch (e) {}
}
function chime() {
  if (muted) return; try {
    const a = audio(), t = a.currentTime;
    [523.25, 659.25, 784].forEach((fq, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = fq;
      g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.7);
      o.connect(g).connect(a.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.8);
    });
  } catch (e) {}
}

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090c);
scene.fog = new THREE.Fog(0x07090c, 14, 30);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6.4, 4.1, 8.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.autoRotate = true; controls.autoRotateSpeed = 0.55;
controls.minDistance = 3.5; controls.maxDistance = 20;
controls.target.set(0, 0.2, 0);

const key = new THREE.DirectionalLight(0xfff2e0, 3.2);
key.position.set(5, 8, 6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 1; key.shadow.camera.far = 30;
key.shadow.camera.left = key.shadow.camera.bottom = -8; key.shadow.camera.right = key.shadow.camera.top = 8;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x35f0d0, 1.1); rim.position.set(-6, 3, -7); scene.add(rim);
const fill = new THREE.PointLight(0x4455ff, 8, 20); fill.position.set(-4, -2, 5); scene.add(fill);
scene.add(new THREE.AmbientLight(0x223040, 1.4));

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.9, metalness: 0.1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.1; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.PolarGridHelper(14, 12, 6, 48, 0x1b2430, 0x11161e);
grid.position.y = -3.09; scene.add(grid);

// ---------- cube ----------
const CUBE_COLORS = { px: 0xb71234, nx: 0xff5800, py: 0xf4f4f4, ny: 0xffd500, pz: 0x009b48, nz: 0x0046ad };
const cubeGroup = new THREE.Group(); scene.add(cubeGroup);
const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.07);
const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x14171c, roughness: 0.42, metalness: 0.25, clearcoat: 0.5 });
const stickGeo = new RoundedBoxGeometry(0.84, 0.84, 0.055, 2, 0.05);
const cubies = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const faces = [[x, 1, 0, 0, 'px'], [x, -1, 0, 0, 'nx'], [y, 0, 1, 0, 'py'], [y, 0, -1, 0, 'ny'], [z, 0, 0, 1, 'pz'], [z, 0, 0, -1, 'nz']];
  for (const [v, dx, dy, dz, key] of faces) {
    if (v !== Math.sign(key === 'px' || key === 'py' || key === 'pz' ? 1 : -1) && v !== 0) continue;
    if ((key[0] === 'p' && v !== 1) || (key[0] === 'n' && v !== -1)) continue;
    const m = new THREE.Mesh(stickGeo, new THREE.MeshPhysicalMaterial({
      color: CUBE_COLORS[key], roughness: 0.25, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
    m.position.set(dx * 0.5, dy * 0.5, dz * 0.5);
    if (dy) m.rotation.x = Math.PI / 2;
    if (dx) m.rotation.y = Math.PI / 2;
    m.castShadow = true; g.add(m);
  }
  g.userData.grid = new THREE.Vector3(x, y, z);
  cubeGroup.add(g); cubies.push(g);
}

const FACE_DEF = [ // axis is the positive-coordinate axis; base = signed quarter-turn angle (radians base deg) matching cubie.js
  { n: new THREE.Vector3(0, 1, 0),  axis: 'y', layer: 1,  base: -Math.PI / 2, u: new THREE.Vector3(0, 0, -1) }, // U
  { n: new THREE.Vector3(1, 0, 0),  axis: 'x', layer: 1,  base: -Math.PI / 2, u: new THREE.Vector3(0, 1, 0)  }, // R
  { n: new THREE.Vector3(0, 0, 1),  axis: 'z', layer: 1,  base: -Math.PI / 2, u: new THREE.Vector3(0, 1, 0)  }, // F
  { n: new THREE.Vector3(0, -1, 0), axis: 'y', layer: -1, base: Math.PI / 2,  u: new THREE.Vector3(0, 0, 1)  }, // D
  { n: new THREE.Vector3(-1, 0, 0), axis: 'x', layer: -1, base: Math.PI / 2,  u: new THREE.Vector3(0, 1, 0)  }, // L
  { n: new THREE.Vector3(0, 0, -1), axis: 'z', layer: -1, base: Math.PI / 2,  u: new THREE.Vector3(0, 1, 0)  }, // B
];
const AXIS_VEC = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function bakePivot(pivot) {
  pivot.updateMatrixWorld();
  for (const c of [...pivot.children]) {
    cubeGroup.attach(c);
    c.position.round(); // snap to grid
    c.userData.grid.copy(c.position);
    const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'XYZ');
    c.quaternion.setFromEuler(new THREE.Euler(
      Math.round(e.x / (Math.PI / 2)) * Math.PI / 2,
      Math.round(e.y / (Math.PI / 2)) * Math.PI / 2,
      Math.round(e.z / (Math.PI / 2)) * Math.PI / 2));
  }
  pivot.rotation.set(0, 0, 0);
  pivot.clear();
}
const pivot = new THREE.Group(); cubeGroup.add(pivot);
function collectLayer(face) {
  const d = FACE_DEF[face];
  for (const c of cubies) if (Math.round(c.userData.grid[d.axis]) === d.layer) pivot.add(c);
}

// ---------- hand ----------
const METAL = new THREE.MeshPhysicalMaterial({ color: 0x2b313a, roughness: 0.34, metalness: 0.85, clearcoat: 0.4 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6, metalness: 0.4 });
const GLOW = new THREE.MeshStandardMaterial({ color: 0x0b2b26, emissive: 0x35f0d0, emissiveIntensity: 1.6, roughness: 0.5 });
const PAD = new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.95, metalness: 0 });

const hand = new THREE.Group(); scene.add(hand);
const palm = new THREE.Group(); hand.add(palm);
{
  const p = new THREE.Mesh(new RoundedBoxGeometry(1.75, 2.15, 0.72, 4, 0.16), METAL);
  p.castShadow = true; palm.add(p);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.4, 0.1, 2, 0.05), DARK);
  plate.position.set(0, 0.1, 0.4); palm.add(plate);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 1.4, 24), METAL);
  wrist.position.y = -1.7; wrist.castShadow = true; palm.add(wrist);
  const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 10, 32), GLOW);
  wristRing.rotation.x = Math.PI / 2; wristRing.position.y = -1.1; palm.add(wristRing);
}

function buildFinger(basePos, baseEuler, lens, radii) {
  const root = new THREE.Group(); root.position.copy(basePos); root.rotation.copy(baseEuler); palm.add(root);
  const joints = [];
  let parent = root;
  for (let i = 0; i < lens.length; i++) {
    const j = new THREE.Group(); j.position.y = i === 0 ? 0 : lens[i - 1]; parent.add(j);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(radii[i], lens[i] - radii[i], 6, 14), METAL);
    seg.position.y = lens[i] / 2; seg.castShadow = true; j.add(seg);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radii[i] * 1.02, 0.028, 8, 24), GLOW);
    ring.rotation.x = Math.PI / 2; j.add(ring);
    joints.push(j); parent = j;
  }
  const tip = new THREE.Group(); tip.position.y = lens[lens.length - 1]; parent.add(tip);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(radii[radii.length - 1] * 1.05, 14, 12), PAD);
  pad.scale.set(1, 0.7, 1.15); tip.add(pad);
  return { root, joints, tip, rest: joints.map((_, i) => [0.55, 0.85, 0.65][i] || 0.6) };
}
const FINGERS = {
  index:  buildFinger(new THREE.Vector3(0.63, 1.0, 0.05),  new THREE.Euler(0.06, 0, -0.06), [0.78, 0.6, 0.46], [0.155, 0.14, 0.125]),
  middle: buildFinger(new THREE.Vector3(0.215, 1.05, 0.02), new THREE.Euler(0.04, 0, -0.02), [0.84, 0.64, 0.5], [0.16, 0.145, 0.13]),
  ring:   buildFinger(new THREE.Vector3(-0.215, 1.0, 0.02), new THREE.Euler(0.04, 0, 0.02), [0.78, 0.6, 0.46], [0.15, 0.135, 0.12]),
  pinky:  buildFinger(new THREE.Vector3(-0.63, 0.9, 0.05), new THREE.Euler(0.08, 0, 0.07), [0.62, 0.48, 0.38], [0.13, 0.115, 0.1]),
  thumb:  buildFinger(new THREE.Vector3(0.98, -0.15, 0.28), new THREE.Euler(0.5, 0.35, -1.15), [0.68, 0.56, 0.44], [0.16, 0.145, 0.13]),
};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
function ccd(f, target, iters = 6) {
  for (let it = 0; it < iters; it++) {
    for (let j = f.joints.length - 1; j >= 0; j--) {
      const joint = f.joints[j];
      const jw = joint.getWorldPosition(_v1);
      const tw = f.tip.getWorldPosition(_v2);
      const a = tw.sub(jw); const b = _v3.copy(target).sub(jw);
      if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) continue;
      a.normalize(); b.normalize();
      const axisW = new THREE.Vector3(1, 0, 0).applyQuaternion(joint.getWorldQuaternion(_q)).normalize();
      let ang = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      if (new THREE.Vector3().crossVectors(a, b).dot(axisW) < 0) ang = -ang;
      joint.rotateOnAxis(new THREE.Vector3(1, 0, 0), THREE.MathUtils.clamp(ang, -0.45, 0.45));
      joint.rotation.x = THREE.MathUtils.clamp(joint.rotation.x, -0.15, 2.05);
    }
  }
}
function relaxFinger(f, k) {
  f.joints.forEach((j, i) => { j.rotation.x += (f.rest[i] - j.rotation.x) * k; });
}
function orientPalmToward(from, to) {
  const y = _v1.copy(to).sub(from).normalize();
  const out = _v2.copy(from).normalize(); // palm normal away from cube
  const z = out.sub(y.clone().multiplyScalar(out.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
const PARK_POS = new THREE.Vector3(3.6, -1.4, 2.8);
palm.position.copy(PARK_POS); orientPalmToward(PARK_POS, new THREE.Vector3(0, 0, 0));

// per-face choreography
const CHOREO = {
  U: { finger: 'index',  palmPos: new THREE.Vector3(0.9, 3.2, -2.7) },
  D: { finger: 'thumb',  palmPos: new THREE.Vector3(1.3, -2.6, 3.0) },
  R: { finger: 'index',  palmPos: new THREE.Vector3(3.1, 2.0, 0.9) },
  L: { finger: 'middle', palmPos: new THREE.Vector3(-3.1, 2.0, 0.9) },
  F: { finger: 'index',  palmPos: new THREE.Vector3(1.1, 2.5, 3.1) },
  B: { finger: 'middle', palmPos: new THREE.Vector3(1.1, 2.5, -3.1) },
};

// ---------- playback engine ----------
let logical = C.solvedState();
let seq = [];         // move indices (scramble + solution)
let scrLen = 0;       // how many leading moves are the scramble
let idx = 0, playing = false, speed = 1;
let step = null;      // active animation step
let simElapsed = 0, simTotal = 0;
const MOVE_DUR = 0.92; // nominal seconds per quarter swipe at 1x

function moveDuration(m) { return (m % 3 === 1) ? 1.62 : MOVE_DUR; }
function smoother(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function makeStep(m, fast) {
  const face = (m / 3) | 0, power = m % 3;
  const d = FACE_DEF[face];
  const totalAngle = d.base * (power === 2 ? -1 : (power === 1 ? 2 : 1));
  const swipes = power === 1 ? 2 : 1;
  const swipeAngle = totalAngle / swipes;
  const ch = CHOREO[C.FACE_NAMES[face]];
  const aVec = AXIS_VEC[d.axis];
  const v = new THREE.Vector3().crossVectors(aVec, d.u);
  const ringC = d.n.clone().multiplyScalar(1.0);
  const durScale = fast ? 0.45 : 1;
  return {
    m, face, ch, aVec, v, ringC, u: d.u.clone(), swipeAngle, swipes,
    phase: 'approach', t: 0, swipeIdx: 0, pivotFrom: 0, pivotTo: 0,
    dur: { approach: 0.3 * durScale, swipe: (moveDuration(m) / swipes - 0.28) * durScale, recock: 0.22 * durScale, retract: 0.24 * durScale },
    arcPoint(t, radius = 1.6) {
      const ang = this.swipeAngle * t + this.swipeAngle * this.swipeIdx;
      return this.ringC.clone().add(
        this.u.clone().multiplyScalar(Math.cos(ang) * radius).add(this.v.clone().multiplyScalar(Math.sin(ang) * radius)));
    },
  };
}

function beginStep(m, fast) {
  collectLayer((m / 3) | 0);
  step = makeStep(m, fast);
  step.pivotFrom = 0; step.pivotTo = 0;
  servo(0.35, 1);
  // camera drift toward the active face
  const n = FACE_DEF[step.face].n;
  camGoal = n.clone().multiplyScalar(1).add(new THREE.Vector3(0.35 * Math.sign(n.x || 1), 0.5, 0.35 * Math.sign(n.z || 1))).normalize();
  camGoal.y = Math.max(camGoal.y, 0.18);
  click();
}
function finishStep() {
  bakePivot(pivot);
  logical = C.applyMoveIdx(logical, step.m);
  idx++;
  simElapsed += moveDuration(step.m);
  updateNet(); updateMoves(); updateClock();
  if (C.isSolved(logical) && idx >= seq.length) { setStatus('SOLVED'); log('solved in ' + (seq.length - scrLen) + ' moves'); chime(); flash(); playing = false; $('bPlay').textContent = '▶ PLAY'; }
  step = null;
  if (playing && idx < seq.length) beginStep(seq[idx], idx < scrLen);
  if (playing && idx >= seq.length) { playing = false; $('bPlay').textContent = '▶ PLAY'; }
}

const camGoal = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
function updateStep(dt) {
  if (!step) return;
  const s = step; s.t += dt;
  const finger = FINGERS[s.ch.finger];
  const d = s.dur;
  if (s.phase === 'approach') {
    const k = smoother(Math.min(1, s.t / d.approach));
    palm.position.lerpVectors(palm.position.clone(), s.ch.palmPos, 0.18);
    orientPalmToward(palm.position, s.arcPoint(0));
    ccd(finger, s.arcPoint(0, 1.85).lerp(s.arcPoint(0), k), 5);
    for (const [name, f] of Object.entries(FINGERS)) if (name !== s.ch.finger) relaxFinger(f, 0.12);
    if (s.t >= d.approach) { s.phase = 'swipe'; s.t = 0; s.pivotFrom = s.swipeAngle * s.swipeIdx; s.pivotTo = s.swipeAngle * (s.swipeIdx + 1); servo(d.swipe + 0.1, s.swipeAngle > 0 ? 1 : -1); }
  } else if (s.phase === 'swipe') {
    const k = smoother(Math.min(1, s.t / d.swipe));
    pivot.rotation[s.aVec.x ? 'x' : s.aVec.y ? 'y' : 'z'] = s.pivotFrom + (s.pivotTo - s.pivotFrom) * k;
    ccd(finger, s.arcPoint(k), 6);
    if (s.t >= d.swipe) {
      s.swipeIdx++;
      if (s.swipeIdx < s.swipes) { s.phase = 'recock'; s.t = 0; }
      else { s.phase = 'retract'; s.t = 0; }
    }
  } else if (s.phase === 'recock') {
    const k = smoother(Math.min(1, s.t / d.recock));
    ccd(finger, s.arcPoint(1, 2.3).lerp(s.arcPoint(0, 2.3), k), 5);
    if (s.t >= d.recock) { s.phase = 'swipe'; s.t = 0; s.pivotFrom = s.swipeAngle * s.swipeIdx; s.pivotTo = s.swipeAngle * (s.swipeIdx + 1); servo(d.swipe + 0.1, s.swipeAngle > 0 ? 1 : -1); }
  } else if (s.phase === 'retract') {
    const k = smoother(Math.min(1, s.t / d.retract));
    ccd(finger, s.arcPoint(1, 1.6).lerp(s.arcPoint(1, 2.6), k), 4);
    palm.position.lerp(PARK_POS, 0.06 * k);
    if (s.t >= d.retract) finishStep();
  }
}

// ---------- UI ----------
function setStatus(t) { statusEl.textContent = t; }
let simT0 = 0;
function log(msg) {
  const line = document.createElement('div');
  const t = document.createElement('span'); t.className = 't';
  t.textContent = (simElapsed).toFixed(1).padStart(5, '0') + 's';
  line.append(t, document.createTextNode(msg));
  logEl.appendChild(line);
  while (logEl.children.length > 8) logEl.removeChild(logEl.firstChild);
}
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
const NET_LAYOUT = { U: [0, 3], R: [3, 6], F: [3, 3], D: [6, 3], L: [3, 0], B: [3, 9] }; // [row,col] in 9x12 grid
const NET_COLORS = ['#f4f4f4', '#b71234', '#009b48', '#ffd500', '#ff5800', '#0046ad'];
const netCells = [];
(function buildNet() {
  netEl.style.gridTemplateRows = 'repeat(9, 13px)';
  const map = {};
  for (const f of FACE_ORDER) { const [r, c] = NET_LAYOUT[f]; for (let i = 0; i < 9; i++) map[(r + ((i / 3) | 0)) * 12 + c + (i % 3)] = [f, i]; }
  for (let i = 0; i < 9 * 12; i++) {
    const d = document.createElement('div');
    if (map[i]) { netCells.push({ el: d, f: map[i][0], i: map[i][1] }); }
    else d.style.visibility = 'hidden';
    netEl.appendChild(d);
  }
})();
function updateNet() {
  const fl = C.facelets(logical);
  for (const c of netCells) c.el.style.background = NET_COLORS[fl[c.f][c.i]];
}
function updateMoves() {
  movesEl.innerHTML = '';
  seq.forEach((m, i) => {
    const b = document.createElement('b');
    b.textContent = C.MOVE_NAMES[m];
    if (i < idx) b.className = 'done';
    if (i === idx) b.className = 'cur';
    if (i === scrLen && scrLen > 0) b.style.marginLeft = '8px';
    movesEl.appendChild(b);
  });
}
function updateClock() {
  const fmt = (s) => `${String((s / 60) | 0).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  clockEl.textContent = fmt(simElapsed) + ' / ' + fmt(simTotal);
}
function flash() {
  const g = new THREE.PointLight(0x35f0d0, 60, 18); g.position.set(0, 2, 0); scene.add(g);
  const t0 = performance.now();
  (function decay() { const k = 1 - (performance.now() - t0) / 1400; if (k <= 0) { scene.remove(g); return; } g.intensity = 60 * k * k; requestAnimationFrame(decay); })();
}

// ---------- planning + orchestration ----------
let tables = null;
S.loadTables('2-tables.bin').then(t => { tables = t; setStatus('READY'); log('solver tables online (2-phase kociemba)'); })
  .catch(e => { setStatus('TABLES FAILED'); log('tables.bin failed to load: ' + e.message); });

function plan() {
  setStatus('PLANNING'); log('phase 1: orienting edges + corners…');
  const t0 = performance.now();
  const sol = (tables && (S.solve(logical, tables, 6e6) || S.solve(logical, tables, 3e7))) || null;
  const ms = Math.round(performance.now() - t0);
  if (!sol) { setStatus('PLAN FAILED'); log('no plan found — try a new scramble'); return null; }
  log(`phase 2: permuting into place… plan: ${sol.length} moves in ${ms}ms`);
  return sol;
}
function newRun() {
  logical = C.solvedState(); idx = 0; simElapsed = 0; playing = false; step = null;
  bakePivot(pivot); // safety
  // reset cube visually: rebuild stickers by resetting transforms — simplest: reload cubie arrangement
  resetCubeVisual();
  const scr = C.randomScramble(12);
  scrLen = scr.length;
  let s = C.solvedState(); for (const m of scr) s = C.applyMoveIdx(s, m);
  logical = s;
  const sol = plan();
  if (!sol) return;
  logical = C.solvedState(); // playback starts from solved and replays everything
  seq = scr.concat(sol);
  simTotal = seq.reduce((a, m) => a + moveDuration(m), 0);
  setStatus('SCRAMBLING'); log('scramble: ' + scr.map(m => C.MOVE_NAMES[m]).join(' '));
  updateNet(); updateMoves(); updateClock();
  playing = true; $('bPlay').textContent = '⏸ PAUSE';
  beginStep(seq[0], true);
}
function resetCubeVisual() {
  bakePivot(pivot);
  cubies.sort(() => 0); // keep array
  // simplest true reset: rebuild each cubie's transform from scratch is complex; instead rebuild scene cube
  for (const c of cubies) cubeGroup.remove(c);
  cubies.length = 0;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.castShadow = true; body.receiveShadow = true; g.add(body);
    const faces = [[x, 1, 0, 0, 'px'], [x, -1, 0, 0, 'nx'], [y, 0, 1, 0, 'py'], [y, 0, -1, 0, 'ny'], [z, 0, 0, 1, 'pz'], [z, 0, 0, -1, 'nz']];
    for (const [v, dx, dy, dz, key2] of faces) {
      if ((key2[0] === 'p' && v !== 1) || (key2[0] === 'n' && v !== -1)) continue;
      const m = new THREE.Mesh(stickGeo, new THREE.MeshPhysicalMaterial({
        color: CUBE_COLORS[key2], roughness: 0.25, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
      m.position.set(dx * 0.5, dy * 0.5, dz * 0.5);
      if (dy) m.rotation.x = Math.PI / 2;
      if (dx) m.rotation.y = Math.PI / 2;
      m.castShadow = true; g.add(m);
    }
    g.userData.grid = new THREE.Vector3(x, y, z);
    cubeGroup.add(g); cubies.push(g);
  }
}
function toSolvedInstant() {
  // jump to end state: apply remaining moves instantly
  while (idx < seq.length) { bakePivot(pivot); collectLayer((seq[idx] / 3) | 0); const d = FACE_DEF[(seq[idx] / 3) | 0];
    const ang = d.base * (seq[idx] % 3 === 2 ? -1 : (seq[idx] % 3 === 1 ? 2 : 1));
    pivot.rotation[d.axis] = ang; bakePivot(pivot);
    logical = C.applyMoveIdx(logical, seq[idx]); idx++; }
  simElapsed = simTotal; updateNet(); updateMoves(); updateClock();
}

// buttons
$('bGo').onclick = () => { $('start').classList.add('hidden'); controls.autoRotate = false; audio(); newRun(); };
$('bNew').onclick = () => { if (!tables) return; newRun(); };
$('bPlay').onclick = () => {
  if (!seq.length) return;
  if (step || idx < seq.length) {
    playing = !playing;
    $('bPlay').textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
    if (playing && !step && idx < seq.length) beginStep(seq[idx], idx < scrLen);
  } else { // replay finished run
    newRunSameScramble();
  }
};
function newRunSameScramble() {
  const scr = seq.slice(0, scrLen);
  resetCubeVisual(); logical = C.solvedState(); idx = 0; simElapsed = 0; step = null;
  for (const m of scr) logical = C.applyMoveIdx(logical, m);
  const sol = plan(); if (!sol) return;
  logical = C.solvedState(); seq = scr.concat(sol); simTotal = seq.reduce((a, m) => a + moveDuration(m), 0);
  setStatus('SCRAMBLING'); updateNet(); updateMoves(); updateClock();
  playing = true; $('bPlay').textContent = '⏸ PAUSE'; beginStep(seq[0], true);
}
$('bNext').onclick = () => {
  if (!seq.length) return;
  playing = false; $('bPlay').textContent = '▶ PLAY';
  if (step) { // finish current instantly
    pivot.rotation[FACE_DEF[step.face].axis] = step.pivotTo; finishStep();
  } else if (idx < seq.length) {
    collectLayer((seq[idx] / 3) | 0);
    const d = FACE_DEF[(seq[idx] / 3) | 0];
    pivot.rotation[d.axis] = d.base * (seq[idx] % 3 === 2 ? -1 : (seq[idx] % 3 === 1 ? 2 : 1));
    step = { m: seq[idx], face: (seq[idx] / 3) | 0 }; finishStep();
  }
};
$('bPrev').onclick = () => {
  if (!seq.length || idx === 0) return;
  playing = false; $('bPlay').textContent = '▶ PLAY';
  if (step) { pivot.rotation.set(0, 0, 0); bakePivot(pivot); step = null; }
  idx--;
  const m = seq[idx]; const inv = (m - (m % 3)) + (2 - (m % 3));
  collectLayer((m / 3) | 0);
  const d = FACE_DEF[(m / 3) | 0];
  pivot.rotation[d.axis] = d.base * (inv % 3 === 2 ? -1 : (inv % 3 === 1 ? 2 : 1));
  logical = C.applyMoveIdx(logical, inv);
  bakePivot(pivot);
  simElapsed = Math.max(0, simElapsed - moveDuration(m));
  updateNet(); updateMoves(); updateClock();
};
$('bRestart').onclick = () => {
  if (!seq.length) return;
  playing = false; $('bPlay').textContent = '▶ PLAY';
  if (step) { pivot.rotation.set(0, 0, 0); bakePivot(pivot); step = null; }
  while (idx > 0) {
    idx--;
    const m = seq[idx]; const inv = (m - (m % 3)) + (2 - (m % 3));
    logical = C.applyMoveIdx(logical, inv);
  }
  resetCubeVisual();
  // re-apply scramble visually? restart = back to scrambled state (start of run)
  let s = C.solvedState(); const scr = seq.slice(0, scrLen); for (const m of scr) s = C.applyMoveIdx(s, m);
  logical = s; // logical is scrambled; cube visual is solved — replay scramble forward visually:
  logical = C.solvedState(); idx = 0; simElapsed = 0; updateNet(); updateMoves(); updateClock();
  setStatus('READY'); playing = true; $('bPlay').textContent = '⏸ PAUSE'; beginStep(seq[0], true);
};
document.querySelectorAll('.spd').forEach(b => b.onclick = () => {
  document.querySelectorAll('.spd').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); speed = parseFloat(b.dataset.s);
});
let closeup = false;
$('bCam').onclick = () => {
  closeup = !closeup; $('bCam').textContent = closeup ? 'OVERVIEW' : 'CLOSE-UP';
  const r = closeup ? 5.2 : 10.6;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camTween = { from: camera.position.clone(), to: controls.target.clone().add(dir.multiplyScalar(r)), t: 0 };
};
$('bMute').onclick = () => { muted = !muted; $('bMute').textContent = muted ? 'SOUND OFF' : 'SOUND ON'; };

// ---------- main loop ----------
let camTween = null;
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateStep(dt * speed);
  if (!step) for (const f of Object.values(FINGERS)) relaxFinger(f, 0.05);
  // idle life
  const t = performance.now() / 1000;
  if (!step) { palm.position.y += Math.sin(t * 1.4) * 0.0012; cubeGroup.position.y = Math.sin(t * 0.8) * 0.05; }
  else cubeGroup.position.y *= 0.9;
  // camera follow during steps
  if (step && !controls.autoRotate) {
    const radius = camera.position.distanceTo(controls.target);
    const goal = camGoal.clone().multiplyScalar(radius).add(controls.target);
    camera.position.lerp(goal, 0.03);
  }
  if (camTween) {
    camTween.t += dt * 1.4;
    camera.position.lerpVectors(camTween.from, camTween.to, smoother(Math.min(1, camTween.t)));
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();
  renderer.render(scene, camera);
}
updateNet(); updateClock(); tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
