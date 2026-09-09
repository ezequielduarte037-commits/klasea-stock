# Klase A — propuestas visuales para listas de compras

Cuatro imágenes conceptuales generadas con la herramienta integrada image_gen. Materiales, proveedores, precios y cantidades son ejemplos. No se modificó la aplicación. Los porcentajes del brief corresponden a líneas: las imágenes los reutilizan como valores ilustrativos, no como mediciones verificadas de esas obras.

## Diagnóstico

La pantalla actual usa la estructura de almacenamiento como estructura de trabajo. Obliga a Compras, Pañol, Oficina técnica y Dirección a deducir su siguiente acción a partir de estados mezclados. Además confunde tres dimensiones: origen del material, situación del abastecimiento y cantidades efectivamente recibidas o entregadas.

## Dos direcciones

| Dirección | Qué cambia | Costo relativo y compromiso |
| --- | --- | --- |
| A. Tabla evolucionada | Resumen compacto, vistas por rol, filtros consistentes, adicionales integrados y detalle lateral. Imagen 01. | Menor costo y menor cambio de hábitos. Conserva buena parte del modelo actual; sigue haciendo de la tabla el centro de la experiencia. |
| B. Mesa de trabajo por rol | Cada rol entra a una bandeja con columnas, agrupación y acción principal propias, sobre los mismos ítems. Imágenes 02 a 04. | Mayor costo: separar consultas, selección, acciones y componentes del monolito actual; preservar navegación y permisos. Reduce la configuración repetitiva. Es la dirección recomendada. |

El costo es comparativo; no se estimaron horas sin revisar implementación y reglas de negocio. Ambas direcciones admiten temas claro y oscuro. Los cuatro mockups muestran variantes de cada pantalla, no todas las combinaciones de pantalla y tema.

## Estructura propuesta

En los primeros tres segundos: obra y modelo, cantidad pendiente de compra, cantidad por recibir y cantidad lista para entregar. Son cantidades de ítems, no unidades de materiales ni porcentajes de avance de construcción.

- Compras: abrir Por comprar, agrupado por proveedor. Mostrar necesario, disponible sin asignar, cantidad a pedir y precio. Seleccionar ítems o proveedor y Armar pedido. El stock libre exige asignación explícita antes de reducir la compra; los materiales sin precio conservan ese aviso.
- Pañol: Por recibir, Por entregar y Entregados. Priorizar cantidades y acciones de recepción o entrega. Registrar entrega desde el detalle y conservar la posición al volver.
- Seguimiento: todos los ítems y navegación por rubro, con pendientes visibles. No inferir atrasos, criticidad ni bloqueos de construcción sin fechas o dependencias que el brief no proporciona.
- Costos: valorización de los ítems con precio y cobertura del cálculo. Un precio ausente no equivale a cero. Sin comprobar precios históricos de órdenes o movimientos, no presentar esa valorización como gasto real ni compararla con un presupuesto inexistente.

## Estados y adicionales

Una etiqueta principal por fila: Pendiente, Pedido, Comprado, En pañol, Parcial o Entregado. Entregado es el nombre visible de egresado. Recibido y en_panol deben unificarse visualmente solo si ambos implican disponibilidad física equivalente; esa equivalencia debe verificarse antes de implementar. Parcial se explica con las columnas Recibido y Entregado, evitando ambigüedad entre recepción y entrega incompletas.

Un ítem parcialmente abastecido puede necesitar tanto compra como entrega. Las bandejas operativas pueden superponerse por cantidades pendientes; sus contadores no deben sumarse como un total único. Los resúmenes ilustrativos de las imágenes usan una clasificación principal para facilitar su lectura, no definen la lógica definitiva.

Los adicionales permanecen en la tabla con una marca de origen y el filtro Tipo. No tienen buscador ni bloque independientes. Promover a matriz y reasignar obra quedan en Más acciones del detalle, junto con editar catálogo y borrar. Editar precio queda junto al campo. Las acciones habituales de cada rol permanecen visibles; las masivas aparecen al seleccionar.

## Escala, teclado y tablet

Para 248 o 1.585 ítems: mismo tamaño de texto, encabezados fijos, búsqueda sobre el conjunto completo, grupos plegables, índice por rubro y páginas de 50. El mockup grande muestra la página 5 de 32. Conservar filtros, selección y posición al abrir/cerrar el detalle; distinguir selección de página, grupo y resultados completos. Implementar paginación o virtualización según la consulta real, sin renderizar 1.585 filas completas a la vez.

A 1280 px: plegar la navegación global y priorizar las columnas del rol; propiedades secundarias van al detalle. En tablet: navegación plegable, filas con material, cantidad y estado, controles táctiles de al menos 44 px y detalle a pantalla completa. No reducir toda la tabla hasta volverla ilegible.

Teclado propuesto: Tab recorre controles, flechas recorren filas cuando la tabla tiene foco, Enter abre el detalle, Espacio selecciona y Esc cierra devolviendo el foco. Mantener foco visible y no interceptar esos atajos dentro de campos. La imagen no verifica comportamiento responsive, contraste medido ni accesibilidad funcional; requieren validación al implementar.

## Archivos

- 01-tabla-obra-oscuro.png: tabla evolucionada, obra de 248 ítems.
- 02-compras-proveedor-claro.png: bandeja de Compras agrupada por proveedor.
- 03-obra-1585-items-oscuro.png: Seguimiento con navegación de una obra grande.
- 04-panol-detalle-claro.png: Pañol con panel de material y entrega.
- prompts.md: prompts completos y correcciones finales.

Se usaron las guías locales de imagegen y UI/UX Pro Max. El buscador Python de UI/UX no estuvo disponible; se aplicaron sus principios generales. Una consulta auxiliar a Ruflo fue bloqueada por revisión automática por el riesgo de enviar contexto interno a un destino externo. No se reintentó ni se utilizó ese servicio para producir los archivos.
