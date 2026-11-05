# Revisión de precios y factores de compra — 05/11/2026

> **Actualización posterior a la revisión:** por pedido del usuario se aplicó en producción la corrección de 12 presentaciones de precio, se separó el factor del precio del contenido físico de compra y se agregó auditoría de cambios. Según su confirmación de retiro generalmente por peso, E0011, C0049 y C0050 quedaron por kg y con ingreso de peso. Quedan cinco presentaciones comerciales por confirmar (H00161, P0056BOSCH, S0015, B00241 y C00191), protegidas contra cambios de costo por lista, conservando sus costos actuales. Los factores de compra se conservaron. El respaldo completo quedó en la base y en `backups/rest-auditoria-factores-20261105/`. El análisis que sigue documenta la situación anterior a la corrección.

Se revisaron los **659 consumibles activos**, sus configuraciones, los **649 renglones de la lista cargada** y **3.662 movimientos disponibles**, incluidos los anulados para identificarlos y excluirlos del análisis de cambios de costo. Se profundizó en las **56 fichas con factor mayor que 1** y en las bajas históricas superiores al 40%. Esta revisión fue de lectura: no se modificaron fichas, listas ni movimientos.

## Resultado

- **4 fichas con costo actual incorrectamente reducido**, con respaldo de precio por unidad/litro en la lista del proveedor.
- **8 fichas cuyo costo actual coincide con la presentación de entrega, pero cuyo factor podría reducirlo al recalcular desde la lista.**
- **4 fichas con diferencias adicionales que requieren confirmar el contenido o la cotización.**
- **4 fichas con costo reducido que requieren confirmar la unidad física entregada o la presentación cotizada.**

Son **20 fichas distintas señaladas**. Las otras 36 fichas con factor mayor que 1 no presentaron estas señales; eso no certifica sus presentaciones físicas. Los 10 consumibles activos sin vínculo a un renglón de lista no pudieron contrastarse contra un precio del proveedor. P0001 ya estaba corregido a $8.858 y factor 1 al iniciar esta revisión; se excluye de los 20 casos.

## 1. Cuatro casos claros con costo actualmente reducido

Los valores de referencia en pesos conservan la lista y el tipo de cambio **ya cargados en el sistema**. No constituyen una nueva cotización ni incorporan IVA.

| Código | Producto | Costo actual ARS | Referencia cargada por unidad de entrega ARS | Hallazgo | Primera aparición del costo reducido en movimientos |
|---|---|---:|---:|---|---|
| S0001 | Sellador 3M PU550 blanco 310 ml | 958,65 | 11.503,80 por cartucho | Precio unitario dividido por caja de 12 | 04/11/2026 09:20 |
| S0002 | Sellador 3M PU550 negro 310 ml | 958,65 | 11.503,80 por cartucho | Precio unitario dividido por caja de 12 | 05/11/2026 11:15 |
| S0005 | Sellador 3M 4000UV | 4.209,3333 | 50.512,00 por cartucho | Precio unitario dividido por caja de 12 | 04/11/2026 12:47 |
| D000111 | Diluyente por litro | 338,80 | 3.388,00 por litro | Precio ya cotizado por litro reducido a una décima parte; además, el factor actual es 20, por lo que otro recálculo daría 169,40 | 04/11/2026 10:41 |

Horarios de Argentina. Las fechas de la última columna corresponden al **primer movimiento observado con ese costo**, no necesariamente al instante de edición de la ficha.

La lista PDF confirma que los selladores se cotizan por unidad y el diluyente de limpieza por litro, aunque se entregue en bidón. Para los selladores 310 ml, el PDF distingue USD 6,85 + IVA y otra columna USD 7,47. El sistema conserva USD 7,47 con condición Final; esta revisión toma esa referencia para aislar la división por 12, sin resolver ni modificar la diferencia de condición comercial. Para el diluyente, el PDF presenta variantes por litro y el CSV tiene USD 2,20 en D000111; ninguna fuente respalda dividir una cotización por litro entre el contenido de un bidón.

