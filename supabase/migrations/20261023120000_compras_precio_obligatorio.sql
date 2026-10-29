-- Una compra nueva no puede confirmarse sin costo real. El trigger evita
-- saltear la validación desde otro cliente y no exige corregir el historial
-- para cambiar un comentario, recibir mercadería o cerrar un pedido antiguo.
begin;

create or replace function public.purchase_requests_validar_precio_compra()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_validar boolean := false;
begin
  if tg_op = 'INSERT' then
    v_validar := new.status = 'comprado';
  else
    -- La sincronización de los ítems vuelve de Recibido a Comprado cuando
    -- Pañol deja una entrega parcial. No es una compra nueva y no debe
    -- bloquear movimientos históricos sin precio. Un cambio directo de
    -- Compras sigue validándose, igual que cualquier modificación del monto.
    if pg_trigger_depth() > 1 and old.status = 'recibido'
      and new.status = 'comprado'
      and new.actual_amount is not distinct from old.actual_amount then
      return new;
    end if;

    v_validar := (
      new.status = 'comprado'
      and (new.status is distinct from old.status
        or new.actual_amount is distinct from old.actual_amount)
    ) or (
      new.status = 'recibido'
      and new.actual_amount is distinct from old.actual_amount
    );
  end if;

  if v_validar and (new.actual_amount is null
    or not (new.actual_amount > 0 and new.actual_amount < 'Infinity'::numeric)) then
    raise exception using
      errcode = '23514',
      message = 'Cargá un importe real mayor a cero para marcar la compra como Comprado.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_purchase_requests_validar_precio_compra on public.purchase_requests;
create trigger trg_purchase_requests_validar_precio_compra
before insert or update of status, actual_amount on public.purchase_requests
for each row execute function public.purchase_requests_validar_precio_compra();

commit;
