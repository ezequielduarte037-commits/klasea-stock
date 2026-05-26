-- Habilita pg_net para llamadas HTTP desde la DB
create extension if not exists pg_net with schema extensions;

-- Función que envía el email a compras
create or replace function public.notify_compras_via_resend()
returns trigger
language plpgsql
security definer
as $$
declare
  resend_api_key text := 're_hpNFbcC1_9vzuT1vx7doc5TbHeQYeTZyV';
  compras_email  text := 'compras@allyachts.com.ar';
  app_url        text := 'https://klasea-stock.vercel.app';
  subject        text;
  html_body      text;
  json_payload   jsonb;
  headers        jsonb;
  creator_name   text;
begin
  -- No notificar si quien hizo el cambio es compras/admin
  if auth.uid() is not null then
    if exists (select 1 from profiles where id = auth.uid() and role in ('compras', 'admin')) then
      return coalesce(new, old);
    end if;
  end if;

  -- Construir según el tipo de evento
  if TG_TABLE_NAME = 'purchase_requests' and TG_OP = 'INSERT' then
    creator_name := (select username from profiles where id = new.created_by);
    subject := '[Compras] Nueva solicitud: ' || new.title;
    html_body := '<h2>Nueva solicitud de compra</h2>' ||
      '<p><strong>Título:</strong> ' || new.title || '</p>' ||
      '<p><strong>Creado por:</strong> ' || coalesce(creator_name, new.created_by::text) || '</p>' ||
      '<hr><a href="' || app_url || '" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>';

  elsif TG_TABLE_NAME = 'request_comments' and TG_OP = 'INSERT' then
    creator_name := (select username from profiles where id = new.author_id);
    subject := '[Compras] Nuevo mensaje en solicitud';
    html_body := '<h2>Nuevo mensaje</h2>' ||
      '<p><strong>De:</strong> ' || coalesce(creator_name, new.author_id::text) || '</p>' ||
      '<p><strong>Mensaje:</strong></p>' ||
      '<blockquote style="border-left:3px solid #2563eb;padding-left:12px;color:#666;margin:0">' || coalesce(new.body, '') || '</blockquote>' ||
      '<hr><a href="' || app_url || '" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>';

  elsif TG_TABLE_NAME = 'purchase_requests' and TG_OP = 'UPDATE' then
    -- Solo notificar si cambió status o priority
    if new.status is distinct from old.status then
      subject := '[Compras] Estado actualizado: ' || new.title;
      html_body := '<h2>Estado actualizado</h2>' ||
        '<p><strong>Solicitud:</strong> ' || new.title || '</p>' ||
        '<p><strong>Cambio:</strong> ' || coalesce(old.status, '?') || ' → <strong>' || new.status || '</strong></p>' ||
        '<hr><a href="' || app_url || '" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>';
    elsif new.priority is distinct from old.priority then
      subject := '[Compras] Prioridad actualizada: ' || new.title;
      html_body := '<h2>Prioridad actualizada</h2>' ||
        '<p><strong>Solicitud:</strong> ' || new.title || '</p>' ||
        '<p><strong>Cambio:</strong> ' || coalesce(old.priority, '?') || ' → <strong>' || new.priority || '</strong></p>' ||
        '<hr><a href="' || app_url || '" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">Ir a la app</a>';
    else
      return new; -- otro cambio, no notificar
    end if;
  else
    return coalesce(new, old);
  end if;

  json_payload := jsonb_build_object(
    'from', 'Klase A Stock <onboarding@resend.dev>',
    'to', jsonb_build_array(compras_email),
    'subject', subject,
    'html', html_body
  );

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || resend_api_key,
    'Content-Type', 'application/json'
  );

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := json_payload,
    params := '{}'::jsonb,
    headers := headers,
    timeout_milliseconds := 10000
  );

  return coalesce(new, old);
end;
$$;

-- Triggers: nuevo pedido, nuevo mensaje, actualización de pedido
drop trigger if exists trg_notify_compras_new_request on public.purchase_requests;
create trigger trg_notify_compras_new_request
  after insert on public.purchase_requests
  for each row execute function public.notify_compras_via_resend();

drop trigger if exists trg_notify_compras_new_message on public.request_comments;
create trigger trg_notify_compras_new_message
  after insert on public.request_comments
  for each row execute function public.notify_compras_via_resend();

drop trigger if exists trg_notify_compras_update_request on public.purchase_requests;
create trigger trg_notify_compras_update_request
  after update on public.purchase_requests
  for each row execute function public.notify_compras_via_resend();
