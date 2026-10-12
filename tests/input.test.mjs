import test from 'node:test';
import assert from 'node:assert/strict';

import {
  amountFromHold,
  classifyBackgroundSwipe,
  createPointerRouter,
  normalizeLocalPoint,
} from '../src/systems/input.js';

function swipe(overrides = {}) {
  return {
    start: { x: 100, y: 100 },
    end: { x: 52, y: 100 },
    pointerCount: 1,
    interactiveStart: false,
    canceled: false,
    owned: false,
    ...overrides,
  };
}

function pointerEvent(type, properties) {
  const event = new Event(type);
  Object.defineProperties(event, Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, { value }]),
  ));
  return event;
}

class FakeCanvas extends EventTarget {
  captured = [];
  released = [];

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 200, height: 100 };
  }

  setPointerCapture(pointerId) {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.released.push(pointerId);
  }
}

test('48px swipe at 1.4 horizontal dominance uses direction of travel', () => {
  assert.equal(classifyBackgroundSwipe(swipe()), 'next');
  assert.equal(classifyBackgroundSwipe(swipe({ end: { x: 148, y: 100 } })), 'previous');
  assert.equal(classifyBackgroundSwipe(swipe({ end: { x: 148, y: 100 + (48 / 1.4) } })), 'previous');
});

test('ineligible background gestures do not switch stations', () => {
  assert.equal(classifyBackgroundSwipe(swipe({ end: { x: 53, y: 100 } })), null);
  assert.equal(classifyBackgroundSwipe(swipe({ end: { x: 148, y: 135 } })), null);
  assert.equal(classifyBackgroundSwipe(swipe({ interactiveStart: true })), null);
  assert.equal(classifyBackgroundSwipe(swipe({ pointerCount: 2 })), null);
  assert.equal(classifyBackgroundSwipe(swipe({ canceled: true })), null);
  assert.equal(classifyBackgroundSwipe(swipe({ owned: true })), null);
});

test('normalization represents the same local point at mobile and desktop sizes', () => {
  assert.deepEqual(
    normalizeLocalPoint({ x: 103.75, y: 203 }, { left: 10, top: 0, width: 375, height: 812 }),
    { x: 0.25, y: 0.25 },
  );
  assert.deepEqual(
    normalizeLocalPoint({ clientX: 420, clientY: 210 }, { left: 100, top: 10, width: 1280, height: 800 }),
    { x: 0.25, y: 0.25 },
  );
});

test('hold amount uses elapsed milliseconds and clamps to the maximum', () => {
  assert.equal(amountFromHold(750, 2, 10), 1.5);
  assert.equal(amountFromHold(750, 2, 1), 1);
  assert.equal(amountFromHold(1_000, 0.6, 10), amountFromHold(1_000, 0.6, 10));
});

test('owned utensil drag is captured and never emitted as a station swipe', () => {
  const canvas = new FakeCanvas();
  const samples = [];
  const swipes = [];
  const router = createPointerRouter({
    canvas,
    hitTest: () => 'knife',
    handlers: {
      pointerStart: (owner, sample) => samples.push(['start', owner, sample]),
      pointerMove: (owner, sample) => samples.push(['move', owner, sample]),
      pointerEnd: (owner, sample) => samples.push(['end', owner, sample]),
      backgroundSwipe: (direction) => swipes.push(direction),
    },
  });

  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 110, clientY: 70 }));
  canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 20, clientY: 70 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 20, clientY: 70 }));

  assert.deepEqual(canvas.captured, [7]);
  assert.equal(samples.length, 3);
  assert.deepEqual(samples.map(([kind, owner]) => [kind, owner]), [
    ['start', 'knife'],
    ['move', 'knife'],
    ['end', 'knife'],
  ]);
  assert.deepEqual(swipes, []);
  assert.deepEqual(canvas.released, [7]);
  router.dispose();
});

test('background pointer samples emit a qualifying swipe without capture', () => {
  const canvas = new FakeCanvas();
  const swipes = [];
  const router = createPointerRouter({
    canvas,
    hitTest: () => null,
    handlers: { backgroundSwipe: (direction) => swipes.push(direction) },
  });

  canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 150, clientY: 60 }));
  canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 90, clientY: 60 }));

  assert.deepEqual(swipes, ['next']);
  assert.deepEqual(canvas.captured, []);
  router.dispose();
});

test('cancel, capture loss, and recovery release pointer ownership', () => {
  for (const finish of ['pointercancel', 'lostpointercapture', 'recovery']) {
    const canvas = new FakeCanvas();
    const canceled = [];
    const router = createPointerRouter({
      canvas,
      hitTest: () => 'knife',
      handlers: { pointerCancel: (owner) => canceled.push(owner) },
    });
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9, clientX: 10, clientY: 20 }));

    if (finish === 'recovery') router.setRecoveryMode(true);
    else canvas.dispatchEvent(pointerEvent(finish, { pointerId: 9, clientX: 10, clientY: 20 }));

    assert.deepEqual(canceled, ['knife']);
    assert.equal(router.getOwner(), null);
    if (finish !== 'lostpointercapture') assert.deepEqual(canvas.released, [9]);
    router.dispose();
  }
});
