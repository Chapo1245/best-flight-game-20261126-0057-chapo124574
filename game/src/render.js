// render.js — the view: sky, sea, coast, runway, rings and the aircraft itself.
// One job: turn the plane + world state into one 1280x720 frame. No game logic here.

import { COLOURS, GAME } from './config.js';
import { coastXAt, heightAt, ridgeProfile, scatterFeatures, zoneAt } from './terrain.js';
import { RINGS, currentTarget } from './missions.js';
import { deg2rad } from './flight.js';

const W = GAME.canvasWidth;
const H = GAME.canvasHeight;
const CX = W / 2;
const FOCAL = 700;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------- projection

function projector(plane, horizonY) {
  const hdg = deg2rad(plane.headingDeg);
  const sinH = Math.sin(hdg);
  const cosH = Math.cos(hdg);
  const roll = deg2rad(plane.rollDeg);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  return function project(x, y, z) {
    const dx = x - plane.x;
    const dz = z - plane.z;
    const fwd = dx * sinH + dz * cosH;
    if (fwd < 12) return null;
    const right = dx * cosH - dz * sinH;
    const dy = y - plane.altM;
    let sx = CX + (right / fwd) * FOCAL;
    let sy = horizonY - (dy / fwd) * FOCAL;
    // Bank rolls the whole view around the screen centre.
    const ox = sx - CX;
    const oy = sy - horizonY;
    sx = CX + ox * cosR - oy * sinR;
    sy = horizonY + ox * sinR + oy * cosR;
    return { x: sx, y: sy, scale: FOCAL / fwd, fwd };
  };
}

// ---------------------------------------------------------------- sky

