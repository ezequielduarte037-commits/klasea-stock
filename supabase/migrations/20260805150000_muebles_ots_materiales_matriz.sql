-- Documentación técnica de Muebles vinculada de forma informativa a la matriz.
-- Estas OT no modifican stock, compras ni cantidades de la lista de materiales.

create table if not exists public.muebles_ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.prod_muebles_lotes(id) on delete cascade,
  tipo text not null,
  numero_ot text,
  titulo text not null,
  proveedor text not null default 'Oberti',
  notas text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint muebles_ordenes_trabajo_tipo_chk
    check (tipo in ('maderas', 'herrajes')),
  constraint muebles_ordenes_trabajo_lote_tipo_uidx
    unique (lote_id, tipo)
);

create table if not exists public.muebles_orden_trabajo_items (
  id uuid primary key default gen_random_uuid(),
  orden_trabajo_id uuid not null references public.muebles_ordenes_trabajo(id) on delete cascade,
  material_id uuid references public.panol_materiales(id) on delete set null,
  obra_snapshot_id uuid references public.panol_obra_materiales_snapshot(id) on delete set null,
  descripcion text not null,
  codigo text,
  cantidad numeric,
  unidad text not null default 'unidad',
  notas text,
  origen text not null default 'manual',
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint muebles_ot_items_origen_chk
    check (origen in ('matriz_obra', 'matriz_linea', 'manual'))
);

create table if not exists public.muebles_ordenes_trabajo_historial (
  id uuid primary key default gen_random_uuid(),
  orden_trabajo_id uuid not null references public.muebles_ordenes_trabajo(id) on delete cascade,
  lote_id uuid not null references public.prod_muebles_lotes(id) on delete cascade,
  tipo text not null,
  accion text not null default 'OT actualizada',
  detalle jsonb not null default '{}'::jsonb,
  usuario_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists muebles_ot_items_ot_idx
  on public.muebles_orden_trabajo_items(orden_trabajo_id, orden);
create index if not exists muebles_ot_items_material_idx
  on public.muebles_orden_trabajo_items(material_id)
  where material_id is not null;
create index if not exists muebles_ot_historial_lote_idx
  on public.muebles_ordenes_trabajo_historial(lote_id, created_at desc);

alter table public.muebles_ordenes_trabajo enable row level security;
alter table public.muebles_orden_trabajo_items enable row level security;
alter table public.muebles_ordenes_trabajo_historial enable row level security;

drop policy if exists "muebles ot authenticated select" on public.muebles_ordenes_trabajo;
create policy "muebles ot authenticated select"
  on public.muebles_ordenes_trabajo for select to authenticated using (true);
drop policy if exists "muebles ot authenticated write" on public.muebles_ordenes_trabajo;
create policy "muebles ot authenticated write"
  on public.muebles_ordenes_trabajo for all to authenticated
  using (true) with check (true);

drop policy if exists "muebles ot items authenticated select" on public.muebles_orden_trabajo_items;
create policy "muebles ot items authenticated select"
  on public.muebles_orden_trabajo_items for select to authenticated using (true);
drop policy if exists "muebles ot items authenticated write" on public.muebles_orden_trabajo_items;
create policy "muebles ot items authenticated write"
  on public.muebles_orden_trabajo_items for all to authenticated
  using (true) with check (true);

drop policy if exists "muebles ot historial authenticated select" on public.muebles_ordenes_trabajo_historial;
create policy "muebles ot historial authenticated select"
  on public.muebles_ordenes_trabajo_historial for select to authenticated using (true);
drop policy if exists "muebles ot historial authenticated insert" on public.muebles_ordenes_trabajo_historial;
create policy "muebles ot historial authenticated insert"
  on public.muebles_ordenes_trabajo_historial for insert to authenticated
  with check (true);

grant select, insert, update, delete on public.muebles_ordenes_trabajo to authenticated;
grant select, insert, update, delete on public.muebles_orden_trabajo_items to authenticated;
grant select, insert on public.muebles_ordenes_trabajo_historial to authenticated;

-- Guardado atómico: reemplaza el contenido de una OT y registra quién hizo el cambio.
create or replace function public.muebles_ot_guardar(
  p_lote_id uuid,
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
  if p_tipo not in ('maderas', 'herrajes') then
    raise exception 'Tipo de OT inválido';
  end if;

  insert into public.muebles_ordenes_trabajo (
    lote_id, tipo, numero_ot, titulo, proveedor, notas, creado_por, actualizado_por
  ) values (
    p_lote_id,
    p_tipo,
    nullif(trim(coalesce(p_numero_ot, '')), ''),
    coalesce(nullif(trim(coalesce(p_titulo, '')), ''), case when p_tipo = 'maderas' then 'OT de maderas' else 'OT de kit de herrajes' end),
    'Oberti',
    nullif(trim(coalesce(p_notas, '')), ''),
    auth.uid(),
    auth.uid()
  )
  on conflict (lote_id, tipo) do update set
    numero_ot = excluded.numero_ot,
    titulo = excluded.titulo,
    proveedor = 'Oberti',
    notas = excluded.notas,
    actualizado_por = auth.uid(),
    updated_at = now()
  returning id into v_ot_id;

  delete from public.muebles_orden_trabajo_items
  where orden_trabajo_id = v_ot_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_item ->> 'descripcion', '')), '') is null then
      continue;
    end if;
    insert into public.muebles_orden_trabajo_items (
      orden_trabajo_id,
      material_id,
      obra_snapshot_id,
      descripcion,
      codigo,
      cantidad,
      unidad,
      notas,
      origen,
      orden
    ) values (
      v_ot_id,
      nullif(v_item ->> 'material_id', '')::uuid,
      nullif(v_item ->> 'obra_snapshot_id', '')::uuid,
      trim(v_item ->> 'descripcion'),
      nullif(trim(coalesce(v_item ->> 'codigo', '')), ''),
      case
        when nullif(v_item ->> 'cantidad', '') is null then null
        else (v_item ->> 'cantidad')::numeric
      end,
      coalesce(nullif(trim(coalesce(v_item ->> 'unidad', '')), ''), 'unidad'),
      nullif(trim(coalesce(v_item ->> 'notas', '')), ''),
      case
        when v_item ->> 'origen' in ('matriz_obra', 'matriz_linea', 'manual') then v_item ->> 'origen'
        else 'manual'
      end,
      v_orden
    );
    v_orden := v_orden + 1;
  end loop;

  insert into public.muebles_ordenes_trabajo_historial (
    orden_trabajo_id, lote_id, tipo, accion, detalle, usuario_id
  ) values (
    v_ot_id,
    p_lote_id,
    p_tipo,
    'OT actualizada',
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

grant execute on function public.muebles_ot_guardar(uuid, text, text, text, text, jsonb)
  to authenticated;

comment on table public.muebles_ordenes_trabajo is
  'OT informativas de maderas y herrajes para Oberti, asociadas a un proceso de Muebles.';
comment on column public.muebles_orden_trabajo_items.material_id is
  'Referencia opcional al catálogo; editar la OT no modifica la matriz, compras ni stock.';
