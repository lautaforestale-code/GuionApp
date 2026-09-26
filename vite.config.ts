import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base matches the GitHub Pages project URL (username.github.io/GuionApp/)
export default defineConfig({
  base: '/GuionApp/',
  plugins: [react()],
})
