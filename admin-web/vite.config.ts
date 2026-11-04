import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// One id per deploy: baked into the bundle and published as /version.json,
// so an open tab can tell it's running an older build (UpdateNotice).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
  },
});
