---
name: klasea-ui-polish
description: Mejorar o crear pantallas de KlaseA con el sistema de diseño de la marca ("Marcando tendencia"): tokens del tema sin ámbar, Outfit + JetBrains Mono, escala de pesos liviana, piezas compartidas (Portada, PageHeader, Cargando, BrandLoader, Toast, ConfirmDialog, clases ui-), contenedor AppShell y versión celular. Usar al tocar el aspecto de cualquier pantalla, sin cambiar la lógica del producto.
---

# KlaseA · sistema de diseño

La referencia visual es el login y las pantallas de inicio (Home, Obras, Pañol):
fondo oscuro con tinte, el oleaje de la marca, acentos con el degradé azul → cian,
tipografía liviana y mucho aire. Las pantallas operativas mantienen la densidad
(se escanean rápido), pero con el mismo lenguaje.

## Reglas que no se discuten

- **Nunca ámbar ni amarillo.** Atención/pendiente → cian o violeta. Acción principal
  → azul. Error/urgente → rojo. Listo/ok → verde. Teal para maderas/stock.
- **Colores sólo con tokens**: `C` de `@/theme` o `var(--token)` de `src/theme/palette.css`
  (`--blue`, `--cyan`, `--violet`, `--green`, `--red`, `--teal` y sus `-soft`/`-border`;
  `--text`, `--muted`, `--dim`, `--subtle`; `--panel`, `--panel-2`, `--panel-solid`,
  `--border`, `--border-2`; `--brand-grad`, `--glow-a/b`, `--elev-1/2`). Tienen que
  funcionar en los tres temas: oscuro, claro y alto contraste.
- **Fuentes**: Outfit (texto) y JetBrains Mono (números, códigos). Se cargan una sola
  vez en `index.html`. Nunca `@import` de Google Fonts en una pantalla ni otras familias
  (sólo los documentos para imprimir pueden tener las suyas).
- **Escala de pesos**: 400 texto · 500 medio · 600 énfasis, botones, títulos de fila ·
  650 títulos de sección · 700 título de página y números grandes · 750 tope. Nada de
  800/850/900/950: en letra chica se ve tosco.
- **Sin CSS global desde una pantalla.** Todo selector de un `<style>` va con la clase
  raíz de la pantalla (`.compras-root button`, `:where(.materiales-root) button`).
  Ya son globales en `index.css`/`palette.css` y no se repiten: `box-sizing`, foco
  (`:focus-visible` y borde de inputs), placeholder, `select option`, barras de scroll,
  cursor de botones. Un `<style>` de pantalla sin ámbito le cambia el aspecto a toda la
  app mientras está montada (el menú lateral incluido).

## Contenedor

- `AppShell` monta el `Sidebar` una sola vez (ruta de layout). Una pantalla **no**
  importa `Sidebar`, no usa `position: fixed`/`100vh` en la raíz y no deja padding a la
  izquierda para un botón de menú: llena `.ka-shell-content` con
  `position: absolute; top/right/bottom/left: 0` (o `height: 100%`) y scrollea adentro.
- En el celular (< 900 px) el contenedor pone la barra superior con menú, marca,
  buscador y campanita. Nada flota encima del contenido.
- Si una pantalla necesita todo el ancho (modo foco), pide el riel con
  `plegarMenu(true)` y lo devuelve con `plegarMenu(null)` (`@/lib/menuLateral`).

## Piezas compartidas (usar antes de inventar)

| Necesidad | Pieza |
| --- | --- |
| Pantalla de inicio de un módulo | `@/components/ui/Portada`: `Portada`, `PortadaHero` (oleaje + indicadores), `Indicador`, `SeccionPortada` + `TarjetaModulo`, `ColumnasPortada` + `PanelPortada` + `FilaPortada`, `VacioPortada`, `EnlacePortada`, `BuscarPortada` |
| Encabezado de pantalla interna | `@/components/ui/PageHeader` (ícono, eyebrow, título, acciones, segunda fila) |
| Trayendo datos en un bloque | `@/components/ui/Cargando` (`llenar`, `compacto`, `texto`) — nunca un "Cargando…" suelto |
| Toda la app o una ruta cargando | `@/components/ui/BrandLoader` |
| Avisos | `useToast()` de `@/components/ui/Toast` |
| Confirmar | `useConfirm()` de `@/components/ui/ConfirmDialog` (hoja inferior en el celular) |
| Vacíos, números, entrada | `EmptyState`, `AnimatedNumber`, `DrawnCheck`, `FadeIn`, `Skeleton*` de `@/components/ui/motion` |
| Botones, campos, chips, tarjetas, pestañas | clases de `index.css`: `ui-btn` (`-primario`, `-suave`, `-peligro`, `-fantasma`, `-icono`), `ui-input`, `ui-chip`, `ui-card` (`ui-card-hover`), `ui-tabs` + `ui-tab` |
| Compras | kit propio `src/features/compras/comprasUI.jsx` (`PageHeader`, `Toolbar`, `FilterChip`, `BarButton`, `Section`, `Panel`, `Empty`, `StatStrip`, `Tag`) |
| Saludo y fecha | `saludoSegunHora`, `primerNombre`, `fechaLarga` de `@/lib/saludo` + `useAhora()` |

CSS de un componente compartido: `<style href="klasea-…" precedence="default">`, así
React lo inserta una sola vez aunque haya veinte instancias.

## Celular

- Probar a 390 px: sin scroll horizontal de página (`scrollWidth === clientWidth` en
  `.ka-shell-content`).
- Blancos táctiles de 38–44 px. Nada que dependa sólo de `:hover`.
- Filas de chips o pestañas que no entran: una sola fila con `overflow-x: auto`, sin
  barra visible (`scrollbar-width: none`) y fundido en el borde; no apilar en 4 renglones.
- Un menú desplegable adentro de algo que scrollea se recorta: ubicarlo con
  `position: fixed` calculado desde el botón (ver `ComprasTabs`).
- Diálogos: hoja inferior a ≤ 640 px. Respetar `env(safe-area-inset-*)`.

## PDA del pañol (Chrome viejo, ~60–90)

En las pantallas del colector: sin `gap` en flex (usar márgenes), sin `inset`, sin
`:where`/`:is`, sin animaciones por JS; cargadores sólo con CSS.

## Movimiento

- Sólo `transform` y `opacity`; entradas de 150–550 ms con `cubic-bezier(.22,1,.36,1)`.
- Nada infinito y decorativo en pantallas que quedan abiertas todo el día (el oleaje se
  pausa solo con `pausaInactivo`). Nada de relojes con segundos, tipeo letra por letra,
  partículas, líneas de escaneo, brillos que laten ni tarjetas con inclinación 3D.
- `prefers-reduced-motion` ya corta las animaciones CSS en `index.css`; en JS usar
  `useReducedMotion()` / `leerMovimientoReducido()`.

## Datos en vivo

- Canales de Supabase realtime con nombre único por instancia (`useId()`): el mismo
  nombre montado dos veces rompe la pantalla.
- Cada número se muestra una vez y en un lugar; si está en el encabezado no se repite
  en tarjetas y chips.

## Al terminar

1. `node <scratchpad>/comparar-lint.mjs` o `npx eslint <archivos tocados>`: sin errores nuevos.
2. `npm run build`.
3. Mirar la pantalla en el panel del navegador a 1280 px y a 390 px, en tema oscuro y
   claro. Si pide login, lo hace el usuario.
