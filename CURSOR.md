# Bienvenido a KlaseA

Este documento es la puerta de entrada al proyecto para cualquier persona o asistente de IA que trabaje desde Cursor.

KlaseA no es solamente una aplicación de stock. Es el sistema operativo interno de un astillero: conecta producción, obras, materiales, compras, proveedores, pañol, entregas, costos, postventa y otras áreas que participan en la fabricación de cada embarcación.

Si abrís el proyecto por primera vez, empezá leyendo este archivo y después consultá [Cómo funciona el sistema](docs/como-funciona-el-sistema.md) para conocer el circuito funcional con mayor profundidad.

> En Cursor podés escribir `@CURSOR.md` al comenzar una conversación para darle este contexto al asistente.

## La idea central

Cada barco se administra como una **obra**. La obra pertenece a una línea o modelo de producción —por ejemplo K52 o K55— y necesita materiales para avanzar por sus etapas.

El recorrido principal es:

```text
Matriz del modelo
       ↓
Materiales de la obra
       ↓
Pedido a Compras
       ↓
Compra y aviso al Pañol
       ↓
Recepción física
       ↓
Stock disponible
       ↓
Egreso y entrega a la obra
```

La regla más importante es sencilla:

> **Comprar un producto no crea stock. Solamente la recepción física confirmada por Pañol crea stock.**

Un artículo comprado o enviado puede estar “en camino”, pero todavía no está disponible para entregar.

## Para qué se usa

Los principales módulos cubren:

- **Producción y obras:** seguimiento de barcos, etapas, tareas, fechas y avance.
- **Materiales:** necesidad de cada obra, cantidades, adicionales y estado de abastecimiento.
- **Compras:** solicitudes, cotizaciones, órdenes, proveedores y recepción esperada.
- **Pañol:** stock maestro, stock por obra, movimientos, ingresos, egresos, transferencias, devoluciones y estandarización.
- **Catálogo:** productos concretos, códigos, proveedores, imágenes, ubicaciones y datos técnicos.
- **Costos y precios:** seguimiento económico por material y por embarcación.
- **Laminación, muebles, tornería y marmolería:** circuitos específicos de fabricación.
- **Postventa y tickets:** seguimiento de incidencias posteriores a la entrega.
- **RR. HH., procedimientos y configuración:** soporte a la operación general.
- **PDA, escáner, etiquetas y balanza:** herramientas de uso físico dentro del taller y el pañol.

La aplicación tiene permisos por rol. No todos los usuarios ven o pueden modificar lo mismo. Entre los roles existentes están administración, oficina, técnica, compras, pañol, producción, laminación, muebles, mecánica, electricidad, RR. HH., cliente y cadete.

## Conceptos que conviene entender antes de programar

### Matriz y obra

La **matriz** es la lista base de materiales de un modelo de barco. Al crear o preparar una obra se toma una copia de esa matriz, llamada snapshot.

La copia es intencional: modificar hoy la matriz de K55 no debe cambiar silenciosamente una obra que ya estaba en producción. Cada obra puede además tener materiales adicionales o necesidades particulares.

### Requisito y producto

No son lo mismo:

- Un **requisito** expresa una necesidad genérica, como “TV 32 pulgadas”.
- Un **producto o SKU** es el artículo concreto que se compra, recibe y almacena.

El requisito ayuda a planificar. El producto concreto tiene código, proveedor, ubicación, movimientos y stock. No se debe inventar un producto nuevo sólo porque una búsqueda no devolvió resultados: primero hay que comprobar aliases, códigos alternativos y posibles duplicados.

### Las cantidades de una obra

Para un material pueden coexistir varias cantidades:

1. Cantidad necesaria.
2. Cantidad solicitada.
3. Cantidad comprada.
4. Cantidad recibida.
5. Cantidad entregada a la obra.

Por eso “falta comprar” y “falta entregar” representan problemas diferentes.

### El stock es un libro de movimientos

No existe una única cantidad que deba sobrescribirse. El saldo se deriva de los movimientos válidos:

```text
stock = suma de ingresos - suma de egresos
```

La implementación canónica del cálculo en el frontend está en [panolMovimientos.js](src/features/panol/panolMovimientos.js). En la base existe además la función SQL `panol_stock_movimiento_delta`.

Los movimientos históricos no deben borrarse ni retocarse para “hacer coincidir” un saldo. Una corrección se registra mediante un movimiento compensatorio y trazable.

## El módulo de Pañol

La pantalla principal de stock está organizada en tres enfoques:

- **Inventario:** qué productos hay, cuánto saldo tienen y dónde están.
- **Por obra:** qué materiales están asociados, asignados o entregados a cada barco.
- **Movimientos:** historial operativo, devoluciones y trabajo de estandarización.

