# Remitos de plantillas de marmolería

Aplicar completa la migración `supabase/migrations/20261015150000_marmoleria_remitos_plantillas.sql` en Supabase. Es transaccional y puede volver a ejecutarse. Los roles admin, técnica y oficina, y los perfiles administradores activos, pueden emitir y consultar; los perfiles demo no pueden emitir.

En **Marmolería → Remitos**, seleccionar plantillas por barco, sector o búsqueda. La selección se conserva al cambiar los filtros y puede combinar barcos. También se puede entrar desde **Crear remito de plantillas** en el detalle de una embarcación.

El selector ofrece únicamente piezas en estado **Pendiente**, y el filtro de barcos muestra solo los que tienen pendientes. Enviadas, recibidas, a rehacer y las que no llevan quedan fuera de nuevos remitos. Si una pieza seleccionada deja de estar pendiente mientras se prepara el remito, se retira de la selección con un aviso. Las reimpresiones siguen disponibles en **Emitidos**.

La flota separa **Activos** y **Archivados**. Un barco se archiva automáticamente cuando todas sus piezas aplicables están recibidas, sin borrar ni desactivar datos. Los barcos archivados no generan pedidos de plantillas en la planificación. Al agregar una pieza o cambiar una recibida a otro estado, el barco vuelve a Activos. Un checklist vacío o compuesto solo por piezas que no llevan no cuenta como un barco recibido.

Completar destinatario, fecha, responsable, material y cantidades. El nombre de quien retira es opcional: puede completarse en papel. Vista previa permite revisar las dos copias antes de emitir. El original se conserva firmado; el duplicado se entrega a la marmolería. El registro digital conserva los datos; la firma es en papel.

Cada emisión guarda una captura de barco, línea, pieza, sector, material, cantidad y observaciones. La numeración `MAR-000001` la asigna la base y los reintentos de la misma solicitud usan el mismo identificador. **Emitidos** permite ver y descargar nuevamente ambas copias con la información original. Emitir el documento no modifica los estados del checklist; se siguen gestionando en el detalle del barco.

La impresión usa un formato de remito con destinatario y responsables en recuadros, tabla de plantillas y materiales, y campos separados para firma, aclaración y DNI debajo del detalle. Cuando el contenido entra a tamaño legible, original y duplicado comparten una hoja A4 con línea de corte. Los documentos más extensos usan hojas A4 completas, con encabezado y firmas en cada hoja; las observaciones generales aparecen al final de cada copia. La distribución se calcula con el contenido real, sin reducir la letra para hacerla entrar.

Validación: `node --test src/features/marmoleria/*.test.mjs`, ESLint de los archivos modificados, compilación de producción, prueba SQL aislada en PostgreSQL/PGlite y prueba de navegador con API simulada (selección entre barcos, materiales, cantidades, vista previa, respuesta perdida, reimpresión, celular y ambos temas).
