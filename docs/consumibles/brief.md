# Consumibles: brief común para los agentes

Arranque en producción: **martes 13/10/2026, 7 h**. Desde ahí no sale nada del pañol sin registro, ni siquiera 30 g de tornillos. Informe del proyecto: https://claude.ai/code/artifact/4d65793b-278f-466e-9a8e-104d833f1a79

Coordina Claude (sesión principal). Trabajan en paralelo varios agentes sobre carpetas distintas del mismo repo: **tocá solo tus archivos**.

## Qué ya está hecho (no rehacer)

- **Base de datos aplicada en producción**: `supabase/migrations/20261010120000_consumibles_base.sql`. Leela entera antes de empezar.
  - `consumibles_movimientos`: el registro. Stock = suma de `cantidad` (con signo, en unidad de entrega). Tipos: inventario, ingreso, retiro, devolucion, ajuste, merma. No se edita: se anula (`anulado_at`).
  - `consumibles_stock` (vista): stock por material y sede.
  - `consumibles_config`: 1 a 1 con `panol_materiales`. Forma de entrega (unidad, peso, fraccionado, canje, prestamo), unidad de entrega, proveedor y código, factor y lote de compra, máximo, cupo diario, favorito, costo vigente, `codigo_etiqueta` (KA0001, lo pone la base).
  - `consumibles_listas` + `consumibles_lista_items`: listas de precios del proveedor; cada lista es una foto (historial).
  - RPC `consumibles_registrar_conteo` (conteo e inventario inicial: graba la diferencia contra el teórico).
  - Trigger espejo: cuando pañol confirma un retiro de una solicitud de papel (`panol_solicitudes.retirado_at`), sus consumibles entran solos al registro con carril `planificado`.
  - Se reutiliza de `panol_materiales`: descripcion, categoria_id, unidad_medida, es_consumible, peso_unitario_g, stock_minimo (RPC `panol_set_stock_minimo`), ubicacion.
- **Contrato de código**: `src/features/consumibles/api.js`. Usalo; no lo edites. Si necesitás otra función compartida, ponela en un archivo de tu carpeta (`<tu-carpeta>/<algo>Api.js`). Si algo de api.js está mal, decilo en tu informe final.
- **Pantalla contenedora**: `src/features/consumibles/ConsumiblesScreen.jsx`, ruta `/consumibles?tab=<pestaña>`. Cada pestaña recibe `{ profile, sede, irA }` y trae sus datos. La sede del pañol (Chubut o Pampa) se elige una vez por equipo.
- Librerías ya instaladas para etiquetas: `qrcode@1.5.4`, `jsbarcode@3.11.6`. También están `xlsx`, `recharts`, `jspdf`, `lucide-react`, `framer-motion`.

## Decisiones tomadas (no reabrir)

- Dos carriles que terminan en el mismo registro: lista planificada (la arma el encargado hasta las 15 h, se retira a las 7 con tarjeta) y mostrador tipo ferretería (se registra en el momento).
- **Herramientas** (tijeras, cintas métricas, sierras, pistolas, alicates, espátulas) van **como consumibles**: se las quedan hasta que se rompen. La forma `prestamo` existe por si alguna tiene que volver.
- El retiro se carga por defecto a la **obra asignada en RRHH** (`rrhh_empleado_obras`). Quien está en varias obras elige dónde lo usa o se reparte entre todas (`repartirEntreObras`).
- Canje 1 por 1 para discos, mechas, hojas y bandas. Cupo diario por persona: pasarse **no bloquea**, pide quién autoriza y queda marcado `fuera_cupo`.
- Tornillería por peso: la balanza da gramos y el sistema pasa a piezas con `peso_unitario_g`. Hasta el miércoles 14/10 solo está la Kretz (división gruesa): sirve para contar cajones enteros; para retiros chicos se acepta cargar piezas a mano.
- Costos en pesos sin IVA. En la lista de Rebollar, "+IVA" = factura con IVA aparte; "Final" = precio final con remito (el costo es el precio). USD al dólar vendedor BNA (`src/lib/dolarOficial.js`).
- 3 pañoleros por turno; ninguno hace inventario hoy: el lunes 12/10 cuentan dos con el celular mientras el tercero atiende.
- El hardware nuevo (impresora térmica, balanza 0,1 g, lector 2D, tarjetas) llega el miércoles 14/10. El martes se arranca con lo que hay y etiquetas en hojas A4.

## Datos útiles de la base (10/10/2026)

- 222 consumibles (`panol_materiales.es_consumible`): ninguno con precio, mínimo ni ubicación; 2 con peso; 40 con código de barras.
- 71 de 225 empleados con tarjeta NFC. 60 empleados están en más de una obra. 30 obras activas.
- Solicitudes de papel: todas de la sede Chubut.
- Lista de Rebollar (CMR Insumos Industriales, vigente 08/10/2026): 649 productos + 3 notas al pie. Columnas: Código, Descripción, "Unidad / Medida" (en realidad la medida), Precio unitario, Moneda ($ / USD), Condición (+IVA / Final).

## Reglas de trabajo

- **UI**: leé `.claude/skills/klasea-ui-polish/SKILL.md` y seguilo. Nunca ámbar ni amarillo. Solo tokens del tema. Probá el diseño pensando en 390 px de ancho. Textos en castellano rioplatense (voseo), cortos y concretos. Comentarios en castellano, explicando el porqué, como el resto del repo.
- **No toques**: `api.js`, `ConsumiblesScreen.jsx`, `App.jsx`, `Sidebar.jsx`, `index.css`, `src/theme`, `src/components/ui`, `package.json`, ni carpetas de otros agentes.
- **Base de datos**: podés consultar en modo lectura (`npx supabase db query --linked -o json -f <archivo.sql>`, con el SQL en un archivo de tu carpeta temporal). **No escribas datos en producción.** Si necesitás un cambio de esquema o una carga de datos, escribí una migración nueva en `supabase/migrations/` con versión `20261010HHMMSS` que no exista (`ls supabase/migrations | tail`), **no la apliques** y avisala en tu informe: la ensaya y la aplica el coordinador.
- **Verificación**: `npx eslint <tus archivos>` sin errores, y `npx vite build --outDir <tu carpeta temporal>/build --emptyOutDir` sin errores (no uses `npm run build`: comparte `dist/` con otros). No levantes servidores ni uses el navegador: la prueba en pantalla la hace el coordinador.
- **No hagas commits** ni `git add`. No borres archivos que no creaste.
- **Informe final** (en tu respuesta o en `docs/consumibles/informe-<frente>.md`): archivos creados o cambiados, migraciones pendientes, decisiones que tomaste, qué falta y cómo probarlo.
