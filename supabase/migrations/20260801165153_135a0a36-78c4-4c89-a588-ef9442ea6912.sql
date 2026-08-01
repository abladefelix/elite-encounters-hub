insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users where email = 'kumaxilef@gmail'
on conflict (user_id, role) do nothing;

update public.profiles set account_status = 'active', suspended = false
where id in (select id from auth.users where email = 'kumaxilef@gmail');