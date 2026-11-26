// shots.js — deterministic screenshot staging for the maker's own screenshots.
// One job: put the game into a chosen moment (?shot=1..4) and freeze it there.
// Every shot is a real render of the same code path the player flies.

import { createMissionState } from './missions.js';
import { WORLD } from './config.js';

function setPlane(plane, patch) {
  Object.assign(plane, patch);
}

// Shot 1 (cover): ring run, ring 2 ahead, sea on the left, runway in the distance.
function shotCover(game) {
  const p = game.plane;
  setPlane(p, {
    x: 180, z: -1500, altM: 350, headingDeg: 12, pitchDeg: -1, rollDeg: -6,
    speedKt: 148, throttle: 0.74, fuelPct: 78, damagePct: 0,
    gearDown: false, flapsDown: false, verticalSpeedFpm: -60,
  });
  game.mission.stage = 0;
  game.mission.ringIndex = 1;
  game.mission.ringsHit = 1;
  game.mission.score = 250;
  game.mission.elapsedSec = 74;
}

// Shot 2: low coastal tour, lighthouse ahead, sea on the left, beach below.
function shotCoast(game) {
  const p = game.plane;
  setPlane(p, {
    x: -420, z: 1150, altM: 105, headingDeg: 24, pitchDeg: 1, rollDeg: 10,
    speedKt: 132, throttle: 0.62, fuelPct: 64, damagePct: 0,
    gearDown: false, flapsDown: false, verticalSpeedFpm: 40,
  });
  game.mission.stage = 1;
  game.mission.ringIndex = 5;
  game.mission.ringsHit = 5;
  game.mission.checkpointIndex = 0;
  game.mission.score = 1250;
  game.mission.elapsedSec = 186;
}

// Shot 3: final approach, gear down, runway 27 centred ahead.
function shotApproach(game) {
  const p = game.plane;
  setPlane(p, {
    x: -6, z: -1750, altM: 92, headingDeg: 2, pitchDeg: -3, rollDeg: 2,
    speedKt: 96, throttle: 0.34, fuelPct: 41, damagePct: 0,
    gearDown: true, flapsDown: true, verticalSpeedFpm: -520,
  });
  game.mission.stage = 2;
  game.mission.ringIndex = 5;
  game.mission.ringsHit = 5;
  game.mission.checkpointIndex = 3;
  game.mission.checkpointsHit = 3;
  game.mission.score = 2150;
  game.mission.elapsedSec = 301;
}

// Shot 4: the sortie complete — landed panel with the score breakdown.
function shotLanded(game) {
  shotApproach(game);
  const p = game.plane;
  setPlane(p, {
    x: 2, z: 620, altM: 0, headingDeg: 0, pitchDeg: 0, rollDeg: 0,
    speedKt: 0, throttle: 0, fuelPct: 38, onGround: true, verticalSpeedFpm: 0,
  });
  game.state = 'landed';
  game.landingBreakdown = {
    parts: [
      { label: 'Landing', value: 600 },
      { label: 'On centreline', value: 200 },
      { label: 'Soft touchdown', value: 200 },
      { label: 'Fuel remaining', value: 152 },
      { label: 'Time bonus', value: 238 },
    ],
    landingTotal: 1390,
    total: 3540,
  };
  game.mission.score = 3540;
  game.mission.stage = 3;
  game.mission.landed = true;
  game.mission.elapsedSec = 342;
}

const SHOTS = { 1: shotCover, 2: shotCoast, 3: shotApproach, 4: shotLanded };

// Apply ?shot=N from the page URL. Returns the shot number, or 0 for normal play.
export function applyShotFromUrl(game) {
  let n = 0;
  try {
    n = Number(new URLSearchParams(window.location.search).get('shot') || 0);
  } catch (e) {
    n = 0;
  }
  if (!SHOTS[n]) return 0;
  game.mission = createMissionState();
  SHOTS[n](game);
  game.frozen = true; // render the same frame every tick: a stable screenshot
  game.time = 12.5; // fixed clock so the prop and strobe are identical each run
  void WORLD;
  return n;
}
