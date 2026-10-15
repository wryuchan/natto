import assert from 'node:assert/strict';
import test from 'node:test';

import { LatheGeometry } from 'three';

import { createVesselGeometry } from '../src/scene/vessels.js';

const EPSILON = 1e-6;

function includesRadius(position, expectedRadius) {
  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getZ(index));
    if (Math.abs(radius - expectedRadius) <= EPSILON) return true;
  }
  return false;
}

for (const [name, options] of [
  ['mixing bowl', {
    innerRadius: 1.28,
    outerRadius: 1.48,
    height: 0.88,
    footRadius: 1.08,
  }],
  ['rice bowl', {
    innerRadius: 1.52,
    outerRadius: 1.72,
    height: 0.82,
    footRadius: 1.16,
    segments: 40,
  }],
]) {
  test(`${name} geometry is a closed, bottom-origin lathe profile`, () => {
    const geometry = createVesselGeometry(options);
    const position = geometry.getAttribute('position');

    assert.ok(geometry instanceof LatheGeometry);
    assert.ok(position.count > 0);
    assert.ok(geometry.getAttribute('normal').count > 0);
    assert.ok(Math.abs(geometry.boundingBox.min.y) <= EPSILON);
    assert.ok(Math.abs(geometry.boundingBox.max.y - options.height) <= EPSILON);
    assert.ok(includesRadius(position, options.innerRadius));
    assert.ok(includesRadius(position, options.outerRadius));
  });
}

test('vessel geometry rejects invalid radii and height', () => {
  const valid = {
    innerRadius: 1,
    outerRadius: 1.2,
    height: 0.8,
    footRadius: 0.7,
  };

  for (const options of [
    { ...valid, innerRadius: 0 },
    { ...valid, outerRadius: 1 },
    { ...valid, footRadius: 0 },
    { ...valid, height: 0 },
  ]) {
    assert.throws(() => createVesselGeometry(options), RangeError);
  }
});
