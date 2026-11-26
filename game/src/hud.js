// hud.js — the instruments: altitude, speed, heading, horizon, fuel, missions.
// One job: draw every panel the pilot reads, on top of the rendered world.

import { COLOURS, GAME } from './config.js';
import { FT_PER_M } from './flight.js';
import { currentTarget, stageProgress, MISSION_NAMES } from './missions.js';

const W = GAME.canvasWidth;
const H = GAME.canvasHeight;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = COLOURS.hudPanel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, color = 'rgba(244,248,255,0.75)') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function bigValue(ctx, text, x, y, size = 30, color = COLOURS.hudText) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px "SF Mono", "Cascadia Mono", Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- top bar

function drawTopBar(ctx, plane, mission) {
  const altFt = Math.round(plane.altM * FT_PER_M);
  const vs = Math.round(plane.verticalSpeedFpm);
  panel(ctx, 16, 14, 400, 86);
  label(ctx, 'ALTITUDE  FT', 30, 34);
  label(ctx, 'SPEED  KT', 168, 34);
  label(ctx, 'HEADING', 300, 34);
  bigValue(ctx, String(altFt).padStart(5, ' '), 30, 70);
  bigValue(ctx, String(Math.round(plane.speedKt)), 168, 70, 30, plane.stalled ? COLOURS.hudRed : COLOURS.hudText);
  bigValue(ctx, String(Math.round(plane.headingDeg)).padStart(3, '0') + '°', 300, 70);
  // Vertical speed, tucked inside the panel under the altitude.
  ctx.fillStyle = vs >= 0 ? COLOURS.hudGreen : COLOURS.hudAmber;
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText((vs >= 0 ? '▲ +' : '▼ ') + Math.abs(vs) + ' fpm', 30, 92);

  // Compass strip, top centre.
  const cx = W / 2;
  panel(ctx, cx - 190, 14, 380, 44);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - 190, 14, 380, 44, 10);
  ctx.clip();
  const pxPerDeg = 3.2;
  for (let d = -60; d <= 60; d += 5) {
    const hdg = (Math.round(plane.headingDeg) + d + 360) % 360;
    const x = cx + d * pxPerDeg;
    const major = hdg % 30 === 0;
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 22);
    ctx.lineTo(x, major ? 36 : 30);
    ctx.stroke();
    if (major) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      ctx.fillStyle = COLOURS.hudText;
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(names[hdg] ?? String(hdg), x, 52);
    }
  }
  // Centre caret.
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 14); ctx.lineTo(cx + 7, 14); ctx.lineTo(cx, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Mission panel, top right.
  panel(ctx, W - 316, 14, 300, 86);
  const stageLabel = mission.stage >= 3 ? 'SORTIE COMPLETE' : 'MISSION ' + (mission.stage + 1) + ' OF 3 — ' + stageProgress(mission);
  label(ctx, stageLabel, W - 302, 34, 11, COLOURS.hudAmber);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '600 14px sans-serif';
  ctx.textAlign = 'left';
  const mName = MISSION_NAMES[Math.min(mission.stage, 2)];
  ctx.fillText(mName, W - 302, 58);
  label(ctx, 'SCORE', W - 302, 88, 11);
  bigValue(ctx, String(mission.score), W - 252, 90, 20, COLOURS.hudAmber);
  const mins = Math.floor(mission.elapsedSec / 60);
  const secs = Math.floor(mission.elapsedSec % 60);
  ctx.fillStyle = 'rgba(244,248,255,0.75)';
  ctx.font = '600 13px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, W - 30, 90);
}

// ---------------------------------------------------------------- horizon + gauges

