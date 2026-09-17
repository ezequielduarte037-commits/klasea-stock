# Tarea: seguir la reforma de diseño de Klase A, pantalla por pantalla

Klase A está en medio de una reforma visual. El objetivo es que todo el sistema tenga el lenguaje del login y de las pantallas de inicio ("Klase A · Marcando tendencia"), que desaparezca lo precario o raro que se fue acumulando y que todo sea usable desde el celular, que se empezó a usar hace poco.

Es una tarea de **presentación**. No cambies consultas, permisos, reglas de negocio ni flujos. Si encontrás algo de lógica que parece un error, anotalo en tu informe y no lo toques.

**Puede haber varios agentes trabajando al mismo tiempo**, cada uno en un lote distinto. Te van a decir qué lote te toca ("tomá el lote 4"). Si no te lo dicen, preguntá antes de empezar.

## Lo que ya está hecho

Está commiteado en `c3cd3311 Mejoras visuales` (y el login en `957e460a`):

- Base: tokens sin ámbar en `src/theme/palette.css`, Outfit + JetBrains Mono cargadas una sola vez en `index.html`, capa base y clases `ui-` en `src/index.css`.
- Contenedor `src/components/AppShell.jsx`: el menú lateral se monta una sola vez; en el celular hay barra superior propia. Ninguna pantalla monta su `Sidebar`.
- Menú lateral que se abre al pasar el mouse, con chinche para fijarlo (Ctrl+B).
- Piezas compartidas: `Portada`, `PageHeader`, `Cargando`, `BrandLoader`, `Toast`, `ConfirmDialog`, `motion`.
- Terminadas con el sistema nuevo: login, Home, entrada de Obras (`ObrasHome`), inicio de Pañol (`PanolOperativoHome`) y el encabezado, las pestañas y el kit de Compras (`comprasUI.jsx`).
- Barrido general, **todavía sin revisar en pantalla**: escala de pesos tipográficos (ya no hay 800–950), CSS global que filtraban las pantallas, restos del viejo botón de menú flotante, "Cargando…" sueltos y animaciones con nombres que se pisaban.

## Antes de modificar

Leé completos:

- `docs/reforma-diseno/lotes.md` — qué archivos son de tu lote, cuáles comparte con otros y cuáles no toca nadie.
- `.claude/skills/klasea-ui-polish/SKILL.md` — **el sistema de diseño**. Sus reglas valen para esta tarea aunque el archivo esté en una carpeta de Claude.
- `src/theme/palette.css`, `src/theme/index.js` y `src/index.css`.
- Las piezas de `src/components/ui/`: `Portada.jsx`, `PageHeader.jsx`, `Cargando.jsx`, `BrandLoader.jsx`, `motion.jsx`, `Toast.jsx`, `ConfirmDialog.jsx`.
- Ejemplos terminados, para copiar el criterio: `src/features/home/HomeScreen.jsx`, `src/features/obras/ObrasHome.jsx`, `src/features/panol/PanolOperativoHome.jsx`, `src/features/compras/comprasUI.jsx` y `ComprasTabs` en `src/features/compras/PurchaseRequestsScreen.jsx`.
- Tu informe, `docs/reforma-diseno/lote-NN.md`, si ya existe: ahí está lo que hizo la sesión anterior de tu lote.
- La pantalla que vas a tocar, entera.

## Trabajo en simultáneo: reglas

Todos los agentes comparten la misma carpeta, el mismo git y el mismo servidor de desarrollo. Por eso:

1. **Editá sólo archivos de tu lote.** Si hace falta un archivo nuevo, crealo dentro de las carpetas de tu lote. No crees piezas en `src/components/`.
2. **Piezas compartidas** (todo lo que `lotes.md` marca como "fuera de los lotes") **no se editan**. Si necesitás un cambio ahí, resolvelo dentro de tu lote y anotá el pedido en "Para coordinar" de tu informe.
3. **Archivos de tu lote que usan otros lotes** (están marcados en `lotes.md`): podés mejorar su aspecto, pero no cambies lo que exportan ni sus props. Mencioná el cambio en tu informe.
4. **Nada que cambie el estado de git o de todo el repo:** `git checkout`, `restore`, `reset`, `stash`, `clean`, `pull`, `merge`, `rebase` ni `commit`. Tampoco `npm install`, `eslint --fix` sobre todo el repo, formateadores globales ni reemplazos masivos fuera de tu lote. Borrarían o mezclarían el trabajo de los otros agentes.
5. **No mates procesos** de node ni el servidor. Usá el que ya corre en `http://localhost:5173`. Si no hay ninguno, levantá `npm run dev` y dejalo corriendo.
6. **Errores ajenos:** si otra pantalla o `npm run build` fallan por un archivo que no es de tu lote, probablemente otro agente está a mitad de un cambio. No lo arregles: esperá un rato, reintentá y, si sigue, anotalo.
7. **Tu informe es sólo tuyo:** escribí únicamente `docs/reforma-diseno/lote-NN.md` (no edites `lotes.md`, este archivo ni los informes de otros).

