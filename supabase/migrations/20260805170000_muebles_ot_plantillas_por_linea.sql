-- Plantillas de OT por línea + excepciones puntuales por obra/proceso.
-- Una OT puede pertenecer a una línea (plantilla) o a un lote (override), nunca a ambos.

alter table public.muebles_ordenes_trabajo
  add column if not exists linea_id uuid references public.prod_lineas(id) on delete cascade;

alter table public.muebles_ordenes_trabajo
  alter column lote_id drop not null;

alter table public.muebles_ordenes_trabajo
  drop constraint if exists muebles_ordenes_trabajo_lote_tipo_uidx;

alter table public.muebles_ordenes_trabajo
  drop constraint if exists muebles_ordenes_trabajo_scope_chk;
alter table public.muebles_ordenes_trabajo
  add constraint muebles_ordenes_trabajo_scope_chk
  check (num_nonnulls(lote_id, linea_id) = 1);

create unique index if not exists muebles_ot_lote_tipo_uidx
  on public.muebles_ordenes_trabajo(lote_id, tipo)
  where lote_id is not null;
create unique index if not exists muebles_ot_linea_tipo_uidx
  on public.muebles_ordenes_trabajo(linea_id, tipo)
  where linea_id is not null and lote_id is null;

alter table public.muebles_ordenes_trabajo_historial
  add column if not exists linea_id uuid references public.prod_lineas(id) on delete cascade;
alter table public.muebles_ordenes_trabajo_historial
  alter column lote_id drop not null;

create index if not exists muebles_ot_historial_linea_idx
  on public.muebles_ordenes_trabajo_historial(linea_id, created_at desc)
  where linea_id is not null;

create or replace function public.muebles_ot_guardar_contexto(
  p_lote_id uuid,
  p_linea_id uuid,
  p_tipo text,
  p_numero_ot text,
  p_titulo text,
  p_notas text,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ot_id uuid;
  v_item jsonb;
  v_orden integer := 0;
begin
  if num_nonnulls(p_lote_id, p_linea_id) <> 1 then
    raise exception 'La OT debe pertenecer a una línea o a una obra';
  end if;
  if p_tipo not in ('maderas', 'herrajes') then
    raise exception 'Tipo de OT inválido';
  end if;

  if p_lote_id is not null then
    insert into public.muebles_ordenes_trabajo (
      lote_id, linea_id, tipo, numero_ot, titulo, proveedor, notas, creado_por, actualizado_por
    ) values (
      p_lote_id, null, p_tipo,
      nullif(trim(coalesce(p_numero_ot, '')), ''),
      coalesce(nullif(trim(coalesce(p_titulo, '')), ''), case when p_tipo = 'maderas' then 'OT de maderas' else 'OT de kit de herrajes' end),
      'Oberti', nullif(trim(coalesce(p_notas, '')), ''), auth.uid(), auth.uid()
    )
    on conflict (lote_id, tipo) where lote_id is not null do update set
      numero_ot = excluded.numero_ot,
      titulo = excluded.titulo,
      proveedor = 'Oberti',
      notas = excluded.notas,
      actualizado_por = auth.uid(),
      updated_at = now()
    returning id into v_ot_id;
  else
    insert into public.muebles_ordenes_trabajo (
      lote_id, linea_id, tipo, numero_ot, titulo, proveedor, notas, creado_por, actualizado_por
    ) values (
      null, p_linea_id, p_tipo,
      nullif(trim(coalesce(p_numero_ot, '')), ''),
      coalesce(nullif(trim(coalesce(p_titulo, '')), ''), case when p_tipo = 'maderas' then 'OT de maderas' else 'OT de kit de herrajes' end),
      'Oberti', nullif(trim(coalesce(p_notas, '')), ''), auth.uid(), auth.uid()
    )
    on conflict (linea_id, tipo) where linea_id is not null and lote_id is null do update set
      numero_ot = excluded.numero_ot,
      titulo = excluded.titulo,
      proveedor = 'Oberti',
      notas = excluded.notas,
      actualizado_por = auth.uid(),
      updated_at = now()
    returning id into v_ot_id;
  end if;

  delete from public.muebles_orden_trabajo_items
  where orden_trabajo_id = v_ot_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_item ->> 'descripcion', '')), '') is null then
      continue;
    end if;
    insert into public.muebles_orden_trabajo_items (
      orden_trabajo_id, material_id, obra_snapshot_id, descripcion, codigo,
      cantidad, unidad, notas, origen, orden
    ) values (
      v_ot_id,
      nullif(v_item ->> 'material_id', '')::uuid,
      nullif(v_item ->> 'obra_snapshot_id', '')::uuid,
      trim(v_item ->> 'descripcion'),
      nullif(trim(coalesce(v_item ->> 'codigo', '')), ''),
      case when nullif(v_item ->> 'cantidad', '') is null then null else (v_item ->> 'cantidad')::numeric end,
      coalesce(nullif(trim(coalesce(v_item ->> 'unidad', '')), ''), 'unidad'),
      nullif(trim(coalesce(v_item ->> 'notas', '')), ''),
      case when v_item ->> 'origen' in ('matriz_obra', 'matriz_linea', 'manual') then v_item ->> 'origen' else 'manual' end,
      v_orden
    );
    v_orden := v_orden + 1;
  end loop;

  insert into public.muebles_ordenes_trabajo_historial (
    orden_trabajo_id, lote_id, linea_id, tipo, accion, detalle, usuario_id
  ) values (
    v_ot_id, p_lote_id, p_linea_id, p_tipo,
    case when p_linea_id is not null then 'Plantilla de línea actualizada' else 'OT de obra actualizada' end,
    jsonb_build_object(
      'numero_ot', nullif(trim(coalesce(p_numero_ot, '')), ''),
      'titulo', p_titulo,
      'notas', p_notas,
      'items', coalesce(p_items, '[]'::jsonb)
    ),
    auth.uid()
  );

  return v_ot_id;
end;
$$;

grant execute on function public.muebles_ot_guardar_contexto(uuid, uuid, text, text, text, text, jsonb)
  to authenticated;

create or replace function public.muebles_ot_descartar_override(
  p_lote_id uuid,
  p_tipo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ot public.muebles_ordenes_trabajo%rowtype;
begin
  select * into v_ot
  from public.muebles_ordenes_trabajo
  where lote_id = p_lote_id and tipo = p_tipo;

  if v_ot.id is null then return; end if;

  insert into public.prod_muebles_lotes_historial (
    lote_id, accion, detalle, usuario_id
  ) values (
    p_lote_id,
    'OT particular descartada; vuelve a plantilla de línea',
    jsonb_build_object('tipo', p_tipo, 'numero_ot', v_ot.numero_ot, 'titulo', v_ot.titulo),
    auth.uid()
  );

  delete from public.muebles_ordenes_trabajo where id = v_ot.id;
end;
$$;

grant execute on function public.muebles_ot_descartar_override(uuid, text)
  to authenticated;

comment on column public.muebles_ordenes_trabajo.linea_id is
  'Cuando tiene valor, esta OT es la plantilla base de maderas o herrajes para toda la línea.';
