import assert from 'node:assert/strict';
import test from 'node:test';

import { RepeatWrapping } from 'three';

import { createKitchenMaterials, createWoodTexture, disposeKitchenMaterials } from '../src/scene/materials.js';

test('wood texture tiles seamlessly in calm colors', () => {
  const originalDocument = globalThis.document;
  const context = {
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
  globalThis.document = {
    createElement() {
      return { width: 0, height: 0, getContext: () => context };
    },
  };

  try {
    const texture = createWoodTexture();
    // The tile is built from terms periodic over its edges, so it is safe to repeat.
    assert.equal(texture.wrapS, RepeatWrapping);
    assert.equal(texture.wrapT, RepeatWrapping);
    texture.dispose();
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }

  const materials = createKitchenMaterials();
  const channels = [...materials.woodTexture.image.data.slice(0, 3)];
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 50);
  disposeKitchenMaterials(materials);
});
