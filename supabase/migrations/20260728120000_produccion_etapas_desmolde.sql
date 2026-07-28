-- Producción por desmolde: reglas iniciales del K37.
--
-- Cada etapa se identifica con el mismo evento_key que usa ObrasScreen:
-- linea_proceso:<uuid>. El modelo queda en "*" porque el UUID de la etapa ya
-- pertenece a una línea concreta.
--
-- DO NOTHING es intencional: si alguien ya configuró la semana desde la
-- pantalla, la migración no pisa esa decisión.

with reglas_k37 as (
  select
    lp.id as linea_proceso_id,
    case
      when lower(lp.nombre) like '%matriz%casco%' then -3::numeric
      when lower(lp.nombre) like '%pintor%' then 6::numeric
      else null
    end as semanas
  from public.linea_procesos lp
  join public.lineas_produccion linea on linea.id = lp.linea_id
  where (
    regexp_replace(lower(coalesce(linea.nombre, '')), '[^a-z0-9]', '', 'g') like '%k37%'
    or regexp_replace(lower(coalesce(linea.nombre, '')), '[^a-z0-9]', '', 'g') like '%klasea37%'
    or regexp_replace(lower(coalesce(linea.nombre, '')), '[^a-z0-9]', '', 'g') = '37'
  )
  and (
    lower(lp.nombre) like '%matriz%casco%'
    or lower(lp.nombre) like '%pintor%'
  )
)
insert into public.fechas_offsets (
  evento_key,
  modelo,
  semanas,
  referencia,
  updated_at
)
select
  'linea_proceso:' || linea_proceso_id::text,
  '*',
  semanas,
  'desmolde',
  now()
from reglas_k37
where semanas is not null
on conflict (evento_key, modelo) do nothing;

