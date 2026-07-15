-- Variante/marca elegida para un item puntual de una obra.
-- Se guarda en el snapshot para que Compras/Tecnica puedan indicar que variante
-- compro ese barco sin convertirlo en un adicional.

alter table public.panol_obra_materiales_snapshot
  add column if not exists variante text;

create index if not exists idx_panol_obra_snapshot_variante
  on public.panol_obra_materiales_snapshot (obra_id, variante)
  where variante is not null;

create or replace function public.panol_audit_obra_snapshot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_origin text := coalesce(nullif(current_setting('app.audit_origin', true), ''), 'trigger');
  v_note text := nullif(current_setting('app.audit_note', true), '');
  v_context jsonb := jsonb_build_object('txid', txid_current());
  v_change record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  for v_change in
    select *
    from (values
      ('estado'::text, to_jsonb(old.estado), to_jsonb(new.estado)),
      ('recepcion_estado'::text, to_jsonb(old.recepcion_estado), to_jsonb(new.recepcion_estado)),
      ('recepcion_nota'::text, to_jsonb(old.recepcion_nota), to_jsonb(new.recepcion_nota)),
      ('cantidad'::text, to_jsonb(old.cantidad), to_jsonb(new.cantidad)),
      ('egreso_nota'::text, to_jsonb(old.egreso_nota), to_jsonb(new.egreso_nota)),
      ('variante'::text, to_jsonb(old.variante), to_jsonb(new.variante))
    ) as c(campo, valor_anterior, valor_nuevo)
  loop
    if v_change.valor_anterior is distinct from v_change.valor_nuevo then
      insert into public.panol_obra_materiales_snapshot_audit (
        snapshot_id,
        obra_id,
        material_id,
        descripcion,
        campo,
        valor_anterior,
        valor_nuevo,
        nota,
        actor_id,
        origen,
        contexto
      )
      values (
        new.id,
        new.obra_id,
        new.material_id,
        new.descripcion,
        v_change.campo,
        v_change.valor_anterior,
        v_change.valor_nuevo,
        v_note,
        v_actor,
        v_origin,
        v_context
      );
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.panol_asignar_variante_snapshot(
  p_snapshot_id uuid,
  p_variante text default null
)
returns public.panol_obra_materiales_snapshot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.panol_obra_materiales_snapshot%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not (public.is_panol_manager(v_uid) or public.is_panol_viewer(v_uid)) then
    raise exception 'Sin permisos para asignar variante de obra';
  end if;

  perform set_config('app.audit_origin', 'variante_obra', true);
  perform set_config('app.audit_note', 'Asignacion de variante de obra', true);

  update public.panol_obra_materiales_snapshot
     set variante = nullif(btrim(coalesce(p_variante, '')), ''),
         updated_at = now()
   where id = p_snapshot_id
   returning * into v_row;

  if not found then
    raise exception 'Item de obra no encontrado';
  end if;

  return v_row;
end;
$$;

grant execute on function public.panol_asignar_variante_snapshot(uuid, text) to authenticated;
