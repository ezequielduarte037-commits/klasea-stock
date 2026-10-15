# Remitos de plantillas de marmolería

Aplicar completa la migración `supabase/migrations/20261015150000_marmoleria_remitos_plantillas.sql` en Supabase. Es transaccional y puede volver a ejecutarse. Los roles admin, técnica y oficina, y los perfiles administradores activos, pueden emitir y consultar; los perfiles demo no pueden emitir.

En **Marmolería → Remitos**, seleccionar plantillas por barco, sector o búsqueda. La selección se conserva al cambiar los filtros y puede combinar barcos. También se puede entrar desde **Crear remito de plantillas** en el detalle de una embarcación.

Completar destinatario, fecha, responsable, material y cantidades. El nombre de quien retira es opcional: puede completarse en papel. Vista previa permite revisar las dos copias antes de emitir. El original se conserva firmado; el duplicado se entrega a la marmolería. El registro digital conserva los datos; la firma es en papel.

Cada emisión guarda una captura de barco, línea, pieza, sector, material, cantidad y observaciones. La numeración `MAR-000001` la asigna la base y los reintentos de la misma solicitud usan el mismo identificador. **Emitidos** permite ver y descargar nuevamente ambas copias con la información original. Emitir el documento no modifica los estados del checklist; se siguen gestionando en el detalle del barco.

Validación: `node --test src/features/marmoleria/*.test.mjs`, ESLint de los archivos modificados, compilación de producción, prueba SQL aislada en PostgreSQL/PGlite y prueba de navegador con API simulada (selección entre barcos, materiales, cantidades, vista previa, respuesta perdida, reimpresión, celular y ambos temas).
