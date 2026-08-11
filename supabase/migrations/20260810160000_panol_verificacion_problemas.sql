-- Revision del maestro, segunda vuelta.
--
-- Dos cosas que salieron de usarlo:
--
-- 1. BUG: panol_materiales no tiene updated_at. La funcion lo escribia y toda
--    la revision fallaba con 42703. Se saca; la fecha de la revision ya vive en
--    verificado_at, que es la que importa acá.
--
-- 2. "TIENE UN PROBLEMA" NO DICE NADA. Un texto libre obliga a leer item por
--    item para saber si hay que ir a buscar la pieza, corregir una etiqueta o
--    sacar una foto. Y como cada uno lo escribe distinto, no se puede contar:
--    la pregunta que de verdad importa al terminar la pasada es "¿de que tipo
--    son los problemas?", porque de ahi sale que arreglar para que no vuelva a
--    pasar. Ahora el problema se tipifica y el texto queda para el detalle.

-- ── Tipos de problema ─────────────────────────────────────────────────────
-- Se guardan como arreglo porque un mismo producto puede tener varios a la vez:
-- lo tipico es que no este donde dice Y ademas la cantidad no cierre.
--
--   ubicacion    no esta donde dice la ficha
--   cantidad     lo que hay no coincide con el sistema
--   descripcion  el nombre no alcanza para reconocerlo
--   codigo       el codigo o la etiqueta no coinciden
--   foto         falta la foto para identificarlo
--   duplicado    esta cargado dos veces en el catalogo
--   no_existe    no se encontro en el panol
--   otro         algo que no entra en los anteriores
alter table public.panol_materiales
  add column if not exists verificacion_problemas text[] not null default '{}';

comment on column public.panol_materiales.verificacion_problemas is
  'Que tipo de problema tiene. Tipificado para poder contarlos: el texto libre no se puede agrupar.';

alter table public.panol_material_verificaciones
  add column if not exists problemas text[] not null default '{}';

-- Lo que efectivamente se conto en el estante. No corrige el stock —eso es un
-- ajuste y tiene su propio circuito— pero deja registrado el numero que vio la
-- persona, que es la prueba de la diferencia.
alter table public.panol_material_verificaciones
  add column if not exists cantidad_contada numeric(14,3);

comment on column public.panol_material_verificaciones.cantidad_contada is
  'Lo que se conto fisicamente al revisar. No ajusta stock: deja constancia de la diferencia.';

alter table public.panol_material_verificaciones
  add column if not exists cantidad_sistema numeric(14,3);

-- ── Revisar un producto ───────────────────────────────────────────────────
create or replace function public.panol_verificar_material(
  p_material_id uuid,
  p_estado text,
  p_nota text default null,
  p_ubicacion text default null,
  p_ubicacion_obs text default null,
  p_descripcion text default null,
  p_problemas text[] default '{}',
  p_cantidad_contada numeric default null,
  p_cantidad_sistema numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_ubicacion text := nullif(btrim(coalesce(p_ubicacion, '')), '');
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_problemas text[] := coalesce(p_problemas, '{}');
  v_valid text[] := array['ubicacion','cantidad','descripcion','codigo','foto','duplicado','no_existe','otro'];
  v_item text;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if p_estado not in ('pendiente', 'ok', 'problema') then
    raise exception 'Estado de verificacion invalido: %', p_estado;
  end if;

  if p_estado = 'problema' then
    if array_length(v_problemas, 1) is null then
      raise exception 'Elegi al menos un tipo de problema';
    end if;
    foreach v_item in array v_problemas loop
      if not (v_item = any(v_valid)) then
        raise exception 'Tipo de problema invalido: %', v_item;
      end if;
    end loop;
    -- "Otro" sin explicacion es exactamente el caso que esto viene a evitar.
    if 'otro' = any(v_problemas) and v_nota is null then
      raise exception 'Si elegis "Otro" hay que escribir que pasa';
    end if;
  else
    v_problemas := '{}';
  end if;

  -- Sin updated_at: panol_materiales no tiene esa columna. La marca de tiempo
  -- de la revision es verificado_at.
  update public.panol_materiales
     set descripcion = coalesce(v_descripcion, descripcion),
         ubicacion = coalesce(v_ubicacion, ubicacion),
         ubicacion_obs = case
           when p_ubicacion_obs is null then ubicacion_obs
           else nullif(btrim(p_ubicacion_obs), '')
         end,
         verificacion_estado = p_estado,
         verificacion_problemas = v_problemas,
         verificacion_nota = case when p_estado = 'pendiente' then null else v_nota end,
         verificado_at = case when p_estado = 'pendiente' then null else now() end,
         verificado_por = case when p_estado = 'pendiente' then null else v_uid end
   where id = p_material_id;

  if not found then
    raise exception 'Producto inexistente';
  end if;

  if p_estado <> 'pendiente' then
    insert into public.panol_material_verificaciones (
      material_id, estado, nota, problemas, ubicacion, descripcion,
      cantidad_contada, cantidad_sistema, verificado_por
    )
    select
      p_material_id, p_estado, v_nota, v_problemas, m.ubicacion, m.descripcion,
      p_cantidad_contada, p_cantidad_sistema, v_uid
      from public.panol_materiales m
     where m.id = p_material_id;
  end if;
end;
$$;

comment on function public.panol_verificar_material(uuid, text, text, text, text, text, text[], numeric, numeric) is
  'Corrige los datos de un producto y marca la revision, con el problema tipificado.';

grant execute on function public.panol_verificar_material(uuid, text, text, text, text, text, text[], numeric, numeric) to authenticated;

-- La firma vieja queda huerfana y, con parametros por nombre, dos candidatas
-- que aceptan la misma llamada dan "function is not unique".
drop function if exists public.panol_verificar_material(uuid, text, text, text, text, text);

-- ── Avance, ahora con el desglose de problemas ────────────────────────────
-- El conteo por tipo es el resultado util de la pasada: dice que arreglar en el
-- proceso, no solo que arreglar en cada ficha.
--
-- Se dropea antes: la quinta columna cambia de nombre y "create or replace
-- view" solo deja agregar al final, nunca renombrar (42P16).
drop view if exists public.panol_verificacion_avance;

create view public.panol_verificacion_avance
with (security_invoker = true) as
select
  count(*)::int as total,
  count(*) filter (where verificacion_estado = 'ok')::int as ok,
  count(*) filter (where verificacion_estado = 'problema')::int as problema,
  count(*) filter (where verificacion_estado = 'pendiente')::int as pendiente,
  count(*) filter (where 'ubicacion' = any(verificacion_problemas))::int as p_ubicacion,
  count(*) filter (where 'cantidad' = any(verificacion_problemas))::int as p_cantidad,
  count(*) filter (where 'descripcion' = any(verificacion_problemas))::int as p_descripcion,
  count(*) filter (where 'codigo' = any(verificacion_problemas))::int as p_codigo,
  count(*) filter (where 'foto' = any(verificacion_problemas))::int as p_foto,
  count(*) filter (where 'duplicado' = any(verificacion_problemas))::int as p_duplicado,
  count(*) filter (where 'no_existe' = any(verificacion_problemas))::int as p_no_existe,
  count(*) filter (where 'otro' = any(verificacion_problemas))::int as p_otro
from public.panol_materiales
where activo;

grant select on public.panol_verificacion_avance to authenticated;
