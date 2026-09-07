-- Dar de baja usuarios sin borrarlos.
--
-- POR QUE. A un ex-empleado no se lo puede borrar: seis tablas lo referencian
-- con ON DELETE RESTRICT porque son su historial de trabajo —
-- purchase_requests.created_by, request_comments.author_id,
-- purchase_log.created_by, panol_envios.created_by, compras_avisos.created_by y
-- compras_aviso_comentarios.author_id. Borrarlo dejaría 105 pedidos de compra
-- sin autor. El RESTRICT está bien puesto: el que sobra es el botón "Eliminar".
--
-- Así que la baja no borra nada. Marca el perfil como inactivo (para que
-- desaparezca de las listas) y el corte real del acceso lo hace el ban en
-- auth.users, que la edge function admin-usuarios aplica en la misma operación:
-- sin token no entra ni aunque el front tuviera un bug.
--
-- Borrar sigue estando disponible para usuarios sin historial (los de prueba,
-- los que se crearon por error).

alter table public.profiles
  add column if not exists activo boolean not null default true;

comment on column public.profiles.activo is
  'false = usuario dado de baja: no puede ingresar y no aparece en las listas. Su historial (pedidos, envíos, comentarios) se conserva con el autor intacto.';
