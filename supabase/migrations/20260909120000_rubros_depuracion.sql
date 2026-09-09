-- Depuración de rubros
--
-- Deja el catálogo en 13 rubros de trabajo más el árbol de consumibles y una
-- bolsa "A asignar" para lo que no se puede decidir por el nombre.
--
--   Electricidad · Electrónica · Carpintería y alistamiento · Herrajes · Herrería
--   Sanitarios (con Griferías) · Vidrios · Mecánica (con Broncería) · Maderas
--   Laminación · Electrodomésticos · Consumibles (con sus 10 subrubros) · A asignar
--
-- Se mueven 318 materiales de 12 rubros distintos.
-- Los 214 consumibles no se tocan: su árbol ya estaba bien.
--
-- Correr entero, de una vez, en el editor SQL de Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nombres
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_categorias set nombre = 'Carpintería y alistamiento' where nombre = 'Carpintería y varios';

-- "Sin categoría" se lee como un rubro más. "A asignar" dice que falta trabajo.
update public.panol_categorias set nombre = 'A asignar' where nombre = 'Sin categoría';

-- Tildes que quedaron del import de Excel.
update public.panol_categorias set nombre = 'Químicos y adhesivos' where nombre = 'Quimicos y adhesivos';
update public.panol_categorias set nombre = 'Pintura y aplicación'  where nombre = 'Pintura y aplicacion';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reubicación de materiales
--
-- Incluye los que estaban sin rubro y los de Tapicería y Tanques, que se
-- disuelven más abajo.
-- ─────────────────────────────────────────────────────────────────────────────
-- Vidrios: 72 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Vidrios')
 where id in (
  '03425e5e-5e18-41a4-8db1-04ff40a260c1',
  '078555e6-d92c-4c21-90c0-106fa02eacc3',
  '09ceee3b-8b3d-424e-9b10-334e3c12bc25',
  '0b6567b8-fd5e-4f6c-b1b3-3565c954bad2',
  '0b85745c-29ea-40cf-a264-00140248678a',
  '1258cdb1-c87d-45c6-9d57-402adff47c83',
  '12fcd91e-3673-4f3a-b02d-dc3d20200983',
  '15072772-c1e3-422c-b302-977b1dd0dc87',
  '1af2cfca-7d1e-455f-8a53-d89a839cf1b1',
  '1c19421d-1a06-45c0-b729-a3713d2008b0',
  '2782b5b8-11bc-409c-9673-1a8e0274d65f',
  '27d4c9c6-9b0b-40c6-b3b4-6c58168db926',
  '2b39d830-da6a-44a3-bf8d-0be860194050',
  '2ee9fc7b-19eb-4d9f-b047-b264e2f95b21',
  '2f2da4cc-24d0-4a6b-8448-5dba99663fd9',
  '33e80f58-d706-4082-9b31-7e8914eedfb8',
  '3a9153a2-832a-4422-8db7-9a6383881e2c',
  '47c55eea-0d10-4dc8-89f9-7d83afeec465',
  '492c4dc0-4fe0-41c7-93b5-91ed55de31d7',
  '49357d73-83c1-4a36-93c9-088e0d9c5616',
  '497b4711-5611-4882-9995-3d80b2ae5979',
  '49c38343-7db4-47c7-bd6c-8b2261441085',
  '4df2b7b4-ee54-4b6a-810a-7dd411ab366e',
  '591ca286-82bf-41db-883b-af3e4695fa6c',
  '5e1fb767-a9fe-4095-984b-caeee4d75220',
  '6828a7af-e0fb-4ff5-85a2-e82c2a743c98',
  '6aac8fc1-ece0-4f07-98c1-f955c868c440',
  '6b098d9a-6614-4da8-84e1-b8400ecac3e8',
  '701f459c-feb0-4d14-89f8-a372350def73',
  '7492348e-cc75-45de-819a-e2b9526fbdc6',
  '77fe10c2-771b-4c51-a0af-c0b0626b76f8',
  '7dca4e22-48e6-49fb-bf5d-c4a842c75726',
  '8385e09a-ecab-4f31-8448-058a695c54ee',
  '8504ca29-017e-400a-9020-621c4082e882',
  '8d9aa2c7-5ef5-4d98-89e4-f11a11b74f97',
  '93c15110-1096-4c30-bcae-3ac7f4341365',
  '9eacc82a-9827-49ed-9967-700edfd2769b',
  '9ebe22d6-5c17-4ca1-83f6-019fca93c56a',
  '9ec7a4b1-c2ce-45bc-80af-356c1feb46d3',
  '9faaa112-02b7-4891-b17e-e0833f6eeee3',
  '9fbe52d7-8d38-4efd-8ae3-cc32ad619c95',
  'a1e3404a-3b28-4cee-a993-99685a34a056',
  'a6bbdfaa-6edf-4253-a10e-afa1d7510100',
  'a8083939-4042-4c85-8184-3a0332e73a80',
  'a8137fb3-d8c6-4ea0-9bc2-77d6478d7d42',
  'ace61c18-99b1-4358-8411-329e47b111ef',
  'ad735cad-720d-4b49-a53c-4682cba07d08',
  'b2003e08-f3c0-4ab4-821f-5ac301e9c2ad',
  'b7cedde2-4f11-49c9-b18f-43222ebce0ce',
  'c3853ff1-8fe4-4be0-a75f-c39caba01a59',
  'c7271d6c-5b91-4479-b84f-3eab09aed429',
  'c8e31913-04a8-4802-b9ba-d04f10cc5724',
  'c8f4d112-d431-4277-bf01-f59aba81c7bc',
  'cd2955a6-87b2-4d6f-bd85-a4247c42172b',
  'd04ec5de-25b7-4c1a-8f4f-4edcb9ae31d3',
  'd110b778-9b89-4905-a844-4df05e328c99',
  'd462c0f8-1311-49ed-9230-7023c87a9a27',
  'dadc554d-be90-49ee-a763-b20462d2a0bd',
  'dbd81b1d-7358-4c82-9696-50caf4705666',
  'df184234-6b20-4ad3-bc72-0f89f8bff6e9',
  'e27e2c13-aefc-4665-a3de-b60f09824c91',
  'e53974f4-bbaf-4d52-ad61-e0d7970418b9',
  'eae38b09-a436-4c51-bbc3-069b24a646ec',
  'ed42b0be-ece2-4d3b-95bd-7f4e45638886',
  'f03602e2-8008-4351-bd6a-159fc27db479',
  'f2e72caf-47ef-40f7-8348-dbb4a4e9890c',
  'f387ac0d-5a3e-4c58-85cd-994dcbd87ebc',
  'f3ca32da-db5e-4b69-9860-4786596cac22',
  'f487159a-0329-4f59-b947-1451838ec073',
  'f5151b54-2a3d-496d-b868-02b11d36e42f',
  'ff2604f7-8fc1-4d77-99d2-91f253c149ed',
  'ffa23caf-1ec4-4050-a2ce-d3b9af612687'
);

