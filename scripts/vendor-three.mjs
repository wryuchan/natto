import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', 'three');
const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const expectedVersion = '0.186.0';

if (metadata.version !== expectedVersion) {
  throw new Error(`Expected Three.js ${expectedVersion}, found ${metadata.version}`);
}

const outputDirectory = path.join(root, 'vendor', 'three');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  copyFile(path.join(packageRoot, 'build', 'three.module.js'), path.join(outputDirectory, 'three.module.js')),
  copyFile(path.join(packageRoot, 'LICENSE'), path.join(outputDirectory, 'LICENSE')),
]);

console.log(`Vendored Three.js ${metadata.version}`);

