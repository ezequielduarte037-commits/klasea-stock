-- Los avisos de Compras salían por DOS caminos a la vez.
--
--   1. La edge function `notificar-email-compras`, que llama la pantalla.
--      Escapa el HTML, pone el título en el asunto, linkea a /compras?open=<id>
--      y lee la API key de la variable de entorno RESEND_API_KEY.
--      Remitente: notificaciones@envios.klasea.com
--
--   2. Este trigger, `notify_compras_via_resend()`, que dispara desde la base
--      en los mismos eventos. Asunto genérico, sin link a la solicitud, el HTML
--      concatenado en crudo y la API key de Resend escrita en texto plano en la
--      migración 20260529000000.
--      Remitente: onboarding@resend.dev
--
-- O sea: compras recibía dos mails por cada evento, y el feo era el del trigger.
-- El ticket de davidtec ("no me queda en claro sobre qué solicitud llegó ese
-- mensaje") es exactamente el mail del trigger; el de la edge function ya traía
-- el título en el asunto.
--
-- Esto borra el camino duplicado. La edge function queda como único emisor.
--
-- Efecto secundario buscado: al borrar la función desaparece de la base la API
-- key de Resend, que hasta hoy vivía en el cuerpo de una función guardada en
-- pg_proc y visible para cualquiera que pudiera leer su definición.
--
-- ANTES DE CORRER ESTO: confirmá que en compras@allyachts.com.ar llegan mails
-- de notificaciones@envios.klasea.com. Si solo llegan los de onboarding@resend.dev,
-- la edge function no está entregando (típicamente falta RESEND_API_KEY en las
-- variables del proyecto, o el dominio envios.klasea.com no está verificado en
-- Resend) y borrar el trigger deja a Compras sin ningún aviso.
--
-- Para volver atrás: la definición vieja está en la migración
-- 20260529000000_email_notifications.sql, con la API key reemplazada por un
-- placeholder que hay que completar.

drop trigger if exists trg_notify_compras_new_request on public.purchase_requests;
drop trigger if exists trg_notify_compras_new_message on public.request_comments;
drop trigger if exists trg_notify_compras_update_request on public.purchase_requests;

drop function if exists public.notify_compras_via_resend();
