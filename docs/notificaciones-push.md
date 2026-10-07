# Notificaciones al celular

La app usa Web Push estándar con VAPID y cifrado `aes128gcm`. Android admite navegadores compatibles; iPhone/iPad necesitan iOS/iPadOS 16.4 o superior, agregar la app a Inicio y aceptar el permiso desde un toque del usuario. El cron envía avisos aunque la app esté cerrada. El sistema operativo puede demorar la entrega por conectividad, ahorro de energía o modos de concentración.

## Estado

Activo en producción desde el 07/10/2026: migración aplicada, secretos VAPID cargados, función `notificaciones-push` publicada y cron `klasea-notificaciones-push` corriendo cada minuto. Falta que cada persona lo active en su teléfono.

## Cómo se activa en el teléfono

- **Android:** abrir Klase A en Chrome (o la app instalada), tocar la campanita y **Activar avisos** en la tarjeta de arriba. Llega una notificación de prueba al instante.
- **iPhone/iPad (iOS 16.4 o más):** en Safari, Compartir → **Agregar a inicio**, abrir Klase A desde ese ícono, campanita → **Activar avisos**. Desde Safari común no se puede: la tarjeta lo explica paso a paso.
- "Ahora no" oculta la invitación dos semanas; el botón sigue al pie del panel junto con **Enviar prueba**, **Desactivar aquí** y **Qué avisos recibir**.

## Activación en Supabase

1. Aplicar completo `supabase/migrations/20261007150000_web_push_notificaciones.sql`. La transacción crea suscripciones, preferencias, lecturas y outbox; no envía avisos históricos. Las marcas de logística se inicializan preservando `updated_at` y su historial.
2. Generar una sola vez un par VAPID y un token aleatorio de cron con `node tools/preparar-notificaciones-push.mjs --subject mailto:compras@allyachts.com.ar`. El helper usa ECDH `prime256v1`, conserva archivos existentes y guarda `.env.push.local` ignorado por Git junto con SQL de cron listo en `tmp`. No imprime los secretos. El subject debe ser un correo o URL HTTPS reales. No agregarlos a Git ni a variables `VITE_*`. Una rotación VAPID exige volver a activar los dispositivos.
3. Configurar los secretos con `npx supabase secrets set --env-file .env.push.local --project-ref REFERENCIA_DEL_PROYECTO`, o copiar de ese archivo `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `PUSH_CRON_SECRET` a Edge Functions > Secrets. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los proporciona Supabase a la función; la clave privada y el service role nunca llegan al cliente.
4. Publicar `npx supabase functions deploy notificaciones-push --project-ref REFERENCIA_DEL_PROYECTO`. Su `verify_jwt=false` permite cron, que requiere `x-push-secret`. Las acciones del usuario validan el JWT con `auth.getUser` y exigen perfil activo, operativo y sin modo demo.
5. Activar las extensiones `pg_cron` y `pg_net`. Ejecutar completo el SQL de cron generado en `tmp`, verificando que use el proyecto correcto. Como alternativa, usar `supabase/sql-editor/activar_notificaciones_push_cron.sql` reemplazando la URL del proyecto y el mismo `PUSH_CRON_SECRET`. Vault almacena cifrado el token; el job sólo muestra los nombres de esos secretos. Corre cada minuto, encola recordatorios y reclama un lote de 20 entregas. Si se vuelve a ejecutar con el mismo nombre, actualiza ese job.
6. Publicar el frontend y activar notificaciones desde su panel en cada teléfono. Usar **Enviar prueba**, cerrar la app y verificar la recepción. `sent:true` significa que el proveedor push aceptó el envío; la llegada y visualización se comprueban en el dispositivo.

`config` devuelve `enabled=true` sólo cuando existen las tablas, VAPID y un cron activo con sus secretos Vault. `reason` identifica `migration_required`, `vapid_not_configured` o `cron_not_configured`; el panel no presenta el envío como activo mientras falta esa instalación. La prueba y el alta de dispositivos siguen disponibles en la API para verificar un despliegue en curso.

## Avisos y audiencias

- **Logística:** solicita/acepta fecha hacia Compras/Admin; propuesta hacia solicitante/Admin; confirmaciones, reprogramaciones, cancelaciones y movimientos realizados hacia Técnica, Administración, Compras y Admin. Una solicitud cancelada o cerrada **sin haberse confirmado nunca** sólo avisa a quien la pidió y a quien coordina (no estaba en la agenda de Técnica); la campanita aplica la misma regla. Los hitos del calendario se titulan por tipo ("Desmolde programado", "Botadura programada"…). El cuerpo dice "Hoy 13:00" o "Mañana 08:30" en lugar de la fecha. También incluye desmoldes, traslados, botaduras, entregas y entregas de material del calendario. Excluye al autor de la acción. Editar sólo costos o adjuntos no renueva el aviso.
- **Recordatorios:** a la mañana (entre 07:00 y 10:00 de Buenos Aires) "Hoy hay un movimiento" para todo movimiento confirmado del día, tenga hora o no, para organizarse y sumarse; y "Movimiento a las HH:MM" en la hora previa si tiene horario. Se incluye al coordinador que creó el evento, porque necesita el recordatorio. Un mismo horario y versión se encola una vez por dispositivo. Reprogramar renueva el recordatorio. Un movimiento pasado no genera recordatorio. Leer su confirmación no silencia el recordatorio.
- **Compras:** pedidos nuevos, estados, prioridad alta/urgente, asignación, mensajes, menciones accesibles y estado de renglones, a Compras y participantes reales. Títulos en castellano ("Pedido en revisión", "Material recibido") con pedido y obra en el cuerpo. Los renglones que cambian juntos (mismo pedido y estado, ventana de 2 minutos) salen en **un** aviso al cerrar la ventana: "Terciado 9 mm y 9 más · Pedido · Obra". Pedido y renglones comparten `tag`, así el teléfono reemplaza el aviso anterior del mismo pedido en vez de apilarlos. Admin sólo recibe escalaciones urgentes sin asignar, salvo participación directa. No se avisa por cambiar costos, título o descripción.
- **Pañol:** nuevos envíos listos para recibir, al personal de Pañol de esa sede. Los avisos a Compras llegan a Compras, y los urgentes también a Admin. La publicación de borradores no genera avisos.
- **Producción:** conserva avisos internos existentes. Todavía no se envía push del semáforo calculado; no hay una tabla durable de eventos de producción en este circuito.

Cada cuenta puede silenciar push por categoría. Los perfiles con `activo=false`, demos y clientes no reciben avisos operativos. La instalación legacy sin columna `activo` conserva los perfiles habilitados; esta migración no agrega la columna ni altera usuarios. Cambiar de cuenta en el mismo teléfono mueve la propiedad del endpoint; el despachador descarta las entregas encoladas para la cuenta anterior. El service worker también valida el usuario activo y cierra los avisos al salir.

## Entrega y diagnóstico

El outbox aplica deduplicación por evento/dispositivo, reclamo atómico `FOR UPDATE SKIP LOCKED`, lease de 2 minutos y hasta 5 intentos con espera exponencial. Respeta `Retry-After` de 429 hasta 1 hora. 404/410 desactivan el dispositivo vencido. El contenido va cifrado al proveedor. Se permite enviar sólo a endpoints HTTPS de los proveedores de Chrome, Firefox, Apple y Edge; no se aceptan URLs arbitrarias ni redirecciones.

HTTP y la base son sistemas distintos: si el proveedor acepta pero se pierde la confirmación en la base, el reintento puede repetir el envío. Un mismo `topic` y `tag` coalescen esa repetición. No se promete exactamente una entrega.

Las lecturas se guardan por usuario con merge `greatest`: un dispositivo antiguo no vuelve a marcar sin leer algo ya leído. Al tocar el aviso, `clave` y `fecha` permiten marcar sólo esa versión, conservando los microsegundos de Postgres; los cambios posteriores siguen siendo nuevos. El despachador consulta las preferencias actuales y evita enviar versiones leídas salvo recordatorios. Antes de enviar logística, consulta la versión vigente: descarta confirmaciones reemplazadas y recordatorios cancelados/reprogramados. Si se elimina un movimiento futuro, el aviso de cancelación abre el calendario general y no una fila borrada.

Consultas para administradores, sin endpoints ni claves:

```sql
select status, count(*), max(created_at) as ultimo
from public.notificaciones_push_outbox group by status;

