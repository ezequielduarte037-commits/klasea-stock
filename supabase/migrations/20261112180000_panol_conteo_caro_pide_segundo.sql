-- Conteo diario: lo caro y lo que hay de a pocos no se corrige solo.
--
-- Hasta acá una diferencia de hasta 2 unidades (o 5 %) se ajustaba sola, sin
-- mirar qué era: el 06/11 se descontó un bowthruster Sleipner igual que un
-- tornillo. Ezequiel pidió (12/11/2026) que lo caro pida siempre un segundo
-- conteo de otra persona.
--
-- "Caro": la ficha dice USD 100 o más por unidad, o $150.000 si está en pesos.
-- Como sólo 757 de 2771 fichas tienen precio (ninguno de los ajustes de esa
-- semana lo tenía), también cuenta lo que hay de a pocos: si el sistema dice
-- 10 o menos, es casi siempre equipo de barco (bombas, ventanas, thrusters),
-- no ferretería. En esos casos:
--   · la primera diferencia, por chica que sea, pasa a segundo conteo;
--   · se ajusta sólo si el segundo conteo da exactamente lo mismo que el
--     primero (para el resto sigue alcanzando con que estén cerca).
-- `recuento_motivo` guarda por qué se pidió el segundo conteo, para que la
-- pantalla lo explique: caro, pocas, reservado (falta algo separado para
-- obras) o grande (diferencia grande).
begin;
set local lock_timeout = '5s';

alter table public.panol_conteo_items add column if not exists recuento_motivo text;

-- 'caro', 'pocas' o null (se puede corregir solo).
create or replace function public.panol_conteo_delicado(p_material_id uuid, p_teorico numeric)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.panol_materiales m
      where m.id = p_material_id
        and coalesce(m.precio_unitario, 0) > 0
        and (
          (upper(coalesce(m.moneda, '')) = 'USD' and m.precio_unitario >= 100)
          or (upper(coalesce(m.moneda, '')) <> 'USD' and m.precio_unitario >= 150000)
        )
    ) then 'caro'
    when coalesce(p_teorico, 0) <= 10 then 'pocas'
    else null
  end;
$$;
revoke all on function public.panol_conteo_delicado(uuid, numeric) from public, anon;
grant execute on function public.panol_conteo_delicado(uuid, numeric) to authenticated;

create or replace function public.panol_conteo_registrar(p_item_id uuid, p_contado numeric, p_teorico numeric, p_libre numeric, p_nota text default null)
returns public.panol_conteo_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.panol_conteo_items;
  v_sede text;
  v_tol numeric;
  v_dif numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_snap uuid;
  v_delicado text;
  v_cubre boolean;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if not public.can_registrar_conteo_fisico(v_uid) then raise exception 'Sin permiso para contar stock'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'Carga cuantos hay (0 si no hay ninguno)'; end if;
  if p_teorico is null then raise exception 'Falta el stock del sistema'; end if;

  select * into v_item from public.panol_conteo_items where id = p_item_id for update;
  if v_item.id is null then raise exception 'Renglon de conteo inexistente'; end if;
  select sede into v_sede from public.panol_conteo_lotes where id = v_item.lote_id;
  v_tol := public.panol_conteo_tolerancia(p_teorico);
  v_delicado := public.panol_conteo_delicado(v_item.material_id, p_teorico);

  if v_item.estado = 'pendiente' then
    v_dif := p_contado - p_teorico;
    -- Un faltante que el stock libre no cubre (el resto está reservado para
    -- obras) nunca se ajusta solo.
    v_cubre := v_dif > 0 or coalesce(p_libre, 0) + v_dif >= -0.0001;
    update public.panol_conteo_items set
      contado = p_contado, contado_por = v_uid, contado_at = now(), teorico = p_teorico,
      nota = coalesce(v_nota, nota), updated_at = now()
    where id = v_item.id returning * into v_item;

    if abs(v_dif) < 0.0001 then
      update public.panol_conteo_items set estado = 'ok' where id = v_item.id returning * into v_item;
    elsif v_delicado is null and abs(v_dif) <= v_tol and v_cubre then
      v_snap := public.panol_conteo_escribir_ajuste(v_item, v_sede, v_dif, 'Conteo diario ' || to_char(now(), 'DD/MM'));
      update public.panol_conteo_items set estado = 'ajustado', ajuste = v_dif, ajuste_snapshot_id = v_snap
      where id = v_item.id returning * into v_item;
    else
      update public.panol_conteo_items set
        estado = 'recontar',
        recuento_motivo = case
          when abs(v_dif) > v_tol then 'grande'
          when v_delicado is not null then v_delicado
          else 'reservado'
        end
      where id = v_item.id returning * into v_item;
    end if;
    return v_item;
  end if;

  if v_item.estado = 'recontar' then
    if v_item.contado_por = v_uid then raise exception 'El segundo conteo lo tiene que hacer otra persona'; end if;
    update public.panol_conteo_items set
      recontado = p_contado, recontado_por = v_uid, recontado_at = now(), teorico = p_teorico,
      nota = coalesce(v_nota, nota), updated_at = now()
    where id = v_item.id returning * into v_item;
    v_dif := p_contado - p_teorico;

    if abs(v_dif) < 0.0001 then
      update public.panol_conteo_items set estado = 'ok' where id = v_item.id returning * into v_item;
    elsif (
        case when v_delicado is null
          then abs(p_contado - v_item.contado) <= public.panol_conteo_tolerancia(p_contado)
          else abs(p_contado - v_item.contado) < 0.0001
        end
      )
      and (v_dif > 0 or coalesce(p_libre, 0) + v_dif >= -0.0001) then
      v_snap := public.panol_conteo_escribir_ajuste(v_item, v_sede, v_dif, 'Conteo diario confirmado por segundo conteo ' || to_char(now(), 'DD/MM'));
      update public.panol_conteo_items set estado = 'ajustado', ajuste = v_dif, ajuste_snapshot_id = v_snap
      where id = v_item.id returning * into v_item;
    else
      update public.panol_conteo_items set estado = 'revisar' where id = v_item.id returning * into v_item;
    end if;
    return v_item;
  end if;

  raise exception 'Este renglon ya se conto';
end;
$$;
revoke all on function public.panol_conteo_registrar(uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.panol_conteo_registrar(uuid, numeric, numeric, numeric, text) to authenticated;

commit;
