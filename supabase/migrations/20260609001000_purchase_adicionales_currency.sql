-- Track whether each additional amount is in pesos or dollars.

alter table public.purchase_additional_items
  add column if not exists currency text default 'ARS';

update public.purchase_additional_items
set currency = 'ARS'
where currency is null or currency not in ('ARS', 'USD');

alter table public.purchase_additional_items
  alter column currency set default 'ARS',
  alter column currency set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_additional_items_currency_check'
      and conrelid = 'public.purchase_additional_items'::regclass
  ) then
    alter table public.purchase_additional_items
      add constraint purchase_additional_items_currency_check
      check (currency in ('ARS', 'USD'));
  end if;
end $$;
