# Reforma de diseño · lotes para trabajar en paralelo

Cada lote es un grupo de pantallas con sus archivos. **Ningún archivo está en dos lotes**, así que varios agentes pueden trabajar al mismo tiempo, uno por lote, sin pisarse.

Las reglas generales, cómo trabajar y cómo verificar están en [prompt-cursor-reforma-diseno.md](../../prompt-cursor-reforma-diseno.md). Este archivo sólo dice **qué toca cada lote**.

Los lotes están ordenados por prioridad: primero lo que más se usa (pañol y compras). Si corrés pocos agentes a la vez, empezá por los primeros.

Rutas de archivos relativas a `src/features/`. Una carpeta terminada en `/` incluye todo lo que tiene adentro.

---

## 1 · Pañol — Recepción

- **Rutas:** `/recepcion-panol`, `/balanza/calibrar`
- **Archivos:** `panol/RecepcionPanolScreen.jsx`, `panol/PanolEnvioDetail.jsx`, `panol/EnviarAPanolModal.jsx`, `panol/ScannerRemitosTab.jsx`, `panol/RemitosArchivoTab.jsx`, `panol/ConsumiblesPanolTab.jsx`, `panol/CrearProductoTab.jsx`, `panol/AntesDeEscanearModal.jsx`, `panol/SelectorDestinosRemito.jsx`, `panol/DestinosDeRemito.jsx`, `panol/CalibrarPesosScreen.jsx`
- **Ojo:**
  - `EnviarAPanolModal` también se abre desde Compras y Materiales.
  - `BarcodeScanner` y `UbicacionPicker` son del lote 2; no los edites.
  - Se usa en el pañol con las manos ocupadas: blancos táctiles grandes.

## 2 · Pañol — Stock y egresos

- **Rutas:** `/stock-panol`, `/egresos-panol`, `/sobrantes-obra`, `/consumibles-caja`, `/pantalla-egreso`
- **Archivos:** `panol/StockPanolScreen.jsx`, `panol/StockWmsPanel.jsx`, `panol/MapaPanolTab.jsx`, `panol/DevolucionesPanel.jsx`, `panol/NormalizacionIngresosPanel.jsx`, `panol/PanolRetirosDashboard.jsx`, `panol/SobrantesObraScreen.jsx`, `panol/EgresosPanolScreen.jsx`, `panol/EgresoConsumiblesScreen.jsx`, `panol/PantallaEgresoScreen.jsx`, `panol/BarcodeScanner.jsx`, `panol/UbicacionPicker.jsx`
- **Ojo:**
  - `StockWmsPanel` es el archivo que más cambió en el ajuste de pesos tipográficos: revisalo primero.
  - `BarcodeScanner` y `UbicacionPicker` también los usan Recepción y Materiales.
  - `PantallaEgresoScreen` se muestra en una TV: letras grandes, legible de lejos.

## 3 · Pañol en planta — solicitudes, tarjetas y colector (PDA)

- **Rutas:** `/solicitudes-panol`, `/inicio-panol/tarjetas`, `/colector`, `/scan`, `/scan-pedido`, `/etiquetas`, `/balanza`
- **Archivos:** `panol/SolicitudesPanolScreen.jsx`, `panol/FirmaRetiroPanol.jsx`, `panol/FotosSolicitud.jsx`, `panol/TarjetasNfcScreen.jsx`, `inventario/ColectorHomeScreen.jsx`, `inventario/ScanEgresoScreen.jsx`, `inventario/ScanPedidoScreen.jsx`, `inventario/EtiquetasScreen.jsx`, `inventario/BalanzaDebugScreen.jsx`
- **Ojo:**
  - Las pantallas del colector corren en una **PDA con Chrome viejo (~60–90)**. Ahí no uses `gap` en flex, `inset`, `:where`/`:is` ni animaciones por JS.
  - Si no podés probar en un Chrome viejo, limitate a cambios de color, tamaño y espaciado con márgenes.

## 4 · Compras — Bandeja y pedidos

- **Rutas:** `/compras` (bandeja, lista completa y detalle de un pedido), `/proveedor/:token`
- **Archivos:** `compras/PurchaseRequestsScreen.jsx`, `compras/PurchaseRequestDetail.jsx`, `compras/ReciboModal.jsx`, `compras/PedirAComprasModal.jsx`, `compras/comprasUI.jsx`, `compras/ComprasBicho.jsx`, `proveedores/PortalProveedorScreen.jsx`
- **Ojo:**
  - Encabezado, pestañas y menú "Más" ya están rehechos: verificalos en el celular.
  - `comprasUI.jsx` es el kit que usan todas las solapas de Compras (lote 5).
  - `PedirAComprasModal` se abre desde Maderas, Laminación, Muebles y Tornería.
  - `/proveedor/:token` es el portal público de proveedores, fuera del contenedor.

