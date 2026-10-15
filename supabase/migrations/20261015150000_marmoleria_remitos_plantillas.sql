-- Remitos internos de retiro de plantillas: original firmado y duplicado.
-- Captura inmutable: las reimpresiones conservan el material/barco/pieza emitidos.
begin;

create or replace function public.marm_puede_emitir_remitos()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.is_admin, false) or p.role::text in ('admin', 'tecnica', 'oficina'))
      and coalesce((to_jsonb(p)->>'activo')::boolean, true)
      and not coalesce((to_jsonb(p)->>'is_demo')::boolean, false)
  );
$$;
revoke all on function public.marm_puede_emitir_remitos() from public, anon;
grant execute on function public.marm_puede_emitir_remitos() to authenticated;

create table if not exists public.marm_remitos (
  id uuid primary key,
  numero bigint generated always as identity unique,
  fecha date not null,
  destinatario text not null check (length(btrim(destinatario)) between 1 and 200),
  entregado_por text not null check (length(btrim(entregado_por)) between 1 and 150),
  retira text not null default '' check (length(retira) <= 150),
  observaciones text not null default '' check (length(observaciones) <= 1000),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  solicitud jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.marm_remitos enable row level security;
revoke all on public.marm_remitos from anon, authenticated;
grant select on public.marm_remitos to authenticated;
drop policy if exists marm_remitos_lectura on public.marm_remitos;
create policy marm_remitos_lectura on public.marm_remitos for select to authenticated
  using (public.marm_puede_emitir_remitos());

create or replace function public.marm_emitir_remito(
  p_id uuid,
  p_fecha date,
  p_destinatario text,
  p_entregado_por text,
  p_retira text,
  p_observaciones text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_previo public.marm_remitos;
  v_remito public.marm_remitos;
  v_solicitud jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pieza record;
  v_cantidad numeric;
  v_material text;
begin
  if not public.marm_puede_emitir_remitos() then
    raise exception 'Sin permiso para emitir remitos de marmolería' using errcode = '42501';
  end if;
  if p_id is null or p_fecha is null or not isfinite(p_fecha) then
    raise exception 'Indicá el identificador y la fecha de entrega';
  end if;
  p_destinatario := btrim(coalesce(p_destinatario, ''));
  p_entregado_por := btrim(coalesce(p_entregado_por, ''));
  p_retira := btrim(coalesce(p_retira, ''));
  p_observaciones := btrim(coalesce(p_observaciones, ''));
  if length(p_destinatario) not between 1 and 200 or length(p_entregado_por) not between 1 and 150
     or length(p_retira) > 150 or length(p_observaciones) > 1000 then
    raise exception 'Revisá destinatario, responsable y observaciones del remito';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Seleccioná las plantillas del remito';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Seleccioná entre 1 y 100 plantillas';
  end if;
  if jsonb_array_length(p_items) <> (select count(distinct (i->>'pieza_id')::uuid) from jsonb_array_elements(p_items) i) then
    raise exception 'Hay plantillas repetidas o sin identificar';
  end if;
  v_solicitud := jsonb_build_object('fecha', p_fecha, 'destinatario', p_destinatario,
    'entregado_por', p_entregado_por, 'retira', p_retira, 'observaciones', p_observaciones, 'items', p_items);

  -- Un reintento tras perder la respuesta no emite otro remito.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_previo from public.marm_remitos where id = p_id;
  if found then
    if v_previo.created_by is distinct from auth.uid() or v_previo.solicitud is distinct from v_solicitud then
      raise exception 'Este identificador ya pertenece a otro remito';
    end if;
    return to_jsonb(v_previo) - 'solicitud' - 'created_by';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item->'cantidad') is distinct from 'number' then
      raise exception 'La cantidad debe ser un número entero';
    end if;
    v_cantidad := (v_item->>'cantidad')::numeric;
    if v_cantidad not between 1 and 999 or trunc(v_cantidad) <> v_cantidad then
      raise exception 'Cada cantidad debe ser un entero entre 1 y 999';
    end if;
    select p.id, p.unidad_id, p.pieza, p.sector, p.color, p.observaciones,
           u.codigo, l.nombre as linea
      into v_pieza
      from public.marm_unidad_piezas p
      join public.marm_unidades u on u.id = p.unidad_id
      join public.marm_lineas l on l.id = u.linea_id
      where p.id = (v_item->>'pieza_id')::uuid and u.activa and l.activa
        and p.estado is distinct from 'No lleva'
      for share of p, u, l;
    if not found then
      raise exception 'Una plantilla ya no está disponible. Actualizá la selección';
    end if;
    v_material := btrim(coalesce(v_item->>'material', v_pieza.color, ''));
    if length(v_material) not between 1 and 300 then
      raise exception 'Completá el material de todas las plantillas (hasta 300 caracteres)';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'pieza_id', v_pieza.id, 'unidad_id', v_pieza.unidad_id,
      'codigo_barco', v_pieza.codigo, 'linea', v_pieza.linea,
      'sector', v_pieza.sector, 'pieza', v_pieza.pieza,
      'material', v_material, 'cantidad', v_cantidad::integer,
      'observaciones', coalesce(v_pieza.observaciones, '')
    ));
  end loop;

  insert into public.marm_remitos(id, fecha, destinatario, entregado_por, retira, observaciones, items, solicitud, created_by)
    values (p_id, p_fecha, p_destinatario, p_entregado_por, p_retira, p_observaciones, v_items, v_solicitud, auth.uid())
    returning * into v_remito;
  return to_jsonb(v_remito) - 'solicitud' - 'created_by';
end;
$$;
revoke all on function public.marm_emitir_remito(uuid, date, text, text, text, text, jsonb) from public, anon;
grant execute on function public.marm_emitir_remito(uuid, date, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
