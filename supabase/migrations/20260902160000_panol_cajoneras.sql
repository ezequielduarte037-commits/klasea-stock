-- Cajoneras en el mapa del pañol.
--
-- El modelo de hoy sólo sabe describir estantes apilados: `niveles_cm` es un
-- array de alturas y una ubicación es CODIGO-n, donde n es la posición en ese
-- array. Con eso no se puede representar el mueble de la N, que son 20 cajones
-- en una grilla de 4 columnas por 5 filas.
--
-- Se podría haber cargado como 20 "niveles" y listo -las ubicaciones N-1 a N-20
-- existirían igual-, pero se pierden las dos cosas que hacen útil a una
-- cajonera:
--
--   1. La forma. Dibujada como 20 estantes apilados, la vista frontal no se
--      parece en nada al mueble que la persona tiene adelante, que es todo el
--      punto de tener un mapa.
--   2. El nombre del cajón. Nadie busca "el nivel 13": busca el cajón de los
--      racores. La etiqueta ES la dirección.
--
-- Lo que NO cambia: el formato de la ubicación sigue siendo CODIGO-n (N-1 a
-- N-20). Por eso el selector de ubicación, el buscador y el resto del sistema
-- siguen funcionando sin tocarles una línea; lo único que cambia es cómo se
-- dibuja y que ahora cada posición tiene nombre.

alter table public.panol_estanterias
  add column if not exists tipo text not null default 'estante',
  add column if not exists filas integer,
  add column if not exists cajones jsonb;

alter table public.panol_estanterias
  drop constraint if exists panol_estanterias_tipo_valido;
alter table public.panol_estanterias
  add constraint panol_estanterias_tipo_valido
  check (tipo in ('estante', 'cajonera'));

comment on column public.panol_estanterias.tipo is
  'estante = niveles apilados, se describe con niveles_cm · cajonera = grilla de cajones, se describe con cajones y filas.';
comment on column public.panol_estanterias.cajones is
  'Array de etiquetas, una por cajón. La posición en el array + 1 es el número del cajón, igual que en niveles_cm: el cajón N-7 es cajones[6]. Una etiqueta vacía es un cajón sin rotular, no un cajón que no existe.';
comment on column public.panol_estanterias.filas is
  'Cuántos cajones tiene cada columna. Se guarda filas y no columnas porque la numeración baja por la columna -1 a 5 la primera, 6 a 10 la segunda-, así que es el alto de la columna lo que define dónde cae cada número.';

-- ─────────────────────────────────────────────────────────────────────────────
-- La cajonera N
-- ─────────────────────────────────────────────────────────────────────────────

-- Las etiquetas salen de leer las de los cajones reales en la foto. Van a hacer
-- falta correcciones: son rótulos escritos a mano y algunos tienen dos o tres
-- cosas apuntadas.
--
-- Medidas y posición son aproximadas a propósito. La cajonera va contra la
-- pared de arriba, en el hueco entre F2 y K1; el lugar exacto se ajusta
-- arrastrándola con "Editar plano", que es más rápido y más confiable que
-- adivinar centímetros desde una foto.
--
-- El `where not exists` en vez de `on conflict`: no hay certeza de que codigo
-- tenga índice único, y sin él un on conflict falla al ejecutarse.
insert into public.panol_estanterias
  (codigo, tipo, filas, cajones, alto_cm, largo_cm, prof_cm, x_cm, y_cm, w_cm, h_cm, activo, notas)
select
  'N',
  'cajonera',
  5,
  '["MACHO FLARE / TUERCA FLARE",
    "LLAVINES",
    "ENTREROSCA",
    "MACHO FLARE",
    "RACOR / MEDIDAS VARIAS",
    "MACHO FLARE",
    "TAPÓN / TAPA",
    "TUERCA / TEE 1/4 / CODO 1/4",
    "ENTREROSCA REDUCCIÓN / ACOPLE CODO",
    "CODOS 1/2",
    "ENTREROSCA / TAPA-TAPÓN",
    "NIPLE 1 1/2",
    "CANILLA VALDEOS / MIX",
    "ESFÉRICA / RACOR",
    "RACOR",
    "VÁLVULA RETENCIÓN / NIPLE",
    "BUJE REDUCCIÓN",
    "CUPLA / ENTREROSCA",
    "VÁLVULA RETENCIÓN",
    "VÁLVULA RETENCIÓN PLÁSTICO"]'::jsonb,
  95, 130, 60,
  1057, 38, 130, 60,
  true,
  'Cajonera de conexiones. Los cajones ya tienen código de barra pegado: escanearlos es el camino natural para ubicar y buscar.'
where not exists (
  select 1 from public.panol_estanterias where codigo = 'N'
);
