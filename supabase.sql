-- Supabase → SQL Editor 에 그대로 붙여넣고 Run
create table public.progress (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  done      jsonb not null default '[]'::jsonb,
  custom    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- 본인만 읽고 쓰기
create policy "own read"   on public.progress for select using (auth.uid() = user_id);
create policy "own insert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own update" on public.progress for update using (auth.uid() = user_id);

-- (선택) 친구에게 보기 전용 공개하고 싶으면 아래 줄 앞의 -- 를 지우고 실행
--         + config.js 에서 PUBLIC_VIEW: true, OWNER_USER_ID 입력
-- create policy "public read" on public.progress for select using (true);
