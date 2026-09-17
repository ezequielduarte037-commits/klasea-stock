# Lote 03 · Pañol en planta — solicitudes, tarjetas y colector (PDA)

Estado: en curso

## Hecho

### `panol/SolicitudesPanolScreen.jsx`
- Encabezado armado a mano (ícono con degradé fijo `GRAD_BLUE` + resplandor, título de 17 px en peso 750, subtítulo propio) → `PageHeader` con ícono, eyebrow "Pañol", título y subtítulo. Los KPIs y los dos botones quedaron en `actions`, así que en el celular bajan a su propio renglón deslizable en vez de apilarse. El fondo del encabezado va transparente para que se vea el resplandor de la pantalla.
- El `<style>` de la pantalla definía `.spin` y `@keyframes spin` **sin ámbito**: mientras la pantalla estaba montada le cambiaba la animación a cualquier `.spin` de la app (el menú lateral incluido). Se eliminaron; los cargadores pasaron a `<Cargando />`. `.sp-surface`, `.sp-card`, `.sp-row` y `.sp-seg` ahora cuelgan de `.sp-root`. Quedan globales a propósito `.ce-cta` y `.ce-ghost`, porque los pinta el kit de Compras por etapa (lote 8) desde componentes que también se montan en portales — ver "Para coordinar".
- Tres "Cargando…" sueltos (`<Loader2 className="spin"/>` + texto) → `<Cargando />` y `<Cargando compacto />`.
- El resplandor de fondo usaba `tint("#3b82f6", 8)`, que en tema claro daba un azul plano sobre gris → `var(--glow-a)`, que es el token pensado para eso y ya tiene su valor por tema.
- `#ef4444` en la barra de urgencia de cada tarjeta → `C.red`.
- Las cuatro `window.confirm` (deshacer retiro, borrar solicitud, enviar a pañol) → `useConfirm()`: en el celular sube como hoja inferior y el botón peligroso queda en rojo.
- Los filtros de estado se apilaban en tres o cuatro renglones en el celular → una sola fila que se desliza (`.sp-filtros`), con alto de 30 px y peso 600 en vez de 700.
- Rótulos de la tabla de ítems: 10 px / peso 700 / `letter-spacing: .6px` → 11 px / 600 / `.07em`.
- El alta ("Cargar del papel" / "Nuevo pedido") era una tarjeta centrada con sombra a mano; ahora usa `var(--elev-2)` y en ≤ 640 px sube como hoja inferior, respetando `env(safe-area-inset-bottom)`. Su CSS va con prefijo propio (`.sp-hoja*`) porque el modal vive en un portal y no puede colgar de la raíz.
- Margen lateral del contenido alineado al de `PageHeader` (16 px en el celular, 28 en escritorio).

### `panol/FotosSolicitud.jsx`
- Dos "Cargando…" sueltos que dependían del `.spin` de la pantalla padre → `<Cargando compacto />`.
- `window.confirm` de borrar una foto → `useConfirm()` en tono peligro.
- `tint("#3b82f6", 32)` → `C.blueB`.
- El modal de revisión del borrador de la IA mostraba la foto y el borrador en dos columnas fijas: en 390 px quedaban dos columnas de ~190 px. Ahora en ≤ 899 px la foto pasa arriba (máximo 34 vh) y el modal sube como hoja inferior. Las filas de ítems tenían cinco columnas fijas que dejaban el nombre en ~90 px: en ≤ 640 px la confianza baja a su propio renglón. Todo con prefijo `.fs-rev*` porque también es un portal.

### `panol/FirmaRetiroPanol.jsx`
- El "Reintentar" del lector NFC era un texto de 11 px sin borde ni alto: no era un blanco táctil. Pasó a `ui-btn ui-btn-fantasma` (38 px en escritorio, 42 en el celular).

