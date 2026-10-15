import { defineConfig } from '@playwright/test';

const PORT = 4174;

/** Profiling run (`npm run perf`): production build, real clock, hardware GPU when available. */
export default defineConfig({
  testDir: './perf',
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: ['--js-flags=--expose-gc', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-precise-memory-info'],
    },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
