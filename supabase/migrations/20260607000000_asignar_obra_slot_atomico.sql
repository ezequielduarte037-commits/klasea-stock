-- Asignación atómica de obra a slot del Mapa de Producción
-- ─────────────────────────────────────────────────────────────────────────────
-- ANTES: el frontend hacía DOS updates sueltos (limpiar el slot + asignar la obra)
-- sin transacción. Si dos asignaciones entraban en paralelo, o el segundo update
-- fallaba, quedaban DOS obras con el mismo puesto_mapa/bahia_pampa → "colisión".
-- El propio MapaProduccion detectaba esto y pedía correr SQL de limpieza a mano.
--
-- AHORA: una función plpgsql corre ambos statements en una sola transacción
-- implícita. O se aplican los dos, o ninguno. Las colisiones desaparecen de raíz.
--
-- Convención: pasar p_slot = NULL (o '') para DESASIGNAR la obra del mapa/pampa.

-- ── Mapa principal (columna puesto_mapa) ───────────────────────────────────────
create or replace function public.asignar_obra_a_puesto(
  p_obra_id uuid,
  p_puesto  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Normalizar string vacío a NULL (desasignar)
  if p_puesto is not null and btrim(p_puesto) = '' then
    p_puesto := null;
  end if;

  -- 1. Liberar el puesto destino de cualquier OTRA obra que lo ocupe.
  if p_puesto is not null then
    update public.produccion_obras
       set puesto_mapa = null
     where puesto_mapa = p_puesto
       and id <> p_obra_id;
  end if;

  -- 2. Asignar (o desasignar si p_puesto es null) la obra objetivo.
  update public.produccion_obras
     set puesto_mapa = p_puesto
   where id = p_obra_id;
end;
$$;

-- ── Galpón Pampa (columna bahia_pampa) ──────────────────────────────────────────
create or replace function public.asignar_obra_a_bahia(
  p_obra_id uuid,
  p_bahia   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bahia is not null and btrim(p_bahia) = '' then
    p_bahia := null;
  end if;

  if p_bahia is not null then
    update public.produccion_obras
       set bahia_pampa = null
     where bahia_pampa = p_bahia
       and id <> p_obra_id;
  end if;

  update public.produccion_obras
     set bahia_pampa = p_bahia
   where id = p_obra_id;
end;
$$;

grant execute on function public.asignar_obra_a_puesto(uuid, text) to authenticated;
grant execute on function public.asignar_obra_a_bahia(uuid, text)  to authenticated;

-- ── Limpieza one-shot de colisiones preexistentes ───────────────────────────────
-- Si ya hay dos obras compartiendo el mismo puesto_mapa, conservar la de
-- updated_at más reciente y liberar a las demás. Misma lógica para bahia_pampa.
with ranked as (
  select id, puesto_mapa,
         row_number() over (
           partition by puesto_mapa
           order by updated_at desc nulls last, created_at desc nulls last
         ) as rn
    from public.produccion_obras
   where puesto_mapa is not null
)
update public.produccion_obras o
   set puesto_mapa = null
  from ranked r
 where o.id = r.id
   and r.rn > 1;

with ranked as (
  select id, bahia_pampa,
         row_number() over (
           partition by bahia_pampa
           order by updated_at desc nulls last, created_at desc nulls last
         ) as rn
    from public.produccion_obras
   where bahia_pampa is not null
)
update public.produccion_obras o
   set bahia_pampa = null
  from ranked r
 where o.id = r.id
   and r.rn > 1;