Las últimas ediciones de configuración de S0001, S0002 y S0005 quedaron el 04/11 entre las 08:21:26 y 08:21:58, asociadas a `tomas.viyagra`. La última edición de D000111 figura el 04/11 a las 13:52:35 con el mismo usuario. **No existe auditoría por campo de consumibles_config**, por lo que estos metadatos no prueban qué campo modificó la persona en cada edición.

Se encontraron **13 retiros vigentes** de estas cuatro fichas con costo reducido, que suman **18 unidades de entrega** (14 cartuchos y 4 litros). No se revalorizaron movimientos históricos.

## 2. Ocho fichas con precio actual coherente y factor incompatible con su cotización

El proveedor cotiza el cartucho, rollo, hoja o envase completo. La configuración de entrega también indica esas unidades. El factor de caja o el peso del envase no debe dividir automáticamente ese precio unitario.

| Código | Producto | Costo actual ARS | Factor actual | Costo que produciría lista / factor ARS |
|---|---|---:|---:|---:|
| TEROSON | Teroson 939 negro 420 g | 23.596,00 | 12 | 1.966,3333 |
| S0003 | Sellador 3M PU550 blanco 600 ml | 13.274,80 | 12 | 1.106,2333 |
| C0037 | Cinta DobleA #988 48 mm × 50 m, por rollo | 5.423,60 | 18 | 301,3111 |
| C0032 | Cinta papel DobleA verde 48 mm, por rollo | 5.287,36 | 18 | 293,7422 |
| C0034 | Cinta DobleA #988 18 mm × 50 m, por rollo | 2.059,20 | 48 | 42,90 |
| L0023 | Lija al agua AA #2000, por hoja | 1.334,9292 | 50 | 26,6986 |
| M0015 | Masilla Finish Zeocar, envase 4 kg | 36.562,00 | 4 | 9.140,50 |
| M0017 | Masilla Zeocar azul, envase 4 kg | 28.742,00 | 4 | 7.185,50 |

El PDF del proveedor respalda estas presentaciones y precios, con redondeos y las dos condiciones comerciales en algunas filas. En las masillas, la conclusión supone la entrega del envase completo, tal como indica actualmente la ficha (`unidad`); si se fraccionan por kilogramo, debe registrarse y costearse esa unidad explícitamente.

**Ya hubo antecedentes:** S0003, L0023 y C0032 tienen movimientos que alternan entre el precio completo y el dividido por caja. S0003 bajó a $1.106,2333 el 22/10 y volvió a $13.274,80 el 23/10; L0023 bajó a $26,6986 el 22/10 y volvió a $1.334,9292 el 26/10; C0032 bajó a $293,7422 el 20/10 y volvió a $5.287,36 el 21/10. Se observa un problema que puede reaparecer al recalcular, aunque el costo actual sea coherente.

## 3. Cuatro diferencias adicionales que requieren respaldo de presentación

| Código | Producto | Costo actual ARS | Configuración / diferencia |
|---|---|---:|---|
| H00161 | T130RF PRO hoja de calar en blíster | 3.891,64 | Lista $19.458,20; el costo actual equivale a dividir por 5, pero el factor figura en 2. Confirmar cuántas hojas trae el blíster. |
| P0056BOSCH | Punta PH2 × 50 mm Bosch | 1.148,14 | Factor 3 por blíster; el precio de lista también es $1.148,14. Confirmar si se cotiza por punta o por blíster; 50 mm es longitud. |
| S0015 | Sellador Siloc 8600 × 420 g | 60.848,45 | Factor 12; el costo conservado es el precio completo de lista. Confirmar si ese importe corresponde a caja o cartucho antes de dividirlo. Tiene un ingreso histórico con valor dividido y retiros posteriores con valor completo. |
| B00241 | Bolsa de consorcio reforzada 130–100 | 474,03 | Factor 10; el costo conservado es el precio completo de lista. Las cifras 130–100 son medidas, no cantidad del pack. Confirmar cotización por bolsa o paquete. |

