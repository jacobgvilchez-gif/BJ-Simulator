import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any static host or file path.
  base: './',
  test: {
    // The engine is UI-free, so its suite needs no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
