-- Recepcion parcial de pedidos legacy de maderas.
-- nota_recepcion sigue significando "item cerrado"; cantidad_recibida acumula
-- ingresos parciales sin disparar el cierre hacia compras hasta completar.

alter table public.pedido_items
  add column if not exists cantidad_recibida numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedido_items_cantidad_recibida_nonnegative'
      and conrelid = 'public.pedido_items'::regclass
  ) then
    alter table public.pedido_items
      add constraint pedido_items_cantidad_recibida_nonnegative
      check (cantidad_recibida >= 0);
  end if;
end $$;

comment on column public.pedido_items.cantidad_recibida is
  'Cantidad acumulada recibida para ingresos parciales. nota_recepcion no-null cierra el item.';
