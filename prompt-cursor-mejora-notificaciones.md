# Tarea: mejorar relevancia y diseño de las notificaciones de Klase A

Necesito que revises e implementes una mejora integral, pero acotada, del sistema de notificaciones dentro de la aplicación. No hagas un rediseño genérico ni agregues avisos por agregar. El objetivo principal es que cada cuenta reciba solamente novedades que le sirven para trabajar y que los avisos realmente importantes tengan un poco más de presencia visual.

## Antes de modificar

Leé completos estos archivos y seguí sus convenciones:

- `src/components/NotificacionesBell.jsx`
- `src/hooks/useNotificaciones.js`
- `src/hooks/useAlertas.js`
- `src/lib/permissions.js`
- `src/components/Sidebar.jsx`
- las APIs y pantallas relacionadas con Compras, Logística, Recepción de pañol y Producción que aparezcan enlazadas desde `useNotificaciones.js`

Inspeccioná también las migraciones y el esquema existente antes de usar campos para responsables, seguidores, autores, sede o asignaciones. No inventes columnas ni relaciones. Si falta persistencia por usuario y realmente hace falta una migración, hacela aditiva y compatible con los datos existentes.

Actualmente las notificaciones se derivan de información abierta y el estado de lectura se guarda en `localStorage`. La campana está correctamente ubicada dentro del sidebar y el panel usa un portal para no ser recortado por el `overflow`; preservá esas decisiones.

## Problema funcional a resolver

El filtrado actual se apoya demasiado en conjuntos amplios de roles:

- Recepción: `panol`.
- Producción: `admin`, `oficina`.
- Compras: `compras`, `admin`, `tecnica`, `oficina`, `panol`.
- Logística: `compras`, `admin`, `tecnica`, `administracion`.

Eso hace que algunas cuentas reciban novedades que no pueden ni necesitan resolver. El caso más molesto es Admin: tener acceso a toda la aplicación no significa querer recibir cada movimiento del sistema.

Separá claramente estos dos conceptos:

1. **Permiso para entrar o administrar un módulo.**
2. **Interés real de ese usuario en una notificación.**

No uses `is_admin` como suscripción automática a todo. Tampoco hagas que `roleOf(profile)` reemplace el rol operativo por `admin` para decidir la audiencia. Una cuenta con privilegios administrativos puede seguir teniendo un rol operativo concreto; para notificaciones deben pesar su relación con el evento, su rol real y la urgencia.

## Reglas de relevancia

Centralizá las decisiones en funciones puras y legibles. Cada notificación debe poder explicar internamente por qué ese usuario es destinatario. Usá solamente evidencia real disponible en el esquema:

- Es creador o solicitante.
- Está asignado como responsable.
- Sigue el pedido.
- Pertenece al equipo que debe ejecutar la próxima acción.
- La novedad corresponde a su sede.
- Es una escalación crítica que realmente necesita supervisión.

Reglas mínimas:

### Técnica

- Recibe cambios de estado, comentarios, confirmaciones y problemas de los pedidos que creó, que tiene asignados o que sigue.
- En Logística recibe cambios sobre solicitudes creadas por esa cuenta o donde deba confirmar una fecha o decisión.
- No recibe el flujo completo de todos los pedidos de Compras ni toda la logística del astillero.
- No se notifica una acción que hizo el propio usuario.

### Compras

- Recibe solicitudes nuevas que debe tomar, pedidos asignados, respuestas o comentarios ajenos, cambios que requieren intervención y solicitudes logísticas que debe coordinar.
- No recibe como novedad su propio cambio inmediatamente después de hacerlo.
- Agrupá movimientos repetidos del mismo pedido: una cosa debe producir como máximo una notificación actual, tal como ya intenta hacer `ultimoMovimiento`.

### Pañol

- Recibe recepciones, solicitudes o movimientos accionables de su sede.
- Respetá `profile.sede`; una cuenta de Pampa no debe recibir trabajo de otra sede, salvo que su configuración indique ambas.
- No le envíes novedades generales de Compras si no está relacionado con el pedido o no tiene una acción concreta.

### Administración, oficios y otros roles

- Reciben únicamente elementos relacionados con su trabajo, creados/asignados a la cuenta o que requieren una acción de ese rol.
- Si no hay una relación verificable en los datos actuales, es preferible no notificar antes que llenar la campana de ruido.

### Admin

- No recibe automáticamente todas las compras, recepciones, alertas de producción y movimientos logísticos.
- Recibe sólo:
  - elementos creados, asignados o seguidos por su cuenta;
  - urgencias o bloqueos críticos que requieren escalación;
  - fallos importantes sin responsable claro, cuando Admin sea realmente el último destinatario posible.
- Una prioridad `alta` común no alcanza por sí sola para inundar a Admin. Definí con claridad qué constituye una escalación crítica.