function drawHorizon(ctx, plane) {
  const cx = 108;
  const cy = H - 108;
  const r = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.rollDeg * Math.PI / 180);
  const pitchPx = clamp(plane.pitchDeg, -30, 30) * 1.8;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r - 4, -r - 4 - pitchPx, r * 2 + 8, r + 4 + pitchPx);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r - 4, pitchPx * 0 + 0, r * 2 + 8, r + 4);
  ctx.fillStyle = '#6b4e2e';
  ctx.fillRect(-r - 4, pitchPx, r * 2 + 8, r + 4);
  // Pitch ladder.
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  for (const p of [-20, -10, 10, 20]) {
    const y = pitchPx - p * 1.8;
    ctx.beginPath();
    ctx.moveTo(-18, y);
    ctx.lineTo(18, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol + bezel.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = COLOURS.hudAmber;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.moveTo(8, 0); ctx.lineTo(26, 0);
  ctx.moveTo(0, 0); ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Bank pointer.
  const bankA = -plane.rollDeg * Math.PI / 180;
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.arc(Math.sin(bankA) * (r - 4), -Math.cos(bankA) * (r - 4), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, 'ATTITUDE', cx - 30, cy + r + 18, 11);
}

function drawGauges(ctx, plane) {
  const x = W - 208;
  const y = H - 226;
  panel(ctx, x, y, 192, 212);
  // Throttle bar (short, so it never reaches the fuel row).
  label(ctx, 'THROTTLE', x + 14, y + 22);
  const thH = 62;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + 16, y + 32, 22, thH);
  const thFill = thH * plane.throttle;
  ctx.fillStyle = plane.engineOut ? COLOURS.hudRed : COLOURS.hudGreen;
  ctx.fillRect(x + 16, y + 32 + (thH - thFill), 22, thFill);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '700 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(Math.round(plane.throttle * 100) + '%', x + 46, y + 44);
  label(ctx, 'W / S', x + 46, y + 64, 11);
  // Fuel.
  label(ctx, 'FUEL', x + 14, y + 116, 11);
  bar(ctx, x + 14, y + 122, 164, 12, plane.fuelPct / 100, plane.fuelPct < 20 ? COLOURS.hudRed : COLOURS.hudAmber);
  ctx.fillStyle = plane.fuelPct < 20 ? COLOURS.hudRed : COLOURS.hudText;
  ctx.font = '700 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(plane.fuelPct) + '%', x + 178, y + 132);
  // Damage.
  label(ctx, 'DAMAGE', x + 14, y + 152, 11);
  bar(ctx, x + 14, y + 158, 164, 12, plane.damagePct / 100, COLOURS.hudRed);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '700 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(plane.damagePct) + '%', x + 178, y + 168);
  // Gear / flaps state, one per line so nothing is clipped.
  ctx.textAlign = 'left';
  ctx.font = '600 12px sans-serif';
  ctx.fillStyle = plane.gearDown ? COLOURS.hudGreen : 'rgba(244,248,255,0.6)';
  ctx.fillText('GEAR ' + (plane.gearDown ? 'DOWN' : 'UP') + '  [G]', x + 14, y + 192);
  ctx.fillStyle = plane.flapsDown ? COLOURS.hudGreen : 'rgba(244,248,255,0.6)';
  ctx.fillText('FLAPS ' + (plane.flapsDown ? 'DOWN' : 'UP') + '  [F]', x + 14, y + 208);
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
}

// ---------------------------------------------------------------- guidance + messages

