-- Supabase SQL Editor에서 실행합니다. 공개 API에는 회원·세션·글 테이블을 직접 허용하지 않습니다.
begin;
create table if not exists public.matzip_members (
  id text primary key check (id ~ '^[a-zA-Z0-9_]{4,20}$'),
  name text not null check (length(name) between 1 and 30),
  email text not null unique,
  salt text not null,
  password_hash text not null,
  iterations integer not null default 310000,
  created_at timestamptz not null default now()
);
create unique index if not exists matzip_members_id_casefold on public.matzip_members (lower(id));
create table if not exists public.matzip_sessions (
  token_hash text primary key,
  user_id text not null references public.matzip_members(id) on delete cascade,
  expires_at timestamptz not null,
  confirmed_until timestamptz
);
create index if not exists matzip_sessions_expiry on public.matzip_sessions(expires_at);
create table if not exists public.matzip_posts (
  index bigint generated always as identity primary key,
  author_id text references public.matzip_members(id) on delete set null,
  writer text not null,
  subject text not null check (length(subject) between 1 and 120),
  content text not null check (length(content) between 1 and 10000),
  type text not null check (type in ('review','bookmark')),
  rating integer,
  restaurant jsonb,
  bookmark jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'review' and rating is not null and rating between 1 and 5 and restaurant is not null and bookmark is null)
    or (type = 'bookmark' and rating is null and restaurant is null and bookmark is not null))
);
create table if not exists public.matzip_comments (
  id uuid primary key default gen_random_uuid(),
  post_id bigint not null references public.matzip_posts(index) on delete cascade,
  author_id text references public.matzip_members(id) on delete set null,
  writer text not null,
  content text not null check (length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists matzip_comments_post on public.matzip_comments(post_id,created_at);
alter table public.matzip_members enable row level security;
alter table public.matzip_sessions enable row level security;
alter table public.matzip_posts enable row level security;
alter table public.matzip_comments enable row level security;
revoke all on public.matzip_members, public.matzip_sessions, public.matzip_posts, public.matzip_comments from anon, authenticated;
grant all on public.matzip_members, public.matzip_sessions, public.matzip_posts, public.matzip_comments to service_role;
grant usage, select on sequence public.matzip_posts_index_seq to service_role;
create or replace function public.matzip_board_list(search_text text default '', post_type text default 'all', page_number integer default 1)
returns jsonb language sql stable security invoker set search_path = public as $$
  with matched as (
    select p.* from matzip_posts p
    where (post_type = 'all' or p.type = post_type)
      and (search_text = '' or strpos(lower(concat_ws(' ', p.subject,p.content,p.writer,p.restaurant::text,p.bookmark::text)),lower(search_text)) > 0)
  ), page_rows as (
    select index,author_id,writer,subject,type,rating,restaurant,bookmark,created_at,
      (select count(*) from matzip_comments c where c.post_id = p.index) as comment_count
    from matched p order by index desc limit 8 offset ((greatest(page_number,1)-1)*8)
  )
  select jsonb_build_object('total',(select count(*) from matzip_posts),
    'matched',(select count(*) from matched), 'posts',coalesce((select jsonb_agg(to_jsonb(r) order by r.index desc) from page_rows r),'[]'::jsonb));
$$;
revoke all on function public.matzip_board_list(text,text,integer) from public, anon, authenticated;
grant execute on function public.matzip_board_list(text,text,integer) to service_role;
notify pgrst, 'reload schema';
commit;