## 5 · Compras — Planillas, registro y gastos

- **Rutas:** las solapas de `/compras` que viven en paneles propios (planilla por obra, matriz por línea, faltantes, reposición, registro, adicionales, caja chica) y `/cadete`
- **Archivos:** `compras/PlanillaObrasPanel.jsx`, `compras/PlanillaDetalle.jsx`, `compras/PlanillaHerramientas.jsx`, `compras/MatrizLineasPanel.jsx`, `compras/FaltantesComprasPanel.jsx`, `compras/ReposicionPanel.jsx`, `compras/PurchaseLogPanel.jsx`, `compras/AdditionalPurchasesPanel.jsx`, `compras/CajaChicaPanel.jsx`, `compras/PortalProveedorActividad.jsx`, `cadete/`
- **Ojo:**
  - El kit `comprasUI.jsx` es del lote 4: usalo, no lo cambies.
  - `PlanillaObrasPanel` también aparece dentro de Materiales.
  - Son tablas anchas: en el celular tienen que scrollear dentro de su contenedor, nunca la página.

## 6 · Obras

- **Rutas:** `/obras` (todas las vistas, menos la pantalla de entrada)
- **Archivos:** `obras/ObrasScreen.jsx`, `obras/FechasView.jsx`, `obras/GalponPampa.jsx`, `obras/mapa/`, `obras/MapaProduccion.jsx`, `obras/MaterialesProduccionPanel.jsx`, `obras/PanelDetallesObra.jsx`, `obras/PiezasLaminacionView.jsx`, `obras/TareaArchivosPanel.jsx`, `obras/TimelineDesmoldeView.jsx`
- **Ojo:**
  - En el celular conviven "+ Nueva obra" y "+ Obra" en la misma vista.
  - Las obras terminadas muestran "etapas tarde": puede ser lógica, sólo anotalo.
  - `GalponPampa` tiene muchos colores fijos dentro de SVG: ahí `var()` no siempre funciona.
  - `obras/mapa/components.jsx` arma una memoria para imprimir: no cambies su CSS de impresión.

## 7 · Materiales

- **Rutas:** `/materiales`
- **Archivos:** `materiales/`
- **Ojo:**
  - `MaterialesScreen.jsx` tiene ~9.700 líneas: trabajá por solapa.
  - Usa piezas de otros lotes, que no se editan acá:
    - `PlanillaObrasPanel` (lote 5)
    - `EnviarAPanolModal` (lote 1)
    - `UbicacionPicker` (lote 2)
    - `Cargando`, `KpiCard` y otros de `rrhh/ui.jsx` (lote 13)
  - `MaterialExtras`, `ProductoAsignadoControl`, `ProveedoresTab` y `ProveedorTipoBadge` también se usan en Catálogo, Pañol, Compras y Precios.

## 8 · Tornería y compras por etapa

- **Rutas:** `/torneria`, `/compras-etapa`
- **Archivos:** `torneria/`, `produccion/`
- **Ojo:**
  - Tornería pliega el menú lateral en modo foco (`plegarMenu`): mantenelo.
  - `produccion/MaterialPicker.jsx` y `produccion/comprasUI.jsx` también los usan Obras y Pañol.

## 9 · Laminación y maderas

- **Rutas:** `/laminacion`, `/laminacion-chubut`, `/obras-laminacion`, `/laminacion/plantillas`, `/madera`, `/pedidos`
- **Archivos:** `laminacion/`, `inventario/MaderasScreen.jsx`, `inventario/PedidosMaderaScreen.jsx`, `inventario/AjusteMaderasModal.jsx`, `inventario/PedidosScreen.jsx`, `inventario/AjusteInventarioModal.jsx`, `inventario/ComprasSugeridasPanel.jsx`, `inventario/EncargadosTab.jsx`, `inventario/OrdenCompraGenerator.jsx`
- **Ojo:**
  - En Laminación hay una sección que aparece a medias: buscala primero.
  - `LaminacionScreen.jsx` es el archivo con más colores fijos.
  - `calendario/BarcoCalendarioPanel.jsx` es del lote 11.