function drawSky(ctx, plane, horizonY, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLOURS.skyTop);
  g.addColorStop(0.42, COLOURS.skyMid);
  g.addColorStop(0.62, COLOURS.skyHorizon);
  g.addColorStop(1, '#9db8c4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Sun, upper right, with a soft glow.
  const sunX = 1030;
  const sunY = 105;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
  glow.addColorStop(0, COLOURS.sunGlow);
  glow.addColorStop(1, 'rgba(255,236,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
  ctx.fillStyle = COLOURS.sunCore;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();

  // High clouds drift with heading so turning feels like turning.
  const drift = ((plane.headingDeg * 3.2) % 1400 + 1400) % 1400;
  const puffs = [
    [180, 150, 150, 26], [520, 122, 190, 30], [860, 140, 130, 22],
    [300, 180, 110, 18], [1150, 70, 170, 26], [60, 210, 120, 18],
  ];
  for (const [x, y, w, h] of puffs) {
    const px = ((x - drift) % 1400 + 1400) % 1400 - 60;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(px, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.ellipse(px - w * 0.28, y + h * 0.22, w * 0.32, h * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(px + w * 0.3, y + h * 0.2, w * 0.3, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  void t;
}

function drawRidges(ctx, plane, horizonY) {
  for (let layer = 0; layer < 2; layer++) {
    const baseH = layer === 0 ? 92 : 150;
    const shift = ((plane.headingDeg * (layer === 0 ? 1.1 : 2.0)) % 1 + 1) % 1;
    const lift = plane.pitchDeg * 5;
    ctx.beginPath();
    ctx.moveTo(-10, horizonY + 2);
    for (let sx = -10; sx <= W + 10; sx += 16) {
      const u = sx / W + shift;
      const { h } = ridgeProfile(u, layer);
      ctx.lineTo(sx, horizonY + 2 - h * baseH + lift);
    }
    ctx.lineTo(W + 10, horizonY + 2);
    ctx.closePath();
    ctx.fillStyle = layer === 0 ? COLOURS.mountainFar : COLOURS.mountainNear;
    ctx.fill();
    // Snow caps: small white triangles only on the highest peaks.
    if (layer === 1) {
      ctx.fillStyle = COLOURS.mountainSnow;
      for (let sx = -10; sx <= W + 10; sx += 16) {
        const u = sx / W + shift;
        const { h, snow } = ridgeProfile(u, layer);
        const prev = ridgeProfile((sx - 16) / W + shift, layer).h;
        const next = ridgeProfile((sx + 16) / W + shift, layer).h;
        if (h > snow && h >= prev && h >= next) {
          const y = horizonY + 2 - h * baseH + lift;
          ctx.beginPath();
          ctx.moveTo(sx - 18, y + 16);
          ctx.lineTo(sx, y - 2);
          ctx.lineTo(sx + 18, y + 16);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

// ---------------------------------------------------------------- ground

const ZONE_FILL = {
  sea: COLOURS.seaDeep,
  sand: COLOURS.sand,
  grass: COLOURS.grass,
  field: COLOURS.fieldA,
  forest: COLOURS.forest,
  rock: '#8a7d6d',
};

function drawGround(ctx, plane, project, horizonY) {
  // Base ground: everything below the horizon.
  const g = ctx.createLinearGradient(0, horizonY, 0, H);
  g.addColorStop(0, '#7fae6a');
  g.addColorStop(1, '#4c8a3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, horizonY), W, H - Math.max(0, horizonY));

  // Sea west of the coast: project the coastline and fill to the left edge.
  const coastPts = [];
  for (let z = plane.z + 4200; z > plane.z - 3200; z -= 220) {
    const p = project(coastXAt(z), 0, z);
    if (p) coastPts.push(p);
  }
  if (coastPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    for (const p of coastPts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(-10, coastPts[coastPts.length - 1].y);
    ctx.closePath();
    const sea = ctx.createLinearGradient(0, horizonY, 0, H);
    sea.addColorStop(0, COLOURS.seaShallow);
    sea.addColorStop(1, COLOURS.seaDeep);
    ctx.fillStyle = sea;
    ctx.fill();
    // Sun glitter on the water.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const zz = plane.z + 500 + i * 260;
      const p = project(coastXAt(zz) - 120 - (i % 3) * 90, 0, zz);
      if (!p || p.y < horizonY || p.y > H) continue;
      ctx.beginPath();
      ctx.moveTo(p.x - 14 * p.scale, p.y);
      ctx.lineTo(p.x + 14 * p.scale, p.y);
      ctx.stroke();
    }
    // Beach strip along the coast.
    ctx.strokeStyle = COLOURS.sand;
    ctx.lineWidth = 7;
    ctx.beginPath();
    coastPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  // Field patches: a few rotated quads of alternating crops on the land.
  for (let i = 0; i < 10; i++) {
    const fx = 420 + i * 260;
    const fz = -2600 + i * 620;
    const a = project(fx, 1, fz);
    const b = project(fx + 240, 1, fz);
    const c = project(fx + 240, 1, fz + 420);
    const d = project(fx, 1, fz + 420);
    if (!a || !b || !c || !d) continue;
    ctx.fillStyle = i % 2 ? 'rgba(138,168,79,0.85)' : 'rgba(111,176,74,0.85)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  // Perspective ground lines: distance bands + radials from the vanishing point.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  for (let d = 120; d < 4200; d = Math.round(d * 1.55) + 30) {
    const l = project(plane.x - 2600, 0, plane.z + d);
    const r = project(plane.x + 2600, 0, plane.z + d);
    if (!l || !r) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(-20, l.x), l.y);
    ctx.lineTo(Math.min(W + 20, r.x), r.y);
    ctx.stroke();
  }
}

function drawRunway(ctx, plane, project) {
  const r = { x: 0, z0: 0, z1: 1500, w: 46 };
  const hw = r.w / 2;
  const corners = [
    project(r.x - hw, 0.4, r.z0), project(r.x + hw, 0.4, r.z0),
    project(r.x + hw, 0.4, r.z1), project(r.x - hw, 0.4, r.z1),
  ];
  if (corners.some((c) => !c)) return;
  ctx.fillStyle = COLOURS.runway;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fill();
  // Edge lines + centreline dashes + threshold bars.
  ctx.strokeStyle = COLOURS.runwayEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y); ctx.lineTo(corners[3].x, corners[3].y);
  ctx.moveTo(corners[1].x, corners[1].y); ctx.lineTo(corners[2].x, corners[2].y);
  ctx.stroke();
  ctx.fillStyle = '#f8f8f0';
  for (let z = r.z0 + 120; z < r.z1 - 60; z += 150) {
    const a = project(0, 0.5, z);
    const b = project(0, 0.5, z + 70);
    if (!a || !b) continue;
    const wdt = Math.max(1.5, 4 * a.scale);
    ctx.fillRect(a.x - wdt / 2, Math.min(a.y, b.y), wdt, Math.abs(b.y - a.y) + 2);
  }
  // Runway number "27" near the threshold, rotated to lie along the strip.
  const num = project(0, 0.6, r.z0 + 90);
  const numFar = project(0, 0.6, r.z0 + 320);
  if (num && numFar && num.scale > 0.12) {
    ctx.save();
    ctx.translate(num.x, num.y);
    ctx.rotate(Math.atan2(numFar.y - num.y, numFar.x - num.x) - Math.PI / 2);
    ctx.fillStyle = '#f8f8f0';
    ctx.font = `bold ${Math.round(34 * num.scale + 10)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('27', 0, 0);
    ctx.restore();
  }
  // Approach lights.
  ctx.fillStyle = '#ffdf6b';
  for (let z = r.z0 - 40; z > r.z0 - 320; z -= 70) {
    const p = project(-14, 1, z);
    const q = project(14, 1, z);
    for (const pt of [p, q]) {
      if (!pt) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1.5, 3 * pt.scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Control tower + windsock beside the runway.
  const tower = project(120, 0, 700);
  if (tower) {
    const s = clamp(tower.scale * 60, 2, 90);
    ctx.fillStyle = '#dfe6ea';
    ctx.fillRect(tower.x - s * 0.18, tower.y - s, s * 0.36, s);
    ctx.fillStyle = '#31517a';
    ctx.fillRect(tower.x - s * 0.3, tower.y - s * 1.25, s * 0.6, s * 0.28);
  }
  const sock = project(-70, 0, 240);
  if (sock) {
    const s = clamp(sock.scale * 26, 2, 40);
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath(); ctx.moveTo(sock.x, sock.y); ctx.lineTo(sock.x, sock.y - s * 1.6); ctx.stroke();
    ctx.fillStyle = '#ff7a3c';
    ctx.beginPath();
    ctx.moveTo(sock.x, sock.y - s * 1.6);
    ctx.lineTo(sock.x + s, sock.y - s * 1.35);
    ctx.lineTo(sock.x, sock.y - s * 1.1);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------- rings & features

function drawRings(ctx, plane, mission, project) {
  const targets = mission.stage === 0 ? RINGS : [];
  targets.forEach((ring, i) => {
    if (i < mission.ringIndex) return; // passed rings are gone
    const p = project(ring.x, ring.altM, ring.z);
    if (!p) return;
    const isNext = i === mission.ringIndex;
    const rad = 42 * p.scale;
    if (rad < 2) return;
    ctx.save();
    ctx.globalAlpha = isNext ? 1 : 0.45;
    ctx.strokeStyle = isNext ? COLOURS.ringNext : COLOURS.ring;
    ctx.lineWidth = Math.max(2, rad * 0.09);
    ctx.shadowColor = COLOURS.ring;
    ctx.shadowBlur = isNext ? 18 : 6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rad, rad * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isNext ? '#fff3b0' : '#ffe98a';
    ctx.font = `bold ${Math.max(11, Math.round(rad * 0.42))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p.x, p.y);
    ctx.restore();
  });
  // Next checkpoint: a floating diamond marker with a guide line to the ground.
  if (mission.stage === 1) {
    const target = currentTarget(mission);
    const p = project(target.x, target.altM, target.z);
    const pg = project(target.x, 0, target.z);
    if (p) {
      const s = Math.max(8, 26 * p.scale + 10);
      if (pg) {
        ctx.save();
        ctx.strokeStyle = 'rgba(126,231,135,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + s / 2);
        ctx.lineTo(pg.x, pg.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#7ee787';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#7ee787';
      ctx.shadowBlur = 16;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }
}

function drawFeatures(ctx, plane, project, features) {
  // Trees: small two-tone triangles, billboarded.
  for (const t of features.trees) {
    const p = project(t.x, heightAt(t.x, t.z), t.z);
    if (!p || p.y < 0 || p.y > H + 40) continue;
    const s = clamp(16 * p.scale * t.s + 3, 2, 42);
    ctx.fillStyle = '#2f7a33';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s);
    ctx.lineTo(p.x - s * 0.55, p.y);
    ctx.lineTo(p.x + s * 0.55, p.y);
    ctx.closePath();
    ctx.fill();
  }
  // Houses of the little town.
  for (const h of features.houses) {
    const p = project(h.x, 0, h.z);
    if (!p) continue;
    const w = Math.max(2, h.w * p.scale);
    const hh = Math.max(2, h.h * p.scale);
    if (w < 2 || p.y < 0) continue;
    ctx.fillStyle = h.c;
    ctx.fillRect(p.x - w / 2, p.y - hh, w, hh);
    ctx.fillStyle = '#5a3a28';
    ctx.beginPath();
    ctx.moveTo(p.x - w / 2, p.y - hh);
    ctx.lineTo(p.x, p.y - hh * 1.6);
    ctx.lineTo(p.x + w / 2, p.y - hh);
    ctx.closePath();
    ctx.fill();
  }
  // Lighthouse on the coast.
  const lh = features.lighthouse;
  const lp = project(lh.x, 0, lh.z);
  if (lp) {
    const s = clamp(70 * lp.scale + 4, 3, 120);
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(lp.x - s * 0.16, lp.y - s, s * 0.32, s);
    ctx.fillStyle = '#d84a4a';
    ctx.fillRect(lp.x - s * 0.16, lp.y - s * 0.62, s * 0.32, s * 0.18);
    ctx.fillRect(lp.x - s * 0.16, lp.y - s * 0.28, s * 0.32, s * 0.18);
    ctx.fillStyle = '#222';
    ctx.fillRect(lp.x - s * 0.2, lp.y - s * 1.14, s * 0.4, s * 0.16);
  }
  // Buoys bobbing on the water.
  for (const b of features.buoys) {
    const p = project(b.x, 0, b.z);
    if (!p) continue;
    const s = clamp(10 * p.scale + 2, 2, 26);
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath();
    ctx.arc(p.x, p.y - s / 2, s / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- the aircraft

function drawPlaneShadow(ctx, plane, project) {
  const ground = heightAt(plane.x, plane.z);
  const p = project(plane.x, ground + 1, plane.z + 6);
  if (!p) return;
  const agl = Math.max(1, plane.altM - ground);
  const s = clamp(900 / agl, 6, 90);
  ctx.save();
  ctx.globalAlpha = clamp(0.34 - agl / 1400, 0.06, 0.34);
  ctx.fillStyle = '#06283d';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlane(ctx, plane, t) {
  const px = CX;
  const py = 468 + plane.pitchDeg * 1.4;
  const roll = deg2rad(plane.rollDeg) * 0.9;
  const scale = 0.88 + plane.pitchDeg * 0.002;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(roll);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';

  // Propeller disc + blades at the nose (top of the sprite).
  const propT = t * (2 + plane.throttle * 14);
  ctx.save();
  ctx.translate(0, -148);
  ctx.fillStyle = 'rgba(210,225,240,0.30)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 86, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,50,66,0.85)';
  ctx.lineWidth = 5;
  for (const a of [propT, propT + Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 4);
    ctx.lineTo(Math.cos(a) * 82, Math.sin(a) * 22);
    ctx.stroke();
  }
  ctx.restore();

  // Main wings.
  ctx.fillStyle = '#e8b64a';
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 2;
  ctx.beginPath(); // left wing
  ctx.moveTo(-14, -30); ctx.lineTo(-178, 6); ctx.lineTo(-172, 30); ctx.lineTo(-12, 8);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); // right wing
  ctx.moveTo(14, -30); ctx.lineTo(178, 6); ctx.lineTo(172, 30); ctx.lineTo(12, 8);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Aileron lines + roundels.
  ctx.strokeStyle = 'rgba(90,60,10,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-150, 12); ctx.lineTo(-40, -8); ctx.moveTo(150, 12); ctx.lineTo(40, -8); ctx.stroke();
  ctx.fillStyle = '#2f6fb2';
  ctx.beginPath(); ctx.arc(-132, 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(132, 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-132, 8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(132, 8, 4, 0, Math.PI * 2); ctx.fill();

  // Tailplane + fin (bottom of the sprite, nearest the camera).
  ctx.fillStyle = '#d99a2b';
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58, 108); ctx.lineTo(-96, 128); ctx.lineTo(-90, 142); ctx.lineTo(-52, 126);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(58, 108); ctx.lineTo(96, 128); ctx.lineTo(90, 142); ctx.lineTo(52, 126);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c98f1f';
  ctx.beginPath();
  ctx.moveTo(-16, 96); ctx.lineTo(0, 158); ctx.lineTo(16, 96);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Fuselage: tapered body, nose up-screen.
  const body = ctx.createLinearGradient(-26, 0, 26, 0);
  body.addColorStop(0, '#f7f3e8');
  body.addColorStop(0.5, '#fffdf4');
  body.addColorStop(1, '#d9cfb4');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#7a6a4d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -152);
  ctx.quadraticCurveTo(24, -110, 27, -40);
  ctx.quadraticCurveTo(28, 40, 20, 108);
  ctx.quadraticCurveTo(16, 138, 0, 146);
  ctx.quadraticCurveTo(-16, 138, -20, 108);
  ctx.quadraticCurveTo(-28, 40, -27, -40);
  ctx.quadraticCurveTo(-24, -110, 0, -152);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Centreline stripe + registration.
  ctx.strokeStyle = '#2f6fb2';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, -140); ctx.lineTo(0, 132); ctx.stroke();
  ctx.fillStyle = '#33414f';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(-34, 60);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('SKY-01', 0, 0);
  ctx.restore();

  // Canopy.
  const canopy = ctx.createLinearGradient(0, -108, 0, -58);
  canopy.addColorStop(0, '#bfe6ff');
  canopy.addColorStop(1, '#2f6fb2');
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(0, -84, 15, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#274b6d';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-5, -96, 4, 9, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Nav lights: red port, green starboard, white strobe blinking.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath(); ctx.arc(-180, 16, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#34d17b';
  ctx.beginPath(); ctx.arc(180, 16, 5, 0, Math.PI * 2); ctx.fill();
  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 150, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Landing gear.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, 96); ctx.lineTo(-26, 128);
    ctx.moveTo(18, 96); ctx.lineTo(26, 128);
    ctx.moveTo(0, 128); ctx.lineTo(0, 152);
    ctx.stroke();
    ctx.fillStyle = '#1d2126';
    ctx.beginPath(); ctx.arc(-27, 132, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(27, 132, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 156, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- particles

export function createParticles() {
  return [];
}

export function spawnRingBurst(parts, x, y) {
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    parts.push({
      x, y, vx: Math.cos(a) * (60 + (i % 5) * 26), vy: Math.sin(a) * (60 + (i % 5) * 26),
      life: 0.7, max: 0.7, size: 3 + (i % 3), color: '#ffd23f',
    });
  }
}

export function spawnCrashFire(parts, x, y) {
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 + (i % 7);
    parts.push({
      x, y, vx: Math.cos(a) * (40 + (i % 9) * 22), vy: Math.sin(a) * (40 + (i % 9) * 22) - 40,
      life: 1.1, max: 1.1, size: 4 + (i % 5), color: i % 3 ? '#ff7a3c' : '#ffcf4d',
    });
  }
}

function drawParticles(ctx, parts, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 60 * dt;
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.max), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSpeedLines(ctx, plane, t) {
  if (plane.speedKt < 150) return;
  const n = Math.min(22, Math.round((plane.speedKt - 140) / 3));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const seed = (i * 97 + Math.floor(t * 9)) % 100;
    const x = (seed * 13.7) % W;
    const y = (seed * 7.3) % H;
    const len = 20 + (plane.speedKt - 140) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.3, y + len);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- frame

export function createRenderer() {
  return { features: scatterFeatures() };
}

export function renderFrame(ctx, game, dt) {
  const { plane, mission, particles, time } = game;
  const horizonY = 300 + plane.pitchDeg * 5.5 - (plane.altM > 600 ? 0 : 0);
  const project = projector(plane, horizonY);
  drawSky(ctx, plane, horizonY, time);
  drawRidges(ctx, plane, horizonY);
  drawGround(ctx, plane, project, horizonY);
  drawRunway(ctx, plane, project);
  drawFeatures(ctx, plane, project, game.renderer.features);
  drawRings(ctx, plane, mission, project);
  drawPlaneShadow(ctx, plane, project);
  drawPlane(ctx, plane, time);
  drawParticles(ctx, particles, dt);
  drawSpeedLines(ctx, plane, time);
  void zoneAt;
}
