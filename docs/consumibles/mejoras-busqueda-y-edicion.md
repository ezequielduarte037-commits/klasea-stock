# Consumibles: búsqueda, fotos y correcciones

Solicitudes y Mostrador conservan el texto al agregar productos por nombre, de modo que se puede elegir cinta de 18 mm y después cinta de 48 mm sin volver a buscar. La cantidad agregada se ve en cada resultado. Los códigos exactos siguen entrando directamente; el lector distingue el escaneo del texto de una búsqueda abierta.

Las fotos del catálogo aparecen en los resultados y renglones de solicitudes, en el carrito y en Movimientos, incluido su detalle y el historial del mostrador. Si falta una foto o no carga, se muestran las iniciales.

Las cantidades y los productos se pueden corregir durante la firma del mostrador. En una solicitud entregada, **Corregir cantidades o agregar** reabre la solicitud mediante el circuito existente de anulación; después de editar se confirma nuevamente la entrega.

Los retiros y devoluciones ya registrados tienen **Editar** en el mostrador y **Editar cantidades o agregar productos** en Movimientos. El editor trae el carrito completo, permite cambiar cantidades, agregar variantes y quitar productos, y exige un motivo. La base anula la versión anterior y guarda la nueva en una transacción, con una clave que evita duplicaciones por reintentos. Conserva la fecha, persona, empresa y precios de los productos originales. Las cantidades repartidas mantienen su suma exacta. Los nuevos productos toman el destino del primer producto del retiro y el precio vigente. Las solicitudes se corrigen desde su propio circuito.

## Activación

Aplicar `supabase/migrations/20261014120000_consumibles_corregir_operacion.sql` antes de publicar el frontend. La migración agrega el registro de correcciones, el vínculo con los movimientos originales y el RPC de edición; no modifica datos históricos. La migración y el frontend quedaron preparados en el proyecto; no se publicaron ni se aplicaron en producción en esta tarea.

## Validación

- ESLint de los archivos modificados y compilación de producción.
- 117 pruebas existentes de solicitudes, movimientos, carrito, persistencia y operaciones.
- 14 pruebas nuevas de cantidades, corrección SQL, cortes de inventario, permisos, autorizaciones, rollback, precios e identidad congelados e idempotencia.
- Prueba de navegador con API simulada: selección consecutiva de ambas cintas, escaneo sobre una búsqueda abierta, fotos, edición durante firma, guardado de cantidades en solicitudes, vista móvil y envío del carrito corregido.