### `panol/TarjetasNfcScreen.jsx`
- **El arco de espera no giraba.** La pantalla usaba `className="spin"` en dos lugares pero nunca definió esa clase ni su `@keyframes`: sólo se animaba si otra pantalla que sí la define estaba montada. Ahora tiene su propia `.nfc-gira` con prefijo.
- Encabezado armado a mano (72 px de alto, flecha de volver a la izquierda, título de 18 px peso 750) → `PageHeader`, con el estado del lector y el enlace al inicio de Pañol en `actions`.
- `.nfc-card` y `.nfc-btn` quedaron bajo `.nfc-root`.
- `color: "#fff"` sobre fondos `var(--blue)` y sobre el degradé violeta→azul: en tema oscuro el azul del sistema es claro (`#7eb3ff`) y el texto blanco no se leía → `var(--inverse-text)`.
- Rótulo "DNI" de 10 px / 700 / `.7px` → constante `LBL` local de 11 px / 600 / `.07em`.
- Alto mínimo de los campos 42 → 44 px y el botón de buscar 44 → 46 px, para el uso con guantes.
- `window.confirm` de desvincular la tarjeta → `useConfirm()` en tono peligro.
- Pesos 750 de los pasos → 700.

### `inventario/ColectorHomeScreen.jsx` (PDA)
- Las dos tarjetas se identificaban con emojis (📤 y 🛒): en el Android viejo del colector el emoji no siempre está en la fuente del sistema. Pasaron a `PackageMinus` y `ShoppingCart` de Lucide, dentro de un recuadro con el color de cada acción.
- `rgba(59,130,246,0.14)` y `rgba(16,185,129,0.14)` → `C.blueL` / `C.greenL`, con `C.blueB` / `C.greenB` en el borde (antes el borde era el color a saturación plena).
- El botón "Salir" medía menos de 30 px de alto: 40 px y con ícono `LogOut`.
- Peso 700 del botón de panel completo → 600.
- La tarjeta no usa `gap` (queda anotado en el comentario, para que no se cuele después).

### `inventario/ScanEgresoScreen.jsx` (PDA)
- **Usaba `gap` en flex en nueve lugares.** El colector corre Chrome ~73 y `gap` en flexbox llegó en Chrome 84: ahí los elementos aparecían pegados. Todo pasó a márgenes. El encabezado del archivo ahora lo dice, igual que ya decía lo de `inset`.
- `rgba(16,185,129,0.16)` / `rgba(239,68,68,0.16)` del cartel de aviso → `C.greenL` / `C.redL` con bordes `-border`.
- `"#3a3a3f"` del botón de confirmar deshabilitado → `C.panel2` con texto `C.dim` (en tema claro el gris oscuro fijo se veía como un botón activo).
- `color: "#fff"` sobre `C.blue` y `C.green` → `var(--inverse-text)`.
- Símbolos improvisados → Lucide: `×` de quitar → `X` en un blanco de 34 px con `aria-label`; `−` y `+` → `Minus` y `Plus`; `⚠` de "supera stock" → `AlertTriangle`; se sacó el `✓` del texto del cartel (ya es verde).
- Rótulos 10,5 px / `.8px` → 11 px / `.07em`. Los chips de personas recientes pasaron a 34 px de alto.
- Pesos 650 → 600.

### `inventario/ScanPedidoScreen.jsx` (PDA)
- `rgba(16,185,129,0.16)`, `rgba(239,68,68,0.16)`, `rgba(59,130,246,0.16)` y `rgba(34,211,238,0.10)` → `C.greenL`, `C.redL`, `C.blueL`, `C.cyanL`, con los bordes `-border` en lugar del color pleno.
- `color: "#fff"` → `var(--inverse-text)`.
- `×`, `−`, `+` y `⚠` → `X`, `Minus`, `Plus` y `AlertTriangle` de Lucide, con `aria-label`.
- Los tres botones de urgencia y los dos de pedido/aviso tenían el alto que les daba el padding: ahora 44 y 42 px fijos.
- Rótulos con `letterSpacing: 0.5` y peso 650 → `.07em` y 600. Pesos 650/700 sueltos → 600.
- Los botones "Egresar" / "Menú" y "Cancelar" comparten una constante `chico` de 32 px de alto.

