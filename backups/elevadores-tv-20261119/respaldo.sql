select json_build_object(
'snapshot',(select json_agg(s) from panol_obra_materiales_snapshot s where id in ('401c44d2-d29b-415d-a9f5-128779663543','b2e1a148-7229-4f54-8c18-d360af0012da','81e8f59b-7f20-4d6e-8d0d-53d55cf40ba5')),
'envio_items',(select json_agg(i) from panol_envio_items i where envio_id in ('8fc465da-15e1-4098-b41e-46f5244d587c','77ff3066-2b54-4c60-b9a3-d4b67466c838','8ae9e5d7-1493-42c3-bf20-703fb1f8d226')),
'envios',(select json_agg(e) from panol_envios e where id in ('8fc465da-15e1-4098-b41e-46f5244d587c','77ff3066-2b54-4c60-b9a3-d4b67466c838','8ae9e5d7-1493-42c3-bf20-703fb1f8d226')),
'eventos',(select json_agg(v) from panol_envio_eventos v where envio_id in ('8fc465da-15e1-4098-b41e-46f5244d587c','77ff3066-2b54-4c60-b9a3-d4b67466c838','8ae9e5d7-1493-42c3-bf20-703fb1f8d226')),
'pri',(select json_agg(p) from purchase_request_items p where request_id in ('c51ec468-338b-4aa4-8295-ac14f0788ad1','0c1d4007-bca0-48e0-b2c1-27e1812293e7','d92e4b2c-1f2c-4a52-8f93-eeece4647ed6')),
'pr',(select json_agg(p) from purchase_requests p where id in ('c51ec468-338b-4aa4-8295-ac14f0788ad1','0c1d4007-bca0-48e0-b2c1-27e1812293e7','d92e4b2c-1f2c-4a52-8f93-eeece4647ed6'))) b
