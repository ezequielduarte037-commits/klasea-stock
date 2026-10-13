# Etiquetas de consumibles con retiros registrados

Se enviaron **101 etiquetas**, una por producto distinto: las cinco etiquetas de la prueba se reimprimieron primero y luego se enviaron las otras 96 en tandas de 25, 25, 25 y 21. Todas las llamadas de impresión terminaron correctamente y la cola quedó vacía, con la P1S en estado Normal.

El criterio indicado por el usuario es imprimir consumibles que se consumieron. El registro nuevo aporta 21 productos; el histórico de retiros aporta 96, con 16 productos presentes en ambas fuentes. El conjunto contiene 101 productos activos de Consumibles con código de etiqueta vigente y retiros registrados, desde el 05/08/2026 hasta el 13/10/2026. Por ese criterio la tanda terminó en 101 y no se completó con productos sin consumo.

La consulta fue de lectura con la CLI de Supabase. Se usó `consumibles_movimientos` sin anulaciones y el histórico de `panol_obra_materiales_snapshot` con origen `solicitud_consumible_retiro`, cantidades positivas y sin marca de anulación. En los productos históricos fusionados se tomó el producto activo solamente cuando había una coincidencia única del nombre anterior dentro del alias. Los movimientos del registro nuevo presentes en la selección son todos retiros.

Se conservó el componente real de la app, sus fuentes y la regla global `box-sizing: border-box`. El PDF contiene 101 páginas exactas de 40 × 30 mm y las imágenes de impresión miden 320 × 240 píxeles a 203 ppp. Se comprobaron la carga de las fuentes, las dimensiones, los QR y barras dentro de la página y la conservación de los gráficos sin escala; también se revisaron las imágenes renderizadas, incluidos los códigos de diez caracteres.

Se imprimió con Windows PrintDocument, impresora explícita **P1S Label Printer**, papel **D 40 x 30 mm**, 203 ppp, márgenes cero, una copia por página y DrawImageUnscaled. No se cambiaron las preferencias de la impresora. La P1S sigue como predeterminada, según la autorización previa del usuario.

Las 46 pruebas de etiquetas pasaron y los cuatro archivos de etiquetas de la app permanecieron sin cambios. No se escribió en la base ni se marcaron etiquetas como impresas en la app.

`lista-etiquetas.csv` conserva el orden, código, descripción, unidad, último movimiento y fuente de cada etiqueta. `final-status.json` y los resultados de cada tanda registran los envíos. La lectura física con el lector corresponde al usuario: en Consumibles → Etiquetas → Prueba, el QR y las barras deben devolver el mismo código. Los códigos largos de esta tanda son PEROXID010, PARGOT0025 y PARFRE0025.