La estandarización permite revisar ingresos creados durante la operación, enfocarse en una línea y una obra, decidir si un artículo pasa a ser estándar o queda como puntual, corregir su denominación y completar opcionalmente código, proveedores, precio, cantidad verificada y otros datos.

Las operaciones de stock deben usar las funciones RPC del dominio. Algunas de las principales son:

- `panol_ingresar_stock_general`
- `panol_registrar_conteo_fisico`
- `panol_egresar_producto`
- `panol_egresar_carrito`
- `panol_transferir_producto`
- `panol_crear_envio`
- `panol_marcar_items`
- `panol_egresar_obra_materiales`
- `panol_set_stock_minimo`
- `panol_crear_catalog_material`

Evitá insertar movimientos directamente desde un componente. Las RPC concentran validaciones, trazabilidad y actualizaciones relacionadas.

## Arquitectura técnica

El proyecto es una SPA construida con:

- React 19
- React Router 7
- Vite 7
- Supabase para autenticación, PostgreSQL, RPC, Storage y Edge Functions
- Lucide para iconografía
- Recharts para gráficos
- SheetJS y jsPDF para importación y exportación
- Vercel para el hosting del frontend

El frontend se inicia en [main.jsx](src/main.jsx), las rutas y permisos generales están en [App.jsx](src/App.jsx), y la conexión pública a Supabase se configura en [supabaseClient.js](src/supabaseClient.js).

### Estructura del repositorio

```text
src/
├── App.jsx                 Rutas, guardas y estructura general
├── main.jsx                Entrada de la aplicación
├── supabaseClient.js       Cliente público de Supabase
├── assets/                 Recursos del frontend
├── components/             Componentes compartidos
├── features/               Módulos de negocio
├── legacy/                 Código anterior aún conservado
└── theme/                  Tokens y comportamiento del tema

supabase/
├── migrations/             Evolución de la base de datos
├── functions/              Edge Functions
└── config.toml             Configuración local de Supabase

docs/                       Documentación funcional y técnica
tools/                      Puentes de escáner y NFC
backups/ y exports/         Evidencia histórica, no código de ejecución
```

Dentro de `src/features`, cada dominio mantiene juntas sus pantallas, componentes, helpers y acceso a datos. La guía breve está en [src/features/README.md](src/features/README.md).

No edites `dist/` ni `node_modules/`: son resultados generados. Tampoco tomes automáticamente un SQL suelto, un backup o un export como fuente vigente; primero verificá si está representado en `supabase/migrations` y en el código actual.

## Cómo levantar el proyecto

Requisitos recomendados:

- Node.js compatible con Vite 7.
- npm.
- Un archivo local de variables de entorno con las credenciales públicas del proyecto.

Variables públicas necesarias:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Nunca pegues en el chat, imprimas en consola ni subas al repositorio contraseñas, tokens privados o una `service_role`.

Comandos habituales:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

`npm run dev` levanta el entorno local. `npm run build` es la validación mínima antes de considerar terminada una modificación de interfaz o lógica.

La aplicación mantiene compatibilidad con dispositivos PDA y navegadores antiguos usados en planta. Antes de incorporar APIs nuevas del navegador, comprobá que tengan un fallback razonable.

## Convenciones de interfaz

La interfaz está en español y busca sentirse como una herramienta operativa clara y compacta, no como un panel de marketing.

Al modificar una pantalla:

- Conservá los tokens existentes de `src/theme`, [theme.css](src/theme.css) y [palette.css](src/theme/palette.css).
- Verificá tema claro y oscuro.
- Usá Lucide para iconos en lugar de símbolos improvisados.
- Priorizá los elementos de trabajo; los KPIs y encabezados no deben quitarles espacio.
- Mantené jerarquía visual entre nombre, código, proveedor, rubro, cantidades y estado.
- Evitá crear una estética aislada dentro de un módulo.
- Revisá escritorio, resoluciones angostas y dispositivos táctiles.
- Conservá el texto en español y el vocabulario que ya usa cada área.

El repositorio combina CSS global con estilos cercanos a los componentes. Antes de introducir un patrón nuevo, buscá cómo se resolvió algo equivalente en una pantalla reciente.

## Base de datos y Supabase

Los cambios de esquema se hacen mediante migraciones nuevas y acotadas en `supabase/migrations`. No reescribas una migración que ya pudo haberse aplicado.

La historia local de migraciones y la base remota no siempre están perfectamente sincronizadas. Por eso:

