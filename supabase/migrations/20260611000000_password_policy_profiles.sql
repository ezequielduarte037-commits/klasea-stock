-- Password hygiene for internal users.
-- WhatsApp links stay in public.user_phones and are not affected by password changes.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'If true, the user must change their temporary/admin-set password after login.';

create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set must_change_password = false
   where id = auth.uid();
end;
$$;

grant execute on function public.mark_password_changed() to authenticated;