function drawGuidance(ctx, plane, mission) {
  const target = currentTarget(mission);
  if (!target || mission.stage >= 2 && mission.stage !== 2) return;
  if (mission.stage === 3) return;
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const distM = Math.hypot(dx, dz, (target.altM - plane.altM));
  const bearing = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  let rel = ((bearing - plane.headingDeg + 540) % 360) - 180; // -180..180
  const cx = W / 2;
  const cy = 148;
  // Arrow pointing toward the target, clamped to a small arc.
  const arrowA = clamp(rel, -70, 70) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(arrowA);
  ctx.fillStyle = mission.stage === 2 ? COLOURS.hudGreen : COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(0, -16); ctx.lineTo(12, 8); ctx.lineTo(0, 2); ctx.lineTo(-12, 8);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  const distTxt = distM > 1000 ? (distM / 1000).toFixed(1) + ' km' : Math.round(distM) + ' m';
  ctx.font = '700 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0a1622';
  ctx.fillText(`${target.label}  ·  ${distTxt}`, cx + 1, cy + 35);
  ctx.fillStyle = COLOURS.hudText;
  ctx.fillText(`${target.label}  ·  ${distTxt}`, cx, cy + 34);
  if (mission.stage === 2) {
    // Landing guidance: glide-slope helper, with a dark edge so it reads over sky.
    const altFt = Math.round(plane.altM * FT_PER_M);
    ctx.fillStyle = '#0a1622';
    ctx.font = '700 13px sans-serif';
    ctx.fillText(`ON FINAL — ${altFt} FT — GEAR ${plane.gearDown ? 'DOWN ✓' : 'UP — PRESS G'}`, cx + 1, cy + 57);
    ctx.fillStyle = 'rgba(244,248,255,0.95)';
    ctx.font = '600 13px sans-serif';
    ctx.fillText(`ON FINAL — ${altFt} FT — GEAR ${plane.gearDown ? 'DOWN ✓' : 'UP — PRESS G'}`, cx, cy + 56);
  }
}

function drawWarnings(ctx, plane) {
  const warns = [];
  if (plane.stalled) warns.push({ text: '⚠ STALL — NOSE DOWN, ADD POWER', color: COLOURS.hudRed });
  if (plane.fuelPct < 20 && plane.fuelPct > 0) warns.push({ text: '⚠ LOW FUEL — ' + Math.round(plane.fuelPct) + '%', color: COLOURS.hudAmber });
  if (plane.engineOut) warns.push({ text: '⚠ ENGINE OUT — GLIDE TO THE RUNWAY', color: COLOURS.hudRed });
  if (plane.damagePct >= 60) warns.push({ text: '⚠ HEAVY DAMAGE — LAND NOW', color: COLOURS.hudRed });
  warns.forEach((w, i) => {
    ctx.fillStyle = w.color;
    ctx.font = '700 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.text, W / 2, 200 + i * 26);
  });
}

function drawBanner(ctx, message, t) {
  if (!message || !message.text) return;
  const age = t - message.at;
  if (age > 3.2) return;
  ctx.globalAlpha = age > 2.6 ? (3.2 - age) / 0.6 : 1;
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.font = '700 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message.text, W / 2, 236);
  ctx.globalAlpha = 1;
}

function drawHint(ctx) {
  ctx.fillStyle = 'rgba(244,248,255,0.7)';
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('W/S throttle · ↑/↓ pitch · ←/→ bank · G gear · F flaps · P pause · R restart', W / 2, H - 14);
}

// ---------------------------------------------------------------- screens

function drawTitle(ctx, game) {
  ctx.fillStyle = 'rgba(6,16,30,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '800 64px sans-serif';
  ctx.fillText('ISLAND HOPPER', W / 2, 168);
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.font = '700 30px sans-serif';
  ctx.fillText('— SKYLINE RUN —', W / 2, 210);
  ctx.fillStyle = 'rgba(244,248,255,0.92)';
  ctx.font = '600 17px sans-serif';
  ctx.fillText('One sortie, three jobs: thread the rings, skim the coast, and put her down on Runway 27.', W / 2, 252);
  panel(ctx, W / 2 - 330, 282, 660, 190);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.font = '700 15px sans-serif';
  ctx.fillText('THE SORTIE', W / 2 - 306, 314);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('1 · RING RUN — fly through 5 golden rings over the island', W / 2 - 306, 344);
  ctx.fillText('2 · COASTAL TOUR — pass 3 checkpoints low over the water', W / 2 - 306, 372);
  ctx.fillText('3 · LANDING — gear down, gentle on Runway 27, score the stop', W / 2 - 306, 400);
  ctx.fillStyle = 'rgba(244,248,255,0.75)';
  ctx.font = '600 14px sans-serif';
  ctx.fillText('Watch your fuel and your airspeed — a stall over the sea ends the sortie.', W / 2 - 306, 436);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '700 20px sans-serif';
  const blink = Math.floor(game.time * 1.8) % 2 === 0;
  if (blink) ctx.fillText('PRESS ENTER OR CLICK TO FLY', W / 2, 524);
  ctx.fillStyle = 'rgba(244,248,255,0.7)';
  ctx.font = '600 13px sans-serif';
  ctx.fillText('W/S throttle · Arrow keys fly · G gear · F flaps · P pause', W / 2, 556);
  if (game.bestScore > 0) {
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.font = '700 15px sans-serif';
    ctx.fillText('BEST SCORE: ' + game.bestScore, W / 2, 588);
  }
}

