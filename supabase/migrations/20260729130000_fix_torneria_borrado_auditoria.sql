-- Al borrar un seguimiento completo, el ON DELETE CASCADE elimina primero sus
-- items y operaciones. Los triggers AFTER DELETE de esas tablas intentaban
-- insertar un historial con el proceso_id que acababa de desaparecer, haciendo
-- fallar toda la transaccion por la FK torneria_historial_proceso_id_fkey.
--
-- Las bajas individuales se siguen auditando mientras el proceso padre exista.
-- Durante el cascade del proceso completo se omite ese historial: de todos
-- modos, el propio historial del proceso tambien se elimina por cascade.

create or replace function public.torneria_auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proceso uuid;
  v_entidad_id uuid;
  v_detalle jsonb;
begin
  if tg_op = 'INSERT' then
    v_entidad_id := new.id;
    v_detalle := jsonb_build_object('nuevo', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    v_entidad_id := new.id;
    v_detalle := jsonb_build_object('anterior', to_jsonb(old), 'nuevo', to_jsonb(new));
  else
    v_entidad_id := old.id;
    v_detalle := jsonb_build_object('anterior', to_jsonb(old));
  end if;

  if tg_table_name = 'torneria_procesos' then
    v_proceso := v_entidad_id;
  elsif tg_op = 'DELETE' then
    v_proceso := old.proceso_id;
  else
    v_proceso := new.proceso_id;
  end if;

  -- Si el padre ya no existe, esta baja viene del cascade de un proceso
  -- completo. No hay un proceso valido al cual vincular la auditoria.
  if v_proceso is null
     or not exists (
       select 1
       from public.torneria_procesos
       where id = v_proceso
     ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.torneria_historial(
    proceso_id, entidad, entidad_id, accion, detalle, actor_id
  )
  values (
    v_proceso,
    replace(tg_table_name, 'torneria_', ''),
    v_entidad_id,
    lower(tg_op),
    v_detalle,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