select categoria, last_error, attempts, created_at
from public.notificaciones_push_outbox
where status='failed' order by created_at desc limit 20;

select jobname,schedule,active from cron.job
where jobname='klasea-notificaciones-push';
```

Las filas finalizadas se conservan 30 días. El job puede pausarse con `cron.unschedule('klasea-notificaciones-push')`. Sin cron sólo funciona la prueba directa; los eventos operativos quedan pendientes hasta que se active.

## Pruebas locales

No se necesitan credenciales ni una base productiva. Los paquetes de verificación viven en `tmp`, ignorado por Git; no se agregaron dependencias al frontend. En un checkout nuevo, preparar las dos carpetas:

```sh
npm install --prefix tmp/torneria-db-test --no-save --ignore-scripts @electric-sql/pglite@0.5.8
npm install --prefix tmp/notificaciones-push-test --no-save --ignore-scripts web-push@3.6.7
```

Con Node 22.18 o superior, ejecutar los casos SQL, reglas de entrega y cifrado real:

```sh
node --test supabase/functions/notificaciones-push/core.test.mjs supabase/functions/notificaciones-push/encryption.test.mjs supabase/tests/notificacionesPush.test.mjs
```

`notificacionesPush.test.mjs` aplica la migración completa en Postgres embebido PGlite y prueba audiencias, lecturas/RLS, cron y el SQL de activación. `core.test.mjs` usa transporte simulado para errores HTTP y cambios de cuenta. `encryption.test.mjs` cifra con Web Push, descifra con la clave del dispositivo y verifica la firma VAPID; no realiza envíos externos.

Verificar también tipos y ejecución en el runtime Deno:

```sh
npx deno check --config supabase/functions/notificaciones-push/deno.json supabase/functions/notificaciones-push/index.ts
npx deno test --allow-env --config supabase/functions/notificaciones-push/deno.json supabase/functions/notificaciones-push/runtime_test.ts
```

La prueba Deno usa claves efímeras en memoria y transporte simulado. `--allow-env` permite que la biblioteca consulte la configuración de su runtime. La comprobación final de recepción con la app cerrada requiere un teléfono real después del despliegue.

Referencias primarias: [Web Push](https://github.com/web-push-libs/web-push), [cron/Vault en Supabase](https://supabase.com/docs/guides/functions/schedule-functions), [Web Push en iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
