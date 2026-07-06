-- Correccion puntual K55: anodos STD que quedaron en revision por match conservador.
-- Excel filas 12 y 13 de K55 seguimiento (2).xlsx.
begin;

insert into public.panol_material_modelo (material_id, modelo, variante, cantidad)
values
  ('335658f9-b72a-41cf-ab2c-bceb8dfb7fe3'::uuid, '55', 'standard', 1), -- Anodo escudo PLACA 30X15
  ('29687db1-d64d-4f74-bd3c-fb8a51af0a57'::uuid, '55', 'standard', 2)  -- Anodo timon 95MM
on conflict (material_id, modelo, variante) do update
set cantidad = excluded.cantidad;

update public.panol_materiales m
set notas = btrim(concat_ws(E'\n', nullif(btrim(coalesce(m.notas, '')), ''), v.nota))
from (values
  ('335658f9-b72a-41cf-ab2c-bceb8dfb7fe3'::uuid, '[K55 Excel fila 12] PLACA 30X15. PERFORMANCE METAL USA.'),
  ('29687db1-d64d-4f74-bd3c-fb8a51af0a57'::uuid, '[K55 Excel fila 13] 95MM. PERFORMANCE METAL USA.')
) as v(material_id, nota)
where m.id = v.material_id
  and position(lower(v.nota) in lower(coalesce(m.notas, ''))) = 0;

select m.descripcion, mm.cantidad
from public.panol_material_modelo mm
join public.panol_materiales m on m.id = mm.material_id
where mm.modelo = '55'
  and mm.variante = 'standard'
  and mm.material_id in (
    '335658f9-b72a-41cf-ab2c-bceb8dfb7fe3'::uuid,
    '29687db1-d64d-4f74-bd3c-fb8a51af0a57'::uuid
  )
order by m.descripcion;

commit;
