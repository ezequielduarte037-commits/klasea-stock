# Prompt para Codex — rehacer el front de la lista de obra

## Precisiones aprobadas para la implementación

Estas precisiones complementan y, ante diferencias, prevalecen sobre el texto original.

- El proyecto usa React 19.2 y Vite. Las referencias por número de línea son orientativas.
- Conservar también la lógica que vive dentro de `ObraMatrizView`: combinación de matriz/snapshot, estados, cantidades por etapa, productos compatibles, precios, stock libre y preparación de órdenes. Se permite extraerla sin alterar su comportamiento. Los mockups definen presentación, nunca cálculos ni datos.
- Inventariar las acciones existentes antes de editar y registrar su ubicación nueva: incluir configuración de producto por obra/línea, regularización con identificación de quien retiró, historial, recuperación de filas históricas y asignación/movimiento entre etapas, además de la lista original.
- Extender `MaterialThumb` y `MaterialImageUploader` mediante propiedades opcionales compatibles con sus usos actuales. Miniatura de 28–32 px en escritorio, vacío discreto con acceso a subida, fallback ante error y foco visible. Conservar las reglas de acceso existentes y no habilitar edición de materiales sin vínculo de catálogo.
- Paginar de a 50 sobre resultados ya filtrados y agrupados. La búsqueda abarca el conjunto completo. Seleccionar página y seleccionar grupo tienen alcances explícitos; la selección se conserva entre páginas. Las órdenes mantienen su alcance actual: seleccionados dentro del filtro o todos los resultados filtrados si no hay selección. Mostrar cuántos seleccionados quedan fuera del filtro.
- Un estado visual por fila; origen, incidencias y cantidad parcial son dimensiones separadas. No cambiar estados guardados, filtros o reglas para acomodarlos al dibujo. La secuencia de estado destaca la situación actual sin inventar pasos completados.
- Abrir el detalle no cambia el ancho ni desmonta la tabla: panel superpuesto lateral en escritorio y pantalla completa en móvil. Conservar página, posición, filtros y selección, devolver foco al origen y respetar el cierre de diálogos secundarios antes de cerrar el detalle.
- Eliminar ámbar y amarillo en esta pantalla y sus paneles mediante estilos acotados; no cambiar globalmente otros módulos.
- Validar lectura y navegación con obras reales pequeña, mediana y grande disponibles. Probar acciones mutantes con datos controlados, sin crear compras, egresos o borrados en producción para validar la interfaz. Informar por separado lo verificado por código, por pruebas y por navegación real; no declarar una prueba que no se pudo ejecutar.
- Preservar cambios preexistentes del workspace. No desplegar ni aplicar migraciones como parte de este trabajo.

Copiá todo lo que está debajo de la línea.

---

Vas a rehacer **el front** de la pantalla de lista de materiales por obra del sistema
Klase A. No es un rediseño desde cero ni un cambio de producto: la lógica, las
consultas, los permisos y las funciones que ya existen se conservan enteras. Lo que
cambia es cómo se ve y cómo se navega.

## La referencia visual

Ya generaste estos mockups; son el objetivo:

- `output/mockups-compras-2026-09-09/03-obra-1585-items-oscuro.png` — la estructura:
  índice por rubro a la izquierda, tabla densa con encabezado fijo, grupos plegables,
  paginado de 50, KPIs en línea arriba. **Esta es la base del layout.**
- `output/mockups-compras-2026-09-09/04-panol-detalle-claro.png` — el panel de detalle
  lateral: pestañas Resumen / Compras / Más, bloque de Cantidades, línea de estado
  Pedido → Comprado → En pañol → Entregado, y la acción principal abajo separada de
  las secundarias. **Este es el patrón del detalle.**

Tomá de ahí la jerarquía, el espaciado, el peso tipográfico y la disciplina de columnas.
No copies los datos: son inventados. Los datos salen de la base.

## Qué se toca y qué no

