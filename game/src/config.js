// config.js — tuning constants and world layout for Island Hopper: Skyline Run.
// One job: every number the flight model, the missions and the renderer share.

export const GAME = {
  title: 'ISLAND HOPPER',
  subtitle: 'SKYLINE RUN',
  canvasWidth: 1280,
  canvasHeight: 720,
};

export const WORLD = {
  // Runway: centreline x = 0, threshold (south end) z = 0, north end z = 1500.
  runway: { x: 0, z0: 0, z1: 1500, width: 46, headingDeg: 0 },
  // Coastline: sea to the west of this line, land to the east. It curves with z.
  coastBaseX: -620,
  // Sea level is height 0; land rises east of the coast.
  seaLevel: 0,
  // Where the sortie starts: south of the runway, heading north.
  start: { x: 0, z: -2600, altFt: 1400, headingDeg: 0, speedKt: 150, throttle: 0.72 },
};

export const PLANE = {
  maxThrottleSpeedKt: 212, // level speed at full throttle
  minThrottleSpeedKt: 42, // level speed at idle
  speedApproachRate: 0.22, // 1/s toward target speed
  stallSpeedKt: 58, // below this the wing stops flying
  stallSpeedFlapsKt: 50,
  pitchRateDeg: 26, // elevator authority, deg/s
  rollRateDeg: 68, // aileron authority, deg/s
  maxRollDeg: 62,
  maxPitchDeg: 32,
  autoLevelRateDeg: 14, // roll drift back to wings level, deg/s
  climbFactor: 0.88, // fraction of speed turned into climb by pitch
  fuelBurnPerSec: 0.16, // %/s at full throttle (about 10 min of flying)
  fuelBurnIdle: 0.05,
  ringRadiusM: 42,
  checkpointRadiusM: 55,
};

export const SCORE = {
  ring: 250,
  checkpoint: 300,
  landingBase: 600,
  landingCenterBonus: 200,
  landingSoftBonus: 200,
  fuelBonusPerPct: 4,
  timeBonusPerSec: 2,
};

export const COLOURS = {
  skyTop: '#1c4f9e',
  skyMid: '#5ea3dd',
  skyHorizon: '#cfe8f7',
  sunCore: '#fff6c8',
  sunGlow: 'rgba(255, 236, 160, 0.55)',
  seaDeep: '#0e5f8f',
  seaShallow: '#2f9dc4',
  sand: '#e3cd8e',
  grass: '#5da244',
  fieldA: '#6fb04a',
  fieldB: '#8aa84f',
  forest: '#2f7a33',
  mountainFar: '#7d8aa8',
  mountainNear: '#5d6b52',
  mountainSnow: '#eef3f8',
  runway: '#3c4148',
  runwayEdge: '#f2f2ea',
  hudPanel: 'rgba(8, 18, 32, 0.72)',
  hudText: '#f4f8ff',
  hudAmber: '#ffc845',
  hudGreen: '#7ee787',
  hudRed: '#ff5d5d',
  ring: '#ffd23f',
  ringNext: '#ffe98a',
};
