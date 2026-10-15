/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { assetsDir: 'static' },
  optimizeDeps: {
    include: ['react', 'react-dom/client', '@tanstack/react-query', 'axios', 'pixi.js', 'msw', 'msw/browser'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
