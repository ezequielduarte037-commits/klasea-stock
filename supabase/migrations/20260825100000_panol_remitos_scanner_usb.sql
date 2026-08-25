-- Digitalizacion de remitos desde el scanner USB del panol.
--
-- Reutiliza panol_comprobantes/panol_comprobante_items: el mismo PDF puede
-- alimentar la recepcion fisica y, para Compras, el historial de precios.
-- Ninguna fila de stock se crea aca. El impacto sigue ocurriendo unicamente al
-- confirmar el formulario de ingreso existente (panol_crear_envio).

alter table public.panol_comprobantes
  add column if not exists origen_carga text not null default 'manual',
  add column if not exists archivo_hash text,
  add column if not exists archivo_nombre text,
  add column if not exists archivo_mime text,
  add column if not exists sede text,
  add column if not exists recepcion_estado text not null default 'pendiente',
  add column if not exists panol_envio_id uuid references public.panol_envios(id) on delete set null,
  add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  add column if not exists procesado_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.panol_comprobante_items
  add column if not exists scanner_confianza numeric,
  add column if not exists scanner_material_sugerido_id uuid references public.panol_materiales(id) on delete set null,
  add column if not exists scanner_revision text,
  add column if not exists scanner_unidad text,
  add column if not exists scanner_ingreso_envio_id uuid references public.panol_envios(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'panol_comprobantes_origen_carga_check'
      and conrelid = 'public.panol_comprobantes'::regclass
  ) then
    alter table public.panol_comprobantes
      add constraint panol_comprobantes_origen_carga_check
      check (origen_carga in ('manual', 'precios', 'scanner_panol'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'panol_comprobantes_recepcion_estado_check'
      and conrelid = 'public.panol_comprobantes'::regclass
  ) then
    alter table public.panol_comprobantes
      add constraint panol_comprobantes_recepcion_estado_check
      check (recepcion_estado in (
        'pendiente', 'requiere_revision', 'listo_ingreso', 'parcial',
        'ingresado', 'error', 'archivado'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'panol_comprobante_items_scanner_revision_check'
      and conrelid = 'public.panol_comprobante_items'::regclass
  ) then
    alter table public.panol_comprobante_items
      add constraint panol_comprobante_items_scanner_revision_check
      check (
        scanner_revision is null
        or scanner_revision in ('vinculado', 'revisar', 'sin_coincidencia')
      );
  end if;
end $$;

create unique index if not exists panol_comprobantes_scanner_hash_uidx
  on public.panol_comprobantes (archivo_hash)
  where origen_carga = 'scanner_panol' and archivo_hash is not null;

create index if not exists panol_comprobantes_scanner_bandeja_idx
  on public.panol_comprobantes (sede, recepcion_estado, created_at desc)
  where origen_carga = 'scanner_panol';

create or replace function public.puede_operar_scanner_panol(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.role::text, '')) in (
          'admin', 'panol', 'tecnica', 'compras', 'administracion'
        )
      )
  );
$$;

revoke all on function public.puede_operar_scanner_panol(uuid) from public;
grant execute on function public.puede_operar_scanner_panol(uuid) to authenticated;

alter table public.panol_comprobantes enable row level security;
alter table public.panol_comprobante_items enable row level security;

drop policy if exists "scanner panol comprobantes lectura" on public.panol_comprobantes;
create policy "scanner panol comprobantes lectura"
on public.panol_comprobantes for select to authenticated
using (
  origen_carga = 'scanner_panol'
  and public.puede_operar_scanner_panol(auth.uid())
);

drop policy if exists "scanner panol comprobantes alta" on public.panol_comprobantes;
create policy "scanner panol comprobantes alta"
on public.panol_comprobantes for insert to authenticated
with check (
  origen_carga = 'scanner_panol'
  and public.puede_operar_scanner_panol(auth.uid())
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "scanner panol comprobantes edicion" on public.panol_comprobantes;
create policy "scanner panol comprobantes edicion"
on public.panol_comprobantes for update to authenticated
using (
  origen_carga = 'scanner_panol'
  and public.puede_operar_scanner_panol(auth.uid())
)
with check (
  origen_carga = 'scanner_panol'
  and public.puede_operar_scanner_panol(auth.uid())
);

drop policy if exists "scanner panol items lectura" on public.panol_comprobante_items;
create policy "scanner panol items lectura"
on public.panol_comprobante_items for select to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1 from public.panol_comprobantes c
    where c.id = comprobante_id and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol items alta" on public.panol_comprobante_items;
create policy "scanner panol items alta"
on public.panol_comprobante_items for insert to authenticated
with check (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1 from public.panol_comprobantes c
    where c.id = comprobante_id and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol items edicion" on public.panol_comprobante_items;
create policy "scanner panol items edicion"
on public.panol_comprobante_items for update to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1 from public.panol_comprobantes c
    where c.id = comprobante_id and c.origen_carga = 'scanner_panol'
  )
)
with check (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1 from public.panol_comprobantes c
    where c.id = comprobante_id and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol items baja" on public.panol_comprobante_items;
create policy "scanner panol items baja"
on public.panol_comprobante_items for delete to authenticated
using (
  public.puede_operar_scanner_panol(auth.uid())
  and exists (
    select 1 from public.panol_comprobantes c
    where c.id = comprobante_id and c.origen_carga = 'scanner_panol'
  )
);

drop policy if exists "scanner panol comprobantes baja" on public.panol_comprobantes;
create policy "scanner panol comprobantes baja"
on public.panol_comprobantes for delete to authenticated
using (
  origen_carga = 'scanner_panol'
  and public.puede_operar_scanner_panol(auth.uid())
  and panol_envio_id is null
);

-- El bucket ya es el que usa la pantalla de Precios. Estas reglas solo abren la
-- carpeta scanner-panol/ para los roles operativos del circuito.
drop policy if exists "scanner panol archivos alta" on storage.objects;
create policy "scanner panol archivos alta"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'panol-comprobantes'
  and (storage.foldername(name))[1] = 'scanner-panol'
  and public.puede_operar_scanner_panol(auth.uid())
);

drop policy if exists "scanner panol archivos lectura" on storage.objects;
create policy "scanner panol archivos lectura"
on storage.objects for select to authenticated
using (
  bucket_id = 'panol-comprobantes'
  and (storage.foldername(name))[1] = 'scanner-panol'
  and public.puede_operar_scanner_panol(auth.uid())
);

drop policy if exists "scanner panol archivos baja" on storage.objects;
create policy "scanner panol archivos baja"
on storage.objects for delete to authenticated
using (
  bucket_id = 'panol-comprobantes'
  and (storage.foldername(name))[1] = 'scanner-panol'
  and public.puede_operar_scanner_panol(auth.uid())
);

comment on column public.panol_comprobantes.archivo_hash is
  'SHA-256 del archivo original. Evita procesar dos veces el mismo escaneo.';
comment on column public.panol_comprobantes.panol_envio_id is
  'Ingreso de panol confirmado a partir de este remito. NULL hasta confirmacion humana.';
comment on column public.panol_comprobantes.recepcion_estado is
  'Estado de la bandeja del scanner; no representa ni modifica stock.';
