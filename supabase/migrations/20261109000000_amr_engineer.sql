-- Amr becomes a regular engineer; Abdulmuin stays the head.
update public.profiles
   set role = 'engineer', can_edit = false
 where id in (select id from auth.users where lower(email) = 'amr.aswad@gmail.com');
