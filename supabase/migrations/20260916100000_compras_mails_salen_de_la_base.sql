-- Mails a compras: vuelven a salir desde la base.
--
-- QUE SE ROMPIO. La migracion 20260914160000 borro el trigger que mandaba los
-- mails (notify_compras_via_resend) para dejar como unico emisor a la edge
-- function notificar-email-compras. Pero esa funcion no habia entregado un solo
-- mail en su vida, por dos razones que se verificaron el 2026-09-16:
--
--   1. El proyecto no tiene el secreto RESEND_API_KEY. La funcion mandaba
--      "Authorization: Bearer " vacio y Resend contestaba 401.
--   2. El remitente notificaciones@envios.klasea.com no existe: envios.klasea.com
--      no tiene ni un registro de DNS, asi que el dominio nunca se verifico en
--      Resend. Aun con la key, Resend lo rechaza.
--
-- Lo unico que le llegaba a compras era el trigger viejo, desde
-- onboarding@resend.dev. Al borrarlo, compras se quedo sin nada.
--
-- POR QUE VUELVE A LA BASE Y NO QUEDA EN LA PANTALLA. La funcion solo manda
-- cuando una pantalla se acuerda de llamarla, y cuatro no se acordaban: Radar
-- Profeta, el escaneo de pedidos del colector y dos lugares de Materiales
-- crean pedidos sin avisar. El trigger los cubria a todos por construccion,
-- porque mira la tabla y no la pantalla. Cada pantalla nueva que cree pedidos
-- queda cubierta sin que nadie tenga que acordarse de nada.
--
-- COMO QUEDA. El trigger ya no arma el mail ni conoce ninguna key: anota el
-- evento en compras_emails y le avisa a la funcion con el id. La funcion lee
-- todo de la base -el pedido, los renglones, el mensaje, quien lo hizo- y arma
-- el mail bueno: que solicitud, que obra, que se pide y un boton que abre esa
-- solicitud. La API key vive solo en los secretos de la funcion.
--
-- Los dos avisos que siguen saliendo desde la pantalla -aviso a compras y
-- pedido recibido- tambien se anotan aca. Asi toda la actividad de mails esta
-- en un solo lugar, y la funcion puede evitar el doble mail de una recepcion
-- (el cambio de estado a "recibido" mas el aviso de recepcion con el detalle).
--
-- La tabla es el registro: cada aviso queda con su estado (enviado, error y
-- por que, omitido y por que). "No me llego el mail" pasa a ser una consulta
-- en vez de una adivinanza.
--
-- QUIEN NO RECIBE AVISO DE LO SUYO. Igual que antes, lo que hace compras no le
-- avisa a compras, y los mensajes y cambios de estado de un admin tampoco
-- (davidtec, que responde desde compras, escribio 20 de los 65 mensajes desde
-- agosto). Lo que cambia: un PEDIDO NUEVO de un admin ahora si avisa. Antes se
-- omitia, y ezequiel.adm creo 22 pedidos desde agosto de los que compras nunca
-- recibio mail.
--
-- NUNCA TRABA UN PEDIDO. El trigger esta envuelto en un bloque de excepcion:
-- si pg_net no responde o falla el registro, el pedido se guarda igual y queda
-- un warning en el log. Un mail que no sale es un problema; un pedido que no
-- se puede cargar es mucho peor.
--
-- PARA SCRIPTS DE MANTENIMIENTO. Un update masivo de estados mandaria un mail
-- por fila. Para evitarlo, antes del update:
--     set local app.silenciar_mails_compras = 'on';

set lock_timeout = '5s';

create extension if not exists pg_net with schema extensions;

create table if not exists public.compras_emails (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in (
                 'new_request', 'new_message', 'status_update', 'priority_update',
                 'nuevo_aviso', 'pedido_recibido'
               )),
  origen       text not null default 'base' check (origen in ('base', 'pantalla')),
  request_id   uuid references public.purchase_requests(id) on delete cascade,
  aviso_id     uuid references public.compras_avisos(id) on delete cascade,
  comment_id   uuid references public.request_comments(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  valor_antes  text,
  valor_nuevo  text,
  datos        jsonb not null default '{}'::jsonb,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'omitido')),
  motivo       text,
  intentos     integer not null default 0,
  asunto       text,
  tomado_at    timestamptz,
  procesado_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint compras_emails_sobre_algo check (request_id is not null or aviso_id is not null)
);

comment on table public.compras_emails is
  'Cola y registro de los mails a compras. La escriben el trigger compras_email_encolar y la edge function notificar-email-compras, que es la que los manda. Cada fila dice si el mail salio, si fallo y por que, o por que se omitio.';

create index if not exists idx_compras_emails_por_procesar
  on public.compras_emails(created_at)
  where estado in ('pendiente', 'enviando', 'error');

create index if not exists idx_compras_emails_pedido
  on public.compras_emails(request_id, created_at desc)
  where request_id is not null;

alter table public.compras_emails enable row level security;

