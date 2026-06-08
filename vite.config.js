import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
  },
  esbuild: {
    target: 'es2019',
  },
})
