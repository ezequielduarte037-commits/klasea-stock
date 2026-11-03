-- Fusión de fichas repetidas aprobada por Ezequiel el 03/11/2026
-- (hoja Repetidos de entregables/limpieza/limpieza-panol-2026-11-03.xlsx).
-- De los 19 pares, 9 resultaron ser requisito de matriz + su producto (Whale
-- WX1514/1503/1521/1502, Anafe, Bacha Piazza, cable bow thruster, plotter,
-- silenciador Centek): no son repetidos y quedan como están. Las 7 "BORNERA"
-- también quedan afuera: el nombre no dice la medida. Quedan 10 fusiones; se
-- conserva la ficha de más movimientos.
-- Necesita 20261103160000_panol_fusionar_materiales.sql.
begin;
-- ACCESORIO DE FIJACIÓN PARA RESORTE HIDRAULICO R05627
select public.panol_fusionar_materiales('52e6bb06-f368-4158-9ca1-48f814462945', 'd88c8a80-63e4-4550-b353-03df7cc4cd00', 'Repetidos 03/11/2026');
-- Acc Springlift Fijacion
select public.panol_fusionar_materiales('bc6892c2-bd5a-4da9-b441-0fd3cb96ef5f', '1df9f918-cb1a-4492-989a-9d0a16268954', 'Repetidos 03/11/2026');
-- Ancla Bruce 30kg galvanizada
select public.panol_fusionar_materiales('e004f66d-8030-44d3-85ba-94c18a35547e', '55f07459-5b9b-4329-be61-d22233e0a624', 'Repetidos 03/11/2026');
-- INVER/CARG.MUL.1600W,12V-80A
select public.panol_fusionar_materiales('d5926486-c0f0-4b4d-9f68-8d7b82d5cc45', 'cccfe193-8f20-4402-b13f-e107860722fa', 'Repetidos 03/11/2026');
-- PARLANTE FUSION XS-FL77SPGW 7.7 inch 240
select public.panol_fusionar_materiales('14c6cc87-bd13-46e9-8424-9d5a8f464db7', 'c9df0325-73b3-4c1f-b014-d56303c8a034', 'Repetidos 03/11/2026');
-- PARRILLA LEVY
select public.panol_fusionar_materiales('016e9e51-5638-4259-96e7-ad14eb0680ac', 'f0728914-dfe5-4770-8763-43ce93804fcb', 'Repetidos 03/11/2026');
-- PISTONES Linear TechLine LA36 - 6800N
select public.panol_fusionar_materiales('b9fec9ae-d23e-472b-a7c6-0e2f35e471cf', '17da39f8-a22f-4288-8ec4-4b8df982605f', 'Repetidos 03/11/2026');
-- Portarrollo Epuyén 0167/L2 Negro
select public.panol_fusionar_materiales('9f840a6e-1936-4bf4-8bf5-c28e68ce191d', 'f640b428-911c-4478-8a08-1c141f9062e0', 'Repetidos 03/11/2026');
-- Sello PSS para eje 2 1/4", tubo 3 1/2"
select public.panol_fusionar_materiales('6cc29c6c-32a5-400f-b8d1-47b23f39c919', '2d19d592-640c-4364-877f-4570d7d0a27c', 'Repetidos 03/11/2026');
-- Toallero Epuyén 0163/L2 Negro
select public.panol_fusionar_materiales('cb0f6f61-bad4-42e0-a882-10b1e77cc6bc', 'f90a405a-9bca-45d5-a160-2b20eaad648a', 'Repetidos 03/11/2026');
commit;
