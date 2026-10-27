import { stat } from 'node:fs/promises';

const files = [
  '../dist/esm/index.js',
  '../dist/esm/cli.js',
  '../dist/cjs/index.cjs',
];
const sizes = await Promise.all(files.map(async (file) => (await stat(new URL(file, import.meta.url))).size));
const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
const limitBytes = 50_000;

if (totalBytes > limitBytes) {
  throw new Error(`Built JavaScript is ${totalBytes} bytes; limit is ${limitBytes} bytes.`);
}

process.stdout.write(`Built JavaScript size: ${totalBytes} / ${limitBytes} bytes.\n`);