-- Herrajes: 39 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Herrajes')
 where id in (
  '15434e19-20ec-4c5f-a327-7e494dc79e42',
  '3772fd17-e188-48b2-987e-73ed80799d7b',
  '52e6bb06-f368-4158-9ca1-48f814462945',
  '62d13da7-f06c-474c-9080-854c13799acf',
  '6596b767-892a-4acd-8aa3-359f8ae9a6ac',
  '9256b6a0-243c-4103-aa28-5d7c1bef0e26',
  'b9fec9ae-d23e-472b-a7c6-0e2f35e471cf',
  'bc6892c2-bd5a-4da9-b441-0fd3cb96ef5f',
  'd395a4e8-4948-4029-adc8-552cd0130509',
  'd88c8a80-63e4-4550-b353-03df7cc4cd00',
  'ee393478-3027-42ea-8600-2ee5bcc94262',
  'f59d1862-9828-4a20-9f16-aa636e431d54',
  'ffd2bc5d-6c6b-47fb-ba38-2db866621c91',
  '17da39f8-a22f-4288-8ec4-4b8df982605f',
  '1c17d746-5a67-4096-867c-956781b852d5',
  '1ecf2eb9-fb46-4e7e-9ed3-7a6a1184f843',
  '2f74997a-1200-4474-b408-bb273828a311',
  '33cd96e4-def4-47e3-92ea-960d3404258e',
  '4d8976eb-a02a-41a8-b778-d692afeff8f4',
  '5aca1ca3-3b3c-45f7-912f-f88e3d2b96d3',
  '65a75fd0-cd90-4f76-9b2c-000d45142aec',
  '6e5cec01-3bca-423d-be0e-9ef4c08acbc7',
  '70d4f04b-5a19-4692-b0f8-a549d6c961ce',
  '7751935b-db5c-4ac1-9466-53c6f87a33c7',
  '8286c5c1-03d3-4847-b0fe-11bcd1362a81',
  'a192747c-bd1b-48fa-a7b3-160dfb70a840',
  'a6158ae2-8061-4dbf-a936-c277ffab2129',
  'aa2d4ea3-3c45-4364-a206-31c76afc22a5',
  'b54d74da-5ecd-4795-b3fd-c8e0a276ca66',
  'c60e635d-686f-4da6-b5c5-27d1f5990583',
  'c9cb0c09-4449-4486-9f46-88fb064a80b7',
  'd34d31bd-95d0-4f2d-87dd-6de830310a18',
  'd627ad27-ca4d-4010-a132-815d1f7b4c68',
  'da8bafce-c7dc-41a3-8e77-f44e2bec8720',
  'e20d6f86-5d1a-4b74-b10b-a890b8c32e23',
  'e45a2ce5-1ef2-4f7b-840a-d099514de332',
  'e5131c94-6c46-44b2-ace2-a5e99a0a194a',
  'e957b9f5-ff93-4802-98ac-960fb657ac87',
  'fe08d3d6-a277-4b51-99d3-9180008972e5'
);

