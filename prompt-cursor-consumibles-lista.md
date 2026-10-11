# Tarea para Cursor: lista del día siguiente desde el celular

Proyecto Consumibles del pañol. Arranque: martes 13/10/2026, 7 h.

**Antes de empezar leé entero `docs/consumibles/brief.md`.** Tiene las decisiones tomadas, qué no tocar y cómo verificar. Hay otros agentes trabajando en paralelo en `src/features/consumibles/`: tocá **solo** `src/features/consumibles/lista/`.

## Qué hay que hacer

Reemplazar el lugar reservado `src/features/consumibles/lista/ListaManianaScreen.jsx` (ruta `/pedido-panol`, ya registrada en `App.jsx`, abierta a cualquier usuario con sesión).

Es la pantalla del **carril planificado**: el encargado de cada cuadrilla arma desde el celular, hasta las 15 h, la lista de consumibles que su gente va a usar al día siguiente. Pañol la prepara a la tarde y se retira a las 7 con tarjeta, sin cola. Hoy esto se hace en papel y casi nadie lo hace: la pantalla tiene que ser más rápida que el papel.

- Celular primero (390 px, una mano, blancos táctiles de 44 px).
- Elegir obra (`produccion_obras` activas) o sector, y el día de retiro (por defecto mañana; si es viernes, el lunes).
- Agregar consumibles buscando por nombre o tocando los más pedidos de esa persona (sus listas anteriores). Cantidad con +/-.
- "Repetir la lista de ayer" y plantillas por tarea guardadas por el encargado (en localStorage alcanza para empezar).
- Enviar: crea la solicitud en `panol_solicitudes` + `panol_solicitud_items` con `origen: 'digital'` y estado `enviada`, igual que lo hace `src/features/panol/SolicitudesPanolScreen.jsx` (mirá cómo arma la solicitud digital alrededor de la línea 1026 y `src/features/panol/solicitudesPanolApi.js`). Así aparece en la bandeja de Solicitudes del pañol sin tocar nada más. Marcá los ítems con `es_consumible: true`.
- Después de las 15 h, avisar que llega tarde (no bloquear: queda para preparar a la mañana).
- Ver mis listas enviadas y su estado (enviada, preparando, lista, entregada).
- Los consumibles salen de `panol_materiales` con `es_consumible = true` (cualquier usuario puede leerla). Ojo: `consumibles_config` y el stock **no** los puede leer cualquier rol; no los uses acá.

## Reglas

- Diseño: `.claude/skills/klasea-ui-polish/SKILL.md`. Nunca ámbar ni amarillo.
- No toques `App.jsx`, `api.js`, `ConsumiblesScreen.jsx`, `index.css`, `src/components/ui`, `package.json`.
- No escribas datos en producción para probar. No hagas commits.
- Verificación: `npx eslint src/features/consumibles/lista` y `npx vite build --outDir tmp/build-cursor --emptyOutDir`, los dos sin errores.
- Al terminar, escribí `docs/consumibles/informe-lista.md`: archivos, decisiones, cómo probar y qué falta.
