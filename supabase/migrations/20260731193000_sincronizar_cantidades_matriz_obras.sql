-- La lista matriz (panol_material_modelo) es la fuente de verdad para los
-- ítems estándar. Las obras guardan un snapshot operativo para pañol/compras,
-- por lo que había que mantener ambas cantidades sincronizadas.
--
-- Los adicionales quedan expresamente afuera: pertenecen sólo a su obra y
-- nunca deben ser modificados por un cambio en la matriz de la línea.

create or replace function public.sincronizar_cantidad_matriz_en_obras(
  p_material_id uuid,
  p_modelo text,
  p_cantidad numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo text := regexp_replace(
    regexp_replace(upper(trim(coalesce(p_modelo, ''))), '[^A-Z0-9]+', '', 'g'),
    '^K',
    ''
  );
  v_actualizadas integer := 0;
begin
  if p_material_id is null or v_modelo = '' or p_cantidad is null or p_cantidad <= 0 then
    return 0;
  end if;

  -- El trigger de auditoría de snapshots deja claro que el ajuste vino de la
  -- matriz y no de una edición manual dentro de la obra.
  perform set_config('app.audit_origin', 'matriz_linea', true);
  perform set_config(
    'app.audit_note',
    format('Cantidad sincronizada desde la matriz %s.', v_modelo),
    true
  );

  update public.panol_obra_materiales_snapshot snapshot
     set cantidad = p_cantidad,
         updated_at = now()
    from public.produccion_obras obra
   where snapshot.obra_id = obra.id
     and snapshot.material_id = p_material_id
     and lower(coalesce(snapshot.source, 'matriz')) = 'matriz'
     and lower(coalesce(snapshot.tipo, 'base')) not in ('addon', 'adicional', 'opcional')
     and coalesce(
       nullif(regexp_replace(upper(coalesce(to_jsonb(obra) ->> 'modelo', '')), '[^A-Z0-9]+', '', 'g'), ''),
       nullif(regexp_replace(upper(coalesce(obra.linea_nombre, '')), '[^A-Z0-9]+', '', 'g'), ''),
       nullif(regexp_replace(upper(split_part(coalesce(obra.codigo, ''), '-', 1)), '[^A-Z0-9]+', '', 'g'), '')
     ) in (v_modelo, 'K' || v_modelo)
     and snapshot.cantidad is distinct from p_cantidad;

  get diagnostics v_actualizadas = row_count;
  return v_actualizadas;
end;
$$;

create or replace function public.trg_sincronizar_cantidad_matriz_en_obras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sólo la fila estándar del BOM define la cantidad de las obras. Quitar un
  -- ítem de la matriz no borra snapshots históricos automáticamente.
  if tg_op = 'DELETE' then
    return old;
  end if;

  if coalesce(new.variante, 'standard') <> 'standard' then
    return new;
  end if;

  perform public.sincronizar_cantidad_matriz_en_obras(
    new.material_id,
    new.modelo,
    new.cantidad
  );
  return new;
end;
$$;

drop trigger if exists trg_panol_material_modelo_sync_obras on public.panol_material_modelo;
create trigger trg_panol_material_modelo_sync_obras
after insert or update of cantidad, modelo, material_id on public.panol_material_modelo
for each row
execute function public.trg_sincronizar_cantidad_matriz_en_obras();

-- Corrige también las cantidades que ya habían quedado desfasadas antes de
-- instalar este trigger. Las filas adicionales no entran en la actualización.
do $$
declare
  v_bom record;
begin
  for v_bom in
    select material_id, modelo, cantidad
      from public.panol_material_modelo
     where coalesce(variante, 'standard') = 'standard'
       and cantidad > 0
  loop
    perform public.sincronizar_cantidad_matriz_en_obras(
      v_bom.material_id,
      v_bom.modelo,
      v_bom.cantidad
    );
  end loop;
end;
$$;
