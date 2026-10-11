# Informe · Etiquetas y tablero

Fecha: 10/10/2026. Trabajo sin commits, sin servidores y sin escrituras en producción. Se leyeron el brief, la migración base, la API compartida y la skill de diseño. Se conservaron los cambios de los demás frentes.

## Archivos

Se encontró una implementación de etiquetas ya presente al retomar la tarea; se revisó y se completó sobre esa base.

Esa base la escribió el agente Claude «Etiquetas y tablero» (núcleo puro con decodificador propio de Code128 y QR en la prueba, vista y pestaña). Una segunda pasada la revisó y le sumó el tablero. Lo que se lista abajo como modificado es el resultado de las dos.

Modificados en `src/features/consumibles/etiquetas/`:

- `EtiquetasTab.jsx`: selección, búsqueda, rubro, prefijo libre de ubicación con sugerencias y filtro sin ubicación; historial local de impresas con aviso cuando el navegador no permite guardarlo; impresión aislada por una marca temporal en el documento y una capa montada en `body`.
- `etiquetasCore.js`: QR con cuatro módulos blancos dentro del SVG y tamaño de 12 mm en A4; filtro de estantería por prefijo, incluyendo `C2-`.
- `EtiquetasVista.jsx`: ubicación pendiente explícita en la etiqueta; tokens para el marco de la vista previa. Los gráficos impresos siguen siendo negro sobre blanco.
- `etiquetasCore.test.mjs`: comprobación de los cuatro módulos blancos del QR y de los prefijos de ubicación.

En `src/features/consumibles/tablero/`:

- `TableroTab.jsx`: reemplaza la pantalla reservada con filtros, indicadores, rankings en Recharts, carriles, viajes, incidencias y mermas.
- `tableroApi.js`: nuevo; consultas propias de sólo lectura, paginadas, con cancelación al cambiar filtros.
- `tableroCore.js`: nuevo; límites de fechas argentinos, agrupaciones y cálculos separados de la UI.
- `tableroCore.test.mjs`: nuevo; seis pruebas de fechas, valorización, unidades, viajes, incidencias, conteos y vacíos.

No se editaron `api.js`, el contenedor, los componentes compartidos, el tema, `package.json` ni carpetas de otros agentes. No hay migraciones pendientes de este frente.

## Etiquetas: decisiones y funcionamiento

- El dato sale de `fetchCatalogo({ sede })`. Nombre corto: alias si existe, descripción en caso contrario. Código de etiqueta, código de proveedor, unidad y ubicación acompañan el nombre. Si falta ubicación, se imprime «Sin ubicación».
- QR y Code128 se generan en el navegador con `qrcode` y `jsbarcode`, en SVG. Ambos codifican el mismo `codigoEtiqueta`. No se usan servicios externos.
- Sin `codigoEtiqueta` no se imprime una etiqueta de catálogo: la base asigna el código cuando existe la configuración del consumible. Se muestra un enlace a Catálogo.
- A4: 3 × 8 etiquetas de 70 × 37 mm. La grilla ocupa 296 mm de alto, centrada con 0,5 mm arriba y abajo; `@page` tiene margen cero. El contenido tiene relleno interno para protegerlo del borde no imprimible de la láser.
- Térmica: página de 60 × 40 mm, margen cero y una etiqueta por página. Code128 lleva barras de 9 mm de alto y módulos de 0,375 mm, equivalentes a tres puntos en una térmica de 203 ppp. A4 usa barras de 8 mm. Todas incluyen diez módulos blancos a cada lado.
- La misma composición se usa para vista previa e impresión. La hoja A4 permite empezar en una posición libre de una hoja usada. La vista previa limita la cantidad de páginas dibujadas; la impresión incluye todas.
- Hoja de mostrador: hasta 40 consumibles con `favorito_orden`, ordenados por ese campo; cuando no hay favoritos, los primeros 40 por nombre. A4, dos columnas y veinte filas, con barras grandes.
- Prueba: una etiqueta del catálogo o `KA0000` si todavía no hay códigos reales. Incluye un campo para comprobar lo que escribe el lector. La prueba y la hoja de mostrador no marcan etiquetas de estante como impresas.
- El navegador no informa si se imprimió o se canceló. Después del diálogo, el operador confirma que salieron bien antes de guardar los códigos en `localStorage`. El historial pertenece a este equipo. Se combina con las marcas ya guardadas para conservar impresiones hechas desde otra pestaña.
- El botón Imprimir no se bloquea mientras se imprime: cada toque arma un trabajo nuevo y vuelve a abrir el diálogo. Así, si un navegador no dispara `afterprint` (pasa en algunos celulares), el botón no queda trabado en «Imprimiendo…». Si eso pasa, la capa queda montada pero oculta en pantalla, y se retira igual al salir de la pestaña.
- La capa `#consumibles-labels-print` vive fuera del menú y el encabezado. Su CSS de impresión se monta durante el trabajo; los selectores que ocultan la app requieren la clase temporal `cns-etq-imprimiendo`. Se retira al terminar o desmontar la pestaña.

