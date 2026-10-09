-- =====================================================================
-- 測驗區更新（在 schema.sql 之後執行；可重複執行）
-- 新增：闖關成績、排行榜、我的最高分、老師用的測驗統計與錯題分析
-- 每一題的作答（含完整題目、選項、學生選了什麼、迷思代碼）寫在 events 表：
--   page = 'quiz1'～'quiz5'，kind = 'answer'，payload = 題目內容
-- =====================================================================

create table if not exists public.quiz_attempts (
  id         bigint generated always as identity primary key,
  student_id text references public.roster(student_id) on delete cascade,
  demo       boolean not null default false,
  level      int not null check (level between 1 and 5),
  score      int not null check (score between 0 and 150),    -- 5 題 ×（20 + 速度 10）；2026-10-09 起的規則
  correct    int not null check (correct between 0 and 5),
  total      int not null default 5,
  ms         int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_idx on public.quiz_attempts (level, student_id);
alter table public.quiz_attempts enable row level security;

-- 送出一關的成績；回傳這一關的個人最高分
create or replace function public.submit_quiz(tok text, lv int, sc int, cor int, dur int)
returns int language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  adm boolean := public._is_admin();
  best int;
begin
  if sid is null and not adm then raise exception '請重新登入' using errcode = 'P0001'; end if;
  if lv not between 1 and 5 or cor not between 0 and 5 or sc not between 20 * cor and 30 * cor then
    raise exception '成績格式不正確' using errcode = 'P0001';
  end if;
  insert into public.quiz_attempts (student_id, demo, level, score, correct, ms)
    values (sid, sid is null or adm, lv, sc, cor, greatest(dur, 0));
  select max(score) into best from public.quiz_attempts
    where level = lv and student_id is not distinct from sid and demo = (sid is null or adm);
  return best;
end;
$$;

-- 我在每一關的最高分 {"1": 820, "3": 560}
create or replace function public.my_quiz_best(tok text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(level::text, best), '{}'::jsonb)
  from (select level, max(score) best from public.quiz_attempts
        where student_id = public._session_sid(tok) group by level) t;
$$;

-- 排行榜計算（內部用）：每關取最高分（同分取較快），五關加總；同總分比總時間
create or replace function public._quiz_ranking()
returns table (student_id text, nickname text, total bigint, levels bigint, ms bigint, rk bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (q.student_id, q.level) q.student_id, q.level, q.score, q.ms
    from public.quiz_attempts q
    where not q.demo and q.student_id is not null
    order by q.student_id, q.level, q.score desc, q.ms asc
  ), tot as (
    select b.student_id, sum(b.score) total, count(*) levels, sum(b.ms) ms from best b group by b.student_id
  )
  select t.student_id, r.nickname, t.total, t.levels, t.ms,
         rank() over (order by t.total desc, t.ms asc) rk
  from tot t join public.roster r on r.student_id = t.student_id
  where r.active;
$$;

-- 學生看的排行榜：前 10 名只有暱稱，加上自己的名次
create or replace function public.quiz_leaderboard(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
begin
  if sid is null and not public._is_admin() then raise exception '請重新登入' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', rk, 'nickname', coalesce(nickname, '（未取暱稱）'),
                       'total', total, 'levels', levels, 'me', student_id = sid) order by rk, ms)
                     from public._quiz_ranking() where rk <= 10), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rk, 'total', total, 'levels', levels)
           from public._quiz_ranking() where student_id = sid)
  );
end;
$$;

-- 老師用：各關統計、迷思排行、錯題（依答錯人數排序）、排行榜（含學號）
create or replace function public.admin_quiz_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'level', lvl, 'players', players, 'answers', answers, 'correct', correct) order by lvl)
      from (
        select (payload ->> 'level')::int lvl, count(distinct student_id) players,
               count(*) answers, count(*) filter (where correct) correct
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-5]$'
        group by 1
      ) t), '[]'::jsonb),
    'mis', coalesce((
      select jsonb_agg(jsonb_build_object('level', lvl, 'mis', mis, 'count', n, 'students', s) order by n desc)
      from (
        select (payload ->> 'level')::int lvl, payload ->> 'mis' mis, count(*) n, count(distinct student_id) s
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-5]$' and correct = false
        group by 1, 2
      ) t), '[]'::jsonb),
    -- 錯題：同一題（sig 相同）合併；picks 是「選項文字 → 選的人次」；只取答錯人次最多的 80 題
    'wrong', coalesce((
      with ans as (
        select payload ->> 'sig' sig, payload, correct, student_id, created_at
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-5]$'
      ), pk as (
        select sig, jsonb_object_agg(pt, c) picks
        from (select sig, payload ->> 'pickedText' pt, count(*) c from ans
              where payload ->> 'pickedText' is not null group by 1, 2) x
        group by sig
      ), grp as (
        select sig, (array_agg(payload order by created_at desc))[1] q,
               count(*) answers_n,
               count(*) filter (where not correct) wrong_n,
               count(distinct student_id) filter (where not correct) students
        from ans
        group by sig
        having count(*) filter (where not correct) > 0
        order by 4 desc, 3 desc
        limit 80
      )
      select jsonb_agg(jsonb_build_object(
               'sig', g.sig, 'q', g.q, 'answers', g.answers_n, 'wrong', g.wrong_n,
               'students', g.students, 'picks', coalesce(p.picks, '{}'::jsonb))
             order by g.wrong_n desc, g.answers_n desc)
      from grp g left join pk p on p.sig = g.sig
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rk, 'nickname', coalesce(nickname, '（未取暱稱）'),
                       'student_id', student_id, 'total', total, 'levels', levels) order by rk, ms)
      from public._quiz_ranking() where rk <= 20), '[]'::jsonb)
  );
end;
$$;

-- 清除作答紀錄時一併清除闖關成績
create or replace function public.admin_reset_events()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.events where true;
  delete from public.quiz_attempts where true;
end;
$$;

revoke all on function public._quiz_ranking() from public, anon, authenticated;
grant execute on function
  public.submit_quiz(text, int, int, int, int), public.my_quiz_best(text),
  public.quiz_leaderboard(text), public.admin_quiz_stats()
to anon, authenticated;

-- 作答紀錄：大小限制＋測驗作答的格式檢查（避免被塞入過大或格式錯誤、會讓統計失敗的資料）
create or replace function public.log_event(tok text, pg text, k text, p jsonb default null, ok boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
begin
  if sid is null and not public._is_admin() then
    raise exception '請重新登入' using errcode = 'P0001';
  end if;
  if p is not null and octet_length(p::text) > 8000 then
    raise exception '資料太大' using errcode = 'P0001';
  end if;
  if pg like 'quiz%' and (
       pg !~ '^quiz[1-5]$' or k <> 'answer' or p is null or ok is null
       or coalesce(p ->> 'level', '') !~ '^[1-5]$' or 'quiz' || (p ->> 'level') <> pg
       or coalesce(p ->> 'sig', '') = '' or jsonb_typeof(p -> 'choices') is distinct from 'array'
       or coalesce(p ->> 'answer', '') !~ '^[0-9]$'
     ) then
    raise exception '作答紀錄格式不正確' using errcode = 'P0001';
  end if;
  insert into public.events (student_id, demo, page, kind, payload, correct)
  values (sid, sid is null or public._is_admin(), left(pg, 40), left(k, 40), p, ok);
end;
$$;
