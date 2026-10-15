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

function profileIndex(points, radius, y = null) {
  return points.findIndex((point) => (
    Math.abs(point.x - radius) <= EPSILON
    && (y == null || Math.abs(point.y - y) <= EPSILON)
  ));
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

  test(`${name} uses a sampled curved belly and rounded lip`, () => {
    const geometry = createVesselGeometry(options);
    const points = geometry.parameters.points;
    const footIndex = profileIndex(points, options.footRadius, 0);
    const outerRimIndex = profileIndex(points, options.outerRadius);
    const innerRimIndex = profileIndex(points, options.innerRadius);
    const outerWall = points.slice(footIndex + 1, outerRimIndex + 1);
    const slopes = outerWall.slice(1).map((point, index) => {
      const previous = outerWall[index];
      return ((point.x - previous.x) / (point.y - previous.y)).toFixed(3);
    });

    assert.ok(points.length >= 30);
    assert.ok(footIndex >= 0);
    assert.ok(outerRimIndex > footIndex);
    assert.ok(innerRimIndex > outerRimIndex);
    assert.ok(outerWall.length >= 10);
    assert.ok(new Set(slopes).size >= 4);
    assert.ok(points.some((point) => Math.abs(point.y - options.height) <= EPSILON));
  });

  test(`${name} has continuous normals across the lathe seam`, () => {
    const geometry = createVesselGeometry(options);
    const normal = geometry.getAttribute('normal');
    const profileLength = geometry.parameters.points.length;
    const lastRingStart = geometry.parameters.segments * profileLength;

    for (let index = 0; index < profileLength; index += 1) {
      const firstLength = Math.hypot(
        normal.getX(index),
        normal.getY(index),
        normal.getZ(index),
      );
      if (firstLength < 0.5) continue;
      const lastIndex = lastRingStart + index;
      const dot = (
        normal.getX(index) * normal.getX(lastIndex)
        + normal.getY(index) * normal.getY(lastIndex)
        + normal.getZ(index) * normal.getZ(lastIndex)
      );
      assert.ok(dot > 0.999999, `profile vertex ${index} has a visible normal seam`);
    }
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
