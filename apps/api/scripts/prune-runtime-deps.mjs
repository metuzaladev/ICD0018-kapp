/**
 * Runs in the Docker prod-deps stage after `npm ci --workspace @kapp/api --omit=dev` (M8) and
 * removes every installed package the API cannot reach at runtime.
 *
 * Why `--omit=dev` alone is not enough in this monorepo (measured: 273 MB → ~150 MB node_modules):
 * - better-auth declares drizzle-kit, vitest, … as *optional peer* dependencies. They are dev
 *   dependencies here, so npm marks them `devOptional`, and `--omit=dev` keeps devOptional packages
 *   (only `--omit=optional` would drop them, and that would also drop sharp's native binaries);
 * - the lockfile is shared with the Expo app, and some of its production packages (lightningcss)
 *   are installed even with `--workspace`.
 *
 * How: walk the dependency graph from apps/api/package.json using Node's resolution rules on the
 * lockfile paths (nearest node_modules first), following dependencies, optionalDependencies and
 * non-optional peers. Anything not reached is deleted. The API's bundle (scripts/build.mjs) imports
 * only declared dependencies; CI starts the image and checks /health, which would fail if something
 * needed were removed.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';

const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));

/**
 * Node resolution over lockfile paths: from the package at `fromPath`, the nearest installed
 * `name`. `node_modules/a/node_modules/b` looks in its own node_modules, then
 * `node_modules/a/node_modules`, then the root; a workspace (`apps/api`) in its own, then the root.
 */
function resolve(fromPath, name) {
  let dir = fromPath;
  while (dir) {
    const candidate = `${dir}/node_modules/${name}`;
    if (packages[candidate] && existsSync(candidate)) return candidate;
    const parent = dir.lastIndexOf('/node_modules/');
    dir = parent === -1 ? '' : dir.slice(0, parent);
  }
  const root = `node_modules/${name}`;
  return packages[root] && existsSync(root) ? root : null;
}

const reachable = new Set();
const queue = ['apps/api'];
while (queue.length > 0) {
  const path = queue.pop();
  if (reachable.has(path)) continue;
  reachable.add(path);
  const meta = packages[path] ?? {};
  const target = meta.link ? meta.resolved : path; // workspace symlinks point at their folder
  if (target !== path) queue.push(target);
  const optionalPeers = meta.peerDependenciesMeta ?? {};
  const names = [
    ...Object.keys(meta.dependencies ?? {}),
    ...Object.keys(meta.optionalDependencies ?? {}),
    ...Object.keys(meta.peerDependencies ?? {}).filter((n) => !optionalPeers[n]?.optional),
  ];
  for (const name of names) {
    const found = resolve(target, name);
    if (found) queue.push(found);
  }
}

let removed = 0;
for (const path of Object.keys(packages)) {
  if (!path.includes('node_modules/') || reachable.has(path) || !existsSync(path)) continue;
  // A nested package inside a removed one disappears with its parent.
  rmSync(path, { recursive: true, force: true });
  removed++;
}
console.log(`kept ${reachable.size} packages, removed ${removed} the API never loads`);
