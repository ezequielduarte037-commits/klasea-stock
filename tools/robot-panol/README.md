# Robot Klase A · Pañol Chubut

ESP32-S3 con logo original, carita animada, avisos de ingreso y **consultas por voz**: cuánto queda de algo, en qué estantería está, qué envíos faltan recibir, y pedidos de consumibles dictados. No confirma recepciones, no cambia stock ni marca las notificaciones de la app como leídas. El único registro que crea es el pedido a compras, y sólo con doble toque.

## Pantalla y botón

- **Mantener apretado:** habla. Graba hasta 8 segundos; al soltar consulta y contesta con voz y texto.
- **Toque corto:** abre el primer aviso o pasa al siguiente. En una respuesta, vuelve a la carita.
- **Doble toque:** en un aviso, recorre el detalle de materiales. Cuando la pantalla dice "PEDIDO LISTO PARA COMPRAS", manda el pedido (hay 55 segundos). Un toque simple ahí lo cancela.
- Aviso nuevo: despierta y muestra cara enojada hasta abrir ese aviso.
- Reposo tras 45 segundos solo cuando no quedan avisos por ver.
- Una consulta fallida o un corte de Wi-Fi no borra los avisos por ver: muestra los últimos datos y hace cuánto son.

La red corre en su propia tarea, así que la cara y el botón no se traban mientras consulta. El micrófono se lee por DMA (ADC continuo, 16 kHz) en otra tarea.

## Voz

El robot manda el WAV a la edge function `robot-panol-voz` con su credencial propia (la misma de los avisos). La función:

1. valida la credencial y que quien lo vinculó siga con permiso de recepción en la sede;
2. pasa el audio a texto con Groq Whisper (`GROQ_API_KEY`, el mismo que usa WhatsApp);
3. deja que un modelo de OpenRouter (`OPENROUTER_MODEL_ROBOT`, por defecto `openai/gpt-4o-mini`) elija herramientas: buscar material, agregar/quitar/ver/vaciar el pedido, dejarlo listo para mandar, leer avisos. Los números salen de la base; el modelo no escribe consultas;
4. convierte la respuesta en voz con OpenRouter (`openai/gpt-4o-mini-tts`, PCM 24 kHz) y la devuelve.

El stock es el mismo que muestra la pantalla de Stock (`supabase/functions/_shared/stockPanol.ts`, comparado fila por fila con `panolMovimientos.js` en su test). El buscador (`_shared/robotBuscador.ts`) empareja lo hablado con el catálogo escrito: "masilla epoxi" con "MASILLA E-POXY", "racor de una pulgada" con `Racor 1"`, "lija en seco ciento veinte" con "Lija En Seco 120".

El pedido confirmado entra en Compras como cualquier otro (`source = robot_panol`, creado a nombre de quien vinculó el robot) y dispara el mail de siempre. Cada consulta queda en `panol_robot_consultas` (qué oyó, qué herramientas usó, qué contestó) para ver qué entiende mal:

```sql
select created_at, oido, respuesta, error, ms from panol_robot_consultas order by created_at desc limit 50;
```

### Puesta en marcha

1. Aplicar `supabase/migrations/20260929120000_robot_panol_voz.sql` en el SQL editor.
2. Publicar la función: `npx supabase functions deploy robot-panol-voz --project-ref fiwugzjeegzlgclfayfd --use-api` (requiere `npx supabase login` una vez).
3. Probar sin el robot: `node tools/robot-panol/probar-voz.mjs` (crea una credencial de prueba y la revoca al terminar; `--voz "frase"` prueba también el audio con la voz en español de Windows; `--escuchar` reproduce las respuestas).
4. Cargar el firmware nuevo al robot por USB.

## Prueba por USB

Conectar COM5, cerrar monitores serie y ejecutar `node tools/robot-panol/bridge.mjs` desde la raíz. Abrir http://127.0.0.1:4188 e iniciar sesión con usuario o email de Klase. El puente consulta Chubut cada 15 segundos usando la sesión en memoria. Reiniciar el puente requiere iniciar sesión otra vez. La voz necesita Wi-Fi: por USB solo llegan los avisos.

## Wi-Fi autónomo

La migración `20260926120000_robot_panol_consulta_autonoma.sql` ya está aplicada y el robot de Chubut se vinculó el 26/09.

1. Con USB conectado, iniciar sesión en el panel con permiso de recepción en Chubut.
2. Pulsar Vincular robot a Chubut. Se genera una credencial propia de consulta, no una sesión de usuario ni service-role.
3. Guardar SSID y contraseña del Wi-Fi de 2,4 GHz del pañol.
4. Desconectar la PC y alimentar con cargador USB de 5 V. Conserva red y vinculación en Preferences.

Consulta Supabase directamente por HTTPS cada 15 segundos, validando certificado y hora NTP. No requiere una PC encendida. El backend limita la consulta a la sede y comprueba el permiso vigente de quien lo vinculó. Guarda solo el hash del token en una tabla privada. Se revoca con `panol_robot_revocar`.

La respuesta de avisos está paginada de a 20; el botón pide la siguiente página. Devuelve título, obra, sede, cantidad de renglones pendientes y extracto de materiales, con urgentes primero. No devuelve precios, adjuntos ni credenciales. Cambios de CA del servidor requieren regenerar `cloud_ca.h` con `prepare-ca.mjs` y recargar firmware.

## Verificación

`node --test tools/robot-panol/feed.test.mjs`

`node --test supabase/functions/_shared/stockPanol.test.mjs supabase/functions/_shared/robotBuscador.test.mjs` (con la clave de servicio compara contra la base real).

`node tools/robot-panol/validate-db.mjs` ensaya migración, vinculación, sede, token incorrecto y revocación dentro de una transacción que termina en ROLLBACK.

Firmware en `KlasePanol/`. Placa: ESP32-S3 N16R8, PSRAM OPI (la voz usa PSRAM para grabar y reproducir). Cableado: pantalla CS10, DC9, RESET8, MOSI11, SCK12, VCC y LED a 3V3; botón GPIO7 a GND con INPUT_PULLUP; micrófono MAX9814 OUT a GPIO1; amplificador MAX98357A LRC4, BCLK5, DIN6, SD16.
