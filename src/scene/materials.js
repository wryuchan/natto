import * as THREE from 'three';

function makeDataTexture(color) {
  const data = new Uint8Array([color.r, color.g, color.b, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createWoodTexture() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return makeDataTexture({ r: 174, g: 119, b: 74 });
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return makeDataTexture({ r: 174, g: 119, b: 74 });

  const gradient = context.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, '#c78d58');
  gradient.addColorStop(0.5, '#ad7044');
  gradient.addColorStop(1, '#d49b63');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  context.globalAlpha = 0.22;
  context.strokeStyle = '#704428';
  context.lineWidth = 2;
  for (let y = 12; y < 256; y += 18) {
    context.beginPath();
    for (let x = 0; x <= 256; x += 8) {
      const wave = Math.sin((x + y) * 0.065) * 3;
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

export function createKitchenMaterials() {
  const woodTexture = createWoodTexture();
  return {
    woodTexture,
    counter: new THREE.MeshStandardMaterial({ map: woodTexture, color: 0xf2d0a2, roughness: 0.78 }),
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

