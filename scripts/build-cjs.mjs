import { chmod, copyFile, rename } from 'node:fs/promises';

await rename(new URL('../dist/cjs/index.js', import.meta.url), new URL('../dist/cjs/index.cjs', import.meta.url));
await copyFile(new URL('../dist/esm/index.d.ts', import.meta.url), new URL('../dist/cjs/index.d.cts', import.meta.url));
await chmod(new URL('../dist/esm/cli.js', import.meta.url), 0o755);
