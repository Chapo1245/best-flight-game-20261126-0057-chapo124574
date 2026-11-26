// missions.js — the sortie: rings, coastal checkpoints, then the landing.
// One job: know the current objective, detect completions, and score the flight.

import { SCORE, WORLD } from './config.js';
import { coastXAt } from './terrain.js';

// Ring course: five glowing rings guiding the pilot north, then east over the island.
export const RINGS = [
  { x: 0, z: -1800, altM: 380, label: 'RING 1' },
  { x: 260, z: -1050, altM: 350, label: 'RING 2' },
  { x: 620, z: -350, altM: 330, label: 'RING 3' },
  { x: 1050, z: 350, altM: 300, label: 'RING 4' },
  { x: 1250, z: 1050, altM: 280, label: 'RING 5' },
];

// Low coastal checkpoints: lighthouse, buoy, beach arch. Stay low, stay close.
export function checkpoints() {
  return [
    { x: coastXAt(1500) + 60, z: 1500, altM: 120, label: 'LIGHTHOUSE', maxAltM: 200 },
    { x: coastXAt(600) - 130, z: 600, altM: 70, label: 'BUOY', maxAltM: 150 },
    { x: coastXAt(-300) - 170, z: -300, altM: 90, label: 'BEACH ARCH', maxAltM: 180 },
  ];
}

export const MISSION_NAMES = [
  'RING RUN — 5 rings',
  'COASTAL TOUR — 3 checkpoints',
  'LAND ON RUNWAY 27',
];

export function createMissionState() {
  return {
    stage: 0, // 0 rings, 1 checkpoints, 2 landing, 3 done
    ringIndex: 0,
    checkpointIndex: 0,
    score: 0,
    ringsHit: 0,
    checkpointsHit: 0,
    elapsedSec: 0,
    landed: false,
    landingQuality: null, // { centerOffsetM, sinkFpm, speedKt, soft, centered }
    events: [], // { text, at } for the message banner
  };
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.altM - b.altM, a.z - b.z);
}

export function currentTarget(m) {
  if (m.stage === 0) return { kind: 'ring', ...RINGS[m.ringIndex] };
  if (m.stage === 1) {
    const cps = checkpoints();
    return { kind: 'checkpoint', ...cps[m.checkpointIndex] };
  }
  if (m.stage === 2) {
    return { kind: 'runway', x: WORLD.runway.x, z: (WORLD.runway.z0 + WORLD.runway.z1) / 2, altM: 0, label: 'RUNWAY 27' };
  }
  return null;
}

export function stageProgress(m) {
  if (m.stage === 0) return `${m.ringIndex}/5`;
  if (m.stage === 1) return `${m.checkpointIndex}/3`;
  if (m.stage === 2) return 'LAND';
  return 'DONE';
}

// Advance the mission from the plane's position. Returns an event string or null.
export function updateMission(m, plane, dt) {
  m.elapsedSec += dt;
  const target = currentTarget(m);
  if (!target) return null;
  if (m.stage === 0) {
    const d = dist3(plane, target);
    if (d < 42) {
      m.ringIndex++;
      m.ringsHit++;
      m.score += SCORE.ring;
      const text = `RING ${m.ringIndex} CLEARED  +${SCORE.ring}`;
      if (m.ringIndex >= RINGS.length) {
        m.stage = 1;
        return 'ALL RINGS CLEAR — COASTAL TOUR: STAY LOW';
      }
      return text;
    }
    return null;
  }
  if (m.stage === 1) {
    const d = dist3(plane, target);
    if (d < 55 && plane.altM <= target.maxAltM) {
      m.checkpointIndex++;
      m.checkpointsHit++;
      m.score += SCORE.checkpoint;
      if (m.checkpointIndex >= checkpoints().length) {
        m.stage = 2;
        return 'TOUR COMPLETE — RETURN TO RUNWAY 27';
      }
      return `${target.label} PASSED  +${SCORE.checkpoint}`;
    }
    if (d < 55 && plane.altM > target.maxAltM) return 'TOO HIGH — DROP BELOW ' + Math.round(target.maxAltM * 3.28) + ' FT';
    return null;
  }
  return null;
}

// Score the landing once the wheels stop. Returns a breakdown for the end panel.
export function scoreLanding(m, plane, centerOffsetM, sinkFpm) {
  const soft = sinkFpm < 500;
  const centered = Math.abs(centerOffsetM) < 12;
  const fuelBonus = Math.round(plane.fuelPct * SCORE.fuelBonusPerPct);
  const timeBonus = Math.max(0, Math.round((420 - m.elapsedSec) * SCORE.timeBonusPerSec));
  const parts = [
    { label: 'Landing', value: SCORE.landingBase },
    { label: 'On centreline', value: centered ? SCORE.landingCenterBonus : 0 },
    { label: 'Soft touchdown', value: soft ? SCORE.landingSoftBonus : 0 },
    { label: 'Fuel remaining', value: fuelBonus },
    { label: 'Time bonus', value: timeBonus },
  ];
  const landingTotal = parts.reduce((s, p) => s + p.value, 0);
  m.score += landingTotal;
  m.landed = true;
  m.stage = 3;
  m.landingQuality = { centerOffsetM, sinkFpm, speedKt: plane.speedKt, soft, centered };
  return { parts, landingTotal, total: m.score };
}

export function pushEvent(m, text) {
  m.events.push({ text, at: m.elapsedSec });
  if (m.events.length > 6) m.events.shift();
}
