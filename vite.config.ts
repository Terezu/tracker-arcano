import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { offlinePlugin } from './build/offline-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlinePlugin()],
  build: { rolldownOptions: { input: { app: resolve('index.html'), marcador: resolve('marcador.html') } } },
})