-- Broncería: 36 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Broncería')
 where id in (
  '01d53801-c1ed-434d-abe2-a2c635ef7292',
  '0582faf9-b569-4f20-82f9-5d5ce768eeda',
  '14105975-65ff-428b-a012-6c011cd619bd',
  '1f8c475c-b6c4-4ec9-9541-196b70553ad1',
  '23cf21cd-bb09-48e1-a060-b0bb33c6323a',
  '350d0ded-0371-4084-8d29-4bbc263c2570',
  '6a26c134-4a30-4f7a-94ad-ca5cba930f5d',
  '8b49cf46-7284-4bb5-a8d8-3116aaac60a9',
  '9d505714-32ef-4ce1-836c-0b706d9ff7ed',
  'c04b6032-e4c1-42a4-83a1-8ba99108c632',
  'dde8f0b1-40aa-481a-a491-7f32c606aaa2',
  '07fb5e8c-b9d7-44f0-8fab-6d3db0babfe5',
  '087e2175-0d86-4d09-8828-3880c5937b99',
  '0e264161-b09d-4ec0-963f-44d84470e654',
  '120a9a18-23bb-4b7e-b8c7-11c65f3418fb',
  '14bcc8ed-de46-4bed-95cf-cf8e5311d2a2',
  '1e962cbe-a22a-42ab-8863-2e64f56dcdf2',
  '27f5cdcc-0782-4e7c-986b-30ba90639424',
  '395930c9-73c2-45d1-a02c-859dc37ec727',
  '3c32533a-f235-42de-a293-c8065f89a78e',
  '3cfd818a-222b-4659-bea5-4a689dbb43cb',
  '3e628160-2d0e-4dda-9ea6-3c85cb9b8ffa',
  '3f132969-a4ba-4414-8c74-688c924c1202',
  '47b692fc-9e04-436c-94ee-9f4af6b6291e',
  '4bbc95f1-fc70-456b-9252-a316d366046e',
  '56588f03-cdcc-4a42-9792-63b94bc4cd88',
  '59c2b25f-5c20-478e-bff5-d4bbe9bae026',
  '59fc5388-e1eb-4cfc-9302-0c8e64457f20',
  '60cc69f1-f661-4b3c-972d-58ffe8b1a26e',
  '649da7f4-d76f-40d6-9bfc-3b4fdd682b1d',
  '7460410d-5b01-4344-a13d-fa481593a57a',
  '7a9da0a6-4f72-4e3c-b1ee-228059aa5e7b',
  '956b740e-60cf-4667-bbdf-d17c977a72c3',
  'af66e55d-906b-468b-8e72-71c9dcde5b46',
  'cac9771e-8ffa-48f4-a9fb-6d7cabe278b7',
  'd982268f-2504-4e6b-b145-18d8cb2951c1'
);

