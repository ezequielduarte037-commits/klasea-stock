-- Web Push: alta por dispositivo, entrega durable y lecturas por usuario.
-- No guarda claves VAPID ni credenciales de Supabase en tablas accesibles al cliente.
begin;
set local lock_timeout = '5s';

create table if not exists public.notificaciones_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 10 and 2048),
  p256dh text not null,
  auth text not null,
  device_label text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_test_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notificaciones_push_suscripciones_usuario
  on public.notificaciones_push_suscripciones(user_id) where enabled;

create table if not exists public.notificaciones_push_preferencias (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  categorias text[] not null default array['logistica','compras','panol'],
  updated_at timestamptz not null default now(),
  check (categorias <@ array['logistica','compras','panol']::text[])
);

create table if not exists public.notificaciones_lecturas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  clave text not null check (length(clave) between 1 and 200),
  leida_hasta timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, clave)
);

create table if not exists public.notificaciones_push_outbox (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.notificaciones_push_suscripciones(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  categoria text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  lease_id uuid,
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(subscription_id, event_key)
);
create index if not exists notificaciones_push_outbox_pendientes
  on public.notificaciones_push_outbox(available_at, created_at)
  where status in ('pending','processing');

alter table public.notificaciones_push_suscripciones enable row level security;
alter table public.notificaciones_push_preferencias enable row level security;
alter table public.notificaciones_lecturas enable row level security;
alter table public.notificaciones_push_outbox enable row level security;

drop policy if exists "push suscripciones propias" on public.notificaciones_push_suscripciones;
create policy "push suscripciones propias" on public.notificaciones_push_suscripciones
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push borrar dispositivo propio" on public.notificaciones_push_suscripciones;
create policy "push borrar dispositivo propio" on public.notificaciones_push_suscripciones
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists "push preferencias propias" on public.notificaciones_push_preferencias;
create policy "push preferencias propias" on public.notificaciones_push_preferencias
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "push preferencias insertar" on public.notificaciones_push_preferencias;
create policy "push preferencias insertar" on public.notificaciones_push_preferencias
  for insert to authenticated with check (user_id = auth.uid() and exists(
    select 1 from public.profiles p where p.id=auth.uid() and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente'));
drop policy if exists "push preferencias actualizar" on public.notificaciones_push_preferencias;
create policy "push preferencias actualizar" on public.notificaciones_push_preferencias
  for update to authenticated using (user_id = auth.uid() and exists(
    select 1 from public.profiles p where p.id=auth.uid() and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente'))
  with check (user_id = auth.uid());
drop policy if exists "push preferencias borrar" on public.notificaciones_push_preferencias;
create policy "push preferencias borrar" on public.notificaciones_push_preferencias
  for delete to authenticated using (user_id = auth.uid() and exists(
    select 1 from public.profiles p where p.id=auth.uid() and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente'));
drop policy if exists "lecturas propias" on public.notificaciones_lecturas;
create policy "lecturas propias" on public.notificaciones_lecturas
  for select to authenticated using (user_id = auth.uid());
-- Las suscripciones se escriben únicamente mediante la función Edge: valida
-- endpoints de proveedores push y claves, y resuelve cambios de cuenta seguros.
revoke all on public.notificaciones_push_suscripciones, public.notificaciones_push_preferencias,
  public.notificaciones_lecturas, public.notificaciones_push_outbox from anon, authenticated;
grant select, delete on public.notificaciones_push_suscripciones to authenticated;
grant select, insert, update, delete on public.notificaciones_push_preferencias to authenticated;
grant select on public.notificaciones_lecturas to authenticated;
grant all on public.notificaciones_push_suscripciones, public.notificaciones_push_preferencias,
  public.notificaciones_lecturas, public.notificaciones_push_outbox to service_role;

create or replace function public.notificaciones_marcar_leidas(p_lecturas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente') then
    raise exception 'Esta cuenta no puede guardar lecturas operativas';
  end if;
  if jsonb_typeof(p_lecturas) is distinct from 'array' or jsonb_array_length(p_lecturas) > 500 then
    raise exception 'Las lecturas deben ser una lista de hasta 500 avisos';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lecturas) x
    where length(coalesce(x->>'clave','')) not between 1 and 200
      or x->>'leida_hasta' is null) then
    raise exception 'Lectura inválida';
  end if;
  insert into public.notificaciones_lecturas(user_id, clave, leida_hasta)
  select v_uid, x->>'clave', least(max((x->>'leida_hasta')::timestamptz), now())
    from jsonb_array_elements(p_lecturas) x group by x->>'clave'
  on conflict (user_id, clave) do update
    set leida_hasta = greatest(notificaciones_lecturas.leida_hasta, excluded.leida_hasta), updated_at = now();
end;
$$;
revoke all on function public.notificaciones_marcar_leidas(jsonb) from public, anon;
grant execute on function public.notificaciones_marcar_leidas(jsonb) to authenticated;

-- p_agrupar: varios cambios con la misma clave se juntan en un solo aviso
-- mientras siguen pendientes (ej.: diez renglones recibidos = un push que dice
-- "Terciado 9 mm y 9 más"). El payload trae 'primero' y 'contexto' para armarlo.
create or replace function public.notificaciones_push_encolar(
  p_users uuid[], p_actor uuid, p_categoria text, p_key text, p_payload jsonb,
  p_expires_at timestamptz default now() + interval '24 hours',
  p_disponible timestamptz default now(), p_agrupar boolean default false
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.notificaciones_push_outbox(subscription_id, user_id, event_key, categoria, payload, expires_at, available_at)
  select s.id, s.user_id, p_key, p_categoria,
    p_payload || jsonb_build_object('userId', s.user_id, 'categoria', p_categoria), p_expires_at, p_disponible
  from public.notificaciones_push_suscripciones s
  join public.profiles p on p.id = s.user_id
  left join public.notificaciones_push_preferencias pref on pref.user_id = s.user_id
  where s.enabled and coalesce((to_jsonb(p)->>'activo')::boolean,true) and not p.is_demo and p.role::text <> 'cliente'
    and s.user_id = any(p_users) and s.user_id is distinct from p_actor
    and coalesce(pref.push_enabled, true)
    and p_categoria = any(coalesce(pref.categorias, array['logistica','compras','panol']::text[]))
    and p_expires_at > now()
  on conflict(subscription_id, event_key) do update
    set payload = notificaciones_push_outbox.payload || jsonb_build_object(
          'n', coalesce((notificaciones_push_outbox.payload->>'n')::int, 1) + 1,
          'body', left(concat_ws(' · ',
            (notificaciones_push_outbox.payload->>'primero') || ' y '
              || coalesce((notificaciones_push_outbox.payload->>'n')::int, 1) || ' más',
            nullif(notificaciones_push_outbox.payload->>'contexto', '')), 240))
    where p_agrupar and notificaciones_push_outbox.status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.notificaciones_push_encolar(uuid[],uuid,text,text,jsonb,timestamptz,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.notificaciones_push_encolar(uuid[],uuid,text,text,jsonb,timestamptz,timestamptz,boolean) to service_role;

-- Reclamo atómico con lease: dos ejecuciones cron no toman el mismo aviso.
-- El worker usa lease_id al finalizar para no pisar un reclamo posterior.
create or replace function public.notificaciones_push_claim(p_limit integer default 20)
returns setof public.notificaciones_push_outbox
language plpgsql security definer set search_path = public as $$
begin
  update public.notificaciones_push_outbox set status = 'skipped', last_error = 'Aviso vencido'
   where status in ('pending','processing') and expires_at <= now();
  update public.notificaciones_push_outbox set status = 'failed', last_error = 'Reintentos agotados'
   where attempts >= 5 and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '2 minutes'));
  return query
  with candidatas as (
    select id from public.notificaciones_push_outbox
    where attempts < 5 and expires_at > now() and available_at <= now()
      and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '2 minutes'))
    order by available_at, created_at for update skip locked limit greatest(1, least(p_limit, 40))
  )
  update public.notificaciones_push_outbox o
    set status = 'processing', attempts = o.attempts + 1, lease_id = gen_random_uuid(), locked_at = now()
    from candidatas c where o.id = c.id returning o.*;
end;
$$;
revoke all on function public.notificaciones_push_claim(integer) from public, anon, authenticated;
grant execute on function public.notificaciones_push_claim(integer) to service_role;

-- Estado de instalación sin leer/exponer el valor de los secretos. La migración
-- no requiere pg_cron/pg_net/Vault; config informa pendiente hasta activarlos.
create or replace function public.notificaciones_push_estado()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_job boolean := false; v_vault boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname=''klasea-notificaciones-push'' and active)' into v_job;
  end if;
  if to_regclass('vault.secrets') is not null then
    execute 'select count(distinct name)=2 from vault.secrets where name in (''notificaciones_push_project_url'',''notificaciones_push_cron_secret'')' into v_vault;
  end if;
  return jsonb_build_object('cronReady',v_job and v_vault and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null);
end;
$$;
revoke all on function public.notificaciones_push_estado() from public, anon, authenticated;
grant execute on function public.notificaciones_push_estado() to service_role;

-- Metadatos de actividad real: editar un costo o adjuntar factura no vuelve a
-- avisar que un movimiento está confirmado. Se inicializan SIN encolar historia.
alter table public.calendario_eventos
  add column if not exists logistica_notificada_at timestamptz,
  add column if not exists logistica_notificada_por uuid references public.profiles(id) on delete set null,
  add column if not exists logistica_cambio text;
-- Evita que inicializar SOLO las nuevas marcas modifique updated_at o cree
-- movimientos ficticios en el historial existente. La transacción preserva
-- exactamente el modo previo de esos dos triggers, incluso si estaban apagados.
do $$
declare v_trigger record;
begin
  perform set_config('notificaciones.backfill_triggers',coalesce((select jsonb_agg(jsonb_build_object('name',tgname,'mode',tgenabled))::text
    from pg_trigger where tgrelid='public.calendario_eventos'::regclass
      and tgname in ('trg_calendario_eventos_touch','trg_calendario_eventos_auditar')),'[]'),true);
  for v_trigger in select tgname,tgenabled from pg_trigger where tgrelid='public.calendario_eventos'::regclass
    and tgname in ('trg_calendario_eventos_touch','trg_calendario_eventos_auditar') and tgenabled <> 'D'
  loop
    execute format('alter table public.calendario_eventos disable trigger %I',v_trigger.tgname);
  end loop;
  -- Se restaura abajo desde la copia de cada modo guardada en SET LOCAL.
end $$;
update public.calendario_eventos e
set logistica_notificada_at = coalesce(
  (select h.created_at from public.calendario_eventos_historial h where h.evento_id=e.id
    and h.accion <> 'costo_actualizado' order by h.created_at desc, h.id desc limit 1),
  case e.estado when 'confirmado' then e.confirmado_at when 'fecha_propuesta' then e.propuesta_at
    when 'fecha_aceptada' then e.aceptado_at when 'realizado' then e.completado_at end, e.created_at),
  logistica_notificada_por = coalesce(
  (select h.actor_id from public.calendario_eventos_historial h where h.evento_id=e.id
    and h.accion <> 'costo_actualizado' order by h.created_at desc, h.id desc limit 1), e.created_by),
  logistica_cambio = case when e.clase='evento' then 'movimiento' else e.estado end
where e.logistica_notificada_at is null and (e.clase='solicitud_logistica'
  or (e.clase='evento' and e.tipo in ('desmolde','traslado','botadura','entrega','entrega_material')));
do $$
declare v_trigger jsonb;
begin
  for v_trigger in select * from jsonb_array_elements(current_setting('notificaciones.backfill_triggers')::jsonb) loop
    if v_trigger->>'mode' <> 'D' then execute format('alter table public.calendario_eventos enable %s trigger %I',
      case v_trigger->>'mode' when 'A' then 'always' when 'R' then 'replica' else '' end,v_trigger->>'name'); end if;
  end loop;
end $$;

create or replace function public.notificaciones_logistica_marcar()
returns trigger language plpgsql set search_path = public as $$
declare v_cambio text;
begin
  if not (new.clase='solicitud_logistica' or (new.clase='evento'
    and new.tipo in ('desmolde','traslado','botadura','entrega','entrega_material'))) then
    return new;
  end if;
  if tg_op='INSERT' then
    v_cambio := case when new.clase='evento' then 'movimiento' else new.estado end;
  elsif row(new.clase,new.tipo,new.estado,new.fecha,new.hora,new.fecha_solicitada,new.hora_solicitada,
    new.fecha_propuesta,new.hora_propuesta,new.fecha_confirmada,new.hora_confirmada,new.transportes,
    new.tipo_transporte,new.proveedor_logistico,new.paradas,new.carga,new.titulo,new.obra,new.prioridad)
    is distinct from row(old.clase,old.tipo,old.estado,old.fecha,old.hora,old.fecha_solicitada,old.hora_solicitada,
    old.fecha_propuesta,old.hora_propuesta,old.fecha_confirmada,old.hora_confirmada,old.transportes,
    old.tipo_transporte,old.proveedor_logistico,old.paradas,old.carga,old.titulo,old.obra,old.prioridad) then
    v_cambio := case
      when new.estado is distinct from old.estado then new.estado
      when new.estado='confirmado' and row(new.fecha,new.hora,new.fecha_confirmada,new.hora_confirmada)
        is distinct from row(old.fecha,old.hora,old.fecha_confirmada,old.hora_confirmada) then 'reprogramado'
      when new.clase='evento' then 'movimiento' else new.estado end;
  else
    new.logistica_notificada_at := old.logistica_notificada_at;
    new.logistica_notificada_por := old.logistica_notificada_por;
    new.logistica_cambio := old.logistica_cambio;
    return new;
  end if;
  new.logistica_notificada_at := clock_timestamp();
  new.logistica_notificada_por := case when tg_op='INSERT' then coalesce(auth.uid(),new.created_by) else auth.uid() end;
  new.logistica_cambio := v_cambio;
  return new;
end;
$$;
drop trigger if exists z_notificaciones_logistica_marcar on public.calendario_eventos;
create trigger z_notificaciones_logistica_marcar before insert or update on public.calendario_eventos
  for each row execute function public.notificaciones_logistica_marcar();

create or replace function public.notificaciones_logistica_audiencia(p_evento jsonb, p_cambio text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}'::uuid[]) from public.profiles p
  where coalesce((to_jsonb(p)->>'activo')::boolean,true) and p.role::text <> 'cliente'
    and (p.is_admin or p.role::text in ('admin','compras','tecnica','administracion'))
    and (
      (p_cambio in ('solicitado','fecha_aceptada') and (p.is_admin or p.role::text in ('admin','compras')))
      or (p_cambio='fecha_propuesta' and (p.id::text=p_evento->>'created_by' or p.is_admin or p.role::text='admin'))
      -- Una solicitud que nunca se confirmó no estaba en la agenda de nadie más:
      -- su cancelación sólo le importa a quien la pidió y a quien coordina.
      or (p_cambio='cerrado_sin_confirmar' and (p.id::text=p_evento->>'created_by' or p.is_admin or p.role::text in ('admin','compras')))
      or p_cambio in ('confirmado','reprogramado','realizado','cancelado','movimiento','recordatorio')
    );
$$;
revoke all on function public.notificaciones_logistica_audiencia(jsonb,text) from public, anon, authenticated;

create or replace function public.notificaciones_logistica_detalle(v_evento jsonb)
returns text language plpgsql stable set search_path = public as $$
declare v_fecha date; v_hora text; v_recursos text; v_paradas text; v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if v_evento->>'estado' in ('fecha_propuesta','fecha_aceptada') then
    v_fecha := coalesce((v_evento->>'fecha_propuesta')::date,(v_evento->>'fecha_solicitada')::date,(v_evento->>'fecha')::date);
    v_hora := coalesce(v_evento->>'hora_propuesta',v_evento->>'hora_solicitada',v_evento->>'hora');
  else
    v_fecha := coalesce((v_evento->>'fecha_confirmada')::date,(v_evento->>'fecha_solicitada')::date,(v_evento->>'fecha')::date);
    v_hora := coalesce(v_evento->>'hora_confirmada',v_evento->>'hora_solicitada',v_evento->>'hora');
  end if;
  select string_agg(case when coalesce(t->>'cantidad','1')='1' then '' else (t->>'cantidad')||' ' end ||
    case t->>'tipo' when 'hidrogrua' then 'Hidrogrúa' when 'grua' then 'Grúa' when 'camion' then 'Camión'
      when 'flete' then 'Flete' when 'motomensajeria' then 'Motomensajería' else 'Transporte' end, ' + ')
    into v_recursos from jsonb_array_elements(case when jsonb_typeof(v_evento->'transportes')='array' then v_evento->'transportes' else '[]'::jsonb end) t;
  if v_recursos is null then v_recursos := case v_evento->>'tipo_transporte'
    when 'hidrogrua' then 'Hidrogrúa' when 'grua' then 'Grúa' when 'camion' then 'Camión'
    when 'flete' then 'Flete' when 'motomensajeria' then 'Motomensajería' else null end; end if;
  select string_agg(coalesce(nullif(p->>'lugar',''),nullif(p->>'direccion','')), ' → ') into v_paradas
    from jsonb_array_elements(case when jsonb_typeof(v_evento->'paradas')='array' then v_evento->'paradas' else '[]'::jsonb end) p;
  return left(concat_ws(' · ',nullif(coalesce(v_evento->>'carga',v_evento->>'titulo'),''),nullif(v_evento->>'obra',''),
    -- "Hoy 13:00" o "Mañana 08:30" se lee de un vistazo en la pantalla bloqueada.
    case when v_fecha is not null then case v_fecha - v_hoy when 0 then 'Hoy' when 1 then 'Mañana' else to_char(v_fecha,'DD/MM') end
      || case when nullif(v_hora,'') is not null then ' '||left(v_hora,5) else ' · horario a coordinar' end end,
    v_recursos,v_paradas),240);
end;
$$;
revoke all on function public.notificaciones_logistica_detalle(jsonb) from public, anon, authenticated;

create or replace function public.notificaciones_logistica_encolar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_evento jsonb; v_cambio text; v_actor uuid; v_titulo text; v_body text; v_key text; v_audiencia text;
begin
  if tg_op='DELETE' then
    v_evento := to_jsonb(old); v_cambio := 'cancelado'; v_actor := auth.uid();
    if old.estado in ('cancelado','realizado') or coalesce(old.fecha_confirmada,old.fecha) < (now() at time zone 'America/Argentina/Buenos_Aires')::date then return old; end if;
    v_key := 'logistica:'||old.id||':eliminado:'||clock_timestamp();
  else
    if tg_op='UPDATE' and new.logistica_notificada_at is not distinct from old.logistica_notificada_at then return new; end if;
    v_evento := to_jsonb(new); v_cambio := new.logistica_cambio; v_actor := new.logistica_notificada_por;
    v_key := 'logistica:'||new.id||':'||new.logistica_notificada_at;
  end if;
  if not (v_evento->>'clase'='solicitud_logistica' or (v_evento->>'clase'='evento'
    and v_evento->>'tipo' in ('desmolde','traslado','botadura','entrega','entrega_material'))) then
    return coalesce(new,old);
  end if;
  v_audiencia := v_cambio;
  if v_cambio in ('cancelado','realizado') and tg_op <> 'INSERT' and old.clase='solicitud_logistica'
    and old.estado <> 'confirmado' and old.confirmado_at is null and old.fecha_confirmada is null then
    v_audiencia := 'cerrado_sin_confirmar';
  end if;
  v_titulo := case v_cambio when 'solicitado' then 'Nueva solicitud logística' when 'fecha_propuesta' then 'Propuesta de fecha'
    when 'fecha_aceptada' then 'Fecha aceptada: falta confirmar' when 'confirmado' then 'Movimiento confirmado'
    when 'reprogramado' then 'Movimiento reprogramado' when 'realizado' then 'Movimiento realizado'
    when 'cancelado' then 'Movimiento cancelado'
    else case v_evento->>'tipo' when 'desmolde' then 'Desmolde programado' when 'botadura' then 'Botadura programada'
      when 'entrega' then 'Entrega programada' when 'entrega_material' then 'Entrega de material programada'
      when 'traslado' then 'Traslado programado' else 'Movimiento programado' end end;
  v_body := public.notificaciones_logistica_detalle(v_evento);
  perform public.notificaciones_push_encolar(public.notificaciones_logistica_audiencia(v_evento,v_audiencia),v_actor,
    'logistica',v_key,jsonb_build_object('title',v_titulo,'body',left(v_body,240),
      'url',case when tg_op='DELETE' then '/calendario' else '/calendario?open='||(v_evento->>'id') end,'tag','logistica:'||(v_evento->>'id'),
      'clave',case when tg_op='DELETE' then null else 'logistica:'||(v_evento->>'id') end,
      'fecha',case when tg_op='DELETE' then null else v_evento->>'logistica_notificada_at' end,
      'logisticaId',v_evento->>'id','logisticaEliminada',tg_op='DELETE',
      'urgency',case when v_cambio in ('reprogramado','cancelado') or v_evento->>'prioridad'='urgente' then 'high' else 'normal' end));
  return coalesce(new,old);
end;
$$;
drop trigger if exists notificaciones_logistica_encolar on public.calendario_eventos;
create trigger notificaciones_logistica_encolar after insert or update or delete on public.calendario_eventos
  for each row execute function public.notificaciones_logistica_encolar();

create or replace function public.notificaciones_compra_audiencia(p_request uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id),'{}'::uuid[]) from public.profiles p
  join public.purchase_requests pr on pr.id=p_request
  where coalesce((to_jsonb(p)->>'activo')::boolean,true) and p.role::text <> 'cliente' and public.can_access_purchase_request(pr.id,p.id)
    and (p.role::text='compras' or p.id in (pr.created_by,pr.assigned_to)
      or exists(select 1 from public.request_followers f where f.request_id=pr.id and f.user_id=p.id)
      or ((p.is_admin or p.role::text='admin') and pr.priority='urgente' and pr.assigned_to is null and pr.status in ('nuevo','en_revision')));
$$;
revoke all on function public.notificaciones_compra_audiencia(uuid) from public, anon, authenticated;

create or replace function public.notificaciones_compras_encolar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_request uuid; v_actor uuid; v_title text; v_body text; v_key text; v_tag text;
  v_pedido public.purchase_requests%rowtype; v_users uuid[]; v_fecha timestamptz; v_contexto text;
  v_extra jsonb := '{}'::jsonb; v_disponible timestamptz := now(); v_agrupar boolean := false; v_ventana bigint;
begin
  if tg_table_name='purchase_requests' then
    v_request := new.id; v_pedido := new;
    if tg_op='INSERT' then
      v_title := case when new.priority='urgente' then 'Nuevo pedido urgente' else 'Nuevo pedido de compra' end;
      v_actor := coalesce(auth.uid(),new.created_by); v_key := 'compra:'||new.id||':alta'; v_fecha := new.created_at;
    elsif new.status is distinct from old.status then
      v_title := case new.status when 'nuevo' then 'Pedido vuelto a la cola' when 'en_revision' then 'Pedido en revisión'
        when 'cotizando' then 'Pedido en cotización' when 'comprado' then 'Pedido comprado'
        when 'recibido' then 'Pedido recibido' when 'cancelado' then 'Pedido cancelado'
        else 'Pedido actualizado' end;
      v_actor := auth.uid();
      v_key := 'compra:'||new.id||':estado:'||clock_timestamp(); v_fecha := coalesce(new.status_changed_at,new.updated_at);
    elsif new.priority is distinct from old.priority and new.priority in ('alta','urgente') then
      v_title := case new.priority when 'urgente' then 'Pedido marcado urgente' else 'Pedido con prioridad alta' end;
      v_actor := auth.uid(); v_key := 'compra:'||new.id||':prioridad:'||clock_timestamp();
    elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
      v_title := 'Te asignaron un pedido'; v_actor := auth.uid(); v_key := 'compra:'||new.id||':asignado:'||clock_timestamp();
      v_users := array[new.assigned_to];
    else return new; end if;
    v_tag := 'compra:'||new.id;
  elsif tg_table_name='request_comments' then
    v_request := new.request_id; v_actor := coalesce(auth.uid(),new.author_id);
    select * into v_pedido from public.purchase_requests where id=v_request;
    v_title := 'Mensaje en '||coalesce(v_pedido.title,'un pedido');
    v_body := coalesce((select nullif(btrim(username),'')||': ' from public.profiles where id=new.author_id),'')
      ||left(btrim(regexp_replace(regexp_replace(new.body,'<[^>]+>',' ','g'),'\s+',' ','g')),180);
    v_key := 'comentario:'||new.id; v_tag := 'compra-mensaje:'||v_request; v_fecha := new.created_at;
  elsif tg_table_name='request_comment_mentions' then
    select pr.* into v_pedido from public.request_comments c join public.purchase_requests pr on pr.id=c.request_id where c.id=new.comment_id;
    select author_id into v_actor from public.request_comments where id=new.comment_id;
    v_request := v_pedido.id;
    if not public.can_access_purchase_request(v_request,new.mentioned_user_id) then return new; end if;
    v_users := array[new.mentioned_user_id]; v_title := 'Te mencionaron en '||coalesce(v_pedido.title,'un pedido');
    v_body := coalesce((select nullif(btrim(username),'')||' te mencionó. ' from public.profiles where id=v_actor),'')||'Abrí el pedido para ver el mensaje.';
    select created_at into v_fecha from public.request_comments where id=new.comment_id;
    v_key := 'comentario:'||new.comment_id; v_tag := 'compra-mensaje:'||v_request;
  else
    if new.status is not distinct from old.status or new.status='pendiente' then return new; end if;
    v_request := new.request_id; v_actor := auth.uid();
    select * into v_pedido from public.purchase_requests where id=v_request;
    -- Los renglones que cambian juntos (mismo pedido y estado, en una ventana
    -- de 2 minutos) salen en un solo aviso que se manda al cerrar la ventana.
    v_title := case new.status when 'en_panol' then 'Material enviado a pañol' when 'pedido' then 'Material pedido'
      when 'parcial' then 'Material recibido en parte' when 'recibido' then 'Material recibido'
      when 'cancelado' then 'Material cancelado' else 'Material actualizado' end;
    v_ventana := floor(extract(epoch from now())/120);
    v_key := 'items:'||v_request||':'||new.status||':'||v_ventana;
    v_disponible := to_timestamp((v_ventana+1)*120); v_agrupar := true;
    v_tag := 'compra:'||v_request; v_fecha := coalesce(new.status_changed_at,new.updated_at,new.created_at);
  end if;
  -- Pedido y obra: el aviso se entiende sin abrir la app.
  v_contexto := concat_ws(' · ', nullif(btrim(v_pedido.title),''),
    (select 'Obra '||o.codigo from public.produccion_obras o where o.id=v_pedido.project_id
      and position(o.codigo in coalesce(v_pedido.title,''))=0));
  if tg_table_name='purchase_request_items' then
    v_body := concat_ws(' · ', new.description, v_contexto);
    v_extra := jsonb_build_object('primero', left(new.description,120), 'contexto', v_contexto);
  elsif tg_table_name='purchase_requests' then
    v_body := v_contexto;
  end if;
  perform public.notificaciones_push_encolar(coalesce(v_users,public.notificaciones_compra_audiencia(v_request)),v_actor,
    'compras',v_key,jsonb_build_object('title',left(v_title,100),'body',left(coalesce(v_body,''),240),
      'url','/compras?open='||v_request,'tag',v_tag,'clave','compra:'||v_request,'fecha',v_fecha,
      'urgency',case when v_pedido.priority='urgente' then 'high' else 'normal' end) || v_extra,
    now() + interval '24 hours', v_disponible, v_agrupar);
  return new;
end;
$$;
drop trigger if exists notificaciones_compras_encolar on public.purchase_requests;
create trigger notificaciones_compras_encolar after insert or update on public.purchase_requests
  for each row execute function public.notificaciones_compras_encolar();
drop trigger if exists notificaciones_comentario_encolar on public.request_comments;
create trigger notificaciones_comentario_encolar after insert on public.request_comments
  for each row execute function public.notificaciones_compras_encolar();
drop trigger if exists notificaciones_mencion_encolar on public.request_comment_mentions;
create trigger notificaciones_mencion_encolar after insert on public.request_comment_mentions
  for each row execute function public.notificaciones_compras_encolar();
drop trigger if exists notificaciones_item_encolar on public.purchase_request_items;
create trigger notificaciones_item_encolar after update of status on public.purchase_request_items
  for each row execute function public.notificaciones_compras_encolar();

create or replace function public.notificaciones_panol_avisos_encolar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[]; v_actor uuid; v_categoria text; v_title text; v_url text; v_tag text;
begin
  if tg_table_name='panol_envios' then
    if new.estado not in ('enviado','en_preparacion') then return new; end if;
    if tg_op='UPDATE' and old.estado <> 'borrador' then return new; end if;
    select array_agg(p.id) into v_users from public.profiles p where coalesce((to_jsonb(p)->>'activo')::boolean,true) and p.role::text='panol'
      and (p.sede is null or btrim(p.sede)='' or lower(p.sede)='ambas' or p.sede=new.sede);
    v_categoria := 'panol'; v_title := 'Recepción pendiente en '||new.sede;
    v_url := '/recepcion-panol?tab=recepcion&envio='||new.id; v_tag := 'recepcion:'||new.id;
  else
    if new.estado not in ('nuevo','visto','en_proceso') then return new; end if;
    if tg_op='UPDATE' and (new.prioridad is not distinct from old.prioridad or new.prioridad <> 'urgente') then return new; end if;
    select array_agg(p.id) into v_users from public.profiles p where coalesce((to_jsonb(p)->>'activo')::boolean,true)
      and (p.role::text='compras' or (new.prioridad='urgente' and (p.is_admin or p.role::text='admin')));
    v_categoria := 'compras'; v_title := 'Aviso a Compras';
    v_url := '/compras?tab=avisos&aviso='||new.id; v_tag := 'aviso:'||new.id;
  end if;
  v_actor := case when tg_op='INSERT' then coalesce(auth.uid(),new.created_by) else auth.uid() end;
  perform public.notificaciones_push_encolar(coalesce(v_users,'{}'::uuid[]),v_actor,v_categoria,
    v_tag||':'||clock_timestamp(),jsonb_build_object('title',v_title,'body',left(new.titulo,240),
      'url',v_url,'tag',v_tag,'clave',v_tag,'fecha',coalesce(new.updated_at,new.created_at),
      'urgency',case when new.prioridad='urgente' then 'high' else 'normal' end));
  return new;
end;
$$;
drop trigger if exists notificaciones_panol_encolar on public.panol_envios;
create trigger notificaciones_panol_encolar after insert or update of estado on public.panol_envios
  for each row execute function public.notificaciones_panol_avisos_encolar();
drop trigger if exists notificaciones_aviso_encolar on public.compras_avisos;
create trigger notificaciones_aviso_encolar after insert or update of prioridad on public.compras_avisos
  for each row execute function public.notificaciones_panol_avisos_encolar();

-- Se ejecuta desde cron antes de despachar. No requiere que nadie tenga abierta
-- la app. Sin hora definida, el aviso del día se emite entre 07:00 y 10:00 BA.
create or replace function public.notificaciones_push_recordatorios()
returns integer language plpgsql security definer set search_path = public as $$
declare v_row record; v_when timestamptz; v_hora time; v_count integer := 0; v_payload jsonb; v_local timestamp; v_tipo text;
begin
  v_local := now() at time zone 'America/Argentina/Buenos_Aires';
  for v_row in select * from public.calendario_eventos
    where estado='confirmado' and coalesce(fecha_confirmada,fecha) between v_local::date and (v_local+interval '60 minutes')::date
      and (clase='solicitud_logistica' or (clase='evento' and tipo in ('desmolde','traslado','botadura','entrega','entrega_material')))
  loop
    v_hora := coalesce(v_row.hora_confirmada,case when v_row.hora ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then v_row.hora::time end);
    v_when := (coalesce(v_row.fecha_confirmada,v_row.fecha)+coalesce(v_hora,'23:59:59'::time)) at time zone 'America/Argentina/Buenos_Aires';
    if v_when <= now() then continue; end if;
    -- Dos avisos por movimiento confirmado: uno a la mañana (07 a 10 h) para
    -- organizarse y sumarse, y otro en la hora previa si tiene horario.
    if v_hora is not null and v_when <= now()+interval '60 minutes' then
      v_tipo := 'hora';
    elsif coalesce(v_row.fecha_confirmada,v_row.fecha) = v_local::date
      and v_local::time >= '07:00'::time and v_local::time < '10:00'::time then
      v_tipo := 'hoy';
    else continue;
    end if;
    v_payload := jsonb_build_object('title',case when v_tipo='hoy' then 'Hoy hay un movimiento'
        else 'Movimiento a las '||to_char(v_hora,'HH24:MI') end,
      'body',public.notificaciones_logistica_detalle(to_jsonb(v_row)),
      'url','/calendario?open='||v_row.id,'tag','logistica:'||v_row.id,'clave','logistica:'||v_row.id,
      'fecha',v_row.logistica_notificada_at,'urgency','high','recordatorio',true,'logisticaId',v_row.id);
    v_count := v_count+public.notificaciones_push_encolar(
      public.notificaciones_logistica_audiencia(to_jsonb(v_row),'recordatorio'),null,'logistica',
      'recordatorio:'||v_row.id||':'||coalesce(v_row.fecha_confirmada,v_row.fecha)||':'||v_tipo||':'||coalesce(v_hora::text,'sin-hora')||':'||coalesce(v_row.logistica_notificada_at::text,''),
      v_payload,v_when);
  end loop;
  -- Retención limitada: conserva pendientes y fallos recientes para diagnóstico.
  delete from public.notificaciones_push_outbox where status in ('sent','skipped','failed') and created_at < now()-interval '30 days';
  return v_count;
end;
$$;
revoke all on function public.notificaciones_push_recordatorios() from public, anon, authenticated;
grant execute on function public.notificaciones_push_recordatorios() to service_role;

-- Las funciones de trigger no son RPC públicas invocables por clientes.
revoke all on function public.notificaciones_logistica_encolar(),public.notificaciones_compras_encolar(),
  public.notificaciones_panol_avisos_encolar(),public.notificaciones_logistica_marcar() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notificaciones_lecturas'
  ) then alter publication supabase_realtime add table public.notificaciones_lecturas; end if;
end $$;
commit;
