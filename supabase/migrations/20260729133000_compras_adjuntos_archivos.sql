-- Adjuntos generales para pedidos a Compras.
-- Conserva photo_url/photo_path para compatibilidad con pedidos anteriores,
-- pero los pedidos nuevos pueden guardar varios archivos con nombre, MIME y
-- tamano. El bucket deja de limitarse a imagenes y admite hasta 50 MB por archivo.

alter table public.purchase_requests
  add column if not exists attachments jsonb;

update public.purchase_requests
set attachments = case
  when photo_url is not null and btrim(photo_url) <> '' then
    jsonb_build_array(jsonb_build_object(
      'url', photo_url,
      'path', coalesce(photo_path, ''),
      'name', 'Adjunto del pedido',
      'type', 'application/octet-stream',
      'size', 0
    ))
  else '[]'::jsonb
end
where attachments is null;

alter table public.purchase_requests
  alter column attachments set default '[]'::jsonb,
  alter column attachments set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_requests_attachments_array_chk'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_attachments_array_chk
      check (jsonb_typeof(attachments) = 'array');
  end if;
end $$;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = null
where id = 'purchase-request-photos';
