/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaServiceWorkerPlugin } from './build/pwaServiceWorker';

const repoFromEnv = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  plugins: [react(), pwaServiceWorkerPlugin()],
  base: repoFromEnv ? `/${repoFromEnv}/` : '/',
  assetsInclude: ['**/*.md'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-geometry': ['clipper2-ts', 'polygon-clipping'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  },
});
