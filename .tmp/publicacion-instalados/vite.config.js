import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'

function buildVersionPlugin(buildId) {
  return {
    name: 'klasea-build-version',
    apply: 'build',
    generateBundle() {
      // Rollup escribe este asset junto con el resto del build. Antes se usaba
      // writeFileSync('dist/version.json') en closeBundle, que dependía de que
      // esa carpeta ya existiera y por eso fallaba en un checkout limpio de
      // Vercel con ENOENT.
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId, builtAt: new Date().toISOString() }),
      })
    },
  }
}

// Recarga la página entera ante cualquier cambio, en vez de parchear el módulo.
//
// Para qué: cuando un hot update falla (típico en medio de un refactor de varios
// archivos, donde un módulo importa algo que todavía no existe), Vite abandona
// ese módulo y la pantalla queda congelada en la versión vieja — y no se
// descongela sola ni cuando el código ya quedó bien. Con esto, cada guardado
// recarga y siempre ves el estado real: o el cambio aplicado, o el overlay de
// error diciendo qué falta.
//
// Se activa poniendo KLASEA_RECARGA_TOTAL=1 en .env.local. Cuesta el estado de
// React en cada guardado (modales abiertos, formularios a medio llenar), así que
// conviene dejarlo prendido sólo mientras se mira trabajar, y apagarlo para
// desarrollar a mano.
function recargaTotalPlugin() {
  return {
    name: 'klasea-recarga-total',
    apply: 'serve',
    handleHotUpdate({ server }) {
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const recargaTotal = env.KLASEA_RECARGA_TOTAL === '1'
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || `${Date.now()}`

  return {
  plugins: [react(), buildVersionPlugin(buildId), ...(recargaTotal ? [recargaTotalPlugin()] : [])],
  define: {
    'import.meta.env.VITE_KLASEA_BUILD_ID': JSON.stringify(buildId),
  },
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
  }
})
