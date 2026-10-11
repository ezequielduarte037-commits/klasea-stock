# Arreglos del mostrador — 10/10/2026

Se implementaron las correcciones de cliente para los puntos 1–12. Cada retiro usa una operación durable antes del primer envío. El carrito queda bloqueado durante el cierre y las respuestas tardías no cambian la firma. Los rechazos y las fechas vencidas se conservan para revisión.

**Ubicación del informe:** la ruta solicitada, `docs/consumibles/informe-arreglos-mostrador.md`, devuelve **Acceso denegado** al crear el archivo. Se verificó que es una carpeta real dentro del repo y se confirmó el error con una escritura nativa de Windows. Este archivo contiene el informe completo para que el coordinador lo mueva a la ubicación final. No se modificaron permisos ni se pidió una excepción: la política de aprobación es `never`.

Todos los archivos escritos están en `src/features/consumibles/mostrador/`. No hice commits, `git add`, cambios a `package.json`, modificaciones al contrato compartido ni escrituras en la base. No levanté servidores ni usé el navegador.

## Correcciones por punto

| Punto | Resultado |
| --- | --- |
| **1. Persistencia y recuperación** | IndexedDB guarda filas, ids, lote, fecha del hecho, persona, destino, autorizaciones y copia del carrito antes del envío. Un índice único por borrador devuelve la operación original si otra pestaña intenta crear otro lote. Al volver se recupera la operación sin terminar. El cierre confirma la marca `finalizada` y retira el borrador antes de mostrar el resultado. La marca durable invalida cualquier borrador viejo que sobreviva a un F5. |
| **2. Tarjetas y consultas tardías** | Otra tarjeta cancela el timer en el evento de lectura, antes de consultar RRHH. Los tokens incluyen carrito, pedido, paso y operación. Confirmar invalida los pedidos anteriores. Las respuestas de identificación, obras y retiros sólo actualizan una consulta vigente. El cierre revalida carrito y paso después de cada espera. |
| **3. Escaneo en cantidades y balanza** | Se reconoce y consume la ráfaga por sus teclas crudas antes del Enter o Tab, sin depender del valor saneado del campo. Se conserva el valor previo al escaneo. El panel de balanza también captura códigos. Las capas de peso y cantidad tienen la clave del producto para no reutilizar el estado de otro. Una lectura tardía de peso no actualiza una capa desmontada. |
| **4. Carrito congelado** | El control sincrónico bloquea cambios, lecturas, navegación y confirmaciones desde el comienzo del cierre, incluidas las verificaciones de cupo. Los controles se deshabilitan. Una operación creada conserva sus ids aunque falle guardar en el equipo; sólo se puede retomar ese cierre. |
| **5. Vaciar y cancelar** | Vaciar o quitar la última línea crea otro id de carrito y limpia persona, destino, autorización de cupo, notas, capas, búsqueda, automatismo y consultas. La persona identificada lleva el id del carrito, que se comprueba antes de firmar. |
| **6. Cola y pestañas** | Cada operación ocupa un registro de IndexedDB. Todas las modificaciones se hacen en transacciones de lectura y escritura. Se resuelven en `oncomplete`, con durabilidad estricta donde está disponible. Un candado por operación con vencimiento y token coordina los intentos; las respuestas viejas no pisan otros resultados. BroadcastChannel avisa cambios y un sondeo cubre navegadores sin ese canal. Si falla la persistencia no aparece éxito ni se permite abandonar una operación no guardada. La cola anterior se copia antes de retirarla. |
| **7. Lecturas con plazo y caché** | Identificación, obras, retiros, catálogo, padrón y comprobación de ids tienen plazo de 7 segundos. Al vencer la identificación se ofrece nombre o DNI; al vencer las obras se puede elegir obra activa o sector. Se guardan catálogo, empleados con UID y obras activas por sede para remontar sin red. Con el navegador desconectado se usa el padrón local y la elección manual de destino. Un cupo sin verificar requiere autorización. |
| **8. Estados y regularización** | `pendiente`, `incierto` y `rechazado` son estados distintos. Los rechazos definitivos no se reintentan por el reloj. La cola permite comprobar todos los ids y corregir destino a sector o autorización de un rechazo sin incertidumbre previa, conservando filas anteriores, fecha y motivo. No permite borrar el único registro. Si hubo incertidumbre, hay filas existentes o el problema requiere otros datos, se descarga el original para revisión. |
| **9. Fechas vencidas** | Se revisa la fecha de cada fila antes de enviar, con un margen de un minuto para no cruzar el límite del trigger durante el viaje. Un vencimiento, fecha inválida o fecha adelantada queda suspendido y visible con su hora original. Se puede descargar el original para regularizar. Comprobar ids existentes puede reconciliar un vencido sin insertarlo otra vez. La app no lo envía con fecha de hoy. |
| **10. Cupo por id** | Las operaciones enviadas siguen disponibles para el cálculo local aunque salgan de la cola visible. Se reconcilian por id con la lectura de hoy y las comprobaciones del registro, incluyendo anulaciones. Confirmar vuelve a leer operaciones locales y consumo de hoy. Los pendientes usan ambos límites del día argentino del contrato y la fecha de cada fila. La validación atómica entre equipos distintos requiere un cambio de base fuera de este alcance. |
| **11. Constructor compartido** | Se eliminó el constructor paralelo de retiros. El adaptador traduce canje, cupo y destino; la pantalla llama a `armarFilasRetiro` de `api.js`. Las notas de préstamo se agregan sin cambiar cantidades, ids ni gramos. Las devoluciones también se ordenan por material. Las pruebas ejecutan las funciones del contrato real extraídas de `api.js`, sin importar Supabase ni copiar el algoritmo. Se verifica 0,002 entre cuatro obras y el peso entero en la primera parte. |
| **12. Devolución y canje** | Cambiar a devolución limpia canje y autorización. Los escaneos de ese modo también entran sin canje. Sólo los retiros validan canje. Volver a retiro inicia los canjes con el usado entregado y sin autorizaciones anteriores. |

