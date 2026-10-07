-- Ejecutar DESPUÉS de la migración y de publicar notificaciones-push.
-- Activar pg_cron y pg_net en Database > Extensions.
-- Reemplazar los dos valores de abajo. El segundo debe coincidir EXACTAMENTE
-- con el secreto PUSH_CRON_SECRET de la función Edge, mínimo32 caracteres.
-- No usar anon key ni service_role key como secreto de cron.
begin;
do $$
declare
  v_project_url text := 'https://YOUR_PROJECT_REF.supabase.co';
  v_cron_secret text := 'REPLACE_WITH_THE_SAME_PUSH_CRON_SECRET';
  v_id uuid;
begin
  if v_project_url like '%YOUR_PROJECT_REF%' or v_cron_secret like 'REPLACE_%'
    or length(v_cron_secret) < 32 then
    raise exception 'Completar URL del proyecto y PUSH_CRON_SECRET antes de ejecutar';
  end if;
  if v_project_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then
    raise exception 'La URL debe ser la URL HTTPS del proyecto Supabase';
  end if;
  if to_regclass('cron.job') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or to_regclass('vault.secrets') is null then
    raise exception 'Activar pg_cron, pg_net y Vault en Supabase antes de ejecutar';
  end if;
  select id into v_id from vault.secrets where name='notificaciones_push_project_url';
  if v_id is null then perform vault.create_secret(v_project_url,'notificaciones_push_project_url');
  else perform vault.update_secret(v_id,v_project_url); end if;
  select id into v_id from vault.secrets where name='notificaciones_push_cron_secret';
  if v_id is null then perform vault.create_secret(v_cron_secret,'notificaciones_push_cron_secret');
  else perform vault.update_secret(v_id,v_cron_secret); end if;
end $$;

-- El texto visible del cron sólo contiene nombres de Vault, nunca el secreto.
select cron.schedule('klasea-notificaciones-push','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='notificaciones_push_project_url') || '/functions/v1/notificaciones-push',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='notificaciones_push_cron_secret')),
    body := '{"action":"process"}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
commit;

-- Comprobar sin revelar credenciales:
select jobid,jobname,schedule,active from cron.job where jobname='klasea-notificaciones-push';
-- Para pausar los envíos conservando suscripciones e historial:
-- select cron.unschedule('klasea-notificaciones-push');
