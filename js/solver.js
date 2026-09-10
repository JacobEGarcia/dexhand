// solver.js — Kociemba two-phase IDA* over precomputed tables. No DOM.
import * as C from './cubie.js';

// Layout of tables.bin
const OFF = {};
(function () {
  let o = 0;
  const u16 = (n) => { const r = o; o += n * 2; return r; };
  const nib = (n) => { const r = o; o += (n + 1) >> 1; return r; };
  OFF.coMT = u16(2187 * 18); OFF.eoMT = u16(2048 * 18); OFF.sliceMT = u16(495 * 18);
  OFF.cpMT = u16(40320 * 18); OFF.epMT = u16(40320 * 10); OFF.spMT = u16(24 * 10);
  OFF.prunP1a = nib(495 * 2187); OFF.prunP1b = nib(495 * 2048);
  OFF.prunP2a = nib(24 * 40320); OFF.prunP2b = nib(24 * 40320);
  OFF.total = o;
})();

export function loadTablesFromBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b.length !== OFF.total) throw new Error('tables.bin size mismatch: ' + b.length + ' != ' + OFF.total);
  const u16 = (off, n) => new Uint16Array(b.buffer, b.byteOffset + off, n);
  const nibArr = (off, n) => {
    const raw = b.subarray(off, off + ((n + 1) >> 1));
    return { get(i) { const v = raw[i >> 1]; return (i & 1) ? (v >> 4) : (v & 15); } };
  };
  return {
    coMT: u16(OFF.coMT, 2187 * 18), eoMT: u16(OFF.eoMT, 2048 * 18),
    sliceMT: u16(OFF.sliceMT, 495 * 18), cpMT: u16(OFF.cpMT, 40320 * 18),
    epMT: u16(OFF.epMT, 40320 * 10), spMT: u16(OFF.spMT, 24 * 10),
    prunP1a: nibArr(OFF.prunP1a, 495 * 2187), prunP1b: nibArr(OFF.prunP1b, 495 * 2048),
    prunP2a: nibArr(OFF.prunP2a, 24 * 40320), prunP2b: nibArr(OFF.prunP2b, 24 * 40320),
  };
}

export async function loadTables(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('fetch tables: ' + res.status);
  return loadTablesFromBuffer(await res.arrayBuffer());
}

export function solve(state, T, maxNodes = 2e6) {
  maxNodes = +maxNodes || 2e6;
  if (C.isSolved(state)) return [];
  let nodes = 0;
  let best = null;

  // phase-2 search from a G1 state; returns shortest continuation <= maxD or null
  function phase2(cp, ep8, sp, maxD) {
    let found = null;
    const sol = [];
    function dfs(cp, ep8, sp, togo, lastFace) {
      if (found) return true;
      if (++nodes > maxNodes) return false;
      const lb = Math.max(T.prunP2a.get(sp * 40320 + cp), T.prunP2b.get(sp * 40320 + ep8));
      if (lb > togo) return false;
      if (togo === 0) { if (cp === 0 && ep8 === 0 && sp === 0) found = sol.slice(); return !!found; }
      for (let k = 0; k < 10; k++) {
        const mv = C.PHASE2_MOVES[k];
        const face = (mv / 3) | 0;
        if (face === lastFace) continue;
        sol.push(mv);
        dfs(T.cpMT[cp * 18 + mv], T.epMT[ep8 * 10 + k], T.spMT[sp * 10 + k], togo - 1, face);
        sol.pop();
        if (found) return true;
      }
      return false;
    }
    const lb0 = Math.max(T.prunP2a.get(sp * 40320 + cp), T.prunP2b.get(sp * 40320 + ep8));
    for (let d = lb0; d <= maxD && !found && nodes <= maxNodes; d++) dfs(cp, ep8, sp, d, -1);
    return found;
  }

  // phase-1 search at exactly depth d; for every G1-reaching sequence try phase 2
  function phase1(co, eo, slice, d, seq) {
    const lb = Math.max(T.prunP1a.get(slice * 2187 + co), T.prunP1b.get(slice * 2048 + eo));
    if (lb > d) return;
    if (d === 0) {
      if (co === 0 && eo === 0 && slice === C.SLICE_GOAL) {
        // state after seq: compute phase-2 coords by replaying seq on cubie level (cheap enough)
        let s = { cp: state.cp, co: state.co, ep: state.ep, eo: state.eo };
        for (const m of seq) s = C.applyMoveIdx(s, m);
        const cp = C.coordCP(s), ep8 = C.coordEP8(s), sp = C.coordSlicePerm(s);
        const limit = best ? best.length - seq.length - 1 : 31 - seq.length;
        if (limit < 0) return;
        const cont = phase2(cp, ep8, sp, limit);
        if (cont && (!best || seq.length + cont.length < best.length)) best = seq.concat(cont);
      }
      return;
    }
    const lastFace = seq.length ? ((seq[seq.length - 1] / 3) | 0) : -1;
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (face === lastFace) continue;
      if (++nodes > maxNodes) return;
      seq.push(m);
      phase1(T.coMT[co * 18 + m], T.eoMT[eo * 18 + m], T.sliceMT[slice * 18 + m], d - 1, seq);
      seq.pop();
    }
  }

  const co = C.coordCO(state), eo = C.coordEO(state), slice = C.coordSlice(state);
  const lb1 = Math.max(T.prunP1a.get(slice * 2187 + co), T.prunP1b.get(slice * 2048 + eo));
  for (let d1 = lb1; d1 <= 12; d1++) {
    if (best && d1 >= best.length) break;
    phase1(co, eo, slice, d1, []);
    if (nodes > maxNodes) break;
  }
  if (best) return best;
  // guaranteed fallback: first phase-1 path to G1 at any depth, then first phase-2 completion
  nodes = 0;
  let p1 = null;
  function p1first(co, eo, slice, d, seq) {
    if (p1 || ++nodes > 4e6) return;
    const lb = Math.max(T.prunP1a.get(slice * 2187 + co), T.prunP1b.get(slice * 2048 + eo));
    if (lb > d) return;
    if (co === 0 && eo === 0 && slice === C.SLICE_GOAL) { p1 = seq.slice(); return; }
    if (d === 0) return;
    const lastFace = seq.length ? ((seq[seq.length - 1] / 3) | 0) : -1;
    for (let m = 0; m < 18 && !p1; m++) {
      if (((m / 3) | 0) === lastFace) continue;
      seq.push(m);
      p1first(T.coMT[co * 18 + m], T.eoMT[eo * 18 + m], T.sliceMT[slice * 18 + m], d - 1, seq);
      seq.pop();
    }
  }
  for (let d = lb1; d <= 12 && !p1; d++) p1first(co, eo, slice, d, []);
  if (!p1) return null;
  let s = state;
  for (const m of p1) s = C.applyMoveIdx(s, m);
  nodes = 0; maxNodes = Math.max(maxNodes, 4e6); // fresh budget for the phase-2 completion
  const p2 = phase2(C.coordCP(s), C.coordEP8(s), C.coordSlicePerm(s), 30);
  return p2 ? p1.concat(p2) : null;
}
