-- Purchase Request Items: cerrar RLS abierta
-- Las policies originales (20260530000000) usaban `using (true)` para todo authenticated,
-- lo que permitía que cualquier usuario logueado leyera/editara/borrara ítems de cualquier
-- pedido (incluyendo clientes externos). Re-emite las policies usando la función
-- can_access_purchase_request() que ya gobierna purchase_requests / followers / comments.

drop policy if exists "Authenticated can read items"   on public.purchase_request_items;
drop policy if exists "Authenticated can insert items" on public.purchase_request_items;
drop policy if exists "Authenticated can update items" on public.purchase_request_items;
drop policy if exists "Authenticated can delete items" on public.purchase_request_items;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'purchase_request_items'
      and policyname = 'items visible to request participants'
  ) then
    create policy "items visible to request participants"
      on public.purchase_request_items for select
      using (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'purchase_request_items'
      and policyname = 'participants can insert items'
  ) then
    create policy "participants can insert items"
      on public.purchase_request_items for insert
      with check (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'purchase_request_items'
      and policyname = 'participants can update items'
  ) then
    create policy "participants can update items"
      on public.purchase_request_items for update
      using (public.can_access_purchase_request(request_id, auth.uid()))
      with check (public.can_access_purchase_request(request_id, auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'purchase_request_items'
      and policyname = 'participants can delete items'
  ) then
    create policy "participants can delete items"
      on public.purchase_request_items for delete
      using (public.can_access_purchase_request(request_id, auth.uid()));
  end if;
end $$;

-- Trigger de updated_at en items, igual al patrón del resto del módulo
drop trigger if exists trg_purchase_request_items_updated_at on public.purchase_request_items;
create trigger trg_purchase_request_items_updated_at
  before update on public.purchase_request_items
  for each row execute function public.touch_updated_at();
