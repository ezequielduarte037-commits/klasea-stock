-- Dejar traza cuando se marca "Egresado" a mano desde la lista de la obra.
--
-- Contexto, para que no se repita el analisis: marcar Egresado desde el selector
-- YA descuenta bien el stock. La fila deja de aportar +cantidad y pasa a aportar
-- 0 —porque cantidad_egresada queda en 0 y el calculo lo toma como cero, no como
-- la cantidad entera—, con lo cual el neto es exactamente -cantidad. No hace
-- falta ningun par ingreso+egreso: eso seria contar el mismo movimiento dos
-- veces. Verificado sobre 500 filas egresadas reales.
--
-- Lo que falta no es el numero, es el RASTRO. Hoy se marca Egresado y no queda
-- quien se lo llevo. Dentro de tres meses la fila dice "egresado" y no hay forma
-- de saber si salio de verdad o si alguien acomodo la lista para que cerrara.
--
-- Dos cosas entonces:
--
-- 1. QUIEN RETIRO, OBLIGATORIO. Mismo criterio que el colector: un egreso sin
--    persona no sirve para nada. La diferencia entre un registro y un adorno es
--    poder preguntarle a alguien.
--
-- 2. QUE SE VEA QUE ES UNA REGULARIZACION. Un egreso normal paso por el
--    mostrador: alguien lo pidio, alguien lo entrego, quedo la firma. Este no:
--    es alguien corrigiendo la lista despues de los hechos. Mezclarlos hace que
--    el kardex parezca mas prolijo de lo que es, y sobre todo impide contar
--    cuantas veces pasa. Esa frecuencia es el dato util: si son 40 por mes, el
--    problema no es la carga, es que la recepcion se esta salteando.

alter table public.panol_obra_materiales_snapshot
  add column if not exists es_regularizacion boolean not null default false;

comment on column public.panol_obra_materiales_snapshot.es_regularizacion is
  'El egreso se cargo a mano desde la lista de la obra, no por el mostrador de panol. Se separa para poder contarlos.';

create index if not exists idx_panol_snapshot_regularizaciones
  on public.panol_obra_materiales_snapshot (egreso_at desc)
  where es_regularizacion;

-- ── Cambiar el estado de un renglon de obra ───────────────────────────────
drop function if exists public.panol_cambiar_estado_snapshot(uuid, text, text);

create or replace function public.panol_cambiar_estado_snapshot(
  p_snapshot_id uuid,
  p_estado text,
  p_nota text default null,
  p_retirado_por text default null
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
  v_retirado text := nullif(btrim(coalesce(p_retirado_por, '')), '');
  v_previo text;
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

  select estado into v_previo
    from public.panol_obra_materiales_snapshot
   where id = p_snapshot_id;
  if not found then
    raise exception 'Renglon de obra inexistente';
  end if;

  -- Solo se exige la persona cuando el renglon PASA a egresado. Editar la nota
  -- de algo ya egresado no tiene por que volver a pedirla.
  if p_estado = 'egresado' and v_previo is distinct from 'egresado' and v_retirado is null then
    raise exception 'Para marcar como egresado hay que indicar quien lo retiro';
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
         retirado_por = case
           when p_estado = 'egresado' then coalesce(v_retirado, retirado_por)
           when estado = 'egresado' and p_estado <> 'egresado' then null
           else retirado_por
         end,
         -- Volver atras limpia la marca: si el renglon deja de estar egresado,
         -- no hay regularizacion que contar.
         es_regularizacion = case
           when p_estado = 'egresado' then true
           else false
         end,
         updated_at = now()
   where id = p_snapshot_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.panol_cambiar_estado_snapshot(uuid, text, text, text) is
  'Cambia el estado de un renglon de obra. Al pasar a egresado exige quien retiro y lo marca como regularizacion.';

grant execute on function public.panol_cambiar_estado_snapshot(uuid, text, text, text) to authenticated;

-- ── Cuantas regularizaciones por mes ──────────────────────────────────────
-- El numero que dice si esto es una excepcion o se volvio el procedimiento.
create or replace view public.panol_regularizaciones_por_mes
with (security_invoker = true) as
select
  date_trunc('month', egreso_at)::date as mes,
  count(*)::int as total,
  count(distinct obra_id)::int as obras,
  count(*) filter (where retirado_por is null or btrim(retirado_por) = '')::int as sin_persona
from public.panol_obra_materiales_snapshot
where es_regularizacion and egreso_at is not null
group by 1
order by 1 desc;

grant select on public.panol_regularizaciones_por_mes to authenticated;
