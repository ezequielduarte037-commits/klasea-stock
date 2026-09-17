# Lote 02 · Pañol — Stock y egresos

Estado: listo

## Hecho

- **Stock de pañol (`StockPanolScreen`)**: el encabezado estaba armado a mano (ícono de 27 px, título y bajada en la misma línea, bajada en mayúsculas monoespaciadas) → ahora usa `PageHeader` con eyebrow "Pañol", y las cuatro pestañas más el conmutador Lista/Mapa viven en su segunda fila. Las pestañas pasaron a `ui-tabs`/`ui-tab`; el bloque quedó en un solo componente (`StockPanolTabs`) que sirve tanto para la pantalla completa como para el modo embebido.
- El botón Actualizar iba en `actions` de `PageHeader`: en el celular bajaba a un renglón solo. Pasó a la misma fila que las pestañas (junto a Lista/Mapa).
- Degradados fijos de las tarjetas de línea y de obra (`#34d399`, `#10b981`, `#60a5fa`, `#3b82f6`, `#a78bfa`, `#f87171`) → tokens planos (`C.green`, `C.blue`, `C.violet`, `C.red`) y fondos con `var(--*-soft)`. En tema claro los degradés se leían lavados.
- Chips de estado de obra: `${color}33` / `${color}11` → `color-mix` sobre el token, y peso 700 → 600.
- El `<style>` de la pantalla tenía selectores sin ámbito (`.stock-primary-tab:focus-visible`, etc.) → todos bajo `.stock-panol-root`.
- "Cargando obras…" suelto → `<Cargando compacto />`. Overlay del modal de barco externo: `rgba(15,23,42,0.48)` → `var(--overlay)`.
- **Stock maestro (`StockWmsPanel`)**: pesos 750 en textos chicos bajados a 700/600 donde era rótulo; rótulo de los filtros (`SelectFilter`) pasó de 9 px/700/uppercase a 11 px/600 con letter-spacing .06em.
- La cabecera del carrito era verde `#059669` con texto blanco y botones semitransparentes → panel con `--green-soft`, ícono en verde del token y botones `ui-btn`. El botón de confirmar usaba `#059669`/`#2563eb` con sombra de color → tokens y clases `ui-btn`.
- Las dos bandas de chips (señales de inventario y niveles de stock) ahora son una sola fila que se desliza en el celular (`.stock-wms-chips`, con fundido en los bordes) en lugar de apilarse.
- `<style>` de la pantalla con ámbito `.stock-wms-root`; el panel quedó envuelto en ese contenedor (mismo layout: columna que llena y scrollea adentro).
- "Cargando movimientos..." → `<Cargando />`; "Registrando...", "Cargando..." con puntos ASCII → elipsis tipográfica.
- Chips de variante con `rgba(139,92,246,…)` → `C.violetL` / `C.violetB`.
- **Mapa del pañol (`MapaPanolTab`)**: el destacado de una estantería encontrada latía en loop (`mapaPulse`) y el aviso de "afuera del pañol" también (`afueraLatido`) → el destacado ahora es un borde cian más grueso y fijo, y el aviso es un chip con color de token. Se quitó el `@keyframes spin` sin uso y se renombraron `fadeIn`/`slideInRight` a `mapaFadeIn`/`mapaSlideInRight` (eran nombres globales que se pisaban con otras pantallas).
- Colores fijos del mapa: `#22d3ee`, `rgba(34,211,238,0.5)`, `#155e75`, `#0e7490` → `var(--cyan)` y `var(--cyan-soft)`; el vacío "¿Ves el material en el estante?" estaba en ámbar (`#f59e0b10`, `#f59e0b40`, `#f59e0b20`) con texto celeste → cian, que es el color de "atención" del sistema. `#fff` del badge → `var(--panel-solid)`; overlay y sombra del panel lateral → `var(--overlay)` y `var(--shadow)`.
- "Cargando el plano..." → `<Cargando />`. El `<style>` quedó bajo `.mapa-panol-root`.
- **Devoluciones (`DevolucionesPanel`)**: rótulos en mayúsculas de 10 px/700 → 11 px/600 con letter-spacing .07em; overlay del modal → `var(--overlay)`; los dos "Cargando…" sueltos → `<Cargando />`.
- **Estandarización (`NormalizacionIngresosPanel`)**: la barra de línea, obra, chips y buscador se apilaba en varios renglones en el celular → una sola fila que se desliza (`.norm-toolbar`). "Buscando ingresos para revisar…" → `<Cargando />`.
- **Pulso de retiros (`PanolRetirosDashboard`)**: pesos 750 → 700 y 700 → 600 en las etiquetas de los KPI.
- **Sobrantes de obra (`SobrantesObraScreen`)**: el detalle tenía encabezado propio con `<h1>` (18/21 px) y la lista otro con `<h1>` de peso 750 → el detalle usa `PageHeader` y sus botones pasaron a `ui-btn`. Los chips de estado bajaron de 700 a 600. Los filtros "Por revisar / Cerradas / Todas" ahora se deslizan en una fila en el celular. Los dos "Cargando…" sueltos → `<Cargando />`. El `<style>` ya estaba con ámbito `.sob-screen`; se le sumó `.sob-filtros`.
- **Egreso de consumibles (`EgresoConsumiblesScreen`)**: encabezado a mano → `PageHeader` (el conmutador Sale/Entra y el botón de actualizar quedaron como acciones). Se quitó la animación infinita del ícono NFC (`caja-late`); el `<style>` pasó a `.caja-root` y ahí se define el giro del `LoaderCircle`, que antes usaba una clase `.spin` que esta pantalla nunca declaró. Rótulos en mayúsculas a 11 px/600. Aparece `<Cargando />` mientras abre la caja.
- **Pantalla de egreso en la TV (`PantallaEgresoScreen`)**: los rótulos chicos estaban en peso 750 con letter-spacing 1.1 px → 600 y .07em. El resto (tamaños grandes para leer de lejos) se mantiene.
- **Escáner (`BarcodeScanner`)**: overlay `rgba(0,0,0,0.72)` → `var(--overlay-strong)`; botones "Usar" y cerrar y el campo manual pasaron a `ui-btn` / `ui-input`. No cambian props ni comportamiento (lo usan también Recepción y Materiales).
- **Ubicación (`UbicacionPicker`)**: el chip de "Afuera del pañol" tenía `#22d3ee` fijo → `var(--cyan)` con su `-soft` y `-border`; rótulo a 11 px/600; el botón Guardar pasó a `ui-btn ui-btn-suave` y dice "Guardando…" en vez de "...".

