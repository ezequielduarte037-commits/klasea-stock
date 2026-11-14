insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261105180000','consumibles_catalogo_ingresos',array[]::text[])
on conflict (version) do nothing;