drop policy if exists "compras y admin leen el registro de mails" on public.compras_emails;
create policy "compras y admin leen el registro de mails"
  on public.compras_emails for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (coalesce(p.is_admin, false) or p.role in ('admin', 'compras'))
  ));

-- La funcion toma una fila para mandarla. Atomico: si dos invocaciones llegan a
-- la vez, solo una la consigue y el mail sale una vez. Tambien rescata filas
-- que quedaron colgadas en 'enviando' porque la funcion se cayo a mitad.
create or replace function public.compras_email_tomar(p_id uuid)
returns setof public.compras_emails
language sql
security definer
set search_path = public
as $tomar$
  update public.compras_emails
     set estado    = 'enviando',
         intentos  = intentos + 1,
         tomado_at = now()
   where id = p_id
     and (
       estado = 'pendiente'
       or (estado = 'error' and intentos < 3)
       or (estado = 'enviando' and tomado_at < now() - interval '5 minutes')
     )
  returning *;
$tomar$;

revoke all on function public.compras_email_tomar(uuid) from public, anon, authenticated;
grant execute on function public.compras_email_tomar(uuid) to service_role;

create or replace function public.compras_email_encolar()
returns trigger
language plpgsql
security definer
set search_path = public
as $encolar$
declare
  v_tipo    text;
  v_request uuid;
  v_comment uuid;
  v_actor   uuid := auth.uid();
  v_rol     text;
  v_antes   text;
  v_nuevo   text;
  v_estado  text := 'pendiente';
  v_motivo  text;
  v_id      uuid;
begin
  if coalesce(current_setting('app.silenciar_mails_compras', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  begin
    if tg_table_name = 'purchase_requests' and tg_op = 'INSERT' then
      v_tipo    := 'new_request';
      v_request := new.id;
      v_actor   := coalesce(v_actor, new.created_by);
    elsif tg_table_name = 'request_comments' and tg_op = 'INSERT' then
      v_tipo    := 'new_message';
      v_request := new.request_id;
      v_comment := new.id;
      v_actor   := coalesce(v_actor, new.author_id);
    elsif tg_table_name = 'purchase_requests' and tg_op = 'UPDATE' then
      if new.status is distinct from old.status then
        v_tipo  := 'status_update';
        v_antes := old.status;
        v_nuevo := new.status;
      elsif new.priority is distinct from old.priority then
        v_tipo  := 'priority_update';
        v_antes := old.priority;
        v_nuevo := new.priority;
      else
        return new;
      end if;
      v_request := new.id;
    else
      return coalesce(new, old);
    end if;

    if v_actor is not null then
      select p.role into v_rol from public.profiles p where p.id = v_actor;
    end if;

    if v_rol = 'compras' then
      v_estado := 'omitido';
      v_motivo := 'Lo hizo compras: no se le avisa a compras de lo propio.';
    elsif v_rol = 'admin' and v_tipo <> 'new_request' then
      v_estado := 'omitido';
      v_motivo := 'Mensaje o cambio de un admin: suele ser compras respondiendo.';
    end if;

    insert into public.compras_emails (
      tipo, origen, request_id, comment_id, actor_id, valor_antes, valor_nuevo, estado, motivo
    )
    values (
      v_tipo, 'base', v_request, v_comment, v_actor, v_antes, v_nuevo, v_estado, v_motivo
    )
    returning id into v_id;

    if v_estado = 'pendiente' then
      -- Sin headers de autorizacion a proposito: la funcion corre con
      -- verify_jwt = false (ver supabase/config.toml) y no confia en lo que le
      -- mandan, solo en la fila que lee de la base con este id.
      perform net.http_post(
        url                  := 'https://fiwugzjeegzlgclfayfd.supabase.co/functions/v1/notificar-email-compras',
        body                 := jsonb_build_object('emailId', v_id),
        headers              := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    raise warning 'compras_email_encolar: no se pudo encolar el aviso (%): %', v_tipo, sqlerrm;
  end;

  return coalesce(new, old);
end
$encolar$;

drop trigger if exists trg_compras_email_pedido_nuevo on public.purchase_requests;
create trigger trg_compras_email_pedido_nuevo
  after insert on public.purchase_requests
  for each row execute function public.compras_email_encolar();

-- "of status, priority": el denormalizado de ultimo comentario tambien hace
-- update sobre purchase_requests, y no tiene que despertar a nadie.
drop trigger if exists trg_compras_email_pedido_cambio on public.purchase_requests;
create trigger trg_compras_email_pedido_cambio
  after update of status, priority on public.purchase_requests
  for each row execute function public.compras_email_encolar();

drop trigger if exists trg_compras_email_mensaje on public.request_comments;
create trigger trg_compras_email_mensaje
  after insert on public.request_comments
  for each row execute function public.compras_email_encolar();

comment on function public.compras_email_encolar() is
  'Anota en compras_emails cada pedido nuevo, mensaje y cambio de estado o prioridad, y despierta a la edge function que manda el mail. Nunca hace fallar la escritura que lo disparo.';
