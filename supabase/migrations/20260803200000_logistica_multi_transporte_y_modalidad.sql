-- Solicitudes logisticas v2: un trabajo puede hacerse en un unico lugar y
-- puede requerir varios recursos (ej. dos gruas y un camion en un desmolde).

alter table public.calendario_eventos
  add column if not exists modalidad text not null default 'traslado',
  add column if not exists plantilla_codigo text,
  add column if not exists transportes jsonb not null default '[]'::jsonb;

update public.calendario_eventos
set transportes = jsonb_build_array(jsonb_build_object(
  'tipo', coalesce(tipo_transporte, 'otro'),
  'cantidad', 1,
  'proveedor', proveedor_logistico
))
where clase = 'solicitud_logistica'
  and (transportes is null or transportes = '[]'::jsonb);

do $$ begin
  alter table public.calendario_eventos
    add constraint calendario_eventos_modalidad_check
    check (modalidad in ('traslado', 'trabajo_en_sitio'));
exception when duplicate_object then null; end $$;

comment on column public.calendario_eventos.modalidad is
  'traslado requiere origen/destino; trabajo_en_sitio requiere solo el lugar de trabajo.';

comment on column public.calendario_eventos.transportes is
  'Recursos solicitados: [{tipo,cantidad,proveedor}]. Permite combinar gruas, camiones, hidrogruas y fletes.';