## Archivos

Modificados:

- `MostradorTab.jsx`: recuperación, cierre durable, control de consultas, bloqueo, limpieza, cupo y adaptación al contrato.
- `mostradorLogica.js`: adaptación de retiro, notas de préstamo, canje por modo, cupo incierto, rango de pendientes y clasificación de rechazos.
- `mostradorApi.js`: comprobación de ids, lectura reconciliada de hoy y caché mínimo por sede.
- `useColaSinConexion.js`: diario transaccional, coordinación, estados, revisión y migración de la cola anterior.
- `useRafagaLector.js`, `PesoBalanza.jsx`, `TecladoNumerico.jsx`: captura cruda, panel de peso, sufijo Tab y descarte de lecturas tardías.
- `Firma.jsx`, `ColaSinConexion.jsx`, `Listo.jsx`: bloqueo, recuperación, corrección conservando el original y textos que distinguen guardado local de confirmación remota.
- `mostradorLogica.test.mjs`: pruebas del contrato real de reparto y gramos.

Creados:

- `operacionesMostrador.js`: transiciones, recuperación, candados, estados, corrección, reconciliación y consumo de ráfagas.
- `mostradorPersistencia.js`: IndexedDB y migración sin pérdida.
- `mostradorEnvios.js`: camino común de envío, comprobación, revisión y cierre.
- `operacionesMostrador.test.mjs`: regresiones de cierre, F5, tarjetas, consultas, escaneo, cupo, vencimiento y respuestas tardías.
- `mostradorPersistencia.test.mjs`: eventos y commits simulados de IndexedDB; concurrencia, índice único, cuota y falta de almacenamiento.
- Este informe.

La UI nueva usa tokens del tema, cian/violeta para pendientes y rojo para rechazo. No incorpora ámbar. Se conserva la distribución adaptable existente. La revisión visual corresponde al coordinador.

## Verificación

- **ESLint:** `npx eslint src/features/consumibles/mostrador` — exit 0, sin errores ni advertencias.
- **Tests:** `node --test --test-isolation=none src/features/consumibles/mostrador/*.test.mjs` — **82 tests, 82 verdes**. La última pasada también se ejecutó con `--test-reporter=dot`, exit 0.
- **Comando estándar de tests:** se intentó `node --test src/features/consumibles/mostrador/*.test.mjs`; el sandbox rechazó crear los procesos del runner con **`spawn EPERM`**. El modo sin aislamiento ejecuta los mismos tests sin esos subprocesos.
- **Build solicitado:** se intentó `npx vite build --outDir /c/Users/ezequ/AppData/Local/Temp/claude/C--klasea-stock/f338cd85-119a-4082-b4a6-0e970a7022aa/scratchpad/agente-codex/build-mostrador --emptyOutDir`. El sandbox rechazó el subproceso de **esbuild** con **`spawn EPERM`** al cargar `vite.config.js`. **No se obtuvo un build**. Repetirlo en la sesión del coordinador con permisos para ejecutar esbuild; en PowerShell usar la ruta nativa `C:/Users/ezequ/.../build-mostrador`.
- **Control estático adicional:** parseo con Babel de los 24 módulos y comprobación de **212 imports locales** contra los exports reales, sin errores. No reemplaza el build.
- **Ruflo:** se localizaron las herramientas y se intentó `memory_search`. La herramienta requiere aprobación y la política es `never`; la llamada fue rechazada. No se delegaron tareas ni se creó un swarm.
- **Informe:** no se pudo crear en la ruta final por **Acceso denegado**. Se entrega este archivo dentro de la carpeta autorizada del frente.

