import * as THREE from 'three';

function requirePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

export function createVesselGeometry({
  innerRadius,
  outerRadius,
  height,
  footRadius,
  segments = 48,
}) {
  requirePositive(innerRadius, 'innerRadius');
  requirePositive(outerRadius, 'outerRadius');
  requirePositive(height, 'height');
  requirePositive(footRadius, 'footRadius');
  if (outerRadius <= innerRadius) {
    throw new RangeError('outerRadius must be greater than innerRadius');
  }
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError('segments must be an integer of at least 3');
  }

  const thickness = outerRadius - innerRadius;
  const innerFootRadius = Math.max(0, footRadius - thickness);
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(footRadius, 0),
    new THREE.Vector2(outerRadius, height),
    new THREE.Vector2(innerRadius, height),
    new THREE.Vector2(innerFootRadius, thickness),
    new THREE.Vector2(0, thickness),
  ];
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