## 4. Cuatro costos reducidos con unidad de entrega por confirmar

| Código | Producto | Costo actual ARS | Referencia de lista ARS | Qué falta confirmar |
|---|---|---:|---:|---|
| C00191 | Cinta doble faz Rapifix 36 mm | 504,8250 | 12.115,80 | Compra caja ×24 y entrega rollo. El costo actual equivale a dividir por 24; confirmar si la lista cotiza caja o rollo. Primer movimiento reducido: 29/10 a las 08:11. |
| E0011 | Estopa blanca lustre por kg | 238,00 | 2.380,00 por kg | Factor 10 y entrega `unidad`. Confirmar si cada unidad es una porción de 100 g; si se entrega 1 kg, el costo está diez veces por debajo. Primer movimiento reducido: ingreso del 29/10 a las 14:18. |
| C0049 | Cola vinílica FANA, envase 4 kg | 4.431,35 | 17.725,40 por envase | Factor 4, forma fraccionado y entrega `unidad`. El costo actual es por kg; confirmar si se entrega un kilo o el pote completo. Primer movimiento reducido: ingreso del 30/10 a las 14:28. |
| C0050 | Cola vinílica FANA ×20 | 4.125,2257 | 82.504,5144 | Factor 20 y entrega `unidad`. Confirmar si se entrega kg o balde completo. El costo configurado es una vigésima parte; el único movimiento disponible conserva el costo completo anterior. |

## Causa compartida y criterio de resolución

La aplicación utiliza `factor_compra` tanto para convertir cantidades de compra a entrega como para dividir el precio de lista. Eso funciona cuando el precio representa el paquete o envase completo. Si el proveedor ya cotiza el precio por cartucho, rollo o litro, cargar la cantidad de una caja o bidón en ese factor puede reducir el costo por segunda vez.

El editor de la ficha recalcula el costo al modificar el factor, y la aplicación de costos de lista también divide por ese factor. Por eso **no es seguro aplicar masivamente los costos calculados** ni poner todos los factores en 1: los factores de precintos, filtros, guantes por par, blísteres y líquidos realmente fraccionados pueden ser legítimos. Además, cambiar un factor puede alterar las cantidades que se ingresan por caja; hay que preservar esa conversión al corregir la base del precio.

También se detectó una limitación de trazabilidad: el editor puede recalcular `costo_unitario_ars` sin actualizar `costo_actualizado_at`. En los tres selladores con bajas recientes esa fecha sigue en octubre, aunque los movimientos muestran el cambio en noviembre. Para investigar fechas se usaron los movimientos y la última edición general de la ficha, sin presentar la fecha de costo como prueba definitiva.

## Fuentes y límites

- Base de producción consultada el 05/11/2026: consumibles_config, panol_materiales, consumibles_lista_items, consumibles_listas, consumibles_movimientos y profiles. La tabla de movimientos contiene 3.662 filas en el momento de consulta; se excluyeron anulados de la detección de cambios y del conteo de retiros afectados.
- PDF original: `C:/Users/ezequ/Downloads/Lista Klase 30-10-2026.pdf`, página 1, leído y revisado visualmente.
- CSV por código: `C:/Users/ezequ/Downloads/Lista de precios Klase A  - Lista Klase A (1).csv`, vigente al 29/10/2026. Se utilizó el código exacto para contrastar productos y moneda. No se interpretaron notas comerciales como instrucciones de edición.
- Lógica vigente de edición de ficha y aplicación de costos de lista. Los archivos locales contienen otros cambios en curso, que esta revisión no modificó.

Las conclusiones distinguen costos actuales incorrectos, factores incompatibles con la cotización y presentaciones que requieren confirmación. No se aplicaron descuentos por volumen, no se sumó IVA, no se actualizó el tipo de cambio y no se corrigió retrospectivamente ninguna operación.