-- Electricidad: 33 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Electricidad')
 where id in (
  '09331295-6def-4f39-9227-a7a528c3f7f9',
  '320f5483-b446-4d08-a96e-4ecbd71871d4',
  '521d64c9-6ca7-46b0-81fd-ca4694a98173',
  '5bbb827c-e3e5-40cd-8538-5946c36558ab',
  '7ffb7afa-16e4-4259-8311-5592818755ec',
  '81399403-44f8-4c56-8840-aef8d2a82b59',
  '8153eaa2-4650-4749-9575-2757b74582c6',
  '8a12304d-3f89-426f-b7d0-10368d9d5502',
  '97797237-c9b1-45f9-8645-a8a998f21da7',
  '993fa5a3-cadb-411f-8a5f-d7dd04f81133',
  '09ff3fc0-550f-4e94-b6ef-9ab3c46432e7',
  '14f79c28-6ca6-49fa-9024-141518b953b6',
  '2867a718-9070-4c34-8a93-01e5d0777b41',
  '28bf764a-02c9-48bd-87be-5f6b57c022f6',
  '359fab35-7264-4d63-b712-1c23a3fc18d0',
  '3a7eb336-6a12-4d48-a0c6-7d6fd0bd45d4',
  '3ac1ac38-ef4b-4e08-ad75-885484a26660',
  '4252bbcd-315f-4a58-a310-a3bcf66ddb29',
  '4d3f98ae-a508-4b04-9d25-65005d428c09',
  '52920ead-6f80-4ee4-914a-d56b4a74f294',
  '64043017-c88a-42e7-b3ae-a76a3cf25edd',
  '6a0afd2f-71a1-4159-8cc4-16e15d26ad57',
  '827171f2-409a-476e-a17a-393780fe38cf',
  '96c1bab9-ba91-43ad-906c-ae7c2ac170ee',
  'a26dd977-2d81-4ac4-b737-1c57d693088d',
  'a8f06a10-fa18-47da-83f4-ba6b58fd38a0',
  'aaa11322-365a-47fa-ae87-57fce52c841f',
  'c96d5fc2-a1d3-48d6-a782-bede0ba531f6',
  'ce697874-9219-46c0-9b5d-f629c668f564',
  'dabc4566-e277-4fe8-99f6-da32b4d860ec',
  'e984a5ee-7fb2-4918-80ea-453c0e0b04c2',
  'eb4f618b-e056-4e1b-a21f-b5f75a9fbddf',
  'f94bf258-a633-4812-a5eb-c8fca890e608'
);