### Reglas comunes

- Nunca mostrar como nueva una acción realizada por el propio usuario cuando hay autor disponible.
- Si el autor es nulo, tratarlo como proceso automático o autor desconocido; no asumir silenciosamente que fue el usuario actual.
- Evitar duplicados entre cambio de pedido, cambio de renglón y comentario. Gana el movimiento útil más reciente.
- Conservar rutas profundas correctas al pedido, movimiento, recepción o alerta.
- Mantener una clave estable por entidad y evento para que una notificación leída no reaparezca sin una novedad real.
- Si introducís lectura persistente en base de datos, debe ser por `user_id` y clave estable, funcionar entre dispositivos y tener un fallback seguro. No crees un log gigantesco de eventos sólo para resolver el badge.

## Jerarquía de importancia

Definí una prioridad visual y de comportamiento consistente:

- `critical`: requiere atención inmediata o bloquea una operación.
- `warning`: requiere una acción próxima del usuario.
- `success`: confirma que algo que el usuario esperaba se completó.
- `info`: novedad útil sin acción urgente.

No conviertas cada estado nuevo o pedido nuevo en crítico. La mayor parte debe seguir siendo silenciosa dentro de la campana.

## Aviso un poco más visible

Cuando llegue en tiempo real una notificación **nueva** y `critical`, o una `warning` que requiere acción directa del usuario:

- Mostrar un aviso transitorio compacto dentro de la app, cercano al borde superior derecho o a la zona segura disponible.
- Debe contener icono, título, una línea de detalle y una acción `Ver`.
- Duración aproximada: 6 a 8 segundos; debe poder cerrarse.
- Nunca mostrar en cascada toda la cola histórica al iniciar sesión, recargar la página o recuperar conexión. El aviso emergente sólo corresponde a eventos que llegaron después de que el hook terminó su carga inicial.
- Si llegan varios juntos, apilá como máximo dos y resumí el resto.
- No uses sonido, modal bloqueante ni vibraciones.

La campana puede hacer una animación breve cuando llega una novedad importante: pequeño giro o impulso y aparición del badge. Debe ejecutarse una sola vez por evento, durar menos de un segundo y respetar `prefers-reduced-motion`.

## Rediseño del panel

Mantené el lenguaje visual de Klase A, los tokens de `@/theme`, modo claro y oscuro, tipografía y estilos inline ya utilizados. Busco una mejora sobria de software operativo:

- Entrada del panel con fade y desplazamiento corto.
- Badge con aparición breve y pulso únicamente cuando cambia el número.
- Ítems sin leer con una barra lateral o acento visual claro, sin pintar toda la tarjeta de un color fuerte.
- Separar visualmente `Requieren acción`, `Novedades` y `Anteriores`, si la cantidad de datos lo justifica.
- Título, detalle, actor, fecha y categoría con una jerarquía fácil de escanear.
- Mostrar una etiqueta textual de prioridad en avisos críticos; no depender sólo del color.
- Hover y focus visibles, objetivos táctiles de al menos 44 px y navegación por teclado.
- Panel responsive que no se salga del viewport y no tape controles importantes.
- Estado vacío cuidado y estado de carga discreto.

No agregues glassmorphism excesivo, colores neón, animaciones continuas, confeti, gradientes decorativos ni una interfaz separada del resto de la app.

## Arquitectura esperada

- Extraé la lógica de audiencia y prioridad a helpers pequeños y comprobables; no dejes otro bloque monolítico dentro del hook.
- Conservá las suscripciones Realtime con debounce y el refresco al recuperar visibilidad/conexión.
- No abras más canales que los necesarios para esa cuenta.
- Evitá traer filas de categorías que el usuario jamás podrá recibir. Filtrá desde la consulta cuando el esquema lo permita y validá nuevamente en cliente.
- No uses el acceso administrativo como atajo para saltar los filtros.
- Preservá el sistema actual de marcar una notificación y todas como leídas.
- No rompas `resolverAlerta`, rutas profundas ni el montaje por portal.
- Si encontrás código duplicado o una consulta repetida accidentalmente en `useNotificaciones.js`, corregilo dentro de esta tarea.

## Entrega

Implementá la mejora completa. Al terminar, informá:

1. Qué archivos cambiaste.
2. La matriz final de destinatarios por tipo de notificación.
3. Qué eventos producen aviso emergente y cuáles quedan sólo en la campana.
4. Cómo evitaste avisos propios, duplicados y el ruido en cuentas Admin.
5. Si agregaste una migración, qué persiste y cómo se comporta con datos existentes.

No cambies permisos generales de la aplicación, no envíes correos ni WhatsApp nuevos y no alteres producción fuera del sistema de notificaciones. No ejecutes tests, lint ni build; la validación se hará por separado.
