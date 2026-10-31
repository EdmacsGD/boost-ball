-- Clips: short match recordings players post from the end-of-match screen, shown in the in-game
-- Clips feed where anyone can watch them, and signed-in players can like and comment.
-- A clip stores the recorded positions (not video), so it is small (about 50-250 KB of text).
--
-- Rules:
--  - everyone can watch clips that are not hidden; the author's name comes from their profile
--    (set by the database, so nobody can post as someone else)
--  - only the author or the owner can delete a clip; a clip with 3 reports is hidden until the owner looks
--  - limits: 15 clips a day, 30 comments per 10 minutes, per player

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  title text not null default '' check (char_length(title) <= 60),
  mode text not null default '' check (char_length(mode) <= 8),
  arena text not null default '' check (char_length(arena) <= 24),
  duration real not null check (duration > 0 and duration <= 31),
  data text not null check (char_length(data) <= 400000),
  like_count int not null default 0,
  comment_count int not null default 0,
  report_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists clips_new on public.clips (created_at desc) where not hidden;
create index if not exists clips_author on public.clips (author, created_at desc);

create table if not exists public.clip_likes (
  clip_id uuid not null references public.clips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);
create index if not exists clip_likes_user on public.clip_likes (user_id);

create table if not exists public.clip_comments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips (id) on delete cascade,
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists clip_comments_clip on public.clip_comments (clip_id, created_at);
create index if not exists clip_comments_author on public.clip_comments (author, created_at desc);

create table if not exists public.clip_reports (
  clip_id uuid not null references public.clips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);
create index if not exists clip_reports_user on public.clip_reports (user_id);

alter table public.clips enable row level security;
alter table public.clip_likes enable row level security;
alter table public.clip_comments enable row level security;
alter table public.clip_reports enable row level security;

create or replace function public.bb_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.badges b where b.player_id = (select auth.uid()) and b.badge = 'owner');
$$;

-- Clips
drop policy if exists "clips: watch" on public.clips;
create policy "clips: watch" on public.clips for select
  using (not hidden or author = (select auth.uid()) or (select public.bb_is_owner()));
drop policy if exists "clips: post own" on public.clips;
create policy "clips: post own" on public.clips for insert to authenticated
  with check (author = (select auth.uid()));
drop policy if exists "clips: delete own or owner" on public.clips;
create policy "clips: delete own or owner" on public.clips for delete to authenticated
  using (author = (select auth.uid()) or (select public.bb_is_owner()));
drop policy if exists "clips: owner unhides" on public.clips;
create policy "clips: owner unhides" on public.clips for update to authenticated
  using ((select public.bb_is_owner())) with check ((select public.bb_is_owner()));

-- Likes
drop policy if exists "likes: read" on public.clip_likes;
create policy "likes: read" on public.clip_likes for select using (true);
drop policy if exists "likes: add own" on public.clip_likes;
create policy "likes: add own" on public.clip_likes for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "likes: remove own" on public.clip_likes;
create policy "likes: remove own" on public.clip_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Comments
drop policy if exists "comments: read" on public.clip_comments;
create policy "comments: read" on public.clip_comments for select using (true);
drop policy if exists "comments: write own" on public.clip_comments;
create policy "comments: write own" on public.clip_comments for insert to authenticated
  with check (author = (select auth.uid()));
drop policy if exists "comments: delete" on public.clip_comments;
create policy "comments: delete" on public.clip_comments for delete to authenticated
  using (author = (select auth.uid()) or (select public.bb_is_owner())
    or exists (select 1 from public.clips c where c.id = clip_id and c.author = (select auth.uid())));

-- Reports (nobody reads them through the API except the owner)
drop policy if exists "reports: add own" on public.clip_reports;
create policy "reports: add own" on public.clip_reports for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "reports: owner reads" on public.clip_reports;
create policy "reports: owner reads" on public.clip_reports for select to authenticated
  using ((select public.bb_is_owner()));

-- Server-set fields and limits
create or replace function public.bb_clip_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.clips c where c.author = new.author and c.created_at > now() - interval '1 day') >= 15 then
    raise exception 'clip limit: 15 a day';
  end if;
  new.author_name := coalesce((select left(p.name, 16) from public.profiles p where p.id = new.author), 'Player');
  new.like_count := 0;
  new.comment_count := 0;
  new.report_count := 0;
  new.hidden := false;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists clip_before_insert on public.clips;
create trigger clip_before_insert before insert on public.clips for each row execute function public.bb_clip_before_insert();

create or replace function public.bb_comment_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.clip_comments c where c.author = new.author and c.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'comment limit: slow down';
  end if;
  new.author_name := coalesce((select left(p.name, 16) from public.profiles p where p.id = new.author), 'Player');
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists comment_before_insert on public.clip_comments;
create trigger comment_before_insert before insert on public.clip_comments for each row execute function public.bb_comment_before_insert();

-- Counters kept by the database.
create or replace function public.bb_clip_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.clip_id, old.clip_id); d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'clip_likes' then
    update public.clips set like_count = greatest(0, like_count + d) where id = cid;
  elsif tg_table_name = 'clip_comments' then
    update public.clips set comment_count = greatest(0, comment_count + d) where id = cid;
  elsif tg_table_name = 'clip_reports' and tg_op = 'INSERT' then
    update public.clips set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3 where id = cid;
  end if;
  return null;
end $$;
drop trigger if exists clip_likes_count on public.clip_likes;
create trigger clip_likes_count after insert or delete on public.clip_likes for each row execute function public.bb_clip_counts();
drop trigger if exists clip_comments_count on public.clip_comments;
create trigger clip_comments_count after insert or delete on public.clip_comments for each row execute function public.bb_clip_counts();
drop trigger if exists clip_reports_count on public.clip_reports;
create trigger clip_reports_count after insert on public.clip_reports for each row execute function public.bb_clip_counts();

-- The owner's update policy is only for hiding/unhiding; stop it changing anything else.
create or replace function public.bb_clip_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if; -- counter updates from the triggers above
  new.author := old.author; new.author_name := old.author_name; new.title := old.title; new.data := old.data;
  new.duration := old.duration; new.mode := old.mode; new.arena := old.arena; new.created_at := old.created_at;
  new.like_count := old.like_count; new.comment_count := old.comment_count;
  if not new.hidden then new.report_count := 0; end if;
  return new;
end $$;
drop trigger if exists clip_before_update on public.clips;
create trigger clip_before_update before update on public.clips for each row execute function public.bb_clip_before_update();

revoke execute on function public.bb_clip_before_insert() from public, anon, authenticated;
revoke execute on function public.bb_comment_before_insert() from public, anon, authenticated;
revoke execute on function public.bb_clip_counts() from public, anon, authenticated;
revoke execute on function public.bb_clip_before_update() from public, anon, authenticated;
