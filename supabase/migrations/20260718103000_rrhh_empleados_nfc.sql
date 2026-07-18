-- Identificacion NFC/RFID de empleados para egresos de panol.
-- Cada tarjeta queda vinculada al maestro de RRHH; el egreso usa ese dato
-- para mostrar foto/nombre de quien retira y autocompletar el receptor.

alter table public.rrhh_empleados
  add column if not exists nfc_uid text,
  add column if not exists foto_url text,
  add column if not exists nfc_asignado_at timestamptz,
  add column if not exists nfc_asignado_por uuid references public.profiles(id) on delete set null;

create unique index if not exists rrhh_empleados_nfc_uid_unique
  on public.rrhh_empleados (lower(btrim(nfc_uid)))
  where nfc_uid is not null and btrim(nfc_uid) <> '';

create index if not exists idx_rrhh_empleados_nfc_uid
  on public.rrhh_empleados(nfc_uid)
  where nfc_uid is not null and btrim(nfc_uid) <> '';

comment on column public.rrhh_empleados.nfc_uid is
  'UID/codigo de tarjeta NFC/RFID asignado al empleado. Normalizado en mayusculas sin separadores.';

comment on column public.rrhh_empleados.foto_url is
  'URL de foto/avatar del empleado para validacion visual en panol.';

comment on column public.rrhh_empleados.nfc_asignado_at is
  'Fecha en que se asigno o modifico la tarjeta NFC del empleado.';

comment on column public.rrhh_empleados.nfc_asignado_por is
  'Usuario que asigno o modifico la tarjeta NFC del empleado.';
