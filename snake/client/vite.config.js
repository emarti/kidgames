import { defineConfig } from 'vite'

export default defineConfig({
  base: '/snake/',       // important for hosting under /snake/ :contentReference[oaicite:1]{index=1}
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})