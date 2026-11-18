-- Items the server handed out always stay in the owned list, even if the page sends an older list.
do $$
declare d text := pg_get_functiondef('private.profiles_guard'::regproc);
begin
  d := replace(d,
    'where not (k = any (locked)) or k = any (earned);',
    'where not (k = any (locked)) or k = any (earned);
    select coalesce(jsonb_agg(distinct k), ''[]''::jsonb) into owned from (
      select jsonb_array_elements_text(owned) as k
      union select item from public.owned_items where player = new.id) x;');
  execute d;
end $$;
