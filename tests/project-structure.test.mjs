import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('project pins Three.js and exposes the required local workflows', async () => {
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.devDependencies?.three, '0.186.0');
  assert.equal(typeof packageJson.scripts?.test, 'string');
  assert.equal(typeof packageJson.scripts?.start, 'string');
  assert.equal(typeof packageJson.scripts?.['vendor:sync'], 'string');
});

test('application shell uses Japanese metadata and only local runtime URLs', async () => {
  const html = await read('index.html');

  assert.match(html, /<html[^>]+lang=["']ja["']/i);
  assert.match(html, /<title>[^<]*納豆[^<]*<\/title>/i);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i);
  assert.match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/wataryuu\.com\/natto\/["']/i);

  const importMapMatch = html.match(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(importMapMatch, 'index.html must contain an import map');
  const importMap = JSON.parse(importMapMatch[1]);
  assert.equal(importMap.imports?.three, './vendor/three/three.module.js');

  const runtimeUrls = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
    ...Object.values(importMap.imports ?? {}).map((url) => [null, url]),
  ].map((match) => match[1]);
  assert.equal(runtimeUrls.some((url) => /^https?:\/\//i.test(url)), false);
});

test('every local shell reference resolves to a file', async () => {
  const html = await read('index.html');
  const importMapMatch = html.match(/<script[^>]+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(importMapMatch, 'index.html must contain an import map');
  const importMap = JSON.parse(importMapMatch[1]);
  const references = [
    ...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi),
  ].map((match) => match[1]).concat(Object.values(importMap.imports ?? {}));
  const localReferences = references.filter((reference) =>
    !/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)
  );

  await Promise.all(localReferences.map(async (reference) => {
    const cleanPath = reference.split(/[?#]/, 1)[0];
    await access(path.resolve(root, cleanPath));
  }));
});

test('license page credits Three.js and links its vendored license', async () => {
  const html = await read('licenses.html');

  assert.match(html, /Three\.js/i);
  assert.match(html, /href=["']\.\/vendor\/three\/LICENSE["']/i);
});
