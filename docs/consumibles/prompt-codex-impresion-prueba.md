Trabajás en C:\klasea-stock (React + Vite + Supabase): el módulo Consumibles del pañol. La pestaña Etiquetas arma etiquetas de estante con nombre, código de Rebollar, QR y Code128. Acabo de conectar por USB una impresora térmica de etiquetas a esta PC y el rollo es de 40 × 30 mm. Quiero una prueba de punta a punta con 5 etiquetas de productos que realmente salieron del pañol.

Importante antes de empezar:
- En src/features/consumibles/etiquetas/ hay cambios sin commitear: el formato «Térmica 40 × 30» (etiquetasCore.js, EtiquetasVista.jsx, EtiquetasTab.jsx y la prueba). No los reviertas ni los modifiques, no commitees y no hagas push.
- No escribas nada en la base, no instales ni descargues programas o drivers, y no cambies la impresora predeterminada ni las preferencias de la impresora sin preguntarme antes.
- Tus archivos de trabajo van en outputs/etiquetas-prueba-2026-10-14/ (fuera de src/).

1. Detectá la impresora (solo lectura) y contame qué ves antes de seguir
   - Get-Printer, Get-PrinterDriver, Get-PrinterPort, Get-PnpDevice -PresentOnly (clases Printer y USB) y, con System.Drawing.Printing.PrinterSettings, los tamaños de papel y las resoluciones que declara.
   - Decime: nombre, marca/modelo, driver (si es el del fabricante o uno genérico tipo «Generic / Text Only»), puerto (USB00x), estado, resolución (203 o 300 ppp), si ya tiene un papel de 40 × 30 y, si se puede deducir, qué lenguaje habla (TSPL, ZPL, EPL o ESC/POS).
   - Si no aparece o no tiene driver, pará y decime qué falta.

2. Elegí 5 productos que realmente se egresaron
   - Consultá en modo lectura con `npx supabase db query --linked -o json -f <archivo.sql>` (el proyecto ya está vinculado; nunca `db push`).
   - Criterio: filas de `public.consumibles_movimientos` con `tipo = 'retiro'` y `anulado_at is null` (incluye retiros del mostrador y los de solicitudes ya entregadas, `origen` 'mostrador' o 'solicitud'), unidas a `public.consumibles_config` con `codigo_etiqueta` no nulo y a `public.panol_materiales` activo. Cinco productos distintos, los más recientes primero.
   - Si alguno de los egresados tiene un código de 10 caracteres, incluilo: es el caso más exigente para el ancho de las barras.
   - Mostrame la lista (código, nombre, cantidad de retiros, último retiro) antes de imprimir.

3. Armá las etiquetas exactamente como las imprime la app
   - No redibujes el diseño a mano. Renderizá el componente `PaginaEtiquetas` de src/features/consumibles/etiquetas/EtiquetasVista.jsx con `FORMATOS.termica` y `contenidoEtiqueta` de etiquetasCore.js, usando react-dom/server. Para el JSX alcanza con esbuild, que ya está en node_modules (viene con vite).
   - Cada ítem tiene que tener la forma que arma `fetchCatalogo` en src/features/consumibles/api.js: `{ id, descripcion, alias, codigoEtiqueta, config: { proveedor_codigo, proveedor_nombre }, unidad, ubicacion, rubro }`, con `unidad = consumibles_config.unidad_entrega ?? panol_materiales.unidad_medida ?? 'unidad'`.
   - El HTML lleva una página por etiqueta con `@page { size: 40mm 30mm; margin: 0 }` y las fuentes Outfit y JetBrains Mono del mismo link de Google Fonts que index.html. Esperá a que carguen.
   - Generá el PDF con Edge o Chrome headless (`--print-to-pdf --no-pdf-header-footer`) y verificá que tenga 5 páginas de 40 × 30 mm. Sacá también un PNG de cada una y mostrámelos.
   - Antes de imprimir corré `node --test src/features/consumibles/etiquetas/etiquetasCore.test.mjs`. Tiene que pasar entero.

4. Imprimí: primero una sola
   - Mandá a la impresora nombrada explícitamente (no a la predeterminada) a tamaño real, escala 100 % y sin «ajustar a la página».
   - Preferí el driver de Windows: por ejemplo, PrintDocument de .NET con papel personalizado de 40 × 30 mm (157 × 118 centésimas de pulgada), márgenes 0 y la etiqueta rasterizada a la resolución real de la impresora (a 203 ppp son 320 × 240 px) sin reescalar. Si el driver es genérico de texto y la impresora habla TSPL o ZPL, podés mandar el bitmap en crudo. Decime qué camino usaste y por qué.
   - Imprimí una sola y preguntame cómo salió: centrada, sin cortes, sin etiquetas en blanco entre medio. Recién con mi OK mandá las otras 4.
   - Si salen corridas, cortadas o gasta etiquetas en blanco, pará y proponé el ajuste (calibrar el sensor de separación, tipo de papel «con separación/gap», tamaño en el driver, desplazamiento) antes de reintentar.

5. Lectura
   - Yo paso el lector por las barras y por el QR de cada etiqueta en el campo de la pestaña Etiquetas → Prueba de la app, que me dice si el código existe. Recordámelo al final con la lista de los 5 códigos esperados.

6. Al terminar, contame
   - La impresora y cómo quedó configurada.
   - El camino de impresión que funcionó.
   - Qué tengo que elegir en el diálogo de impresión del navegador para imprimir desde la app todos los días: impresora, papel 40 × 30, márgenes «Ninguno», escala 100 % y cualquier opción del driver que haya hecho falta.
   - Cualquier problema que viste.
   Estas etiquetas de prueba no quedan marcadas como «impresas» en la app (esa marca es por navegador) y está bien así.
