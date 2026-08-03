-- Compatibilidad para entornos que recibieron Compras por etapa antes de que
-- se agregara la asignacion de materiales a tareas de produccion.

alter table public.linea_compra_etapa_materiales
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

alter table public.obra_compra_etapa_materiales
  add column if not exists linea_proceso_tarea_id uuid
  references public.linea_proceso_tareas(id) on delete set null;

create index if not exists idx_lcem_linea_proceso_tarea
  on public.linea_compra_etapa_materiales(linea_proceso_tarea_id);

create index if not exists idx_ocem_linea_proceso_tarea
  on public.obra_compra_etapa_materiales(linea_proceso_tarea_id);

create or replace function public.compras_material_etapa_desde_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.linea_proceso_tarea_id is not null then
    select tarea.linea_proceso_id
      into new.linea_proceso_id
      from public.linea_proceso_tareas tarea
     where tarea.id = new.linea_proceso_tarea_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lcem_etapa_desde_tarea
  on public.linea_compra_etapa_materiales;
create trigger trg_lcem_etapa_desde_tarea
before insert or update of linea_proceso_tarea_id
on public.linea_compra_etapa_materiales
for each row execute function public.compras_material_etapa_desde_tarea();

drop trigger if exists trg_ocem_etapa_desde_tarea
  on public.obra_compra_etapa_materiales;
create trigger trg_ocem_etapa_desde_tarea
before insert or update of linea_proceso_tarea_id
on public.obra_compra_etapa_materiales
for each row execute function public.compras_material_etapa_desde_tarea();

comment on column public.linea_compra_etapa_materiales.linea_proceso_tarea_id is
  'Tarea de produccion que consume el material de la plantilla de compras.';

comment on column public.obra_compra_etapa_materiales.linea_proceso_tarea_id is
  'Tarea de produccion que consume el material de la etapa de compras de la obra.';

notify pgrst, 'reload schema';
