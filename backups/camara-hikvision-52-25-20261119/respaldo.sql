select json_build_object(
'snapshot',(select json_agg(s) from panol_obra_materiales_snapshot s where s.id='d7eecb39-c36f-4a14-95bb-4471970aee9b'),
'envio',(select json_agg(e) from panol_envios e where e.id='b8ee573b-d2c1-4c46-a44c-9336cb13eaaa'),
'envio_items',(select json_agg(i) from panol_envio_items i where i.envio_id='b8ee573b-d2c1-4c46-a44c-9336cb13eaaa'),
'eventos',(select json_agg(v) from panol_envio_eventos v where v.envio_id='b8ee573b-d2c1-4c46-a44c-9336cb13eaaa'),
'comprobantes',(select json_agg(c) from panol_comprobantes c where c.panol_envio_id='b8ee573b-d2c1-4c46-a44c-9336cb13eaaa'),
'comprobante_items',(select json_agg(c) from panol_comprobante_items c where c.scanner_ingreso_envio_id='b8ee573b-d2c1-4c46-a44c-9336cb13eaaa'),
'equipos',(select json_agg(q) from equipos q where q.panol_envio_item_id='baeca8f1-a864-4194-800c-000b8d03e898')) b
