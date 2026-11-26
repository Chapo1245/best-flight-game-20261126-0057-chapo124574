// flight.js — the flight model: throttle, pitch, roll, stall, fuel, damage, landing.
// One job: step the aircraft state forward one tick from pilot input.

import { PLANE, WORLD } from './config.js';
import { heightAt } from './terrain.js';

export const FT_PER_M = 3.28084;
export const M_PER_FT = 1 / FT_PER_M;
export const KT_TO_MS = 0.514444;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

// Standard coordinated turn: turn rate from bank angle and speed.
export function turnRateDegPerSec(rollDeg, speedKt) {
  if (speedKt < 5) return 0;
  return (1091 * Math.tan(deg2rad(rollDeg))) / speedKt;
}

export function createPlane() {
  const s = WORLD.start;
  return {
    x: s.x, // metres east of runway centreline
    z: s.z, // metres north of runway threshold
    altM: s.altFt * M_PER_FT, // metres above sea level
    headingDeg: s.headingDeg,
    pitchDeg: 0,
    rollDeg: 0,
    speedKt: s.speedKt,
    throttle: s.throttle,
    fuelPct: 100,
    damagePct: 0,
    gearDown: false,
    flapsDown: false,
    verticalSpeedFpm: 0,
    stalled: false,
    engineOut: false,
    onGround: false,
    distanceM: 0,
  };
}

// input: { pitch: -1..1 (up positive), roll: -1..1 (right positive),
//          throttleUp, throttleDown, gear, flaps } — edge flags consumed by caller.
export function stepPlane(p, input, dt) {
  const stallSpeed = p.flapsDown ? PLANE.stallSpeedFlapsKt : PLANE.stallSpeedKt;

  // --- throttle ------------------------------------------------------------
  if (input.throttleUp) p.throttle = clamp(p.throttle + 0.55 * dt, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - 0.55 * dt, 0, 1);
  if (p.fuelPct <= 0) { p.engineOut = true; p.throttle = 0; }

  // --- attitude ------------------------------------------------------------
  const pitchTarget = clamp(input.pitch * PLANE.maxPitchDeg, -PLANE.maxPitchDeg, PLANE.maxPitchDeg);
  const pitchRate = p.stalled ? 12 : PLANE.pitchRateDeg;
  p.pitchDeg += clamp(pitchTarget - p.pitchDeg, -pitchRate * dt, pitchRate * dt);
  if (p.stalled) p.pitchDeg = Math.max(p.pitchDeg, -14); // nose drops in a stall

  const rollTarget = clamp(input.roll * PLANE.maxRollDeg, -PLANE.maxRollDeg, PLANE.maxRollDeg);
  p.rollDeg += clamp(rollTarget - p.rollDeg, -PLANE.rollRateDeg * dt, PLANE.rollRateDeg * dt);
  if (Math.abs(input.roll) < 0.05) {
    // Hands off: wings level themselves, gently.
    const toward = p.rollDeg > 0 ? -1 : 1;
    p.rollDeg += toward * Math.min(Math.abs(p.rollDeg), PLANE.autoLevelRateDeg * dt);
  }

  // --- speed ----------------------------------------------------------------
  const levelTarget =
    PLANE.minThrottleSpeedKt +
    (PLANE.maxThrottleSpeedKt - PLANE.minThrottleSpeedKt) * p.throttle;
  const climbPenalty = p.pitchDeg > 0 ? p.pitchDeg * 0.9 : p.pitchDeg * 0.35;
  const flapDrag = p.flapsDown ? 14 : 0;
  const targetSpeed = Math.max(28, levelTarget - climbPenalty - flapDrag);
  p.speedKt = lerp(p.speedKt, targetSpeed, Math.min(1, PLANE.speedApproachRate * dt));
  p.stalled = p.speedKt < stallSpeed && !p.onGround;

  // --- turn + position -------------------------------------------------------
  const turn = turnRateDegPerSec(p.rollDeg, p.speedKt);
  p.headingDeg = (p.headingDeg + turn * dt + 360) % 360;
  const vMs = p.speedKt * KT_TO_MS;
  const hdg = deg2rad(p.headingDeg);
  const dx = Math.sin(hdg) * vMs * dt;
  const dz = Math.cos(hdg) * vMs * dt;
  p.x += dx;
  p.z += dz;
  p.distanceM += Math.hypot(dx, dz);

  // --- vertical ---------------------------------------------------------------
  let vsFpm;
  if (p.onGround) {
    vsFpm = 0;
  } else {
    vsFpm = p.speedKt * 101.3 * Math.sin(deg2rad(p.pitchDeg)) * PLANE.climbFactor;
    if (p.stalled) vsFpm = Math.min(vsFpm, -900); // stall sinks fast
    if (p.flapsDown) vsFpm -= 120;
  }
  p.verticalSpeedFpm = lerp(p.verticalSpeedFpm, vsFpm, Math.min(1, 3 * dt));
  p.altM += (p.verticalSpeedFpm / 60) * M_PER_FT * dt;

  // --- fuel -------------------------------------------------------------------
  if (!p.engineOut) {
    const burn = PLANE.fuelBurnIdle + p.throttle * PLANE.fuelBurnPerSec;
    p.fuelPct = Math.max(0, p.fuelPct - burn * dt);
  }

  // --- ground contact ----------------------------------------------------------
  const groundM = heightAt(p.x, p.z);
  const aglM = p.altM - groundM;
  return { groundM, aglM, stallSpeed };
}

// Landing / crash judgement when the wheels (or belly) meet the ground.
// Returns 'flying' | 'touchdown' | 'crash' | 'belly'.
export function groundContact(p, aglM) {
  if (aglM > 0.6) return 'flying';
  const r = WORLD.runway;
  const onRunway =
    Math.abs(p.x - r.x) <= r.width / 2 + 4 && p.z >= r.z0 - 40 && p.z <= r.z1 + 60;
  const sink = -p.verticalSpeedFpm; // fpm downward, positive
  const headingErr = Math.min(
    Math.abs(p.headingDeg - r.headingDeg),
    360 - Math.abs(p.headingDeg - r.headingDeg),
  );
  if (!onRunway) return 'crash'; // terrain, sea or field: no landing there
  if (p.speedKt > 150) return 'crash'; // far too fast for this strip
  if (sink > 950 || headingErr > 28) return 'crash';
  if (!p.gearDown) return 'belly';
  return 'touchdown';
}

// Rollout after a touchdown: brakes + drag bleed speed on the runway.
export function rollout(p, dt) {
  p.speedKt = Math.max(0, p.speedKt - 26 * dt);
  const hdg = deg2rad(p.headingDeg);
  const vMs = p.speedKt * KT_TO_MS;
  p.x += Math.sin(hdg) * vMs * dt;
  p.z += Math.cos(hdg) * vMs * dt;
  p.pitchDeg = lerp(p.pitchDeg, 0, Math.min(1, 4 * dt));
  p.rollDeg = lerp(p.rollDeg, 0, Math.min(1, 4 * dt));
  p.onGround = true;
}

export { clamp, lerp, deg2rad, rad2deg };
