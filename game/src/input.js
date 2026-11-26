// input.js — keyboard + mouse, nothing else.
// One job: turn raw events into a clean per-frame input state for the flight model.

export function createInput() {
  return {
    keys: new Set(),
    // Edge-triggered actions, consumed once by main.js each frame.
    pressed: new Set(),
    clicked: false,
    clickX: 0,
    clickY: 0,
  };
}

const KEYMAP = {
  ArrowUp: 'pitchUp',
  ArrowDown: 'pitchDown',
  ArrowLeft: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyW: 'throttleUp',
  KeyS: 'throttleDown',
  KeyG: 'gear',
  KeyF: 'flaps',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  Enter: 'start',
  Space: 'start',
};

export function attachInput(input, onFirstGesture) {
  let gestured = false;
  const gesture = () => {
    if (!gestured) { gestured = true; onFirstGesture(); }
  };
  window.addEventListener('keydown', (e) => {
    gesture();
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) input.pressed.add(action);
    input.keys.add(action);
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) input.keys.delete(action);
  });
  window.addEventListener('mousedown', (e) => {
    gesture();
    input.clicked = true;
    input.clickX = e.clientX;
    input.clickY = e.clientY;
  });
  window.addEventListener('blur', () => input.keys.clear());
}

// Collapse the raw key state into what stepPlane wants, then clear the edges.
export function readFlightInput(input) {
  const out = {
    pitch: 0,
    roll: 0,
    throttleUp: input.keys.has('throttleUp'),
    throttleDown: input.keys.has('throttleDown'),
  };
  if (input.keys.has('pitchUp')) out.pitch += 1;
  if (input.keys.has('pitchDown')) out.pitch -= 1;
  if (input.keys.has('rollLeft')) out.roll -= 1;
  if (input.keys.has('rollRight')) out.roll += 1;
  return out;
}

export function consumePress(input, action) {
  if (input.pressed.has(action)) {
    input.pressed.delete(action);
    return true;
  }
  return false;
}

export function endFrame(input) {
  input.pressed.clear();
  input.clicked = false;
}
