-- Corregir la referencia de un aviso sin modificar la recepción ni sus ítems.
create or replace function public.panol_actualizar_titulo_envio(p_envio uuid, p_titulo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_envio public.panol_envios%rowtype;
  v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  if v_uid is null then
    raise exception 'Sesión requerida';
  end if;

  select * into v_envio from public.panol_envios where id = p_envio for update;
  if not found then
    raise exception 'Aviso inexistente';
  end if;
  if not coalesce(public.can_receive_envio(v_envio.sede, v_uid), false) then
    raise exception 'Sin permiso para editar el título de este aviso';
  end if;
  if v_titulo = '' then
    raise exception 'Completá el título del aviso';
  end if;
  if v_titulo = v_envio.titulo then
    return v_titulo;
  end if;

  update public.panol_envios set titulo = v_titulo, updated_at = now() where id = p_envio;
  insert into public.panol_envio_eventos(envio_id, tipo, nota, actor_id)
  values (p_envio, 'titulo', format('Título anterior: %s%sTítulo nuevo: %s', v_envio.titulo, E'\n', v_titulo), v_uid);
  return v_titulo;
end;
$$;

revoke all on function public.panol_actualizar_titulo_envio(uuid,text) from public, anon;
grant execute on function public.panol_actualizar_titulo_envio(uuid,text) to authenticated;