## Tablero: definiciones de los números

- Períodos: hoy, últimos 7 días, últimos 30 días o rango inclusivo. Los cortes son a medianoche argentina, UTC−03:00, independientemente de la zona del navegador. La sede inicial viene del equipo; el filtro permite Chubut, Pampa o ambas, sin modificar la sede operativa guardada.
- Consumo: retiros del período. Valor = `abs(cantidad) × costo_unitario_ars` de cada fila. No se revaloriza con el precio actual ni se descuentan devoluciones de esta métrica.
- Los costos ausentes producen un total parcial o «Sin costos», nunca un cero presentado como costo conocido. Un costo registrado de cero sí es válido. Los rankings parciales llevan «+».
- Cantidades: agrupadas por unidad de entrega; se elige una unidad para comparar rankings. No se suman litros con piezas. Rubro y unidad se leen de la ficha actual, porque no están congelados en el movimiento.
- Rankings por obra, sector, persona y rubro. El gráfico muestra las primeras ocho posiciones; se puede cambiar a la lista completa con nombres y valores exactos. Los gráficos usan tokens del tema y no tienen animaciones. La estructura pasa a una columna en celular.
- Viajes: clave de sede + día + persona + lote. Las filas de varios artículos y de obras repartidas comparten el viaje. El espejo planificado de la migración base no guarda `lote`: en esas filas se usa `solicitud_id`. Si faltan ambos, se cuenta la fila como un retiro y se avisa que el total puede estar sobreestimado.
- Carriles: porcentaje de retiros distintos planificados y de mostrador por sector, y evolución diaria. Se cuenta una vez por sector y carril. Punto de sector y registros sin carril se informan aparte y se excluyen de ese porcentaje. Los días sin actividad no se presentan como 0 % planificado.
- Fuera de cupo y canjes sin usado: una incidencia por artículo y retiro. Se suman las cantidades repartidas entre obras; se muestran persona, fecha, sede, obras y autorización cuando corresponde.
- Mermas: sólo `tipo = 'inventario'` con diferencia negativa después del primer conteo del mismo producto y sede. Para identificar ese primer conteo se consulta el historial previo al rango. El inventario inicial y los movimientos de tipo `merma` no entran en esta definición.
- Se excluyen anulados. Las consultas paginan en lugar de usar el límite de 1.000 filas de `fetchMovimientos`; se verificó también un límite de servidor menor al tamaño solicitado.

## Verificación ejecutada

Todos los comandos terminaron con código 0:

```powershell
npx eslint src/features/consumibles/etiquetas src/features/consumibles/tablero
node --test src/features/consumibles/etiquetas/etiquetasCore.test.mjs src/features/consumibles/tablero/tableroCore.test.mjs
npx vite build --outDir C:/Users/ezequ/AppData/Local/Temp/claude/C--klasea-stock/f338cd85-119a-4082-b4a6-0e970a7022aa/scratchpad/agente-codex/build --emptyOutDir
```