1. Inspeccioná el esquema y el uso real antes de escribir SQL.
2. Creá una migración aislada con nombre y fecha claros.
3. Revisá exactamente qué migraciones quedarían pendientes.
4. No ejecutes un `db push` masivo a ciegas.
5. Protegé las operaciones con RLS, permisos y validaciones en RPC cuando corresponda.
6. Verificá que un fallback del frontend no esté ocultando una columna inexistente.

Las Edge Functions viven en `supabase/functions`. Algunas integran correo, WhatsApp, proveedores, comprobantes y automatizaciones. La función `wa-webhook` es una excepción importante: recibe llamadas de Meta sin JWT y su configuración debe conservar `verify_jwt = false`.

## Forma segura de trabajar con Cursor

Antes de cambiar código:

1. Leé los archivos involucrados completos.
2. Buscá componentes, helpers o RPC existentes antes de duplicar lógica.
3. Revisá `git status`; puede haber trabajo del usuario sin confirmar.
4. Delimitá qué archivos pertenecen realmente a la tarea.
5. Confirmá si la acción sólo lee datos o si va a modificar datos operativos reales.

Durante el cambio:

- Hacé modificaciones pequeñas y explicables.
- No sobrescribas ni reviertas cambios ajenos.
- Usá IDs para relacionar entidades; el nombre visible no es una identidad confiable.
- Mantené las reglas de negocio fuera del JSX cuando puedan reutilizarse.
- Para mutaciones sensibles, preferí una RPC transaccional.
- No agregues datos ficticios al entorno real para probar una pantalla.
- No elimines historial para arreglar un resultado visible.

Al terminar:

1. Probá el flujo afectado, no sólo que la pantalla renderice.
2. Ejecutá lint dirigido sobre los archivos modificados cuando sea posible.
3. Ejecutá `npm run build` si cambiaste código de la aplicación.
4. Separá errores nuevos de problemas preexistentes del repositorio.
5. Resumí qué cambió, qué se verificó y si queda alguna decisión pendiente.

## Reglas de oro del negocio

1. **Sólo una recepción confirmada crea stock.**
2. **Un producto en tránsito todavía no es stock.**
3. **El ID identifica; el nombre solamente describe.**
4. **No crear duplicados porque una búsqueda no encontró el artículo.**
5. **Los movimientos no se borran: se corrigen con trazabilidad.**
6. **Antes de comprar, revisar existencia en Pañol y asignaciones por obra.**
7. **Una matriz es una plantilla; cada obra conserva su propia foto histórica.**

## Errores frecuentes

- Mostrar saldos negativos como cero puede esconder una inconsistencia real.
- Calcular stock de una forma nueva dentro de una pantalla puede contradecir el cálculo canónico.
- Confundir “comprado” con “recibido” genera disponibilidad ficticia.
- Relacionar artículos por texto produce errores cuando hay aliases o nombres parecidos.
- Crear productos incompletos desde Pañol puede multiplicar registros equivalentes.
- Dar por persistido un campo porque permanece en pantalla puede ser engañoso si la columna aún no existe en la base.
- Cambiar una matriz esperando que se actualicen obras anteriores rompe el concepto de snapshot.
- Probar con escritura en producción puede crear movimientos que después deben auditarse.

## Archivos para orientarse

- [docs/como-funciona-el-sistema.md](docs/como-funciona-el-sistema.md): explicación funcional completa.
- [src/App.jsx](src/App.jsx): rutas, permisos y módulos disponibles.
- [src/features/README.md](src/features/README.md): organización de features.
- [src/features/panol/panolMovimientos.js](src/features/panol/panolMovimientos.js): semántica canónica de movimientos y saldos.
- [src/theme/index.js](src/theme/index.js): tokens de interfaz.
- [vite.config.js](vite.config.js): build, compatibilidad y división de paquetes.
- [vercel.json](vercel.json): publicación y comportamiento de la SPA.
- [supabase/migrations](supabase/migrations): evolución del esquema.
- [supabase/functions](supabase/functions): integraciones y lógica de servidor.

## Un buen primer mensaje para Cursor

Podés iniciar una tarea con algo parecido a esto:

```text
Leé @CURSOR.md y los archivos relacionados con esta pantalla.
Necesito [objetivo concreto]. Primero explicame cómo funciona hoy el flujo,
qué archivos habría que tocar y qué riesgo tiene para los datos. Después
hacé el cambio respetando el diseño, los roles y las RPC existentes.
No modifiques archivos ajenos a la tarea y verificá el resultado.
```

## En una frase

KlaseA acompaña el ciclo completo de construcción de cada barco. Cualquier cambio debe mejorar la operación diaria sin perder la trazabilidad entre lo que una obra necesita, lo que se compra, lo que realmente entra al pañol y lo que finalmente se entrega.