-- Electrónica: 32 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Electrónica')
 where id in (
  '10f6a22b-8048-4c54-af89-39b1560e2617',
  '31b36484-f155-4a39-a649-19eb1d6b74eb',
  '72660701-9b60-4eab-8acb-aff35fb84b7f',
  '92c94707-131b-48f3-b6c3-40fa70d25144',
  '02b1198c-bcdf-4661-bb47-4d6fd20b7732',
  '0f862566-a342-4d1c-9379-c772c2675a7b',
  '150fa924-9e42-4cb8-9c1a-8d0443437455',
  '2d98e85a-bde0-421c-a0f0-61697283eee1',
  '3ac16bda-6682-4f9d-8dc4-98cae7ec125e',
  '477cbb3c-18bc-4ded-ab24-98d646620080',
  '4ae136ee-be39-4a3f-8df9-0269044c9a13',
  '4ddd6c4e-d67a-4f61-91f6-1810d5114964',
  '5781d639-197d-4e6a-9e8e-e0af0fac6d2c',
  '5894a9a9-114f-4791-8d4d-0e71972970f2',
  '591f1533-7618-438a-865f-cca9f71f9330',
  '6943c50c-d595-4a66-8321-66e27e69b165',
  '6de25738-462e-4766-918e-93b6c795566d',
  '76109af8-89d2-4f5b-8bf4-43d45645d02f',
  '777756e9-8993-471e-97f3-272cfa38b62a',
  '8aa51734-a28d-4a4f-ba05-cdb48fc0ab38',
  '99a65b33-45b8-4c78-8657-a5ce5af4b26d',
  '9e94762c-e284-431f-ad95-df721c56e73c',
  'ac6da387-f241-40be-b01a-08a8b21bb039',
  'b03dd940-caed-4660-92e1-c140b0d3fba0',
  'cc9041b4-21d4-4e12-b7ce-d04022071844',
  'dec5cc4c-4a0c-4419-ad7f-2ff3240a8a67',
  'dee3ab68-5c3a-4960-a46d-259a1402ce29',
  'f2080e6e-9741-42cd-a3b1-9c1a5a67f3b1',
  'f4389588-b384-40f3-9d9d-2fc36a53f5e3',
  'f5773e75-e54c-43f2-9161-f1740b8f8b3a',
  'f9802115-c870-4709-85ae-7c0907ac6bcd',
  'ff69a11e-39ba-4d45-aa50-2453685c8990'
);

-- Mecánica: 25 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Mecánica')
 where id in (
  '177498d7-d483-4fbd-a5fc-3566372878f9',
  '17ae82f9-1217-47bc-ab9e-8fdb23d5a6aa',
  '4012a985-a22a-4d61-859b-6f1fe90a8c1b',
  '45e40863-7d72-4b28-b8df-1e2d2608a8b8',
  '4c0ca541-106f-4b6e-b653-59a81898346a',
  '4ceb1c17-382c-45e6-bdb9-de56e2d54d71',
  '5a5659dd-6219-4bed-9719-fc5ee5792ea1',
  '646baa4a-525b-4da8-a656-208127bae392',
  '9a8d6d69-4db2-489c-bcac-1aa4c917c6e8',
  'a6f2bf67-e165-4c87-b7f3-a416d5dab464',
  'b0246751-234f-4dac-aa3d-044236491ab7',
  'ddc1de44-ee41-4881-a021-eb1f16542de3',
  'e60e499b-2019-4aea-9e77-47800de07984',
  '01136608-bc2e-479a-b16d-244933c30e25',
  '223331ad-9717-47a9-add8-38e94f77e2b6',
  '23e08655-1520-4423-b3bc-bde27b97a454',
  '249c937c-f53f-4a3f-8c58-e22200487852',
  '3539b0bd-9f95-4ca8-b9e4-afd170f64bf1',
  '46bb6914-ed9d-4446-810f-a2abe3c83646',
  '6f87639c-1818-4f61-abf1-c48dbbf0de0d',
  '88ded42e-4d4c-4750-b467-a365ad6c8a46',
  '8a7543c8-2701-4b9d-b0bb-1829cc60270b',
  '90f7425c-dbca-4699-9c35-0655acbc1253',
  '9245d633-fee3-4f15-badc-a91f4adaf4aa',
  'd1833a2d-7660-42bc-9b05-e751e29112f1'
);

