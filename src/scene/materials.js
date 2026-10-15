import * as THREE from 'three';

function makeDataTexture(color) {
  const data = new Uint8Array([color.r, color.g, color.b, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// One tile spans WOOD_TILE_WORLD_SIZE world units; the counter repeats it at that scale.
export const WOOD_TILE_WORLD_SIZE = 4;
const WOOD_FALLBACK = { r: 184, g: 160, b: 136 };
const PLANK_TONES = ['#c3a07a', '#bb9771', '#c8a781', '#be9b74'];

export function createWoodTexture() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return makeDataTexture(WOOD_FALLBACK);
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return makeDataTexture(WOOD_FALLBACK);

  // Every term is periodic over the tile so repeated tiles meet without seams.
  const plankWidth = size / PLANK_TONES.length;
  PLANK_TONES.forEach((tone, plank) => {
    context.fillStyle = tone;
    context.fillRect(plank * plankWidth, 0, plankWidth, size);
  });
  context.globalAlpha = 0.16;
  context.strokeStyle = '#7a5b3e';
  context.lineWidth = 1;
  for (let x = 4; x < size; x += 8) {
    const phase = (x / size) * Math.PI * 6;
    context.beginPath();
    for (let y = 0; y <= size; y += 4) {
      const wave = Math.sin(((y / size) * Math.PI * 4) + phase) * 1.5;
      if (y === 0) context.moveTo(x + wave, y);
      else context.lineTo(x + wave, y);
    }
    context.stroke();
  }
  context.globalAlpha = 0.35;
  context.fillStyle = '#8a6a4b';
  for (let plank = 1; plank < PLANK_TONES.length; plank += 1) {
    context.fillRect(plank * plankWidth - 0.5, 0, 1, size);
  }
  context.fillRect(0, 0, 1, size);
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createBackdropTexture() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return makeDataTexture({ r: 216, g: 205, b: 190 });
  }

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return makeDataTexture({ r: 216, g: 205, b: 190 });

  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#eee8de');
  gradient.addColorStop(0.58, '#ddd2c3');
  gradient.addColorStop(1, '#c9b8a1');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createKitchenMaterials() {
  const woodTexture = createWoodTexture();
  const backdropTexture = createBackdropTexture();
  return {
    woodTexture,
    backdropTexture,
    backdrop: new THREE.MeshBasicMaterial({ map: backdropTexture, fog: false }),
    counter: new THREE.MeshStandardMaterial({ map: woodTexture, color: 0xffffff, roughness: 0.8 }),
    board: new THREE.MeshStandardMaterial({ color: 0xe9c58f, roughness: 0.68 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xfff8e9, roughness: 0.42 }),
    ceramicAccent: new THREE.MeshStandardMaterial({ color: 0x315f68, roughness: 0.44 }),
    rice: new THREE.MeshStandardMaterial({ color: 0xfffdf3, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc9d0d2, metalness: 0.62, roughness: 0.28 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x65402d, roughness: 0.62 }),
    natto: new THREE.MeshStandardMaterial({ color: 0x9b5e2f, roughness: 0.72 }),
    onion: new THREE.MeshStandardMaterial({ color: 0x76ad45, roughness: 0.76 }),
    mustard: new THREE.MeshStandardMaterial({ color: 0xe4b72f, roughness: 0.7 }),
    soy: new THREE.MeshStandardMaterial({ color: 0x4b2417, roughness: 0.55 }),
  };
}

export function disposeKitchenMaterials(materials) {
  const disposed = new Set();
  for (const value of Object.values(materials ?? {})) {
    if (!value || disposed.has(value)) continue;
    disposed.add(value);
    value.dispose?.();
  }
}
