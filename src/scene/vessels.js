import * as THREE from 'three';

function requirePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function cubicPoint(start, controlA, controlB, end, t) {
  const inverse = 1 - t;
  return new THREE.Vector2(
    (inverse ** 3) * start.x
      + 3 * (inverse ** 2) * t * controlA.x
      + 3 * inverse * (t ** 2) * controlB.x
      + (t ** 3) * end.x,
    (inverse ** 3) * start.y
      + 3 * (inverse ** 2) * t * controlA.y
      + 3 * inverse * (t ** 2) * controlB.y
      + (t ** 3) * end.y,
  );
}

function appendCubicSamples(profile, start, controlA, controlB, end, sampleCount) {
  for (let index = 1; index < sampleCount; index += 1) {
    profile.push(cubicPoint(start, controlA, controlB, end, index / sampleCount));
  }
  profile.push(end.clone());
}

function averageLatheSeamNormals(geometry, profileLength, segments) {
  const normals = geometry.getAttribute('normal');
  const average = new THREE.Vector3();
  const lastRingStart = segments * profileLength;
  for (let index = 0; index < profileLength; index += 1) {
    const lastIndex = lastRingStart + index;
    average.set(
      normals.getX(index) + normals.getX(lastIndex),
      normals.getY(index) + normals.getY(lastIndex),
      normals.getZ(index) + normals.getZ(lastIndex),
    );
    if (average.lengthSq() > 0) average.normalize();
    normals.setXYZ(index, average.x, average.y, average.z);
    normals.setXYZ(lastIndex, average.x, average.y, average.z);
  }
  normals.needsUpdate = true;
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
  const lipRadius = thickness / 2;
  const lipBaseY = height - lipRadius;
  const footHeight = Math.min(height * 0.12, thickness * 0.5);
  const undersideY = footHeight * 0.45;
  const floorY = Math.min(lipBaseY * 0.48, footHeight + thickness);
  const innerFootRadius = Math.max(thickness, footRadius - thickness);
  const profile = [
    new THREE.Vector2(0, undersideY),
    new THREE.Vector2(innerFootRadius * 0.78, undersideY),
    new THREE.Vector2(innerFootRadius, 0),
    new THREE.Vector2(footRadius, 0),
    new THREE.Vector2(footRadius, footHeight * 0.72),
  ];

  const outerStart = new THREE.Vector2(footRadius * 0.96, footHeight);
  const outerEnd = new THREE.Vector2(outerRadius, lipBaseY);
  profile.push(outerStart);
  appendCubicSamples(
    profile,
    outerStart,
    new THREE.Vector2(footRadius * 0.9, height * 0.34),
    new THREE.Vector2(outerRadius - lipRadius * 0.72, height * 0.68),
    outerEnd,
    12,
  );

  const lipCenterRadius = innerRadius + lipRadius;
  for (let index = 1; index <= 6; index += 1) {
    if (index === 6) {
      profile.push(new THREE.Vector2(innerRadius, lipBaseY));
      continue;
    }
    const angle = (index / 6) * Math.PI;
    profile.push(new THREE.Vector2(
      lipCenterRadius + Math.cos(angle) * lipRadius,
      lipBaseY + Math.sin(angle) * lipRadius,
    ));
  }

  const innerStart = new THREE.Vector2(innerRadius, lipBaseY);
  const innerEnd = new THREE.Vector2(innerFootRadius, floorY);
  appendCubicSamples(
    profile,
    innerStart,
    new THREE.Vector2(innerRadius * 0.99, height * 0.66),
    new THREE.Vector2(innerFootRadius * 1.05, floorY * 1.55),
    innerEnd,
    12,
  );
  profile.push(new THREE.Vector2(0, floorY));

  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  averageLatheSeamNormals(geometry, profile.length, segments);
  geometry.computeBoundingBox();
  return geometry;
}