-- Sanitarios: 19 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Sanitarios')
 where id in (
  '31f8fe8b-015a-4fc7-aeac-cf433d8b26e5',
  'e297f845-f1ef-41c3-83d2-adcf9e351625',
  '090a2a1d-771c-4f13-b54a-c46aa5b60d81',
  '09ff32da-b4ea-41b1-a229-bccbc402b29a',
  '4b452126-5e84-4755-955a-1115ad75c7e3',
  '4f31f444-aaf6-4401-afdd-cba7e41e9bff',
  '58d6dc03-a53c-4a04-92e6-a26584f7c25c',
  '638043c1-6f67-4c0f-8819-4edf57c1d0a2',
  '6455d186-d4cf-495d-9cff-96ceb7195516',
  '8eecd0a2-01c2-4f9d-b192-ab74d0769acc',
  '977151e3-bd41-4236-b683-43721dd89e92',
  '9f840a6e-1936-4bf4-8bf5-c28e68ce191d',
  'b321889e-ec8c-460f-b325-9a14cce2e24c',
  'bc75fe2c-7d50-427d-95fb-ac21f7664b42',
  'cb0f6f61-bad4-42e0-a882-10b1e77cc6bc',
  'd1bcba4c-0015-409b-b91f-ea6c559b0303',
  'f5f25810-9ab1-44b7-a8b4-cc2f5766c6b7',
  'f640b428-911c-4478-8a08-1c141f9062e0',
  'f90a405a-9bca-45d5-a160-2b20eaad648a'
);

-- Carpintería y alistamiento: 18 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Carpintería y alistamiento')
 where id in (
  '016e9e51-5638-4259-96e7-ad14eb0680ac',
  '2f2526be-2cb1-40de-8f81-6f825208713f',
  '33eaa48c-a5fe-4a23-b9e9-acf95e42c7ae',
  '35ee0342-65e2-4297-afd6-3d18878d8b29',
  '48b6e8f4-41e8-433d-8bfa-c575e801feaa',
  '55f07459-5b9b-4329-be61-d22233e0a624',
  '56b038fa-2c10-422a-9ea2-579c10cb92d0',
  '5aa297e2-5cee-48af-9e34-c36d1bef9502',
  '606023db-e088-4242-b9eb-bcbba52afb25',
  '8365ba5b-6304-4def-9e5a-97445a47ae9d',
  '8e07494d-5f09-491e-8449-c59527d3e1bf',
  'd775eb6d-2f27-4684-a22f-fd91fa386a99',
  'd9540ff9-5f24-466f-8975-261fd0258cbb',
  'e3fc2701-32b9-4ea5-beda-a68210c83bbd',
  'f0728914-dfe5-4770-8763-43ce93804fcb',
  'f1299d11-f00d-4344-8364-bd34577755fe',
  'f2087e91-2574-49ee-9a81-f7dcb25b4aea',
  'fc71f623-2fec-42ab-8cc7-0e2f1cc0feed'
);

-- Herrería: 16 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Herrería')
 where id in (
  '10c0a029-9d78-4884-85bd-cec0e0c8f7e7',
  '16b55472-e333-4b70-9324-384e24f484a0',
  '2501c0c6-4616-4996-bcc9-5dfc5bacaf98',
  '327695fd-8c57-4619-a5a4-94a1789a7e5a',
  '335923e9-c7a6-4bc7-9b44-39dea9898c29',
  '53213c0f-9f0a-4f64-beca-64d595e9fd99',
  '5a776b8c-6d8f-43ad-ad9e-18354e9c4786',
  '6ec4d9c4-8b80-4ecf-a686-4ac72201929a',
  '82c49cf0-70a2-4e40-9eee-f0f31d73d535',
  'bd572abd-4d11-4c02-8f73-d977258072a5',
  'd2cdeef5-654e-44d3-8993-cf3c04d4f58f',
  'dd4ddf69-f90d-4f0d-ac1b-c858cd89eac3',
  '3883241f-a539-47d5-a0ca-02b8d50ed1f4',
  '98def276-146e-405c-b5b0-2e6db713d9b1',
  'c044b9ef-6003-4d75-b4f6-a7e52de54a00',
  'd603473c-bcb6-4b61-b1b8-fa911f7b9c55'
);