### `inventario/EtiquetasScreen.jsx`
- Barra superior de 52 px con el título en peso 650 → encabezado con ícono `QrCode`, eyebrow "Pañol" y título de 17 px, sobre `var(--topbar)`.
- Botones a mano (`"#3a3a3f"` cuando estaba deshabilitado, `"#fff"` de texto) → `ui-btn ui-btn-primario` y `ui-btn ui-btn-fantasma`, con íconos `Printer` y `Home`.
- Buscador y campo de código → `ui-input`.
- `✓` de guardar el código → `Check` de Lucide en un botón de 36 px.
- `fontFamily: "'Outfit',system-ui"` a mano → `C.sans`; el código usa `C.mono` en vez de `monospace`.
- **No se tocó nada del `@media print` ni de `#labels-print`.** El `background: "#fff"` del recuadro del QR tampoco: el QR necesita fondo blanco para que el lector lo lea.

### `inventario/BalanzaDebugScreen.jsx`
- `rgba(59,130,246,0.10)`, `rgba(239,68,68,0.08)`, `rgba(34,197,94,0.07)` y `rgba(59,130,246,0.12)` → `C.blueL`, `C.redL`, `C.greenL`; el ícono del encabezado usa el degradé `blue-soft → cyan-soft` del sistema.
- `color: "#fff"` sobre `C.green` → `var(--inverse-text)`.
- Encabezado: título de 16 px peso 750 → `h1` de 20 px peso 700 con eyebrow "Pañol"; "Volver", "Desconectar", "Enviar", "Copiar" y "Limpiar" pasaron a `ui-btn`.
- Rótulos 10 px / 700 / `.6px` → 11 px / 600 / `.07em`, y el "Peso detectado" reusa la constante `LBL`.
- Los chips de DTR/RTS y de comandos comparten una constante `CHIP` de 32 px de alto y peso 600.
- Las tarjetas ahora llevan `var(--elev-1)`.

## Verificado
- `node scripts/comparar-lint.mjs` con los nueve archivos del lote → "Sin errores nuevos respecto de HEAD".
- `npm run build` → `✓ built in 19.09s`, sin errores.
- Revisión de que no queden colores fijos: los únicos `#hex` / `rgba()` que sobreviven en el lote son el CSS de impresión de `EtiquetasScreen` y el fondo blanco del QR, los dos a propósito.
- Revisión de que nada del lote siga dependiendo del `.spin` global: `SolicitudPanolPrintable` y el kit `produccion/comprasUI.jsx` no lo usan, y `MaterialPicker` define el suyo.

## Sin verificar
- **La mirada en pantalla.** El servidor de desarrollo ya corría en `localhost:5173`, pero el navegador de Cursor cae en `/login` y las contraseñas las escribe el usuario. Falta:
  - 1280 px y 390 px, en tema oscuro y claro, de `/solicitudes-panol`, `/inicio-panol/tarjetas`, `/colector`, `/scan`, `/scan-pedido`, `/etiquetas` y `/balanza`.
  - `document.querySelector('.ka-shell-content').scrollWidth - clientWidth === 0` en `/solicitudes-panol` y `/inicio-panol/tarjetas` (las otras están fuera del contenedor).
  - Abrir en el celular: el alta de solicitud, el modal de revisión de la foto con IA, el selector de material y los diálogos de confirmación nuevos.
- **La PDA real.** Los cambios de `gap` a márgenes y los íconos de Lucide no se pudieron probar en un Chrome ~73. Son cambios de color, tamaño, margen y SVG, sin `gap`, `inset`, `:where`/`:is` ni animación por JS, así que en principio son seguros, pero conviene abrir `/colector`, `/scan` y `/scan-pedido` en el aparato antes de darlos por buenos.
- `/balanza` y `/balanza/calibrar` necesitan una balanza conectada y Chrome de escritorio; sólo se revisó el estado sin conectar por lectura del código.

