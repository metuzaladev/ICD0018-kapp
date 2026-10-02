/**
 * Production build (M8): bundles the API's own code and @kapp/shared into dist/ with esbuild.
 *
 * Why a bundle instead of `tsc` or running tsx in production:
 * - the code uses extensionless imports (moduleResolution "Bundler") and @kapp/shared ships
 *   TypeScript source; plain `tsc` output would not run in Node without rewriting every import;
 * - tsx would put a TypeScript compiler in the runtime image and compile on every start (slower
 *   cold starts, bigger attack surface, a dev dependency in production);
 * - npm dependencies stay external and are installed with `npm ci --omit=dev`, so native packages
 *   (sharp) get the right binaries for the container's platform.
 * Type checking is not part of the build — `npm run typecheck` does that in CI.
 */
import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// Workspace packages are bundled (they are TypeScript source); everything else is external.
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@kapp/'));

await build({
  entryPoints: { index: 'src/index.ts', migrate: 'src/db/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // Subpath imports (drizzle-orm/node-postgres, better-auth/api) are external too.
  external: external.flatMap((name) => [name, `${name}/*`]),
  sourcemap: true,
  logLevel: 'info',
});
