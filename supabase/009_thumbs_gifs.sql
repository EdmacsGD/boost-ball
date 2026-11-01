-- 009: clip thumbnails (a frame from the clip or the player's own picture) and GIFs in comments.
-- Every picture must be in the uploader's own folder of the clip-pictures bucket.

create or replace function public.bb_own_picture(url text, who uuid) returns boolean
language sql immutable set search_path = '' as $$
  select url like 'https://wfsinljudtgjkzrulsdo.supabase.co/storage/v1/object/public/clip-pictures/' || who::text || '/%'
     and url !~ '[\s"''<>]';
$$;

alter table public.clips add column if not exists thumb text;
alter table public.clip_comments add column if not exists gif text;

-- A comment can be only a GIF now.
alter table public.clip_comments drop constraint if exists clip_comments_body_check;
alter table public.clip_comments add constraint clip_comments_body_check
  check (char_length(body) <= 200 and (char_length(btrim(body)) >= 1 or gif is not null));

-- Comments: filter, own GIF only.
create or replace function public.bb_comment_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.clip_comments c where c.author = new.author and c.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'comment limit: slow down';
  end if;
  if public.bb_bad_word(new.body) is not null then raise exception 'bad word: comment'; end if;
  if new.gif is not null and not public.bb_own_picture(new.gif, new.author) then raise exception 'comment: GIF must be your own upload'; end if;
  new.author_name := coalesce((select case when p.name_flagged then 'Player' else left(p.name, 16) end from public.profiles p where p.id = new.author), 'Player');
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;

-- Clips: the thumbnail must be the author's own upload.
create or replace function public.bb_clip_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.clips c where c.author = new.author and c.created_at > now() - interval '1 day') >= 15 then
    raise exception 'clip limit: 15 a day';
  end if;
  if public.bb_bad_word(new.title) is not null then raise exception 'bad word: title'; end if;
  perform public.bb_check_overlays(new.overlays, new.author);
  if new.thumb is not null and not public.bb_own_picture(new.thumb, new.author) then raise exception 'thumbnail must be your own upload'; end if;
  new.author_name := coalesce((select case when p.name_flagged then 'Player' else left(p.name, 16) end from public.profiles p where p.id = new.author), 'Player');
  new.like_count := 0;
  new.comment_count := 0;
  new.report_count := 0;
  new.view_count := 0;
  new.hidden := false;
  new.created_at := now();
  return new;
end $$;

-- Update guard: also lets the owner's thumbnail change through (bb_set_thumb).
create or replace function public.bb_clip_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if current_setting('bb.counting', true) = 'views' then
    new := old;
    new.view_count := old.view_count + 1;
    return new;
  end if;
  if current_setting('bb.counting', true) = 'thumb' then
    t := new.thumb;
    new := old;
    new.thumb := t;
    return new;
  end if;
  new.author := old.author; new.author_name := old.author_name; new.title := old.title; new.data := old.data;
  new.duration := old.duration; new.mode := old.mode; new.arena := old.arena; new.created_at := old.created_at;
  new.like_count := old.like_count; new.comment_count := old.comment_count;
  new.view_count := old.view_count; new.overlays := old.overlays; new.thumb := old.thumb;
  if not new.hidden then new.report_count := 0; end if;
  return new;
end $$;

-- The author sets (or changes) the thumbnail of one of their clips.
create or replace function public.bb_set_thumb(p_clip uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.clips where id = p_clip and author = me) then raise exception 'not your clip'; end if;
  if not public.bb_own_picture(p_url, me) then raise exception 'thumbnail must be your own upload'; end if;
  perform set_config('bb.counting', 'thumb', true);
  update public.clips set thumb = p_url where id = p_clip;
  perform set_config('bb.counting', '', true);
end $$;
revoke execute on function public.bb_set_thumb(uuid, text) from public, anon;
grant execute on function public.bb_set_thumb(uuid, text) to authenticated;

-- Studio rows include the thumbnail.
create or replace function public.bb_studio() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows f where f.followee = auth.uid()),
    'clips', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'mode', c.mode, 'arena', c.arena, 'duration', c.duration, 'created_at', c.created_at,
        'views', c.view_count, 'likes', c.like_count, 'comments', c.comment_count, 'hidden', c.hidden, 'thumb', c.thumb) order by c.created_at desc)
      from public.clips c where c.author = auth.uid()), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'views', d.views) order by d.day)
      from (select v.day, sum(v.n)::int as views from public.clip_views v join public.clips c on c.id = v.clip_id
            where c.author = auth.uid() and v.day > current_date - 14 group by v.day) d), '[]'::jsonb)
  );
$$;

-- GIFs can be bigger than stickers (they cannot be shrunk in the browser): 2 MB.
update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'] where id = 'clip-pictures';

revoke execute on function public.bb_clip_before_insert() from public, anon, authenticated;
revoke execute on function public.bb_clip_before_update() from public, anon, authenticated;
revoke execute on function public.bb_comment_before_insert() from public, anon, authenticated;
