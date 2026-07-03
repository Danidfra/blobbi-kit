import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@blobbi\/core$/, replacement: r('./packages/blobbi-core/src/index.ts') },
      { find: /^@blobbi\/core\/(.*)$/, replacement: r('./packages/blobbi-core/src') + '/$1' },
      { find: /^@blobbi\/react$/, replacement: r('./packages/blobbi-react/src/index.ts') },
      { find: /^@blobbi\/react\/(.*)$/, replacement: r('./packages/blobbi-react/src') + '/$1' },
    ],
  },
  test: {
    // jsdom for the browser-only @blobbi/react hook tests; core tests are DOM-free
    // but jsdom is a harmless superset for them.
    environment: 'jsdom',
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
  },
});
