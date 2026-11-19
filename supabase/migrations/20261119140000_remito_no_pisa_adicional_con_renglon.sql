-- Un remito que entra para un adicional "nuevo" (los que desde el 19/10 tienen
-- su propio renglón, panol_obra_addons.obra_snapshot_id) ya no se convierte en
-- otro adicional. Antes el trigger lo pasaba a source 'addon' y la lista de la
-- obra mostraba el ítem dos veces: el adicional con el pedido y el remito como
-- un segundo adicional "en pañol" (55-2, cuenta cadena, 13/11/2026).
--
-- Esos adicionales ya se concilian en la pantalla: el remito queda como
-- recepción del renglón del adicional. La conciliación sigue igual para los
-- adicionales viejos sin renglón propio.

create or replace function public.panol_reconciliar_remito_con_adicional()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$

declare
  v_desc_key text;
  v_unidad_key text;
  v_candidatos integer := 0;
  v_addon_id uuid;
  v_addon public.panol_obra_addons%rowtype;
  v_material_id uuid;
  v_material public.panol_materiales%rowtype;
  v_codigo_remito text;
begin
  if new.obra_id is null or lower(coalesce(new.source, '')) <> 'remito' then
    return new;
  end if;

  v_desc_key := lower(regexp_replace(coalesce(new.descripcion, ''), '[^[:alnum:]]+', '', 'g'));
  v_unidad_key := lower(coalesce(nullif(btrim(new.unidad), ''), 'unidad'));
  if new.material_id is null and length(v_desc_key) < 8 then
    return new;
  end if;

  -- Only reconcile a single, unambiguous additional. This intentionally leaves
  -- duplicate candidates alone so no real material requirement is hidden.
  select count(*), (array_agg(a.id))[1]
    into v_candidatos, v_addon_id
    from public.panol_obra_addons a
   where a.obra_id = new.obra_id
     and a.obra_snapshot_id is null
     and (
       (new.material_id is not null and a.material_id = new.material_id)
       or (
         length(v_desc_key) >= 8
         and lower(regexp_replace(coalesce(a.descripcion, ''), '[^[:alnum:]]+', '', 'g')) = v_desc_key
         and lower(coalesce(nullif(btrim(a.unidad), ''), 'unidad')) = v_unidad_key
       )
     );

  if v_candidatos <> 1 then
    return new;
  end if;

  select * into v_addon
    from public.panol_obra_addons
   where id = v_addon_id;

  v_codigo_remito := nullif(btrim(new.codigo), '');
  if v_addon.material_id is null and new.material_id is not null then
    update public.panol_obra_addons
       set material_id = new.material_id
     where id = v_addon.id;
  end if;

  v_material_id := coalesce(v_addon.material_id, new.material_id);
  if v_material_id is not null then
    select * into v_material
      from public.panol_materiales
     where id = v_material_id;
  end if;

  -- Keep the planned quantity and the canonical identity in the additional.
  -- The actually received quantity remains in recepcion_cantidad_recibida.
  -- Use the same description/code precedence as addonRowToView in the UI so
  -- the normalized snapshot and the additional share one merge identity.
  new.material_id := v_material_id;
  new.descripcion := coalesce(nullif(btrim(v_material.descripcion), ''), nullif(btrim(v_addon.descripcion), ''), new.descripcion);
  new.codigo := coalesce(nullif(btrim(v_material.codigo), ''), nullif(btrim(v_addon.codigo), ''));
  new.unidad := coalesce(nullif(btrim(v_addon.unidad), ''), nullif(btrim(v_material.unidad_medida), ''), new.unidad, 'unidad');
  new.cantidad := coalesce(v_addon.cantidad, new.cantidad);
  new.proveedor := coalesce(nullif(btrim(v_addon.proveedor), ''), new.proveedor);
  new.tipo := 'addon';
  new.tipo_label := case when v_addon.tipo = 'opcional' then 'Opcional' else 'Adicional' end;
  new.source := 'addon';
  new.es_adicional := true;
  new.notas := concat_ws(E'\n',
    nullif(new.notas, ''),
    case
      when v_codigo_remito is not null and v_codigo_remito is distinct from new.codigo
        then 'Codigo informado en remito: ' || v_codigo_remito
      else null
    end,
    'Remito conciliado automaticamente con el adicional de la obra.'
  );

  return new;
end;
$fn$;

-- El único remito convertido así (55-2) vuelve a ser remito.
update public.panol_obra_materiales_snapshot
   set source='remito', tipo='remito', tipo_label='Remito', es_adicional=false,
       notas=nullif(btrim(replace(coalesce(notas,''),'Remito conciliado automaticamente con el adicional de la obra.','')),'')
 where id='f84d8a58-259a-46f6-bb95-9d3e463e2794' and source='addon';
