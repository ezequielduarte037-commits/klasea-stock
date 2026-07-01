-- Reset inicial del libro de stock/egresos de panol.
-- Mantiene Recepcion intacta: NO borra panol_envios ni panol_envio_items.
-- Limpia unicamente lo que alimenta Stock/Egresos: panol_obra_materiales_snapshot.
--
-- Preview manual recomendado antes de aplicar:
-- select estado, source, count(*)
--   from public.panol_obra_materiales_snapshot
--  group by estado, source
--  order by estado, source;
--
-- select count(*) as items_recepcion_con_snapshot
--   from public.panol_envio_items
--  where obra_snapshot_item_id is not null;

do $$
declare
  v_snapshot_rows integer := 0;
  v_linked_recepcion_items integer := 0;
  v_trigger_disabled boolean := false;
begin
  select count(*)
    into v_snapshot_rows
    from public.panol_obra_materiales_snapshot;

  select count(*)
    into v_linked_recepcion_items
    from public.panol_envio_items
   where obra_snapshot_item_id is not null;

  raise notice 'Reset panol stock: se borraran % movimientos/saldos del snapshot. Se preservan envios e items de recepcion. Items de recepcion vinculados al snapshot: %.',
    v_snapshot_rows,
    v_linked_recepcion_items;

  if exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.panol_envio_items'::regclass
       and tgname = 'trg_sync_obra_snapshot_from_panol_item'
       and not tgisinternal
  ) then
    execute 'alter table public.panol_envio_items disable trigger trg_sync_obra_snapshot_from_panol_item';
    v_trigger_disabled := true;
  end if;

  update public.panol_envio_items
     set obra_snapshot_item_id = null
   where obra_snapshot_item_id is not null;

  delete from public.panol_obra_materiales_snapshot;

  if v_trigger_disabled then
    execute 'alter table public.panol_envio_items enable trigger trg_sync_obra_snapshot_from_panol_item';
  end if;

  raise notice 'Reset panol stock completo: snapshot limpio. Recepcion conservada.';
end;
$$;