El componente es `ObraMatrizView`, dentro de `src/features/materiales/MaterialesScreen.jsx`
(el archivo tiene 9.989 líneas; el componente arranca en la línea 3861). Podés y conviene
extraerlo a su propia carpeta, pero **sin cambiar la API de datos**.

**No se toca:**

- `src/features/materiales/api.js` y `materialesConfig.js` — las consultas, los upserts,
  los helpers de precio y proveedor.
- El modelo de datos. Nada de migraciones nuevas para esto.
- Las reglas de negocio: cómo se calcula lo que falta, cómo se resuelve el precio vigente,
  qué cuenta como stock libre.
- Los permisos y el ruteo.

**Se conserva funcionando, aunque cambie de lugar en la pantalla** — esto es lo que más
riesgo corre en una reescritura visual, revisalo uno por uno antes de dar por terminado:

- **Configuración / condicionantes de la obra.** `panol_matriz_condicionantes`,
  `panol_matriz_condicionante_items`, `panol_obra_matriz_condicionantes`. Son las
  decisiones que definen qué lleva el barco (motorización, parrilla, opcionales) y
  suman, agregan o restan ítems de la lista. Hay 8 cargados con 34 ítems.
- **Exclusiones por obra.** `panol_obra_material_exclusiones`: ítems quitados de una obra
  puntual sin borrarlos del catálogo ni de la matriz. Hay 87 en 4 obras.
- **Adicionales**, con su marca de origen, promover a matriz y reasignar a otra obra.
- **Selección múltiple y acciones masivas.**
- **Regenerar lista fijada**, con su aviso.
- Vincular con orden de compra, avisar a pañol, editar precio, editar el ítem del
  catálogo, borrar, copiar OC.
- Las etapas de obra y el filtro por etapa.

Si algo de esto no encuentra lugar natural en el diseño nuevo, decilo en vez de sacarlo.

## Los cuadraditos de producto

Cada renglón lleva una miniatura cuadrada del material a la izquierda, como en el mockup
de pañol. Datos reales antes de que la diseñes:

- `panol_materiales.imagen_url` existe, y hay una tabla `panol_material_imagenes` para
  varias imágenes por material. Bucket `panol-materiales`.
- **De 1.895 materiales, 64 tienen imagen. Es el 3,4%.** El caso normal es el vacío.
- Ya existe el componente: `MaterialThumb` en `src/features/materiales/MaterialExtras.jsx`,
  con lightbox (`MaterialImageLightbox`), subida (`MaterialImageUploader`) y las funciones
  `uploadMaterialImage`, `setMainMaterialImage`, `deleteMaterialImage` en `api.js`.
  **Usalo, no escribas otro.**

Por lo tanto:

- El estado vacío es el estado principal, no una excepción. Que no quede un ícono de
  imagen rota ni un hueco gris que ensucie 96 de cada 100 renglones. Resolvelo con algo
  discreto y consistente — la inicial del rubro, un glifo tenue, lo que decidas — pero
  que la columna se lea prolija cuando está toda vacía.
- Hacé que el hueco vacío sea la forma de cargar la foto: click y sube. Es la única
  manera de que esa cobertura suba del 3%.
- Algunas `imagen_url` apuntan a dominios externos (Amazon, gstatic) y se pueden romper.
  Manejá el `onerror` y caé al estado vacío sin romper la fila.
- La miniatura no puede empujar la densidad: la fila tiene que seguir siendo compacta.
  Ajustá el alto de fila a la miniatura, no al revés.

## La cabecera

Hoy es invasiva y hay que bajarla. El problema concreto, en `MaterialesScreen.jsx`
alrededor de la línea 5208: es una tarjeta con `borderRadius: 22`, fondo con gradiente,
padding 16, un `h2` de 28px, una fila de pastillas de estado, otra fila con los controles
de panel y otra con los KPIs. Ocupa un tercio de la pantalla antes de que aparezca el
primer dato.

Como en el mockup 03: título de obra y modelo en una línea, los KPIs al lado en la misma
banda, sin tarjeta ni gradiente, sin sombra. Que la tabla empiece arriba.

