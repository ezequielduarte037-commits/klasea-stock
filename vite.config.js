import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { writeFileSync } from 'node:fs'
import process from 'node:process'

function buildVersionPlugin() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || `${Date.now()}`

  return {
    name: 'klasea-build-version',
    closeBundle() {
      writeFileSync(
        'dist/version.json',
        JSON.stringify({ buildId, builtAt: new Date().toISOString() }),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Los PDA de pañol traen un Chrome viejo (~60-75) que no entiende sintaxis
  // moderna (?., ??, class fields). Bajamos el target para que se transpile
  // y la app cargue en esos navegadores. Coincide con esbuild (minify por defecto).
  build: {
    target: ['es2019', 'chrome61', 'safari12'],
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Separar las librerías pesadas en chunks propios: baja el bundle
        // principal y se cachean aparte (la mayoría de las pantallas no las usan).
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          charts: ['recharts'],
          pdf: ['jspdf', 'jspdf-autotable', 'html2canvas'],
          maps: ['leaflet', 'react-leaflet'],
          editor: ['react-quill-new'],
          sheets: ['xlsx'],
        },
      },
    },
  },
  esbuild: {
    target: 'es2019',
  },
})