ESLint: sin errores. Pruebas: 50 aprobadas. Incluyen decodificación del SVG de barras y QR, márgenes, medidas, paginado de 222 etiquetas y cálculos del tablero. Además se comprobó con un cliente simulado que 1.501 movimientos se recuperan completos aunque el servidor entregue sólo 137 por página, que el conteo inicial fuera del rango se recupera y que funciona la cancelación.

El primer build restringido falló por `EPERM` al resolver `src/main.jsx`; el mismo comando con permiso de ejecución fuera del sandbox pasó: 5.245 módulos transformados, 18,20 s. No se usó `dist/`.

Repetido al cerrar (10/10, 14:50, con el código actual de las dos carpetas):

- `npx eslint src/features/consumibles/etiquetas src/features/consumibles/tablero`: sin errores.
- `node --test` de las dos pruebas: 50 de 50 (44 de etiquetas, 6 del tablero).
- `npx vite build --outDir …/scratchpad/agente-etiquetas/build --emptyOutDir`: pasa (23,5 s; `EtiquetasTab` 131 kB, 35 kB gzip; `TableroTab` 33 kB). Las dos primeras corridas se cortaron con «out of memory» dentro de esbuild (no es error del código: la máquina tenía unos 20 procesos de node de otros agentes). Pasó limitando la memoria de esbuild: `GOMAXPROCS=2 GOGC=50 NODE_OPTIONS=--max-old-space-size=6144`. Si el coordinador ve el mismo error, que use esas variables.

## Cómo probar y qué falta

La revisión en navegador y las pruebas físicas quedan para el coordinador, conforme al brief. No se levantó ningún servidor ni se usó el navegador.

1. Abrí `/consumibles?tab=etiquetas`. Buscá por nombre o código, filtrá rubro y `C2-`, probá «Sin ubicación», tildá ítems y cambiá entre A4 y térmica. Revisá que la vista previa coincida con las dimensiones y el orden esperado.
2. Imprimí a PDF con escala 100 %, sin márgenes ni encabezados/pies: 24 etiquetas deben llenar una A4; la número 25 debe ir a la segunda hoja. En térmica, cada etiqueta debe ocupar su propia página de 60 × 40 mm. Verificá que no salga el menú ni el encabezado de la app.
3. Cancelá una impresión y elegí «No salieron»: el historial no debe cambiar. Imprimí otra y confirmá: «Sin imprimir todavía» debe excluirla después de volver a entrar. Probá también una hoja usada y la hoja de mostrador.
4. El lunes imprimí «Prueba» en la láser y escaneá barras y QR en el campo del probador. Después comprobá la térmica cuando llegue. Pegá las etiquetas en la caja o el borde del estante.
5. Abrí `/consumibles?tab=tablero` en oscuro y claro, a 1280 px y 390 px. Revisá ausencia de scroll horizontal, selección de período/sede, tablas completas y detalles diarios de viajes. Con pocos datos, comprobá los mensajes vacíos y «Sin costos».
6. En un entorno de prueba, compará un retiro repartido entre dos obras: el consumo debe sumar sus cantidades y valores, pero el viaje y cada incidencia deben contarse una sola vez. Probá conteo inicial, segundo conteo negativo y cambio del precio actual: sólo el segundo conteo es merma y el retiro conserva su costo original.
7. Validá la lectura de las relaciones de PostgREST y permisos con una cuenta de dirección/encargado y otra de pañol. No se ejecutaron consultas contra producción durante este trabajo.

Para imprimir etiquetas reales hace falta que el frente Catálogo haya generado las configuraciones y sus códigos. Los costos, ubicaciones y favoritos pendientes se completan desde sus pestañas. No queda un cambio de esquema ni una carga de datos a cargo de este frente.