## 10 · Muebles y marmolería

- **Rutas:** `/muebles`, `/marmoleria`
- **Archivos:** `muebles/`, `marmoleria/`
- **Ojo:**
  - `EnchapadoView.jsx` y `muebles/printFaltantes.js` generan documentos para imprimir: su CSS de impresión no se toca.
  - `ayuda/BotonAyuda` es compartido.

## 11 · Logística, postventa y tickets

- **Rutas:** `/calendario`, `/calendario-produccion`, `/postventa`, `/tickets`
- **Archivos:** `calendario/`, `postventa/`, `tickets/`
- **Ojo:**
  - En el celular los indicadores de Logística se encimaban.
  - Postventa pliega el menú en el modo mapa (`plegarMenu`) y tiene estilos del mapa (Leaflet) para el tema claro.
  - `BarcoCalendarioPanel` también se usa en Laminación.

## 12 · Precios, costos y catálogo

- **Rutas:** `/precios`, `/costo-barco`, `/catalogo-maestro`
- **Archivos:** `precios/`, `costos/`, `catalogo/`
- **Ojo:** **Memorias salió de este lote**: la está rehaciendo Claude junto con su backend (conexión con obras, listas de compras, compras y pañol). No toques `memorias/` ni `obras/mapa/memoriaFields.jsx` / `obras/mapa/persistence.js`.

## 13 · RR. HH., configuración y sistema

- **Rutas:** `/rrhh`, `/configuracion`, `/admin`, `/alertas`, `/procedimientos`, `/semaforo`
- **Archivos:** `rrhh/`, `configuracion/`, `admin/`, `alertas/`, `procedimientos/`, `semaforo/`, `cuenta/`
- **Ojo:**
  - `rrhh/ui.jsx` lo usa Materiales: no cambies lo que exporta.
  - Configuración todavía marca el hover de los botones con `opacity` (`.cfg-root`): pasalo a fondo o borde.
  - Los modales de `cuenta/` (cambiar contraseña, vincular WhatsApp) se abren desde el menú lateral.
  - El estado "ámbar" del Semáforo no se pinta de amarillo: es una regla del dueño.

---

## Fuera de los lotes: nadie los toca mientras haya agentes en paralelo

| Qué | Archivos |
| --- | --- |
| Piezas y base compartidas | `src/components/`, `src/index.css`, `src/theme/`, `src/theme.css`, `index.html`, `src/App.jsx`, `src/hooks/`, `src/lib/`, `features/search/`, `features/ayuda/` |
| Configuración e instrucciones | `package.json`, `package-lock.json`, `vite.config.js`, `CURSOR.md`, `.claude/skills/klasea-ui-polish/SKILL.md`, `prompt-cursor-reforma-diseno.md`, este archivo, `scripts/` |
| Terminadas | `features/login/`, `features/home/`, `obras/ObrasHome.jsx`, `panol/PanolOperativoHome.jsx` |
| Otra identidad | `features/cliente/` (panel para clientes) |
| Para imprimir | `panol/SolicitudPanolPrintable.jsx`, `compras/printPurchaseRequest.js`, `muebles/printFaltantes.js` |
| Parecen sin uso (ninguna ruta las abre) | `inventario/PanolScreen.jsx`, `inventario/MovimientosScreen.jsx`, `inventario/StockChartsPanel.jsx`, `compras/RadarProfeta.jsx`, `obras/PlanificacionView.jsx`, `obras/AvisosCompraView.jsx` |

Las de la última fila no se mejoran: el dueño decide si se borran.

Los archivos de datos y lógica (`*Api.js`, `api.js`, parsers, utils, hooks) tampoco se tocan en esta tarea, estén o no en un lote.

## Informe de cada lote

Cada agente escribe **sólo** su archivo, `docs/reforma-diseno/lote-NN.md` (por ejemplo `lote-04.md`), y lo actualiza al terminar cada sesión:

```markdown
# Lote NN · Nombre

Estado: en curso | terminado

## Hecho
- Pantalla / parte: qué estaba raro → qué cambió.

## Verificado
- Cómo (lint, build, 1280 px, 390 px, tema claro, menús y modales abiertos).

## Sin verificar
- Qué no se pudo mirar y por qué.

## Para coordinar
- Cambios que harían falta en piezas compartidas o en archivos de otro lote (qué y para qué).

## Lógica o datos para revisar
- Cosas que parecen errores pero no son de diseño.
