# Lote 01 · Pañol — Recepción

Estado: en curso

## Hecho

- **Recepción (`RecepcionPanolScreen`)**
  - El encabezado estaba armado a mano (ícono propio, título de 19 px y una bajada en mayúsculas con letter-spacing grande) → pasó a `PageHeader` con eyebrow "Pañol", título y bajada normales.
  - Las pestañas eran dos botones más un `<select>` de "Más operaciones" que en el celular no se distinguía de un filtro → ahora hay una fila de pestañas que se desliza (`.rp-tabs`) y un menú "Más" ubicado con `position: fixed` calculado desde el botón, al estilo de `ComprasTabs`. Las cuatro solapas escondidas (Archivo, Ingreso directo, Consumibles, Crear producto) muestran su explicación corta.
  - La fila de cinco tarjetas de KPI repetía números que ya estaban en los filtros y empujaba la lista fuera de la pantalla → los estados pasaron a chips de filtro con su cuenta al lado, y las novedades quedaron como un chip rojo. El cartel violeta de "hay N pendientes", que hacía lo mismo que el filtro, se fue.
  - Colores fijos de `panolApi` (`#67e8f9`, `#34d399`, `#a78bfa`, `#f87171`, `#9ca3af`) usados con concatenación de transparencia (`${color}14`, `${color}3d`) → tabla local `ENVIO_TONO` / `ITEM_TONO` con tokens (`C.cyan`, `C.cyanL`, `C.cyanB`, etc.). Las funciones `softBgFor`/`softBorderFor`, que existían sólo para esa concatenación, ya no hacen falta.
  - Buscador y selects: clases `ui-input`; botones `ui-btn`. "Cargando pedidos..." suelto → `<Cargando llenar />`. El vacío hecho a mano → `EmptyState`.
  - Rótulos en mayúsculas: 11 px, peso 600, letter-spacing .07em.

- **Detalle del pedido (`PanolEnvioDetail`)**
  - Encabezado propio con siete botones sueltos → `PageHeader` con las acciones (`Volver`, estado, `Ingresar todo a pañol`, `Imprimir`, `Reactivar`, `Cerrar`, `Cancelar`, `Borrar`) como `ui-btn`, y las cuatro estadísticas en la segunda fila.
  - `StatusChip`, `EnvioStatusChip`, `HeaderStat` y la barra de avance tomaban los colores fijos del meta de `panolApi` → tokens. `#04231a` del botón verde → `var(--inverse-text)`.
  - "Cargando pedido..." → `<Cargando llenar />`. Los filtros de estado usan `ui-chip`.

- **Calibrar pesos (`CalibrarPesosScreen`)**
  - La raíz era `minHeight: 100vh` con padding propio → ahora llena `.ka-shell-content` con `position: absolute` y scrollea adentro.
  - Encabezado a mano → `PageHeader`. `rgba(139,92,246,…)`, `rgba(34,197,94,0.08)`, `rgba(239,68,68,0.08)`, `rgba(59,130,246,0.10)` y `rgba(34,211,238,0.10)` → tokens. El chip "PENDIENTE" en violeta sobre fondo cian (venía de un reemplazo del ámbar) quedó coherente en violeta.
  - "Cargando…" suelto → `<Cargando />`. Botones y campos con clases `ui-`. Blancos táctiles de 44 px en la lista y en los botones de acción. El emoji 🎉 del vacío se fue.

- **Ingreso de materiales (`EnviarAPanolModal`)**
  - Los colores por zona del plano SVG del pañol eran doce hexadecimales de otra paleta (incluía `#84cc16` y `#f97316`, verdes amarillentos y naranjas) → pasaron a los hexadecimales de la paleta de la marca. Siguen fijos porque van en atributos de SVG, donde `var()` no resuelve.
  - La "x" de cerrar era una letra minúscula → botón `ui-btn-fantasma` con el ícono `X`. "Cargando avisos..." → `<Cargando compacto />`. Rótulos de 9,5–10,5 px en peso 650–700 → 11 px, peso 600.

