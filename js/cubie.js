// cubie.js — Rubik's cube cubie model, moves, coordinates. Shared by solver + UI. No DOM.
// Corners: URF=0 UFL=1 ULB=2 UBR=3 DFR=4 DLF=5 DBL=6 DRB=7
// Edges:   UR=0 UF=1 UL=2 UB=3 DR=4 DF=5 DL=6 DB=7 FR=8 FL=9 BL=10 BR=11
// Move indices: face*3 + power, faces U R F D L B = 0..5, power 0=cw 1=180 2=ccw

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const BINOM = [];
for (let n = 0; n <= 12; n++) {
  BINOM[n] = [];
  for (let k = 0; k <= 12; k++) {
    if (k > n) { BINOM[n][k] = 0; continue; }
    let v = 1;
    for (let i = 0; i < k; i++) v = (v * (n - i)) / (i + 1);
    BINOM[n][k] = v;
  }
}

export const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const MOVE_NAMES = [];
for (const f of FACE_NAMES) for (const p of ['', '2', "'"]) MOVE_NAMES.push(f + p);

// Basic quarter turns, arrays mean: position i holds cubie X after the move on a solved cube.
const BASIC = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

export function solvedState() {
  return {
    cp: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
    co: new Uint8Array(8),
    ep: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    eo: new Uint8Array(12),
  };
}

// newState = apply basic move mv to state s. mv arrays are "position i holds cubie mv.cp[i]".
export function applyBasic(s, mv) {
  const cp = new Uint8Array(8), co = new Uint8Array(8);
  const ep = new Uint8Array(12), eo = new Uint8Array(12);
  for (let i = 0; i < 8; i++) { const j = mv.cp[i]; cp[i] = s.cp[j]; co[i] = (s.co[j] + mv.co[i]) % 3; }
  for (let i = 0; i < 12; i++) { const j = mv.ep[i]; ep[i] = s.ep[j]; eo[i] = (s.eo[j] + mv.eo[i]) % 2; }
  return { cp, co, ep, eo };
}

// 18 moves: index = face*3 + (0:cw,1:180,2:ccw)
export const MOVES = [];
for (let f = 0; f < 6; f++) {
  let acc = solvedState();
  for (let p = 0; p < 3; p++) {
    acc = applyBasic(acc, BASIC[f]);
    MOVES.push({
      cp: Array.from(acc.cp), co: Array.from(acc.co),
      ep: Array.from(acc.ep), eo: Array.from(acc.eo),
      face: f, power: p, name: MOVE_NAMES[f * 3 + p],
    });
  }
}

export function applyMoveIdx(s, m) { return applyBasic(s, MOVES[m]); }

export function isSolved(s) {
  for (let i = 0; i < 8; i++) if (s.cp[i] !== i || s.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (s.ep[i] !== i || s.eo[i] !== 0) return false;
  return true;
}

// ---- coordinates ----
export function coordCO(s) { let x = 0; for (let i = 0; i < 7; i++) x = 3 * x + s.co[i]; return x; }          // 0..2186
export function coordEO(s) { let x = 0; for (let i = 0; i < 11; i++) x = 2 * x + s.eo[i]; return x; }          // 0..2047
export function coordSlice(s) { // combinatorial number system rank of slice-edge (8..11) positions, 0..494
  let x = 0, i = 0;
  for (let j = 0; j < 12; j++) if (s.ep[j] >= 8) { i++; x += BINOM[j][i]; }
  return x;
}
export function coordCP(s) { // Lehmer, 0..40319
  let x = 0;
  for (let i = 0; i < 7; i++) { let c = 0; for (let j = i + 1; j < 8; j++) if (s.cp[j] < s.cp[i]) c++; x += c * FACT[7 - i]; }
  return x;
}
export function coordEP8(s) { // Lehmer over U/D edges, 0..40319
  let x = 0;
  for (let i = 0; i < 7; i++) { let c = 0; for (let j = i + 1; j < 8; j++) if (s.ep[j] < s.ep[i]) c++; x += c * FACT[7 - i]; }
  return x;
}
export function coordSlicePerm(s) { // Lehmer over ep[8..11], 0..23
  let x = 0;
  for (let i = 8; i < 11; i++) { let c = 0; for (let j = i + 1; j < 12; j++) if (s.ep[j] < s.ep[i]) c++; x += c * FACT[11 - i]; }
  return x;
}

// ---- inverses (partial states; untouched parts identity) ----
export function invCO(x) {
  const s = solvedState(); let sum = 0;
  for (let i = 6; i >= 0; i--) { s.co[i] = x % 3; sum += s.co[i]; x = (x / 3) | 0; }
  s.co[7] = (3 - (sum % 3)) % 3;
  return s;
}
export function invEO(x) {
  const s = solvedState(); let sum = 0;
  for (let i = 10; i >= 0; i--) { s.eo[i] = x % 2; sum += s.eo[i]; x >>= 1; }
  s.eo[11] = sum % 2;
  return s;
}
export function invSlice(x) {
  const s = solvedState();
  const positions = [];
  let hi = 11;
  for (let i = 4; i >= 1; i--) { // greedy digits of the combinatorial number system
    for (let j = hi; j >= 0; j--) {
      if (BINOM[j][i] <= x) { positions.unshift(j); x -= BINOM[j][i]; hi = j - 1; break; }
    }
  }
  const others = [];
  for (let j = 0; j < 12; j++) if (!positions.includes(j)) others.push(j);
  positions.forEach((p, i) => { s.ep[p] = 8 + i; });
  others.forEach((p, i) => { s.ep[p] = i; });
  return s;
}
function lehmerDecode(x, n) {
  const items = Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const idx = (x / f) | 0; x %= f;
    out.push(items.splice(idx, 1)[0]);
  }
  return out;
}
export function invCP(x) { const s = solvedState(); s.cp = Uint8Array.from(lehmerDecode(x, 8)); return s; }
export function invEP8(x) {
  const s = solvedState();
  const p = lehmerDecode(x, 8);
  for (let i = 0; i < 8; i++) s.ep[i] = p[i];
  return s;
}
export function invSlicePerm(x) {
  const s = solvedState();
  const p = lehmerDecode(x, 4);
  for (let i = 0; i < 4; i++) s.ep[8 + i] = 8 + p[i];
  return s;
}

