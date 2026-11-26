// terrain.js — the island itself: deterministic height, coast, and ridge profiles.
// One job: answer "what is the ground here?" for physics, rendering and missions.

import { WORLD } from './config.js';

// Deterministic PRNG (mulberry32) so the island is identical on every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1-D value noise with smooth interpolation, seeded by an integer lattice.
function hash1(n) {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i);
  const b = hash1(i + 1);
  return a + (b - a) * smooth(f);
}

// Coastline x at a given z: a slow S-curve so the coast is recognisable, not a ruler.
export function coastXAt(z) {
  return WORLD.coastBaseX + Math.sin(z * 0.00042) * 190 + noise1(z * 0.0011) * 130 - 65;
}

// Ground height in metres at world (x, z). Sea is 0. The runway plateau is flat.
export function heightAt(x, z) {
  const r = WORLD.runway;
  const nearRunway =
    x > r.x - 150 && x < r.x + 150 && z > r.z0 - 320 && z < r.z1 + 220;
  if (nearRunway) return 0;
  const coast = coastXAt(z);
  const inland = x - coast; // > 0 on land, < 0 at sea
  if (inland <= 0) return 0;
  // Beach strip, then rolling fields, then mountains far east.
  const beach = Math.min(inland / 90, 1);
  const fields = noise1(x * 0.0016 + z * 0.0011) * 26 + noise1(x * 0.006 + 7.3) * 8;
  const mountain = Math.max(0, (inland - 900) / 1100);
  const peaks = noise1(x * 0.0009 + z * 0.0007) * 150 * mountain * mountain;
  return beach * (fields + peaks);
}

// Ridge silhouette height (0..1) for the far mountain layers, by screen column.
export function ridgeProfile(u, layer) {
  const base = noise1(u * 3.1 + layer * 13.7);
  const detail = noise1(u * 9.4 + layer * 41.2) * 0.35;
  const snow = layer === 0 ? 0.72 : 0.55;
  return { h: base * 0.62 + detail, snow };
}

// Ground zone at (x, z): 'sea' | 'sand' | 'grass' | 'field' | 'forest' | 'rock'.
export function zoneAt(x, z) {
  const coast = coastXAt(z);
  const inland = x - coast;
  if (inland < -40) return 'sea';
  if (inland < 40) return 'sand';
  const h = heightAt(x, z);
  if (h > 95) return 'rock';
  if (h > 45) return 'forest';
  const n = noise1(x * 0.004 + z * 0.003);
  return n > 0.55 ? 'field' : 'grass';
}

// Scatter features placed once, deterministically, for the renderer.
export function scatterFeatures() {
  const rnd = mulberry32(20261126);
  const trees = [];
  const houses = [];
  for (let i = 0; i < 90; i++) {
    const z = -3200 + rnd() * 5600;
    const coast = coastXAt(z);
    const x = coast + 120 + rnd() * 1500;
    if (heightAt(x, z) > 60) continue;
    trees.push({ x, z, s: 0.7 + rnd() * 0.9 });
  }
  // Little town east of the runway mid-field.
  for (let i = 0; i < 16; i++) {
    houses.push({
      x: 260 + rnd() * 420,
      z: 300 + rnd() * 900,
      w: 14 + rnd() * 18,
      h: 9 + rnd() * 8,
      c: ['#c96f4a', '#d8b25c', '#7fa8c9', '#b7c4b0'][i % 4],
    });
  }
  return {
    trees,
    houses,
    lighthouse: { x: coastXAt(1500) + 26, z: 1500 },
    buoys: [
      { x: coastXAt(600) - 130, z: 600 },
      { x: coastXAt(-300) - 170, z: -300 },
    ],
  };
}
