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

-- Un titulo escrito por la persona. "Remito Iriarte 0001-78" se puede deducir
-- del proveedor y el numero, pero "Grifería del baño de proa" no, y es lo que
-- alguien va a recordar dentro de seis meses cuando busque ese papel.
alter table public.panol_comprobantes
  add column if not exists titulo text;

-- Escanear para archivar y escanear para ingresar al stock son dos cosas
-- distintas. Sin esta marca, todo remito escaneado queda esperando un ingreso
-- que a veces no va a existir nunca, y la bandeja de pendientes se llena de
-- cosas que en realidad ya estan resueltas.
alter table public.panol_comprobantes
  add column if not exists solo_archivo boolean not null default false;

comment on column public.panol_comprobantes.obra_id is
  'Obra a la que se imputo el remito al escanearlo. Null = stock general.';
comment on column public.panol_comprobantes.carpeta_local is
  'Carpeta de la PC del panol donde quedo el archivo, ej "K55/55-1".';
comment on column public.panol_comprobantes.titulo is
  'Referencia escrita a mano al escanear, para encontrarlo despues.';
comment on column public.panol_comprobantes.solo_archivo is
  'true = se guarda como documento y no espera ingreso de stock.';
