-- Segunda etapa de la bandeja de normalizacion de Panol.
-- La decision se registra por linea y conserva la obra/movimiento que se uso
-- como evidencia. Aprobar K52 nunca modifica lo decidido para K37 o K55.

create table if not exists public.panol_material_normalizaciones (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  modelo text not null,
  decision text not null check (decision in ('estandar', 'puntual')),
  cantidad numeric(14,3),
  evidencia_obra_id uuid references public.produccion_obras(id) on delete set null,
  evidencia_movimiento_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  revisado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  revisado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panol_material_normalizaciones_modelo_check check (btrim(modelo) <> ''),
  constraint panol_material_normalizaciones_cantidad_check check (
    (decision = 'puntual' and cantidad is null)
    or (decision = 'estandar' and cantidad > 0)
  ),
  constraint panol_material_normalizaciones_material_modelo_key unique (material_id, modelo)
);

create index if not exists idx_panol_material_normalizaciones_obra
  on public.panol_material_normalizaciones (evidencia_obra_id)
  where evidencia_obra_id is not null;

drop trigger if exists trg_panol_material_normalizaciones_touch on public.panol_material_normalizaciones;
create trigger trg_panol_material_normalizaciones_touch
before update on public.panol_material_normalizaciones
for each row execute function public.touch_updated_at();

alter table public.panol_material_normalizaciones enable row level security;

drop policy if exists "panol_material_normalizaciones lectura" on public.panol_material_normalizaciones;
create policy "panol_material_normalizaciones lectura"
  on public.panol_material_normalizaciones for select to authenticated
  using (auth.uid() is not null);

grant select on public.panol_material_normalizaciones to authenticated;

comment on table public.panol_material_normalizaciones is
  'Decision de estandarizacion por producto y linea, con la obra y el ingreso usados como evidencia.';

create or replace function public.panol_normalizar_material_por_linea(
  p_material_id uuid,
  p_descripcion text,
  p_alias text,
  p_modelo text,
  p_decision text,
  p_cantidad numeric default null,
  p_evidencia_obra_id uuid default null,
  p_evidencia_movimiento_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_modelo text := regexp_replace(regexp_replace(upper(btrim(coalesce(p_modelo, ''))), '[^A-Z0-9]+', '', 'g'), '^K', '');
  v_decision text := lower(btrim(coalesce(p_decision, '')));
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not public.is_panol_manager(v_uid) then
    raise exception 'Sin permisos para normalizar el catalogo de Panol';
  end if;
  if p_material_id is null or v_descripcion is null then
    raise exception 'Falta el producto o su nombre';
  end if;
  if v_modelo = '' then raise exception 'Falta la linea de produccion'; end if;
  if v_decision not in ('estandar', 'puntual') then raise exception 'Decision invalida'; end if;
  if v_decision = 'estandar' and coalesce(p_cantidad, 0) <= 0 then
    raise exception 'Un producto estandar necesita cantidad por barco';
  end if;
  if not exists (
    select 1 from public.panol_materiales
     where id = p_material_id
       and activo is distinct from false
       and es_requisito is distinct from true
  ) then
    raise exception 'El producto no existe, esta archivado o es un requisito generico';
  end if;
  if p_evidencia_obra_id is not null and not exists (
    select 1 from public.produccion_obras where id = p_evidencia_obra_id
  ) then
    raise exception 'La obra usada como evidencia no existe';
  end if;
  if p_evidencia_movimiento_id is not null and not exists (
    select 1 from public.panol_obra_materiales_snapshot
     where id = p_evidencia_movimiento_id and material_id = p_material_id
  ) then
    raise exception 'El ingreso usado como evidencia no pertenece al producto';
  end if;

  perform set_config('app.audit_origin', 'normalizacion_ingreso_por_linea', true);

  if v_decision = 'estandar' then
    insert into public.panol_material_modelo (material_id, modelo, cantidad, variante)
    values (p_material_id, v_modelo, p_cantidad, 'standard')
    on conflict (material_id, modelo, variante)
    do update set cantidad = excluded.cantidad;
  else
    delete from public.panol_material_modelo
     where material_id = p_material_id
       and upper(regexp_replace(modelo, '^K', '')) = v_modelo
       and coalesce(variante, 'standard') = 'standard';
  end if;

  insert into public.panol_material_normalizaciones (
    material_id, modelo, decision, cantidad,
    evidencia_obra_id, evidencia_movimiento_id, revisado_por, revisado_at
  ) values (
    p_material_id, v_modelo, v_decision,
    case when v_decision = 'estandar' then p_cantidad else null end,
    p_evidencia_obra_id, p_evidencia_movimiento_id, v_uid, now()
  )
  on conflict (material_id, modelo)
  do update set
    decision = excluded.decision,
    cantidad = excluded.cantidad,
    evidencia_obra_id = excluded.evidencia_obra_id,
    evidencia_movimiento_id = excluded.evidencia_movimiento_id,
    revisado_por = excluded.revisado_por,
    revisado_at = excluded.revisado_at;

  update public.panol_materiales
     set descripcion = v_descripcion,
         alias = nullif(btrim(coalesce(p_alias, '')), ''),
         revisado = true
   where id = p_material_id;

  return jsonb_build_object(
    'material_id', p_material_id,
    'modelo', v_modelo,
    'decision', v_decision,
    'cantidad', case when v_decision = 'estandar' then p_cantidad else null end,
    'evidencia_obra_id', p_evidencia_obra_id,
    'evidencia_movimiento_id', p_evidencia_movimiento_id
  );
end;
$$;

revoke all on function public.panol_normalizar_material_por_linea(uuid,text,text,text,text,numeric,uuid,uuid) from public;
grant execute on function public.panol_normalizar_material_por_linea(uuid,text,text,text,text,numeric,uuid,uuid) to authenticated;

comment on function public.panol_normalizar_material_por_linea(uuid,text,text,text,text,numeric,uuid,uuid) is
  'Normaliza identidad y decision de un producto para una linea sin alterar otras lineas ni el kardex historico.';
