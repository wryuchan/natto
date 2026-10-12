import assert from 'node:assert/strict';
import test from 'node:test';

import { PerspectiveCamera } from 'three';

import { createAppController } from '../src/app-controller.js';
import { createInitialGameState } from '../src/core/game-state.js';
import { scoreMixing } from '../src/core/scoring.js';
import { reduceGameState } from '../src/core/state-machine.js';
import { createKitchenScene } from '../src/scene/kitchen.js';
import {
  applyEggTap,
  amountFromCondimentHold,
  applyMixPath,
} from '../src/stations/mix-model.js';
import { createMixStation } from '../src/stations/mix-station.js';
import { createAudioSystem } from '../src/systems/audio.js';

const initialMixing = () => ({
  progress: 0,
  circularity: 0,
  speedStability: 0,
  clockwiseRatio: 0,
  aeration: 0,
});

const circle = (reverse = false, samples = 49) => {
  const points = Array.from({ length: samples }, (_, index) => {
    const direction = reverse ? -1 : 1;
    const angle = direction * ((index / (samples - 1)) * Math.PI * 2);
    return { x: Math.cos(angle) * 0.68, y: Math.sin(angle) * 0.68 };
  });
  return points;
};

test('only two valid bowl-rim taps crack and then open the egg', () => {
  const whole = { stage: 'whole', added: false };
  assert.equal(applyEggTap(whole, 'counter'), whole);

  const cracked = applyEggTap(whole, 'bowl-rim');
  assert.deepEqual(cracked, { stage: 'cracked', added: false });
  assert.equal(applyEggTap(cracked, 'egg-carton'), cracked);

  const opened = applyEggTap(cracked, 'bowl-rim');
  assert.deepEqual(opened, { stage: 'opened', added: true });
  assert.equal(applyEggTap(opened, 'bowl-rim'), opened);
});

test('condiment quantity depends on elapsed time rather than 30fps or 60fps sampling', () => {
  const totalAtRate = (kind, frames, durationMs) => Array.from({ length: frames })
    .reduce((total) => total + amountFromCondimentHold(kind, durationMs / frames), 0);

  assert.ok(Math.abs(totalAtRate('soySauce', 60, 2_000) - 4) < 1e-9);
  assert.ok(Math.abs(totalAtRate('soySauce', 120, 2_000) - 4) < 1e-9);
  assert.ok(Math.abs(totalAtRate('mustard', 30, 1_000) - 0.6) < 1e-9);
  assert.ok(Math.abs(totalAtRate('mustard', 60, 1_000) - 0.6) < 1e-9);
  assert.equal(amountFromCondimentHold('vinegar', 1_000), 0);
});

test('bowl-local circular paths score equally in either rotation direction', () => {
  const clockwise = applyMixPath(initialMixing(), circle(false), 1_600);
  const counterclockwise = applyMixPath(initialMixing(), circle(true), 1_600);

  assert.ok(clockwise.circularity >= 0.9);
  assert.ok(counterclockwise.circularity >= 0.9);
  assert.ok(Math.abs(clockwise.circularity - counterclockwise.circularity) < 1e-9);
  assert.ok(clockwise.clockwiseRatio > 0.9);
  assert.ok(counterclockwise.clockwiseRatio < 0.1);
});

test('mix metrics stay normalized and stationary input preserves state identity', () => {
  const mixing = initialMixing();
  const stationary = Array.from({ length: 20 }, () => ({ x: 0.4, y: -0.2 }));
  assert.equal(applyMixPath(mixing, stationary, 2_000), mixing);

  let current = mixing;
  for (let index = 0; index < 20; index += 1) {
    current = applyMixPath(current, circle(index % 2 === 0), 1_000);
  }
  for (const value of Object.values(current)) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test('adding egg changes the scoring target without rewriting previous mix samples', () => {
  let state = createInitialGameState();
  state = reduceGameState(state, {
    type: 'UPDATE_MIX',
    progress: 0.76,
    circularity: 1,
    speedStability: 1,
    clockwiseRatio: 0.5,
    aeration: 0.5,
  });
  const previousMixing = state.mixing;
  const eggFreeScore = scoreMixing(state);
  const withEgg = reduceGameState(state, { type: 'ADD_EGG' });

  assert.equal(withEgg.mixing, previousMixing);
  assert.ok(scoreMixing(withEgg) > eggFreeScore);
});

test('mix station preserves the yolk through 0.20 and blends it only above the title threshold', () => {
  const station = createMixStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
  });
  const state = createInitialGameState();
  state.ingredients.egg.added = true;
  const yolk = station.group.getObjectByName('egg-yolk');

  state.mixing.progress = 0.2;
  station.renderState(state);
  assert.equal(yolk.visible, true);
  assert.equal(yolk.material.opacity, 1);

  state.mixing.progress = 0.21;
  station.renderState(state);
  assert.equal(yolk.visible, true);
  assert.ok(yolk.material.opacity < 1);

  state.mixing.progress = 1;
  station.renderState(state);
  assert.equal(yolk.visible, false);
  station.dispose();
});

