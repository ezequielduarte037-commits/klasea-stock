-- Los remitos escaneados se archivan en la PC del pañol dentro de la carpeta de
-- su obra (Remitos\K55\55-1). Para poder buscarlos igual desde el sistema, y no
-- solo parado adelante de esa PC, hace falta guardar de que obra es cada uno.
--
-- Es opcional a proposito: un remito de stock general no va a ninguna obra, y
-- frenar un ingreso por un campo sin completar seria peor que tener un
-- comprobante sin clasificar.

alter table public.panol_comprobantes
  add column if not exists obra_id uuid references public.produccion_obras(id) on delete set null;

-- La pantalla de Remitos filtra por obra y ordena por fecha de carga.
create index if not exists panol_comprobantes_obra_idx
  on public.panol_comprobantes (obra_id, created_at desc);

-- Y la carpeta donde quedo en la PC, tal cual, para que el pañolero sepa donde
-- buscar el papel original sin tener que deducirla.
alter table public.panol_comprobantes
  add column if not exists carpeta_local text;

comment on column public.panol_comprobantes.obra_id is
  'Obra a la que se imputo el remito al escanearlo. Null = stock general.';
comment on column public.panol_comprobantes.carpeta_local is
  'Carpeta de la PC del panol donde quedo el archivo, ej "K55/55-1".';
