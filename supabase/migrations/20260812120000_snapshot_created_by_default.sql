-- Quién creó cada renglón del snapshot de obra.
--
-- Los renglones con source='matriz' —los que genera la pantalla de Materiales al
-- fijar la lista de una obra— se insertaban con created_by en null. Despues, en
-- la lista de movimientos, no habia forma de saber quien los habia hecho: la
-- pantalla rellenaba el hueco con el primer nombre que encontraba cerca (el que
-- armo el envio) y terminaba atribuyendole ingresos a gente que no los toco.
--
-- Se arregla con un DEFAULT en la columna y no completando el campo desde el
-- frontend, por dos razones:
--
--   · Hay varias vias que insertan en esta tabla —Materiales, adicionales,
--     recepciones, scripts—. Poner auth.uid() en cada una es garantizar que
--     alguna quede afuera, y el agujero vuelve por ahi.
--   · Un default no se puede olvidar. Si manana alguien agrega otra pantalla que
--     inserte renglones, el autor queda guardado sin que se acuerde de hacerlo.
--
-- No toca las filas viejas: para esas el dato nunca existio y no hay de donde
-- sacarlo. Van a seguir diciendo "sin registrar", que es la verdad.

-- La columna directamente no existia: por eso el autor no se guardaba en
-- NINGUNA via, no solo en la de matriz. Se crea con el default puesto.
alter table public.panol_obra_materiales_snapshot
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.panol_obra_materiales_snapshot
  alter column created_by set default auth.uid();

comment on column public.panol_obra_materiales_snapshot.created_by is
  'Quien creo el renglon. Default auth.uid() para que ninguna via de insercion pueda dejarlo vacio por olvido.';

create index if not exists idx_panol_snapshot_created_by
  on public.panol_obra_materiales_snapshot (created_by)
  where created_by is not null;