Si estás trabajando en un worktree o una rama propia (Cursor puede ofrecer correr el agente aparte), las reglas 4 a 6 molestan menos. Aun así editá sólo tu lote, para que después se pueda unir todo sin conflictos. En ese caso usá tu propio puerto para el servidor y avisá en el informe que el trabajo está en otra carpeta.

## Cómo trabajar

1. **Primero verificá el barrido general en las pantallas de tu lote** (pesos tipográficos, CSS limpiado, `Cargando`). Si algo quedó mal, corregilo antes de mejorar lo demás.
2. **Mirá cada pantalla funcionando** a 1280 px y a 390 px de ancho, en tema oscuro y claro. Anotá lo que se ve raro antes de tocar. El login lo hace el usuario: nunca escribas contraseñas.
3. **Cambios chicos y por partes.** Muchas pantallas tienen miles de líneas con lógica de negocio: no las reescribas; cambiá sólo lo visual.
4. Usá las piezas existentes antes de inventar una nueva.
5. Mantené el español rioplatense (voseo) de los textos y el estilo de comentarios de cada archivo: explican el porqué, no el qué.
6. Una sesión de conversación por lote (o por parte de un lote grande). Al cerrar la sesión, actualizá tu informe.

## Qué buscar en cada pantalla

- **Encabezado armado a mano** (cada uno de distinto alto, título en mayúsculas o muy grueso): pasalo a `PageHeader`, o al del kit del módulo si existe.
- **Colores fijos** (`#22d3ee`, `#67e8f9`, `#10b981`, `#ef4444`, `rgba(34,211,238,…)`): pasalos a tokens (`var(--cyan)`, `var(--cyan-soft)`, `var(--cyan-border)`, `C.green`…). En el tema claro los fijos se leen mal. **Ojo**: si el color después se concatena con transparencia (`${color}33`), se usa en un `<canvas>` o en un atributo de SVG, `var()` no funciona; ahí usá el token `-soft` correspondiente o dejalo como está.
- **Rótulos en mayúsculas monoespaciadas** con letter-spacing grande: 11 px, peso 600, letter-spacing .06–.08em, Outfit.
- **Chips o pestañas que en el celular se apilan** en varios renglones: una sola fila que se desliza (ver `.cp-barra-filtros` en `comprasUI.jsx`).
- **Menús desplegables adentro de algo que scrollea**: en el celular quedan recortados. Ubicalos con `position: fixed` calculado desde el botón (ver `ComprasTabs`).
- **Tablas con columnas fijas**: que scrolleen dentro de su contenedor, nunca la página; si es una lista de trabajo, en el celular conviene una tarjeta por fila.
- **Animaciones decorativas infinitas** (brillos que laten, partículas, tickers, relojes con segundos): afuera.
- **`<style>` con selectores sin ámbito** (`button {}`, `input:focus`, `*`, `::-webkit-scrollbar`): con la clase raíz de la pantalla, o afuera si ya lo cubre `index.css`. Los `@keyframes` también son globales: nombres con prefijo de la pantalla.
- **"Cargando…" como texto suelto**: `<Cargando />` (`llenar`, `compacto`, `texto`).
- **Hover con `opacity`**: fondo o borde (clases `ui-btn`).
- **Botones duplicados** para la misma acción en la misma vista.

## Qué no hacer

- Ámbar o amarillo, en ningún lado. Atención/pendiente: cian o violeta. Acción principal: azul. Error: rojo. Listo: verde.
- Pesos 800 o más.
- `@import` de fuentes u otras familias tipográficas.
- Importar `Sidebar` en una pantalla, raíces con `position: fixed` o `100vh`, padding a la izquierda "para el menú".
- Librerías nuevas de UI o de animación.
- Canales de Supabase realtime con nombre fijo: si el componente puede montarse dos veces, el nombre lleva `useId()`.

## Antes de dar una parte por terminada

1. `node scripts/comparar-lint.mjs <archivos de tu lote que tocaste>` → tiene que decir "Sin errores nuevos". Pasale **sólo tus archivos**: los de otros lotes pueden estar a mitad de cambio. El script compara con HEAD y separa los errores viejos del repo de los nuevos; sin archivos no revisa nada y avisa.
2. `npm run build`. Si falla por un archivo ajeno, ver la regla 6.
3. Mirar la pantalla en el navegador a 1280 px y 390 px, oscuro y claro. En el celular no puede haber scroll horizontal de página: en la consola, `document.querySelector('.ka-shell-content').scrollWidth - document.querySelector('.ka-shell-content').clientWidth` tiene que dar `0`.
4. En el celular, abrir los menús, modales y filtros de esa pantalla.

## Al terminar la sesión

Actualizá `docs/reforma-diseno/lote-NN.md` con el formato que está al final de `lotes.md`: qué hiciste, cómo lo verificaste, qué no pudiste verificar, qué hace falta coordinar en piezas compartidas y qué cosas de lógica o datos conviene revisar.
