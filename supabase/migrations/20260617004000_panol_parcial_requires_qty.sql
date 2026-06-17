-- Recepcion parcial: exigir cantidad recibida.
-- Evita estados "parcial" sin dato operativo.

create or replace function public.panol_marcar_items(
  p_item_ids uuid[],
  p_estado text,
  p_nota text default null,
  p_cant_recibida text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_envio uuid;
begin
  if p_estado not in ('pendiente','recibido','parcial','sin_info','falta_stock','rechazado') then
    raise exception 'Estado de item invalido: %', p_estado;
  end if;

  if array_length(p_item_ids, 1) is null then
    return;
  end if;

  if p_estado = 'parcial'
     and nullif(btrim(coalesce(p_cant_recibida, '')), '') is null
     and exists (
       select 1
       from public.panol_envio_items it
       where it.id = any(p_item_ids)
         and nullif(btrim(coalesce(it.cantidad_recibida, '')), '') is null
     ) then
    raise exception 'Para marcar parcial carga la cantidad recibida';
  end if;

  if exists (
    select 1
    from public.panol_envio_items it
    join public.panol_envios e on e.id = it.envio_id
    where it.id = any(p_item_ids)
      and not public.can_receive_envio(e.sede, v_uid)
  ) then
    raise exception 'Sin permiso para recepcionar uno o mas items';
  end if;

  update public.panol_envio_items it
     set estado = p_estado,
         nota = coalesce(p_nota, it.nota),
         cantidad_recibida = case
                               when p_estado in ('recibido','parcial') then coalesce(nullif(btrim(coalesce(p_cant_recibida, '')), ''), it.cantidad_recibida)
                               else it.cantidad_recibida
                             end,
         marcado_por = v_uid,
         marcado_at = now(),
         updated_at = now()
   where it.id = any(p_item_ids);

  for v_envio in select distinct envio_id from public.panol_envio_items where id = any(p_item_ids) loop
    perform public.panol_recalc_estado(v_envio);
  end loop;
end;
$$;

grant execute on function public.panol_marcar_items(uuid[],text,text,text) to authenticated;