test('rice transfer locks egg, condiment, and mixing mutations', () => {
  let state = createInitialGameState();
  state = reduceGameState(state, { type: 'TRANSFER_TO_BOWL', ingredient: 'natto', amount: 1 });
  state = reduceGameState(state, {
    type: 'TRANSFER_TO_RICE',
    confirmed: true,
    transferredRatio: 0.2,
  });

  assert.equal(reduceGameState(state, { type: 'ADD_EGG' }), state);
  assert.equal(reduceGameState(state, {
    type: 'ADD_CONDIMENT', condiment: 'soySauce', amount: 1,
  }), state);
  assert.equal(reduceGameState(state, { type: 'UPDATE_MIX', progress: 0.5 }), state);
});

test('mix station implements the adapter contract with capped thread and foam visuals', () => {
  const station = createMixStation({
    camera: new PerspectiveCamera(45, 1, 0.1, 100),
    dispatch() {},
    qualityProfile: { threadCount: 36, foamCount: 24 },
  });
  const foam = station.group.getObjectByName('mix-foam');
  const threads = station.group.getObjectByName('mix-threads');

  assert.equal(station.id, 'mix');
  assert.equal(typeof station.hitTest, 'function');
  assert.equal(typeof station.applyPointerSample, 'function');
  assert.equal(typeof station.renderState, 'function');
  assert.equal(typeof station.dispose, 'function');
  assert.equal(foam.instanceMatrix.count, 24);
  assert.equal(threads.children.length, 36);
  station.dispose();
});

test('default kitchen installs the interactive mix adapter with the selected quality caps', () => {
  const canvas = {
    clientWidth: 375,
    clientHeight: 500,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 500 }),
  };
  const renderer = {
    shadowMap: {},
    setPixelRatio() {},
    setSize() {},
    render() {},
    dispose() {},
  };
  const kitchen = createKitchenScene(canvas, {
    autoStart: false,
    enableInput: false,
    capabilities: { degradationLevel: 3 },
    rendererFactory: () => renderer,
  });
  const mix = kitchen.getStation('mix');

  assert.ok(mix.group.getObjectByName('egg-yolk'));
  assert.equal(mix.group.getObjectByName('mix-foam').instanceMatrix.count, 24);
  assert.equal(mix.group.getObjectByName('mix-threads').children.length, 36);
  kitchen.dispose();
});

test('controller unlocks effects from accepted cooking events and keeps audio mute in sync', async () => {
  const calls = [];
  const controller = createAppController({
    shell: {
      render() {},
      showTutorial() {},
      announce() {},
      dispose() {},
    },
    settings: { muted: false, tutorialSeen: true },
    audio: {
      setMuted: (muted) => calls.push(['muted', muted]),
      unlock: async () => {
        calls.push(['unlock']);
        return true;
      },
      play: (effect) => calls.push(['play', effect]),
      dispose: () => calls.push(['dispose']),
    },
  });

  controller.dispatch({ type: 'UPDATE_MIX', progress: 0.1 });
  await Promise.resolve();
  controller.toggleMute();
  controller.dispose();

  assert.deepEqual(calls, [
    ['muted', false],
    ['unlock'],
    ['play', 'stir'],
    ['muted', true],
    ['dispose'],
  ]);
});

test('audio is silent before unlock, respects mute, and tolerates unavailable Web Audio', async () => {
  let contextCreations = 0;
  const starts = [];
  const fakeContext = {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start: () => starts.push('start'),
      stop() {},
    }),
    resume: async () => {},
    close: async () => {},
  };
  const audio = createAudioSystem({
    contextFactory: () => {
      contextCreations += 1;
      return fakeContext;
    },
  });

  assert.equal(audio.play('stir'), false);
  assert.equal(contextCreations, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(contextCreations, 1);
  assert.equal(audio.play('stir'), true);
  assert.equal(starts.length, 1);
  audio.setMuted(true);
  assert.equal(audio.play('crack'), false);
  await audio.dispose();

  const unavailable = createAudioSystem({ contextFactory: () => null });
  assert.equal(await unavailable.unlock(), false);
  assert.equal(unavailable.play('result'), false);
});
