/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works on GitHub Pages (served from /pulse/) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
})