function drawEndPanel(ctx, game, landed, breakdown) {
  ctx.fillStyle = 'rgba(6,16,30,0.55)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W / 2 - 300, 150, 600, 380);
  ctx.textAlign = 'center';
  ctx.fillStyle = landed ? COLOURS.hudGreen : COLOURS.hudRed;
  ctx.font = '800 44px sans-serif';
  ctx.fillText(landed ? 'LANDED — SORTIE COMPLETE' : 'CRASHED', W / 2, 216);
  ctx.fillStyle = COLOURS.hudText;
  ctx.font = '600 16px sans-serif';
  if (landed && breakdown) {
    ctx.fillText('Rings ' + game.mission.ringsHit + '/5 · Checkpoints ' + game.mission.checkpointsHit + '/3', W / 2, 250);
    let y = 292;
    ctx.textAlign = 'left';
    for (const p of breakdown.parts) {
      ctx.fillStyle = 'rgba(244,248,255,0.85)';
      ctx.font = '600 16px sans-serif';
      ctx.fillText(p.label, W / 2 - 260, y);
      ctx.textAlign = 'right';
      ctx.fillText('+' + p.value, W / 2 + 260, y);
      ctx.textAlign = 'left';
      y += 30;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.moveTo(W / 2 - 260, y - 8); ctx.lineTo(W / 2 + 260, y - 8); ctx.stroke();
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.font = '700 22px sans-serif';
    ctx.fillText('TOTAL SCORE', W / 2 - 260, y + 22);
    ctx.textAlign = 'right';
    ctx.fillText(String(breakdown.total), W / 2 + 260, y + 22);
    ctx.textAlign = 'center';
  } else {
    ctx.fillText(game.crashReason || 'The sortie ended in the terrain.', W / 2, 258);
    ctx.fillStyle = 'rgba(244,248,255,0.8)';
    ctx.font = '600 16px sans-serif';
    ctx.fillText('Score kept: ' + game.mission.score + '  ·  Rings ' + game.mission.ringsHit + '/5', W / 2, 292);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '700 19px sans-serif';
  const blink = Math.floor(game.time * 1.8) % 2 === 0;
  if (blink) ctx.fillText('PRESS R TO FLY AGAIN', W / 2, 492);
}

// ---------------------------------------------------------------- frame

export function drawHUD(ctx, game) {
  const { plane, mission, state } = game;
  if (state === 'title') { drawTitle(ctx, game); return; }
  drawTopBar(ctx, plane, mission);
  drawHorizon(ctx, plane);
  drawGauges(ctx, plane);
  drawGuidance(ctx, plane, mission);
  drawWarnings(ctx, plane);
  drawBanner(ctx, game.banner, game.time);
  drawHint(ctx);
  if (state === 'paused') {
    ctx.fillStyle = 'rgba(6,16,30,0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '600 16px sans-serif';
    ctx.fillText('Press P to resume', W / 2, H / 2 + 36);
  }
  if (state === 'landed') drawEndPanel(ctx, game, true, game.landingBreakdown);
  if (state === 'crashed') drawEndPanel(ctx, game, false, null);
}
