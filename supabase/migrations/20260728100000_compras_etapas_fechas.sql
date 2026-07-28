-- ═════════════════════════════════════════════════════════════════════════════
-- Compras por Etapa — planificación regresiva desde el desmolde.
--
-- La idea: una etapa de compra no tiene una fecha escrita a mano, tiene una
-- REGLA ("10 semanas antes del desmolde"). La fecha se calcula. Cuando cambia el
-- desmolde del barco, todas las etapas se corren solas y los atrasos aparecen
-- sin que nadie toque nada.
--
-- Se reusa el motor que ya existe en el módulo de Fechas, NO se arma uno nuevo:
--   · produccion_obras.desmolde_real / desmolde_estimado / botada / botada_real
--   · produccion_obras.atraso_dias  → desplaza el cronograma sin perder la base
--   · fechas_offsets                → mismo criterio de "semanas + referencia"
-- Si armáramos un segundo sistema de fechas, en unos meses discreparían entre sí
-- y nadie sabría cuál manda.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 0. Columnas de fecha de la obra ─────────────────────────────────────────
-- Existen en producción pero se crearon a mano en el dashboard y nunca tuvieron
-- migración. Se declaran para que un entorno nuevo o un `db reset` las levante.
alter table public.produccion_obras
  add column if not exists desmolde_estimado date,
  add column if not exists desmolde_real date,
  add column if not exists botada date,
  add column if not exists botada_real date,
  add column if not exists atraso_dias integer not null default 0;

-- ── 1. La regla de fecha en la plantilla del modelo ─────────────────────────
-- Acá se define una sola vez "la Etapa 1 del K37 va 10 semanas antes del
-- desmolde" y todas las obras del modelo lo heredan.

alter table public.linea_compra_etapas
  add column if not exists semanas_antes numeric,
  add column if not exists referencia text not null default 'desmolde',
  -- Días de tolerancia antes de que el sistema la genere solo. 0 = el mismo día.
  add column if not exists dias_gracia integer not null default 3;

alter table public.linea_compra_etapas
  drop constraint if exists linea_compra_etapas_referencia_check;
alter table public.linea_compra_etapas
  add constraint linea_compra_etapas_referencia_check
  check (referencia in ('desmolde', 'botada'));

comment on column public.linea_compra_etapas.semanas_antes is
  'Semanas antes de la referencia en que hay que comprar esta etapa. Null = sin regla, la fecha se pone a mano en cada obra.';

-- ── 2. La regla heredada en la obra, con escape manual ──────────────────────
-- Se copia de la plantilla al crear la obra pero queda editable: una obra puntual
-- puede necesitar otro plazo sin ensuciar la plantilla del modelo.
--
-- `fecha_objetivo` ya existía y pasa a ser el OVERRIDE: si tiene valor, gana
-- sobre la regla. Es la vía de escape para el caso raro.

alter table public.obra_compra_etapas
  add column if not exists semanas_antes numeric,
  add column if not exists referencia text not null default 'desmolde',
  add column if not exists dias_gracia integer not null default 3,
  -- Permite apagar la generación automática en una etapa puntual sin apagarla
  -- para toda la obra.
  add column if not exists auto_generar boolean not null default true;

alter table public.obra_compra_etapas
  drop constraint if exists obra_compra_etapas_referencia_check;
alter table public.obra_compra_etapas
  add constraint obra_compra_etapas_referencia_check
  check (referencia in ('desmolde', 'botada'));

comment on column public.obra_compra_etapas.fecha_objetivo is
  'Override manual. Si tiene valor, pisa la fecha calculada por semanas_antes.';

-- ── 3. Fecha base de una obra ───────────────────────────────────────────────
-- Mismo criterio que FechasView: el dato real le gana al estimado. Si no hay
-- ninguno, no se inventa una fecha — se devuelve null y la etapa queda "sin
-- fecha", que es honesto y visible.

