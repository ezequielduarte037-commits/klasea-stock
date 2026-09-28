# Robot Klase A · Pañol Chubut

ESP32-S3 con logo original, carita animada y consulta de avisos de ingreso. No confirma recepciones, no cambia stock ni marca las notificaciones de la app como leídas.

## Pantalla y botón

- Aviso nuevo: despierta y muestra cara enojada hasta abrir ese aviso. Al iniciar también señala pendientes no vistos durante ese arranque.
- Toque corto: abre el primer aviso o pasa al siguiente.
- Doble toque: recorre páginas del extracto de materiales y vuelve al resumen.
- Mantener un segundo: vuelve a la carita.
- Reposo tras 45 segundos solo cuando no quedan avisos por ver.
- Distingue bandeja vacía, consulta fallida, falta de vinculación y datos vencidos. Descarta datos anteriores a los 90 segundos sin actualización.

## Prueba por USB

Conectar COM5, cerrar monitores serie y ejecutar `node tools/robot-panol/bridge.mjs` desde la raíz. Abrir http://127.0.0.1:4188 e iniciar sesión con usuario o email de Klase. El puente consulta Chubut cada 15 segundos usando la sesión en memoria. Reiniciar el puente requiere iniciar sesión otra vez.

## Wi-Fi autónomo

Preparado en firmware y panel. Requiere aplicar primero `supabase/migrations/20260926120000_robot_panol_consulta_autonoma.sql`. No se publicó: la configuración local de auditoría contiene un host de plantilla.

1. Con USB conectado, iniciar sesión en el panel con permiso de recepción en Chubut.
2. Pulsar Vincular robot a Chubut. Se genera una credencial propia de consulta, no una sesión de usuario ni service-role.
3. Guardar SSID y contraseña del Wi-Fi de 2,4 GHz del pañol.
4. Desconectar la PC y alimentar con cargador USB de 5 V. Conserva red y vinculación en Preferences.

Consulta Supabase directamente por HTTPS cada 15 segundos, validando certificado y hora NTP. No requiere una PC encendida. El backend limita la consulta a Chubut y comprueba el permiso vigente de quien lo vinculó. Guarda solo el hash del token en una tabla privada. Se revoca con `panol_robot_revocar`.

La respuesta está paginada de a 20 avisos; en modo autónomo el botón solicita la siguiente página. Devuelve título, obra, sede, cantidad de renglones pendientes y extracto de materiales, con urgentes primero. No devuelve precios, adjuntos ni credenciales. Cambios de CA del servidor requieren regenerar `cloud_ca.h` con `prepare-ca.mjs` y recargar firmware.

## Verificación

`node --test tools/robot-panol/feed.test.mjs`

`node tools/robot-panol/validate-db.mjs` ensaya migración, vinculación, sede, token incorrecto y revocación dentro de una transacción que termina en ROLLBACK. Requiere credenciales de prueba válidas y cuenta conectada al panel; no publica cambios.

Firmware en los entregables `robot_panol/KlasePanol`. Cableado: CS10, DC9, RESET8, MOSI11, SCK12; VCC y LED a 3V3, GND a GND. Botón GPIO7 a GND con INPUT_PULLUP.
