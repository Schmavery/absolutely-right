/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { yamlPlugin } from './vite/yaml-plugin';

export default defineConfig({
  // Set via the GitHub Pages workflow so assets resolve under
  // https://<user>.github.io/<repo>/. Defaults to '/' for local dev.
  base: process.env.BASE_PATH || '/',
  plugins: [yamlPlugin(), react(), tailwindcss()],
  worker: {
    format: 'es',
    plugins: () => [yamlPlugin()],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './data'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    /** Hard cap: no test may run longer than 2 minutes. */
    testTimeout: 120_000,
    hookTimeout: 30_000,
    slowTestThreshold: 5_000,
  },
});
