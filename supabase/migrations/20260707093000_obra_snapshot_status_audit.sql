-- Auditoria de cambios de estado en la lista de materiales por obra.
-- Sirve para regularizaciones manuales durante la puesta en marcha y para
-- trazabilidad futura con recepcion, egresos y conteo fisico.

create table if not exists public.panol_obra_materiales_snapshot_audit (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  obra_id uuid references public.produccion_obras(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  descripcion text,
  campo text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  nota text,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  origen text not null default 'trigger',
  contexto jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_panol_obra_snapshot_audit_snapshot_created
  on public.panol_obra_materiales_snapshot_audit (snapshot_id, created_at desc);

create index if not exists idx_panol_obra_snapshot_audit_obra_created
  on public.panol_obra_materiales_snapshot_audit (obra_id, created_at desc);

create index if not exists idx_panol_obra_snapshot_audit_actor_created
  on public.panol_obra_materiales_snapshot_audit (actor_id, created_at desc);

alter table public.panol_obra_materiales_snapshot_audit enable row level security;

drop policy if exists "panol_obra_snapshot_audit_select_authenticated" on public.panol_obra_materiales_snapshot_audit;
create policy "panol_obra_snapshot_audit_select_authenticated"
  on public.panol_obra_materiales_snapshot_audit
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "panol_obra_snapshot_audit_insert_authenticated" on public.panol_obra_materiales_snapshot_audit;
create policy "panol_obra_snapshot_audit_insert_authenticated"
  on public.panol_obra_materiales_snapshot_audit
  for insert
  to authenticated
  with check (auth.uid() is not null);

grant select, insert on public.panol_obra_materiales_snapshot_audit to authenticated;

create or replace function public.panol_audit_obra_snapshot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_origin text := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'trigger');
  v_note text := nullif(current_setting('app.audit_note', true), '');
  v_context jsonb := jsonb_build_object('txid', txid_current());
  v_change record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  for v_change in
    select *
    from (values
      ('estado'::text, to_jsonb(old.estado), to_jsonb(new.estado)),
      ('recepcion_estado'::text, to_jsonb(old.recepcion_estado), to_jsonb(new.recepcion_estado)),
      ('recepcion_nota'::text, to_jsonb(old.recepcion_nota), to_jsonb(new.recepcion_nota)),
      ('cantidad'::text, to_jsonb(old.cantidad), to_jsonb(new.cantidad)),
      ('egreso_nota'::text, to_jsonb(old.egreso_nota), to_jsonb(new.egreso_nota))
    ) as c(campo, valor_anterior, valor_nuevo)
  loop
    if v_change.valor_anterior is distinct from v_change.valor_nuevo then
      insert into public.panol_obra_materiales_snapshot_audit (
        snapshot_id,
        obra_id,
        material_id,
        descripcion,
        campo,
        valor_anterior,
        valor_nuevo,
        nota,
        actor_id,
        origen,
        contexto
      )
      values (
        new.id,
        new.obra_id,
        new.material_id,
        new.descripcion,
        v_change.campo,
        v_change.valor_anterior,
        v_change.valor_nuevo,
        v_note,
        v_actor,
        v_origin,
        v_context
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_panol_obra_snapshot_audit on public.panol_obra_materiales_snapshot;
create trigger trg_panol_obra_snapshot_audit
  after update on public.panol_obra_materiales_snapshot
  for each row
  execute function public.panol_audit_obra_snapshot_changes();

create or replace function public.panol_cambiar_estado_snapshot(
  p_snapshot_id uuid,
  p_estado text,
  p_nota text default null
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para regularizar materiales de obra';
  end if;

  if p_estado not in ('pendiente','pedido','comprado','en_panol','egresado') then
    raise exception 'Estado invalido: %', p_estado;
  end if;

  perform set_config('app.audit_origin', 'regularizacion_obra', true);
  perform set_config('app.audit_note', coalesce(p_nota, ''), true);

  update public.panol_obra_materiales_snapshot
     set estado = p_estado,
         recepcion_estado = case
           when p_estado = 'en_panol' then coalesce(recepcion_estado, 'recibido')
           when p_estado in ('pendiente','pedido','comprado') then null
           else recepcion_estado
         end,
         recepcion_nota = case
           when p_estado = 'en_panol' and nullif(p_nota, '') is not null then p_nota
           else recepcion_nota
         end,
         recepcion_updated_at = case
           when p_estado = 'en_panol' then now()
           else recepcion_updated_at
         end,
         egreso_at = case
           when p_estado = 'egresado' then coalesce(egreso_at, now())
           when estado = 'egresado' and p_estado <> 'egresado' then null
           else egreso_at
         end,
         egreso_por = case
           when p_estado = 'egresado' then coalesce(egreso_por, v_uid)
           when estado = 'egresado' and p_estado <> 'egresado' then null
           else egreso_por
         end,
         egreso_nota = case
           when p_estado = 'egresado' then coalesce(nullif(p_nota, ''), egreso_nota)
           when estado = 'egresado' and p_estado <> 'egresado' then null
           else egreso_nota
         end,
         updated_at = now()
   where id = p_snapshot_id
   returning * into v_row;

  if not found then
    raise exception 'Item de obra no encontrado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.panol_cambiar_estado_snapshot(uuid, text, text) to authenticated;