-- Electrodomésticos: 13 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Electrodomésticos')
 where id in (
  '2176cf72-d0c3-413f-ae8f-8785be0dab6a',
  '8803ceee-6654-42d5-a057-41cc3ba79260',
  '2f439668-5226-424e-b054-413135161e3b',
  '3c3b6a8d-7ae2-4682-867e-91fcc8e411a4',
  '45d6ce8b-b0aa-4180-995b-df2f3a38ce41',
  '46b7c591-8e31-4943-b576-e8beb2ded1b6',
  '67c5725c-7f0c-479b-b496-f4f024604004',
  '69925b9b-273c-408c-af42-2f1e52d9186d',
  '7789cc25-69a3-4c40-8aa7-0191b634d3eb',
  '919ed30c-8a0e-48cc-bf1d-69cfa1e423e6',
  'ab1a63f0-d275-4d3f-8894-cdc03769a05e',
  'e5fc5e88-3b58-48c6-8464-69f9df1fc8d5',
  'f4bf9a06-066c-471b-b6fc-a30d1e23ba92'
);

-- Griferías: 11 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Griferías')
 where id in (
  '080752c2-8faa-4012-acdc-5a84ced52f24',
  '097716a8-5c97-4d75-b412-049ab02ada8f',
  '1edded56-eac9-404f-8159-c77c9a033869',
  '65349c90-9beb-482c-9085-ace8b9de4991',
  'ad170c62-bcdb-42b6-8674-8a016ef23e92',
  'c829678b-e9fe-42c4-8540-dc84fc102e65',
  '5f33610f-1b58-4e44-8840-d30db1660ec1',
  '5f5ebc3f-3166-4dc2-95ed-eb984b738b17',
  '923434be-2370-4380-a9ca-76fb2b9f65a9',
  'deb7f716-5e8b-479a-9562-955072bd76d6',
  'e93d04c9-3658-4b32-b673-013bb6d36ce0'
);

-- Maderas: 2 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Maderas')
 where id in (
  '32f26063-73d9-4102-85a7-8fa74b94eb96',
  'e0e5ae30-9bb4-4b1b-be50-c45303c2df14'
);

-- Laminación: 2 materiales
update public.panol_materiales
   set categoria_id = (select id from public.panol_categorias where nombre = 'Laminación')
 where id in (
  '16e95373-fd12-4674-8213-7ec42bb21a2f',
  'b48fd85a-9ff7-46e9-9dad-0ff901cceaa2'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rubros que se disuelven
--
-- Tapicería: sus 6 ítems eran soportes de metal de los bancos, no tapizado.
-- Tanques: eran tapas, venteos, visores y mangueras; van a Mecánica y Sanitarios.
--
-- El delete sólo corre si quedaron vacíos. Si algo quedó adentro, no se borra
-- y lo vas a ver en el control de abajo.
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.panol_categorias c
 where c.nombre in ('Tapicería', 'Tanques')
   and not exists (select 1 from public.panol_materiales m where m.categoria_id = c.id)
   and not exists (select 1 from public.panol_categorias h where h.parent_id = c.id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Jerarquía
--
-- Broncería cuelga de Mecánica y Griferías de Sanitarios: se leen como rubro
-- propio en las listas, pero se pueden sumar al padre cuando hace falta.
-- ─────────────────────────────────────────────────────────────────────────────
update public.panol_categorias
   set parent_id = (select id from public.panol_categorias where nombre = 'Mecánica')
 where nombre = 'Broncería';

update public.panol_categorias
   set parent_id = (select id from public.panol_categorias where nombre = 'Sanitarios')
 where nombre = 'Griferías';

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- CONTROL
-- ═════════════════════════════════════════════════════════════════════════════
select coalesce(p.nombre || ' / ', '') || c.nombre as rubro,
       count(m.id)                                 as materiales,
       count(m.id) filter (where m.es_consumible)  as consumibles
  from public.panol_categorias c
  left join public.panol_categorias p on p.id = c.parent_id
  left join public.panol_materiales m on m.categoria_id = c.id
 group by 1
 order by 2 desc;

-- Tiene que dar 0: nada puede quedar sin categoría asignada.
select count(*) as sin_categoria_debe_dar_0
  from public.panol_materiales where categoria_id is null;

-- Tiene que dar 0 filas: los dos rubros disueltos ya no existen.
select nombre from public.panol_categorias where nombre in ('Tapicería', 'Tanques', 'Sin categoría', 'Carpintería y varios');
