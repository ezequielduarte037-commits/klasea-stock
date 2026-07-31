-- Deja trazabilidad cuando una fila historica de materiales de una obra se
-- vincula (o se corrige) contra el catalogo maestro antes de normalizarla.

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
      ('variante'::text, to_jsonb(old.variante), to_jsonb(new.variante)),
      ('material_id'::text, to_jsonb(old.material_id), to_jsonb(new.material_id))
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
        coalesce(
          v_note,
          case
            when v_change.campo = 'material_id' and old.material_id is null then 'Vinculado al catalogo desde la lista de materiales de obra'
            when v_change.campo = 'material_id' and new.material_id is null then 'Desvinculado del catalogo desde la lista de materiales de obra'
            when v_change.campo = 'material_id' then 'Vinculo de catalogo actualizado desde la lista de materiales de obra'
            else null
          end
        ),
        v_actor,
        case when v_change.campo = 'material_id' then 'vinculo_catalogo' else v_origin end,
        v_context || case when v_change.campo = 'material_id' then jsonb_build_object('accion', 'vinculo_catalogo') else '{}'::jsonb end
      );
    end if;
  end loop;

  return new;
end;
$$;