export const SLICE_GOAL = coordSlice(solvedState());
export const PHASE2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16]; // U*, D*, R2, L2, F2, B2

// facelet extraction for the UI net: order U(9) R(9) F(9) D(9) L(9) B(9), rows left-to-right top-down
// facelet color = face of the sticker currently at that facelet position.
const CORNER_FACELETS = [ // [corner position] -> [[face,idx] x3] matching sticker order of cubie home faces
  [['U', 8], ['R', 0], ['F', 2]], // URF
  [['U', 6], ['F', 0], ['L', 2]], // UFL
  [['U', 0], ['L', 0], ['B', 2]], // ULB
  [['U', 2], ['B', 0], ['R', 2]], // UBR
  [['D', 2], ['F', 8], ['R', 6]], // DFR
  [['D', 0], ['L', 8], ['F', 6]], // DLF
  [['D', 6], ['B', 8], ['L', 6]], // DBL
  [['D', 8], ['R', 8], ['B', 6]], // DRB
];
const EDGE_FACELETS = [
  [['U', 5], ['R', 1]], [['U', 7], ['F', 1]], [['U', 3], ['L', 1]], [['U', 1], ['B', 1]],
  [['D', 5], ['R', 7]], [['D', 7], ['F', 7]], [['D', 3], ['L', 7]], [['D', 1], ['B', 7]],
  [['F', 5], ['R', 3]], [['F', 3], ['L', 5]], [['B', 5], ['L', 3]], [['B', 3], ['R', 5]],
];
// home face index of each sticker slot of a cubie (0-based: U0 R1 F2 D3 L4 B5)
const CORNER_HOME = [[0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1], [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5]];
const EDGE_HOME = [[0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1]];

export function facelets(s) {
  // returns {U:[9 ints 0..5],R:..,F:..,D:..,L:..,B:..}; color = home face of sticker at that facelet
  const faces = { U: new Array(9).fill(0), R: new Array(9).fill(1), F: new Array(9).fill(2), D: new Array(9).fill(3), L: new Array(9).fill(4), B: new Array(9).fill(5) };
  for (let pos = 0; pos < 8; pos++) {
    const cubie = s.cp[pos], ori = s.co[pos];
    for (let k = 0; k < 3; k++) {
      const [f, idx] = CORNER_FACELETS[pos][k];
      faces[f][idx] = CORNER_HOME[cubie][(k + ori) % 3];
    }
  }
  for (let pos = 0; pos < 12; pos++) {
    const cubie = s.ep[pos], ori = s.eo[pos];
    for (let k = 0; k < 2; k++) {
      const [f, idx] = EDGE_FACELETS[pos][k];
      faces[f][idx] = EDGE_HOME[cubie][(k + ori) % 2];
    }
  }
  return faces;
}

export function randomScramble(n, rng = Math.random) {
  const moves = [];
  let lastFace = -1;
  while (moves.length < n) {
    const f = (rng() * 6) | 0;
    if (f === lastFace) continue;
    lastFace = f;
    moves.push(f * 3 + ((rng() * 3) | 0));
  }
  return moves;
}