También hay un bloque duplicado con `display: "none"` cerca de la línea 5348 (los botones
Configuración / Adicionales / Excluidos) que es código muerto. Borralo.

## Escala

Los números reales del sistema, para que no diseñes para una lista de 20 renglones:

- 1.895 materiales en el catálogo, 7.664 filas de snapshot por obra, 40 proveedores.
- **Una obra tiene entre 1 y 1.585 ítems. La mediana es 174.**
- 13 a 20 rubros por línea.
- Cobertura de precios por línea: K37 91%, K52 43%, K55 34%.

Índice por rubro a la izquierda con el conteo, encabezado de tabla fijo, grupos plegables,
búsqueda sobre el conjunto completo y no sobre la página. Paginado de 50 o virtualización
— elegí según la consulta real, pero no rendericés 1.585 filas de una.

## Tema claro y oscuro

El sistema ya tiene los dos, más un modo de alto contraste. Usá las variables de
`src/theme/palette.css` a través de `@/theme` (`C.blue`, `C.green`, `C.red`, `C.violet`,
`C.panel`, `C.panelSolid`, `C.border`, `C.text`, `C.muted`, `C.dim`, `C.mono`…) o
directamente `var(--panel-solid)`, `var(--border)`, `var(--text)`.

- **Nada de ámbar ni amarillo.** Está prohibido en este sistema. Si necesitás un tercer
  color de estado, usá violeta o cyan.
- Nada de negros hardcodeados que revienten el modo claro.
- Probá los tres temas antes de terminar.

## Cómo tiene que sentirse

Esto es lo que el pedido llama "más armonioso", en concreto:

- Abrir y cerrar el detalle no mueve la tabla ni pierde la posición, los filtros ni la
  selección. Volver deja el foco donde estaba.
- El detalle es un panel lateral, no un modal que tape todo. Se cierra con Esc.
- Una etiqueta de estado por fila, no nueve. Pendiente, Pedido, Comprado, En pañol,
  Parcial, Entregado.
- Teclado: flechas recorren filas cuando la tabla tiene foco, Enter abre el detalle,
  Espacio selecciona, Esc cierra. No interceptar esas teclas dentro de los campos.
- Transiciones cortas y consistentes (120–200 ms). Nada que rebote.
- Hover legible en las filas y foco visible en todo lo interactivo.
- A 1280 px la tabla sigue siendo usable. En tablet — hay tablets en el pañol — la
  navegación se pliega, la fila muestra material, cantidad y estado, los controles táctiles
  tienen 44 px y el detalle va a pantalla completa.

## Convenciones del proyecto

- React 18 + Vite. Español rioplatense en toda la interfaz: etiquetas cortas y directas,
  sin explicaciones largas ni instructivos dentro de los campos.
- Estilos inline, que es la convención de la casa; bloques `<style>` locales solo para
  hover y keyframes.
- `useResponsive()` para el corte móvil (900 px).
- Íconos de `lucide-react`.
- Ojo con eslint: no tiene el plugin de React, así que un componente que llega por prop y
  se usa solo en JSX se marca como `no-unused-vars`. El truco de la casa es
  `const Icono = icono;` dentro del cuerpo.
- **No corras `npx supabase db push`.** Las migraciones en este proyecto se aplican a mano
  en el editor SQL de Supabase.

## Antes de dar por terminado

1. `npx eslint` sobre los archivos tocados y `npm run build`, los dos limpios.
2. Abrir una obra real y recorrer la lista de los tres puntos: la de 174 ítems, la de
   1.585 y una chica.
3. Verificar uno por uno los ítems de la lista "se conserva funcionando" de más arriba.
4. Los tres temas.
5. Decir explícitamente qué quedó afuera, si algo quedó afuera.

## Cómo quiero la respuesta

Primero, en pocas líneas: qué estructura vas a usar y qué decidiste para el estado vacío
de las miniaturas. Después implementá. Si algo de lo que te conté no cierra con lo que
encontrás en el código, decilo antes de tocar nada.