- **Escanear remitos (`ScannerRemitosTab`)**: el hover de los botones se marcaba con `opacity` → se mantiene el color y se apaga sólo cuando están deshabilitados.

- **Archivo de remitos (`RemitosArchivoTab`)**: el `<style>` sin `href` se insertaba una vez por instancia → `<style href precedence>`; `rgba(15,23,42,…)` de la sombra y del fondo del modal → `var(--shadow)` y `var(--overlay-strong)`. Las dos filas de filtros (vista y estado) se apilaban en el celular → una sola fila que se desliza. El bloque de carga con `LoaderCircle` → `<Cargando />`.

- **Consumibles (`ConsumiblesPanolTab`)**: "Cargando consumibles..." y "Buscando..." → `<Cargando />`; `#fff` del botón primario → `var(--inverse-text)`; botones de 38 px de alto; la fila de cuatro indicadores se desliza en el celular.

- **Crear producto (`CrearProductoTab`)**: los dos botones del pie y el de "Crear igualmente" estaban dibujados a mano con `opacity` para el estado deshabilitado → `ui-btn`.

- **Antes de escanear (`AntesDeEscanearModal`)**: `rgba(15,23,42,0.55)` → `var(--overlay-strong)`; en ≤ 899 px es hoja inferior.

- **Destinos (`SelectorDestinosRemito`, `DestinosDeRemito`)**: rótulos de 10 px peso 700 → 11 px peso 600; el "Cargando…" del buscador de barcos → `<Cargando compacto />`.

## Verificado

- `node scripts/comparar-lint.mjs` con los once archivos del lote: "Sin errores nuevos respecto de HEAD".
- `npm run build`: sale bien (16,9 s, sin advertencias nuevas).

## Sin verificar

- **La revisión en el navegador está pendiente.** El servidor de desarrollo quedó levantado, pero `/recepcion-panol` redirige al login y la sesión la tiene que iniciar el usuario. Falta mirar a 1280 px y 390 px, en tema oscuro y claro, y abrir en el celular: el menú "Más" de las pestañas, el modal de ingreso, el de "antes de escanear" y los filtros del archivo de remitos.
- Falta comprobar que en el celular `.ka-shell-content` no tenga scroll horizontal.
- Los puertos 5173 y 5174 ya estaban ocupados cuando se levantó el servidor: hay otros agentes trabajando en paralelo.

## Para coordinar

- `ITEM_ESTADO_META` y `ENVIO_ESTADO_META` viven en `panol/panolApi.js` (archivo de datos, que esta tarea no toca) y traen colores fijos que no funcionan bien en tema claro. Por ahora cada pantalla del lote los traduce a tokens con una tabla propia. Los lotes 2 y 3 usan los mismos metadatos: convendría que alguien pase esos colores a tokens en un solo lugar, o que se acuerde dónde vive la traducción.
- `EnviarAPanolModal` es de este lote pero lo abren Compras y Materiales: no cambiaron sus props ni lo que exporta, sólo el aspecto del encabezado, el botón de cerrar y el plano del pañol.

## Lógica o datos para revisar

- En Recepción, `PRIO_META.alta` y `PRIO_META.urgente` se pintan con violeta y rojo, pero la prioridad "media" usa el mismo azul que la acción principal: en la lista cuesta distinguir prioridad de estado. Es una decisión de producto, no la cambié.
- `softBgFor`/`softBorderFor` (eliminadas) tenían la rama `color === C.violet` repetida dos veces; la segunda nunca se ejecutaba. No cambiaba el resultado.
- El plano del pañol de `EnviarAPanolModal` asigna un color por letra inicial de la estantería con una cadena de doce ternarios. Si esa correspondencia significa algo para el pañol (zonas reales), conviene que salga de `panolLayout` y no del componente.
