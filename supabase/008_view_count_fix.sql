-- The clip update guard also undid the view counter's own update. bb_view_clip now marks its update
-- (a setting that lasts only for this transaction) and the guard lets that one through.
create or replace function public.bb_clip_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if current_setting('bb.counting', true) = 'views' then
    new := old;
    new.view_count := old.view_count + 1;
    return new;
  end if;
  new.author := old.author; new.author_name := old.author_name; new.title := old.title; new.data := old.data;
  new.duration := old.duration; new.mode := old.mode; new.arena := old.arena; new.created_at := old.created_at;
  new.like_count := old.like_count; new.comment_count := old.comment_count;
  new.view_count := old.view_count; new.overlays := old.overlays;
  if not new.hidden then new.report_count := 0; end if;
  return new;
end $$;

create or replace function public.bb_view_clip(p_clip uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); added int := 0;
begin
  if not exists (select 1 from public.clips where id = p_clip and not hidden) then return 0; end if;
  if me is not null then
    insert into public.clip_views (clip_id, viewer) values (p_clip, me) on conflict do nothing;
    get diagnostics added = row_count;
  else
    insert into public.clip_views (clip_id, viewer) values (p_clip, null)
      on conflict (clip_id, day) where viewer is null do update set n = public.clip_views.n + 1 where public.clip_views.n < 300;
    get diagnostics added = row_count;
  end if;
  if added > 0 then
    perform set_config('bb.counting', 'views', true);
    update public.clips set view_count = view_count + 1 where id = p_clip;
    perform set_config('bb.counting', '', true);
  end if;
  return (select view_count from public.clips where id = p_clip);
end $$;
revoke execute on function public.bb_clip_before_update() from public, anon, authenticated;