## Verificado

- `node scripts/comparar-lint.mjs` con los 12 archivos del lote: "Sin errores nuevos respecto de HEAD".
- `npm run build`: pasa. El primer intento falló por `panol/SelectorDestinosRemito.jsx` (lote 1, a mitad de un cambio de otro agente); al reintentar, compiló.
- **1280 oscuro**: `/stock-panol` Inventario (filtros, detalle de Acc Springlift, carrito con Guardar/Vaciar/Confirmar, chips), Por obra (lista + stock de 52-26), Mapa (KPI, plano, chips de zona, sin pulso), Movimientos/Historial, Estandarización, Devoluciones, Sobrantes (lista). `/egresos-panol` con título "Egreso de materiales". `/consumibles-caja` con PageHeader, Sale/Entra y sin latido NFC. `/sobrantes-obra/:id` (43-29) con PageHeader. `/pantalla-egreso` fuera del shell, rótulos grandes. Escáner abierto desde Inventario (overlay, Usar, campo a mano).
- **390**: Inventario, Por obra (selector a ancho completo) y consumibles. `documentElement.scrollWidth === clientWidth` (390) y `.ka-shell-content` igual. Las pestañas y los chips se deslizan; no hay scroll de página.
- **Claro**: Inventario a 390 (tokens de fondo `#f4f5f7`, texto `#111827`) y consumibles a 390. El plano SVG sigue con paleta oscura (anotado abajo).
- Tras probar el carrito se vació; el tema quedó en oscuro.

## Sin verificar

- `UbicacionPicker` no se abrió en esta pasada (el detalle del producto sí). El aspecto cambió en código; Recepción/Materiales todavía tienen que mirarlo.
- `PantallaEgresoScreen` se vio en el navegador, no en el televisor del pañol.
- Menús nativos del carrito (`window.prompt` / `window.confirm`) no se recorrieron.

## Para coordinar

- Nada pendiente en piezas compartidas: `PageHeader`, `Cargando` y las clases `ui-` alcanzaron para todo lo de este lote.
- `BarcodeScanner` y `UbicacionPicker` cambiaron de aspecto pero conservan exportaciones y props (`BarcodeScanner`: `open`, `onClose`, `onScan`; `UbicacionPicker`: `materialId`, `ubicacion`, `ubicacionObs`, `onSaved`, `toast`, `label`; `UbicacionChip`: `ubicacion`, `obs`, `size`). Los usan Recepción (lote 1) y Materiales (lote 7): conviene que esos lotes los mire una vez.
- El mapa del pañol tiene muchos colores dentro del SVG (`#cbd5e1` de las paredes, la paleta de zonas `MAPA_ZONA_COLOR`, `#0f172a` de las sombras isométricas). Se dejaron como están porque son atributos de SVG y se concatenan con transparencia; si se quiere que el plano acompañe el tema claro, hay que resolverlo aparte.

## Lógica o datos para revisar

- `StockWmsPanel` usa `window.prompt` y `window.confirm` para guardar, cargar y borrar carritos, y para vaciar después de guardar. Funciona, pero no es el `useConfirm()` del sistema y en la PDA los diálogos nativos son incómodos. No lo cambié porque toca el flujo, no el aspecto.
- El vacío del mapa ("El sistema marca 0 unidades físicas aquí") sugiere que el material puede estar en el estante sin ingreso registrado: es correcto según la regla de que sólo la recepción crea stock, pero conviene confirmar que el texto siga describiendo lo que hace hoy la pantalla.
- `MapaPanolTab` guarda la posición de una estantería (`panol_estanterias.x_cm/y_cm`) con un `update` directo desde el componente, sin RPC. Queda anotado, no se tocó.
