import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Produces a single self-contained index.html (JS, CSS and fonts all inlined)
// so the app can be published as a shareable web link (e.g. a Claude Artifact).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-artifact',
    assetsInlineLimit: 100 * 1000,
    cssCodeSplit: false,
    target: 'esnext',
  },
})
