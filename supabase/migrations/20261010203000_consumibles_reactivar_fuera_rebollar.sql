-- Consumibles: recuperar un viejo sin par en Rebollar, con permiso de conciliación.
-- PENDIENTE: ensayar y aplicar por el coordinador. No aplicada por el agente.
-- Material, mostrador, nota y nuevo código KA cambian en una sola transacción.
-- Conserva el id, el historial y la configuración operativa; no mueve stock.

begin;

create or replace function public.consumibles_reactivar_fuera_rebollar(p_material_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.panol_materiales;
  v_config public.consumibles_config;
  v_nota_baja constant text := 'Fuera de la lista de Rebollar (10/10/2026)';
  v_notas text;
  v_codigo text;
  v_numero bigint;
begin
  if auth.uid() is null or not coalesce(public.is_panol_manager(auth.uid()), false) then
    raise exception 'Resolver productos lo pueden hacer admin, Compras y Técnica';
  end if;

  select * into v_material from public.panol_materiales where id = p_material_id for update;
  if not found or not coalesce(v_material.es_consumible, false) then
    raise exception 'No encontré ese consumible';
  end if;
  select * into v_config from public.consumibles_config where material_id = p_material_id for update;
  if not found then
    raise exception 'El consumible no tiene configuración';
  end if;
  if exists (select 1 from public.consumibles_lista_items where material_id = p_material_id) then
    raise exception 'Este producto ya está en una lista de proveedor: revisá su ficha';
  end if;

  -- Una segunda llamada tras perder la respuesta devuelve el mismo código.
  if v_material.activo = true and position('Otro proveedor' in coalesce(v_config.notas, '')) > 0 then
    return jsonb_build_object('material_id', p_material_id, 'config', to_jsonb(v_config), 'ya_reactivado', true);
  end if;
  if v_material.activo is distinct from false
     or position(v_nota_baja in coalesce(v_config.notas, '')) = 0
     or position('Fusionado en "' in coalesce(v_config.notas, '')) > 0 then
    raise exception 'Este producto ya no está pendiente de conciliar con Rebollar. Volvé a traer el catálogo';
  end if;

  v_notas := nullif(btrim(replace(v_config.notas, v_nota_baja, '')), '');
  if position('Otro proveedor' in coalesce(v_notas, '')) = 0 then
    v_notas := concat_ws(E'\n', v_notas, 'Otro proveedor');
  end if;
  v_codigo := v_config.codigo_etiqueta;
  if v_codigo !~ '^KA[0-9]+$' then
    -- No recuperamos el KA viejo: la renumeración de Rebollar ya pudo reutilizarlo.
    loop
      v_numero := nextval('public.consumibles_codigo_seq');
      v_codigo := 'KA' || lpad(v_numero::text, greatest(4, length(v_numero::text)), '0');
      exit when not exists (select 1 from public.consumibles_config where codigo_etiqueta = v_codigo);
    end loop;
  end if;

  update public.panol_materiales set activo = true where id = p_material_id;
  update public.consumibles_config
     set activo_mostrador = true, notas = v_notas, codigo_etiqueta = v_codigo
   where material_id = p_material_id
   returning * into v_config;

  return jsonb_build_object('material_id', p_material_id, 'config', to_jsonb(v_config), 'ya_reactivado', false);
end;
$$;

revoke all on function public.consumibles_reactivar_fuera_rebollar(uuid) from public, anon, authenticated;
grant execute on function public.consumibles_reactivar_fuera_rebollar(uuid) to authenticated;

commit;
