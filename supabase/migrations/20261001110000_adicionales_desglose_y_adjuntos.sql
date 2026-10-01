-- Adicionales: desglose de comprobantes y PDF adjunto por renglón.
--
-- Un renglón de adicionales puede juntar varios comprobantes (el de Rebollar
-- de 85-2 son 10 presupuestos/entregas de CMR Insumos Industriales por
-- $ 2.016.389,63). El detalle que se le entrega al cliente muestra el renglón
-- con su total y, en un anexo dentro del mismo PDF, el desglose y las copias.
--
--   desglose        { "emisor": text, "comprobantes": [{ numero, fecha, importe, pagina }] }
--                   `pagina` es la hoja del PDF adjunto donde está la copia.
--   adjunto_path    ruta en el depósito privado `compras-adicionales`
--   adjunto_nombre  nombre original del archivo
--   adjunto_paginas cantidad de hojas del adjunto
--
-- El depósito es PRIVADO a propósito: `documentos`, `obra-archivos` y
-- `ticket-attachments` son públicos (cualquiera con el link abre el archivo),
-- y estos son comprobantes de proveedores con importes. Sólo los usuarios de
-- Compras pueden leerlos y la app los baja con la sesión al armar el PDF.

begin;

alter table public.purchase_additional_items
  add column if not exists desglose jsonb,
  add column if not exists adjunto_path text,
  add column if not exists adjunto_nombre text,
  add column if not exists adjunto_paginas integer;

comment on column public.purchase_additional_items.desglose is
  'Comprobantes que componen el renglón: { emisor, comprobantes: [{ numero, fecha, importe, pagina }] }. Va como anexo en el detalle para el cliente.';
comment on column public.purchase_additional_items.adjunto_path is
  'PDF con las copias de los comprobantes, en el depósito privado compras-adicionales.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras-adicionales', 'compras-adicionales', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "compras adicionales: leer" on storage.objects;
create policy "compras adicionales: leer"
  on storage.objects for select to authenticated
  using (bucket_id = 'compras-adicionales' and public.is_purchase_user(auth.uid()));

drop policy if exists "compras adicionales: subir" on storage.objects;
create policy "compras adicionales: subir"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'compras-adicionales' and public.is_purchase_user(auth.uid()));

drop policy if exists "compras adicionales: reemplazar" on storage.objects;
create policy "compras adicionales: reemplazar"
  on storage.objects for update to authenticated
  using (bucket_id = 'compras-adicionales' and public.is_purchase_user(auth.uid()))
  with check (bucket_id = 'compras-adicionales' and public.is_purchase_user(auth.uid()));

drop policy if exists "compras adicionales: borrar" on storage.objects;
create policy "compras adicionales: borrar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'compras-adicionales' and public.is_purchase_user(auth.uid()));

-- Rebollar (85-2): desglose leído del original "COPIAS KL 85-2.pdf", una hoja
-- por comprobante. Los diez suman exactamente el importe del renglón. El PDF
-- ya está subido al depósito en la ruta de abajo.
update public.purchase_additional_items
   set desglose = '{
         "emisor": "CMR Insumos Industriales",
         "comprobantes": [
           { "numero": "0002-00020637", "fecha": "2026-03-06", "importe": 356798.40, "pagina": 1 },
           { "numero": "0002-00021300", "fecha": "2026-04-22", "importe": 46526.58,  "pagina": 2 },
           { "numero": "0002-00021301", "fecha": "2026-04-22", "importe": 50111.16,  "pagina": 3 },
           { "numero": "0002-00021472", "fecha": "2026-05-06", "importe": 448318.77, "pagina": 4 },
           { "numero": "0002-00021931", "fecha": "2026-06-01", "importe": 11670.00,  "pagina": 5 },
           { "numero": "0002-00022033", "fecha": "2026-06-18", "importe": 43103.00,  "pagina": 6 },
           { "numero": "0002-00022264", "fecha": "2026-07-03", "importe": 66231.44,  "pagina": 7 },
           { "numero": "0002-00022721", "fecha": "2026-08-06", "importe": 38183.91,  "pagina": 8 },
           { "numero": "0002-00022722", "fecha": "2026-08-07", "importe": 935644.77, "pagina": 9 },
           { "numero": "0002-00022643", "fecha": "2026-08-10", "importe": 19801.60,  "pagina": 10 }
         ]
       }'::jsonb,
       adjunto_path = 'becc5c2a-0bc3-4db6-b2ca-81337b34b095/087a5e48-a7e9-4055-820e-280b51968caf/COPIAS-KL-85-2.pdf',
       adjunto_nombre = 'COPIAS KL 85-2.pdf',
       adjunto_paginas = 10
 where id = '087a5e48-a7e9-4055-820e-280b51968caf'
   and amount = 2016389.63
   and adjunto_path is null;

commit;
