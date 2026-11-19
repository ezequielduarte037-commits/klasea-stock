-- Filas de matriz que ya cubre un adicional de la misma obra (barrido 19/11/2026,
-- OK de Ezequiel). Se quita la fila de la matriz sólo en esa obra; el adicional
-- queda con su pedido y sus movimientos. Para volver atrás: borrar la fila de
-- panol_obra_material_exclusiones (o "Restaurar" en la lista de la obra).
insert into public.panol_obra_material_exclusiones(obra_id, material_id, motivo, updated_at)
select o.id, m.id, 'Ya lo cubre el adicional de la obra (duplicado, 19/11/2026)', now()
from (values
  ('55-1','cd3f2ccf-fccb-4e3c-b4c0-08ca43dfa207'), -- Equipo de audio
  ('55-1','4c965220-d7ef-4a2b-9ffd-6dc7f9e8a309'), -- Panel de control Tecma
  ('55-1','4633a455-bf86-438a-99a7-a63fde82f6bf'), -- Cerraduras Bronzen
  ('55-1','96c1bab9-ba91-43ad-906c-ae7c2ac170ee'), -- Control flap segunda estación
  ('55-1','ec117514-7f5f-42e8-8cb8-e32533e9a05b'), -- Tender lift
  ('55-2','ec117514-7f5f-42e8-8cb8-e32533e9a05b'), -- Tender lift
  ('55-3','ec117514-7f5f-42e8-8cb8-e32533e9a05b')  -- Tender lift
) v(obra, material)
join public.produccion_obras o on o.codigo = v.obra
join public.panol_materiales m on m.id = v.material::uuid
on conflict (obra_id, material_id) do update set motivo = excluded.motivo, updated_at = excluded.updated_at
returning obra_id, material_id;
