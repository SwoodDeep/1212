import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true, strictPort: true },
  preview: { port: 4173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
    outDir: 'dist'
  }
});
