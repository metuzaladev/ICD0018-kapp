import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's pure logic (lib/*). They run in Node, not on a device, so native
 * modules (expo-haptics, AsyncStorage) are replaced with vi.mock in each test and the tested
 * modules must not import react-native at the top level. Screens are verified on the simulator
 * (docs/14-animatsioonid-ja-ligipaasetavus.md).
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __DEV__: 'false' },
  test: { include: ['test/**/*.test.ts'] },
});