create or replace function public.compras_fecha_base_obra(
  p_obra_id uuid,
  p_referencia text default 'desmolde'
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_referencia = 'botada' then coalesce(o.botada_real, o.botada)
    else coalesce(o.desmolde_real, o.desmolde_estimado)
  end
  from public.produccion_obras o
  where o.id = p_obra_id;
$$;

revoke all on function public.compras_fecha_base_obra(uuid, text) from public;
grant execute on function public.compras_fecha_base_obra(uuid, text) to authenticated;

-- ── 4. Vista con la fecha calculada y el semáforo ───────────────────────────
-- Todo el cálculo vive acá y no en el frontend: así la lista, los filtros y el
-- futuro job automático leen exactamente el mismo número. Si el cálculo
-- estuviera en JS, el job y la pantalla podrían discrepar.
--
-- security_invoker: la vista respeta la RLS de las tablas de abajo en vez de
-- correr con los permisos de quien la creó.

create or replace view public.v_obra_compra_etapas
with (security_invoker = true)
as
select
  e.id,
  e.obra_id,
  e.origen_id,
  e.nombre,
  e.descripcion,
  e.orden,
  e.color,
  e.estado,
  e.semanas_antes,
  e.referencia,
  e.dias_gracia,
  e.auto_generar,
  e.fecha_objetivo,
  e.created_by,
  e.created_at,
  e.updated_at,

  o.codigo        as obra_codigo,
  o.linea_id      as obra_linea_id,
  o.linea_nombre  as obra_linea_nombre,
  o.atraso_dias   as obra_atraso_dias,

  base.fecha_base,
  -- Si la referencia real ya ocurrió, el dato es firme; si es estimada, la
  -- fecha se puede mover. Se expone para poder avisarlo en pantalla.
  (case
     when e.referencia = 'botada' then o.botada_real is not null
     else o.desmolde_real is not null
   end) as fecha_base_es_real,

  calc.fecha_compra,

  -- Días desde hoy hasta la fecha de compra. Negativo = ya pasó.
  (calc.fecha_compra - current_date) as dias_restantes,

  -- Semáforo. El orden de los casos importa: "hecha" gana sobre "atrasada"
  -- porque una etapa ya comprada no es un problema aunque su fecha haya pasado.
  (case
     when e.estado in ('completa', 'cancelada') then 'hecha'
     when exists (
       select 1 from public.pedidos_produccion p
        where p.obra_compra_etapa_id = e.id and p.estado <> 'cancelado'
     ) then 'hecha'
     when calc.fecha_compra is null then 'sin_fecha'
     when calc.fecha_compra < current_date then 'atrasada'
     when calc.fecha_compra <= current_date + coalesce(e.dias_gracia, 0) then 'por_vencer'
     else 'a_tiempo'
   end) as semaforo

from public.obra_compra_etapas e
join public.produccion_obras o on o.id = e.obra_id
cross join lateral (
  select case
    when e.referencia = 'botada' then coalesce(o.botada_real, o.botada)
    else coalesce(o.desmolde_real, o.desmolde_estimado)
  end as fecha_base
) base
cross join lateral (
  select case
    -- El override manual gana siempre.
    when e.fecha_objetivo is not null then e.fecha_objetivo
    when e.semanas_antes is not null and base.fecha_base is not null
      -- El atraso operativo de la obra corre también la fecha de compra: si la
      -- producción se atrasó tres semanas, comprar en la fecha original sería
      -- adelantarse y pagar por tener el material parado.
      then base.fecha_base
           - (e.semanas_antes * 7)::integer
           + coalesce(o.atraso_dias, 0)
    else null
  end as fecha_compra
) calc;

comment on view public.v_obra_compra_etapas is
  'Etapas de compra con su fecha calculada desde el desmolde/botada y el semáforo de atraso. Todo el cálculo de fechas del módulo sale de acá.';

grant select on public.v_obra_compra_etapas to authenticated;

-- ── 5. Copiar la regla al crear la obra desde la plantilla ──────────────────
-- La copia la hace la app (copiarPlantillaAObra), pero este default cubre las
-- etapas que se crean sueltas y deja el intent explícito en la base.

create index if not exists idx_obra_compra_etapas_auto
  on public.obra_compra_etapas(auto_generar, estado)
  where auto_generar;