## Para coordinar
- `produccion/comprasTokens.js` (lote 8) exporta `LBL` con 10 px, peso 700 y `letter-spacing: .7px`. Lo usan `SolicitudesPanolScreen`, `FirmaRetiroPanol` y `FotosSolicitud`, más varias pantallas de Compras y Producción. El sistema pide 11 px, peso 600 y `.06–.08em`. No lo cambié para no tocar un archivo ajeno; conviene ajustarlo de una vez desde el lote 8, así todas las pantallas que lo usan se corrigen juntas.
- El kit `produccion/comprasUI.jsx` (lote 8) pone `className="ce-cta"` y `"ce-ghost"` en sus botones pero **no trae su propio CSS**: cada pantalla que lo usa define el hover, y lo define global (no puede colgar de la raíz, porque `MaterialPicker` y otros se montan en portales). Lo mejor sería que el kit incluya su `<style href="klasea-ce-…" precedence="default">`, como hacen las piezas de `src/components/ui/`. Mientras eso no pase, `.ce-cta` y `.ce-ghost` siguen siendo globales desde `SolicitudesPanolScreen`.
- `produccion/comprasTokens.js` también exporta `GRAD_BLUE` y `GLOW_BLUE` con hex fijos (`#3b82f6`, `rgba(37,99,235,.5)`). `SolicitudesPanolScreen` ya no los usa; si el lote 8 los reemplaza por `var(--brand-grad)` y `var(--glow-a)`, el resto de las pantallas que los importan también quedarían bien en tema claro.
- `SolicitudesPanolScreen` importa `MaterialPicker` (lote 8) y `SolicitudPanolPrintable` (para imprimir, fuera de los lotes): no los toqué. `MaterialPicker` es el buscador del catálogo que se abre con "Agregar del catálogo" y en el celular todavía habría que mirarlo.
- `TarjetasNfcScreen` usa `components/CapturaFotoModal` (pieza compartida, fuera de los lotes): sin cambios.

## Lógica o datos para revisar
- `SolicitudesPanolScreen` tiene `const puedeEditar = true; // el rol ya está filtrado por la ruta`, pero la ruta `/solicitudes-panol` deja entrar a `admin`, `oficina`, `tecnica`, `panol` y `compras`. Con eso, cualquiera de esos roles puede borrar una solicitud ajena o editar la cabecera de un pedido que no armó. Si la intención era que sólo pañol y quien la creó pudieran editar, falta la condición.
- `ScanEgresoScreen` (`/scan`), cuando la RPC `registrar_movimiento` falla, cae en un plan B que **escribe `materiales.stock_actual` directo** y después inserta la fila en `movimientos`. Si el insert falla, el stock ya quedó modificado sin movimiento que lo respalde, y el saldo deja de derivarse del libro. Contradice la regla de que el stock sale de los movimientos.
- La misma pantalla trabaja contra `materiales.stock_actual` para mostrar el stock, mientras que `ScanPedidoScreen` lo calcula con `stockPorMaterial` sobre el libro de movimientos. Las dos pantallas del mismo aparato pueden mostrar números distintos para el mismo producto.
- `ScanEgresoScreen` deja confirmar un egreso que supera el stock (avisa "supera el stock" pero no bloquea) y crea el egreso con la obra como **texto libre** (`p_obra: obra.trim()`), no por ID. El nombre visible no es identidad confiable: dos formas de escribir la misma obra generan dos destinos distintos en el historial.
- `EtiquetasScreen` genera el QR pegándole a `api.qrserver.com`, un servicio externo. Sin internet en el pañol no salen las etiquetas, y cada código de material se le manda a un tercero.
- `ScanPedidoScreen` guarda el carrito en `localStorage` con la clave fija `klasea:scan-pedido`, sin el usuario: si dos personas usan la misma PDA con cuentas distintas, la segunda hereda el carrito de la primera.
