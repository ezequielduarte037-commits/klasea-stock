-- Un renglón de Tornería puede apuntar a VARIOS materiales del catálogo.
--
-- El caso que lo pide es el "Lote de broncería y bujes": un solo renglón que en
-- la realidad son cinco o seis piezas distintas -bujes de goma, bujes de bronce
-- para limera, tuercas de limera y de hélice, brazos de timón-. Hasta hoy el
-- vínculo era un `material_id` y nada más, así que el lote sólo podía apuntar a
-- una de ellas: el renglón figuraba "sin catálogo" o, peor, vinculado a una sola
-- pieza como si fuera todo el lote, con el precio de una sola.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA MÁS. Cada material del lote tiene su propia
-- cantidad -2 bujes de goma de una medida, 1 de otra, 2 juegos de brazo- y ese
-- dato no entra en un array de ids. Y con la cantidad adentro, el renglón puede
-- contestar cuánto sale el lote entero sin que nadie lo sume a mano.
--
-- POR QUÉ `material_id` SE QUEDA. Lo leen el armador de pedidos a Compras, el
-- cartel de "Catálogo" de cada renglón y la recepción en Pañol. Sacarlo obligaba
-- a tocar todo eso de una. En vez de eso un trigger lo mantiene apuntando al
-- primer material de la lista, así lo viejo sigue funcionando igual mientras lo
-- nuevo lee la lista completa. Cuando no quede nadie leyendo la columna, se cae
-- sola y sin apuro.

begin;

create extension if not exists pgcrypto;

create table if not exists public.torneria_item_materiales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.torneria_items(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  cantidad numeric not null default 1 check (cantidad > 0),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, material_id)
);

create table if not exists public.torneria_plantilla_item_materiales (
  id uuid primary key default gen_random_uuid(),
  plantilla_item_id uuid not null references public.torneria_plantilla_items(id) on delete cascade,
  material_id uuid not null references public.panol_materiales(id) on delete cascade,
  cantidad numeric not null default 1 check (cantidad > 0),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (plantilla_item_id, material_id)
);

comment on table public.torneria_item_materiales is
  'Materiales de catálogo que componen un renglón de Tornería. Un lote son varios; una pieza suelta, uno.';
comment on column public.torneria_item_materiales.cantidad is
  'Cuántas unidades de ESE material lleva el renglón. No es la cantidad del renglón: un lote va 1 y adentro lleva 2 bujes de una medida y 1 de otra.';

create index if not exists idx_torneria_item_materiales_item
  on public.torneria_item_materiales (item_id, orden);
create index if not exists idx_torneria_plantilla_item_materiales_item
  on public.torneria_plantilla_item_materiales (plantilla_item_id, orden);

-- ── Lo que ya estaba vinculado entra como el primero de su lista ──────────

insert into public.torneria_item_materiales (item_id, material_id, cantidad, orden)
select i.id, i.material_id, 1, 0
  from public.torneria_items i
 where i.material_id is not null
on conflict (item_id, material_id) do nothing;

insert into public.torneria_plantilla_item_materiales (plantilla_item_id, material_id, cantidad, orden)
select p.id, p.material_id, 1, 0
  from public.torneria_plantilla_items p
 where p.material_id is not null
on conflict (plantilla_item_id, material_id) do nothing;

-- ── material_id sigue vivo, apuntando al primero de la lista ──────────────
-- Se recalcula desde la tabla y no al revés: la lista es la fuente de verdad.

create or replace function public.torneria_sincronizar_material_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.torneria_items i
     set material_id = (
       select m.material_id
         from public.torneria_item_materiales m
        where m.item_id = v_item
        order by m.orden, m.created_at
        limit 1
     )
   where i.id = v_item;
  return null;
end;
$$;

drop trigger if exists trg_torneria_material_principal on public.torneria_item_materiales;
create trigger trg_torneria_material_principal
  after insert or update or delete on public.torneria_item_materiales
  for each row execute function public.torneria_sincronizar_material_principal();

create or replace function public.torneria_sincronizar_material_principal_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid := coalesce(new.plantilla_item_id, old.plantilla_item_id);
begin
  update public.torneria_plantilla_items p
     set material_id = (
       select m.material_id
         from public.torneria_plantilla_item_materiales m
        where m.plantilla_item_id = v_item
        order by m.orden, m.created_at
        limit 1
     )
   where p.id = v_item;
  return null;
end;
$$;

drop trigger if exists trg_torneria_material_principal_plantilla on public.torneria_plantilla_item_materiales;
create trigger trg_torneria_material_principal_plantilla
  after insert or update or delete on public.torneria_plantilla_item_materiales
  for each row execute function public.torneria_sincronizar_material_principal_plantilla();

-- ── Permisos, con el mismo criterio que el resto de Tornería ──────────────

alter table public.torneria_item_materiales enable row level security;
alter table public.torneria_plantilla_item_materiales enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['torneria_item_materiales', 'torneria_plantilla_item_materiales']
  loop
    execute format('drop policy if exists "torneria lectura" on public.%I', t);
    execute format(
      'create policy "torneria lectura" on public.%I for select to authenticated using (public.is_torneria_viewer(auth.uid()))', t);
    execute format('drop policy if exists "torneria alta" on public.%I', t);
    execute format(
      'create policy "torneria alta" on public.%I for insert to authenticated with check (public.is_torneria_editor(auth.uid()))', t);
    execute format('drop policy if exists "torneria edicion" on public.%I', t);
    execute format(
      'create policy "torneria edicion" on public.%I for update to authenticated using (public.is_torneria_editor(auth.uid())) with check (public.is_torneria_editor(auth.uid()))', t);
    execute format('drop policy if exists "torneria baja" on public.%I', t);
    execute format(
      'create policy "torneria baja" on public.%I for delete to authenticated using (public.is_torneria_editor(auth.uid()))', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.torneria_item_materiales,
  public.torneria_plantilla_item_materiales
to authenticated;

commit;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Cada renglón que tenía vínculo tiene que tener ahora su fila en la lista, y
-- material_id tiene que seguir apuntando al mismo material.

select
  (select count(*) from public.torneria_items where material_id is not null) as items_con_vinculo,
  (select count(distinct item_id) from public.torneria_item_materiales)      as items_en_la_lista,
  (select count(*) from public.torneria_plantilla_items where material_id is not null) as plantilla_con_vinculo,
  (select count(distinct plantilla_item_id) from public.torneria_plantilla_item_materiales) as plantilla_en_la_lista;
