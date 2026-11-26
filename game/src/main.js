// main.js — the game itself: loop, states, scoring, and the wiring between modules.
// One job: own the game object and drive one frame at a time.

import { GAME } from './config.js';
import { createPlane, stepPlane, groundContact, rollout, FT_PER_M } from './flight.js';
import {
  createMissionState, updateMission, scoreLanding, pushEvent, currentTarget,
} from './missions.js';
import { createRenderer, renderFrame, createParticles, spawnRingBurst, spawnCrashFire } from './render.js';
import { drawHUD } from './hud.js';
import {
  createAudio, ensureAudio, updateAudio, playRingChime, playCheckpointChime,
  playAlarm, playThud, playCrash,
} from './audio.js';
import {
  createInput, attachInput, readFlightInput, consumePress, endFrame,
} from './input.js';
import { applyShotFromUrl } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = GAME.canvasWidth * dpr;
  canvas.height = GAME.canvasHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

fitCanvas();
window.addEventListener('resize', fitCanvas);

// Errors the headless play-test can read back.
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const game = {
  state: 'title', // title | flying | paused | landed | crashed
  plane: createPlane(),
  mission: createMissionState(),
  renderer: createRenderer(),
  particles: createParticles(),
  audio: createAudio(),
  input: createInput(),
  time: 0,
  frozen: false,
  banner: null,
  crashReason: '',
  landingBreakdown: null,
  bestScore: 0,
  alarmAt: -10,
  shot: 0,
};

window.__game = game;

try {
  game.bestScore = Number(window.localStorage.getItem('island-hopper-best') || 0);
} catch (e) {
  game.bestScore = 0;
}

function saveBest() {
  if (game.mission.score > game.bestScore) {
    game.bestScore = game.mission.score;
    try { window.localStorage.setItem('island-hopper-best', String(game.bestScore)); } catch (e) { /* private mode */ }
  }
}

function showBanner(text) {
  game.banner = { text, at: game.time };
}

function startFlight() {
  game.plane = createPlane();
  game.mission = createMissionState();
  game.particles = createParticles();
  game.state = 'flying';
  game.banner = null;
  game.crashReason = '';
  game.landingBreakdown = null;
  showBanner('SORTIE START — RING 1 AHEAD');
}

function endCrash(reason) {
  game.state = 'crashed';
  game.crashReason = reason;
  spawnCrashFire(game.particles, GAME.canvasWidth / 2, 452);
  playCrash(game.audio);
  saveBest();
}

function endLanding(quality) {
  const p = game.plane;
  const centerOffsetM = Math.abs(p.x - 0);
  const sinkFpm = -p.verticalSpeedFpm;
  game.landingBreakdown = scoreLanding(game.mission, p, centerOffsetM, sinkFpm);
  game.state = 'landed';
  playThud(game.audio);
  saveBest();
  void quality;
}

attachInput(game.input, () => ensureAudio(game.audio));

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = game.frozen ? 0 : Math.min(0.05, (nowMs - (frame.last || nowMs)) / 1000 || 0.016);
  frame.last = nowMs;
  if (!game.frozen) game.time += dt;
  const input = game.input;

  if (game.state === 'title') {
    if (consumePress(input, 'start') || input.clicked) startFlight();
  } else if (game.state === 'flying') {
    if (consumePress(input, 'pause')) { game.state = 'paused'; }
    else if (consumePress(input, 'restart')) { startFlight(); }
    else {
      if (consumePress(input, 'gear')) game.plane.gearDown = !game.plane.gearDown;
      if (consumePress(input, 'flaps')) game.plane.flapsDown = !game.plane.flapsDown;
      if (consumePress(input, 'mute')) game.audio.muted = !game.audio.muted;
      const flightInput = readFlightInput(input);
      const { groundM, aglM } = stepPlane(game.plane, flightInput, dt);
      const target = currentTarget(game.mission);
      const event = updateMission(game.mission, game.plane, dt);
      if (event) {
        showBanner(event);
        pushEvent(game.mission, event);
        if (game.mission.stage === 1 && event.includes('RING')) playRingChime(game.audio);
        else if (event.includes('PASSED') || event.includes('CLEARED')) playRingChime(game.audio);
        else if (event.includes('COMPLETE') || event.includes('RETURN')) playCheckpointChime(game.audio);
      }
      // Ring-pass burst at the ring we just cleared (screen centre-ish).
      if (event && event.startsWith('RING')) {
        spawnRingBurst(game.particles, GAME.canvasWidth / 2, 330);
      }
      // Stall alarm, at most once every 4 seconds.
      if (game.plane.stalled && game.time - game.alarmAt > 4) {
        game.alarmAt = game.time;
        playAlarm(game.audio);
      }
      // Ground contact.
      if (aglM <= 0.6) {
        const contact = groundContact(game.plane, aglM);
        if (contact === 'touchdown') {
          game.plane.altM = groundM;
          game.plane.onGround = true;
          rollout(game.plane, dt);
          if (game.plane.speedKt < 12) {
            endLanding({ soft: -game.plane.verticalSpeedFpm < 500 });
          }
        } else if (contact === 'belly') {
          game.plane.damagePct = Math.min(100, game.plane.damagePct + 45);
          game.plane.altM = groundM;
          game.plane.onGround = true;
          showBanner('BELLY LANDING — GEAR WAS UP  −45% HULL');
          rollout(game.plane, dt);
          if (game.plane.speedKt < 12) endLanding({ soft: false });
        } else if (contact === 'crash') {
          const overSea = game.plane.x < -500;
          endCrash(
            overSea ? 'Ditched in the sea — the island keeps its secrets.'
              : 'Terrain impact at ' + Math.round(game.plane.speedKt) + ' kt. The sortie ends here.',
          );
        }
      }
      updateAudio(game.audio, game.plane, dt);
    }
  } else if (game.state === 'paused') {
    if (consumePress(input, 'pause')) game.state = 'flying';
    else if (consumePress(input, 'restart')) startFlight();
  } else if (game.state === 'landed' || game.state === 'crashed') {
    if (consumePress(input, 'restart') || consumePress(input, 'start') || input.clicked) startFlight();
  }

  renderFrame(ctx, game, dt);
  drawHUD(ctx, game);
  endFrame(input);
}

// Screenshot staging (?shot=1..4) happens before the first frame.
// Shots 1-3 start flying; shot 4 stages the landed panel and keeps that state.
game.shot = applyShotFromUrl(game);
if (game.shot > 0 && game.shot < 4) game.state = 'flying';

requestAnimationFrame(frame);

// Expose a tiny self-check for the headless play-test.
window.__selfCheck = function () {
  return {
    state: game.state,
    shot: game.shot,
    errors: window.__errors,
    altFt: Math.round(game.plane.altM * FT_PER_M),
    speedKt: Math.round(game.plane.speedKt),
    headingDeg: Math.round(game.plane.headingDeg),
    missionStage: game.mission.stage,
    score: game.mission.score,
  };
};
