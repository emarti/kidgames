import { defineConfig } from 'vite'

export default defineConfig({
  // Build-time base path. For production we set this to "/games/wallmover/".
  // For local dev, defaulting to "/" keeps Vite/HMR happy.
  base: process.env.VITE_BASE ?? '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
