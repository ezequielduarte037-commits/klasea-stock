-- Detalle técnico de las plantillas de Muebles.
-- Conserva la estructura de la OT histórica: placas, tablones, medidas, caras,
-- veta y cantidades no numéricas como "1,5 m".

alter table public.muebles_ordenes_trabajo
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.muebles_orden_trabajo_items
  add column if not exists cantidad_texto text,
  add column if not exists detalle jsonb not null default '{}'::jsonb;

create or replace function public.muebles_ot_guardar_contexto(
  p_lote_id uuid,
  p_linea_id uuid,
  p_tipo text,
  p_numero_ot text,
  p_titulo text,
  p_notas text,
  p_items jsonb default '[]'::jsonb,
  p_config jsonb default '{}'::jsonb
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
      lote_id, linea_id, tipo, numero_ot, titulo, proveedor, notas, config, creado_por, actualizado_por
    ) values (
      p_lote_id, null, p_tipo,
      nullif(trim(coalesce(p_numero_ot, '')), ''),
      coalesce(nullif(trim(coalesce(p_titulo, '')), ''), case when p_tipo = 'maderas' then 'OT de maderas' else 'OT de kit de herrajes' end),
      'Oberti', nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_config, '{}'::jsonb), auth.uid(), auth.uid()
    )
    on conflict (lote_id, tipo) where lote_id is not null do update set
      numero_ot = excluded.numero_ot,
      titulo = excluded.titulo,
      proveedor = 'Oberti',
      notas = excluded.notas,
      config = excluded.config,
      actualizado_por = auth.uid(),
      updated_at = now()
    returning id into v_ot_id;
  else
    insert into public.muebles_ordenes_trabajo (
      lote_id, linea_id, tipo, numero_ot, titulo, proveedor, notas, config, creado_por, actualizado_por
    ) values (
      null, p_linea_id, p_tipo,
      nullif(trim(coalesce(p_numero_ot, '')), ''),
      coalesce(nullif(trim(coalesce(p_titulo, '')), ''), case when p_tipo = 'maderas' then 'OT de maderas' else 'OT de kit de herrajes' end),
      'Oberti', nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_config, '{}'::jsonb), auth.uid(), auth.uid()
    )
    on conflict (linea_id, tipo) where linea_id is not null and lote_id is null do update set
      numero_ot = excluded.numero_ot,
      titulo = excluded.titulo,
      proveedor = 'Oberti',
      notas = excluded.notas,
      config = excluded.config,
      actualizado_por = auth.uid(),
      updated_at = now()
    returning id into v_ot_id;
  end if;

  delete from public.muebles_orden_trabajo_items where orden_trabajo_id = v_ot_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_item ->> 'descripcion', '')), '') is null then continue; end if;
    insert into public.muebles_orden_trabajo_items (
      orden_trabajo_id, material_id, obra_snapshot_id, descripcion, codigo,
      cantidad, cantidad_texto, unidad, notas, detalle, origen, orden
    ) values (
      v_ot_id,
      nullif(v_item ->> 'material_id', '')::uuid,
      nullif(v_item ->> 'obra_snapshot_id', '')::uuid,
      trim(v_item ->> 'descripcion'),
      nullif(trim(coalesce(v_item ->> 'codigo', '')), ''),
      case
        when coalesce(v_item ->> 'cantidad', '') ~ '^[0-9]+([.][0-9]+)?$' then (v_item ->> 'cantidad')::numeric
        else null
      end,
      nullif(trim(coalesce(v_item ->> 'cantidad_texto', v_item ->> 'cantidad', '')), ''),
      coalesce(nullif(trim(coalesce(v_item ->> 'unidad', '')), ''), 'unidad'),
      nullif(trim(coalesce(v_item ->> 'notas', '')), ''),
      coalesce(v_item -> 'detalle', '{}'::jsonb),
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
    jsonb_build_object('numero_ot', p_numero_ot, 'titulo', p_titulo, 'notas', p_notas, 'config', coalesce(p_config, '{}'::jsonb), 'items', coalesce(p_items, '[]'::jsonb)),
    auth.uid()
  );

  return v_ot_id;
end;
$$;

grant execute on function public.muebles_ot_guardar_contexto(uuid, uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;
