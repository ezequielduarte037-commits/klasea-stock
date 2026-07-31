-- A manual remito for an existing additional used to create a second material
-- row. The remito remains in panol_envios / panol_envio_items for traceability;
-- its snapshot is normalized to the existing additional of the same obra.

create or replace function public.panol_reconciliar_remito_con_adicional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists trg_panol_aa_reconciliar_remito_adicional on public.panol_obra_materiales_snapshot;
create trigger trg_panol_aa_reconciliar_remito_adicional
before insert or update on public.panol_obra_materiales_snapshot
for each row execute function public.panol_reconciliar_remito_con_adicional();

-- panol_crear_envio updates the inserted snapshot after its insert. Preserve
-- the additional flag and classify partial receptions using received quantity.
create or replace function public.panol_corregir_recepcion_parcial_adicional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recibido numeric;
begin
  if lower(coalesce(new.source, '')) = 'addon' then
    new.es_adicional := true;
  end if;

  if lower(coalesce(new.source, '')) <> 'addon'
     or lower(coalesce(new.recepcion_estado, '')) <> 'recibido'
     or coalesce(new.cantidad, 0) <= 0 then
    return new;
  end if;

  if nullif(replace(coalesce(new.recepcion_cantidad_recibida, ''), ',', '.'), '') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_recibido := replace(new.recepcion_cantidad_recibida, ',', '.')::numeric;
  else
    return new;
  end if;

  if v_recibido > 0 and v_recibido < new.cantidad then
    new.recepcion_estado := 'parcial';
    if new.estado in ('en_panol', 'recibido') then
      new.estado := 'parcial';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_panol_ab_recepcion_parcial_adicional on public.panol_obra_materiales_snapshot;
create trigger trg_panol_ab_recepcion_parcial_adicional
before insert or update on public.panol_obra_materiales_snapshot
for each row execute function public.panol_corregir_recepcion_parcial_adicional();

-- Repair historical remito snapshots as well. The trigger only changes rows
-- with exactly one equivalent additional in the same obra.
update public.panol_obra_materiales_snapshot
   set updated_at = updated_at
 where obra_id is not null
   and lower(coalesce(source, '')) = 'remito';
