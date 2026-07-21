-- Imagenes adjuntas en el chat de pedidos a Compras.
-- Reutiliza el bucket publico purchase-request-photos y sus politicas existentes.

alter table public.request_comments
  add column if not exists attachments jsonb;

update public.request_comments
set attachments = '[]'::jsonb
where attachments is null;

alter table public.request_comments
  alter column attachments set default '[]'::jsonb,
  alter column attachments set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'request_comments_attachments_array_chk'
      and conrelid = 'public.request_comments'::regclass
  ) then
    alter table public.request_comments
      add constraint request_comments_attachments_array_chk
      check (jsonb_typeof(attachments) = 'array');
  end if;
end $$;
