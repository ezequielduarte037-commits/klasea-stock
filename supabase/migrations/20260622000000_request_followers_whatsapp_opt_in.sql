-- Opt-in de WhatsApp para usuarios en copia de pedidos a compras.
-- El creador sigue notificado como hasta ahora; los copiados solo si lo piden.

alter table public.request_followers
  add column if not exists notify_whatsapp boolean not null default false,
  add column if not exists notify_whatsapp_at timestamptz;

create index if not exists idx_request_followers_notify_whatsapp
  on public.request_followers(request_id, user_id)
  where notify_whatsapp;

drop policy if exists "followers can update own whatsapp preference"
  on public.request_followers;

create policy "followers can update own whatsapp preference"
  on public.request_followers for update
  using (
    user_id = auth.uid()
    and public.can_access_purchase_request(request_id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    and public.can_access_purchase_request(request_id, auth.uid())
  );