Los tests no se conectan a Supabase. Las pruebas de IndexedDB simulan sus eventos y transacciones; falta probar almacenamiento y hardware reales en el navegador autorizado. No se hizo QA visual ni se ensayaron escrituras en producción.

## Pendientes del coordinador

**No creé migraciones:** la instrucción de este frente permite editar sólo la carpeta del mostrador.

1. **Fecha del hecho mayor a 24 horas:** `20261010160000_consumibles_endurecer.sql` reemplaza una fecha vieja por `now()`. La app suspende esos envíos y conserva su original. Para completar la regularización hace falta un mecanismo de base autorizado que preserve la fecha real. Un upsert normal desde la app no puede resolverlo.
2. **Cupo entre equipos:** el cliente conserva enviados, reconcilia ids, vuelve a consultar al cerrar y requiere autorización si la lectura es incierta. El contrato actual no valida el cupo atómicamente al insertar; dos equipos independientes todavía pueden leer el mismo saldo antes de escribir. Resolver consumo, cupo y autorización en una transacción/RPC o trigger.
3. **Archivo local:** originales y marcas terminadas se conservan deliberadamente. Una futura política de archivo debe mantener evidencia y marcas de recuperación. Si se agota el espacio, el cierre se bloquea con un error visible.
4. Mover este informe a `docs/consumibles/informe-arreglos-mostrador.md`, repetir el build estándar y completar la prueba visual y de hardware.

## Cómo probar sin producción

Usar una base de ensayo o funciones de red simuladas; revisar a 390 px y en escritorio, con temas claro y oscuro.

1. Recargar durante el envío y durante el resumen: recuperar o reconciliar el mismo lote y los mismos ids, sin otro retiro.
2. Demorar la identificación de B mientras A está por confirmar automáticamente. B debe cortar el timer de A. Dejar responder B después de cerrar, vaciar o cambiar de paso: no debe reabrir la firma.
3. Abrir tornillería sin calibrar, escribir piezas y escanear `KA0002`. Repetir con foco en el panel calibrado y sufijo Enter/Tab. No aplicar cantidad ni pesada del producto anterior.
4. Demorar el cierre y probar Escape, NFC, lector, botonera, cantidades, modo y vaciado: deben quedar bloqueados.
5. Identificar A, seguir marcando y vaciar o quitar la última línea. Cargar B: persona, destino y autorizaciones deben estar vacíos.
6. Denegar IndexedDB o simular cuota agotada antes del envío y después de la respuesta remota: no mostrar éxito. Restaurar almacenamiento y retomar los ids originales.
7. Guardar carritos distintos desde dos pestañas y reintentar el mismo lote simultáneamente. Conservar ambos; impedir que un resultado tardío pise otro. Repetir sin BroadcastChannel.
8. Cargar datos una vez, cortar la red y remontar: disponer de catálogo, padrón y obras locales. Suspender identificación: a los 7 segundos ofrecer selección manual; cupo no verificado requiere autorización.
9. Simular timeout, RLS y constraint. Distinguir incierto y rechazado; no reintentar rechazos por el reloj. Verificar ausencia de todos los ids antes de corregir, conservar original y motivo, e impedir corrección si existe una fila o hubo incertidumbre.
10. Preparar una operación mayor a 24 horas: mostrarla para regularizar sin insertarla con fecha de hoy. Descargar el original y revisar la fecha real. Si sus ids ya existen, reconciliar sin reenviar.
11. Cupo 1, retiro anterior de 1 pendiente y carrito nuevo de 1. Sincronizar el anterior durante la firma: mantener el exceso. Al leerlo en la base, contar su id una sola vez. Anularlo en ensayo y verificar la reconciliación de la anulación.
12. Repartir 20 g entre tres obras y 0,002 entre cuatro: conservar totales y ordenar materiales. Pasar un canje sin autorización a devolución: no dejar autorizaciones ocultas.
