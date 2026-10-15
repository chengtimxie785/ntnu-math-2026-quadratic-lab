-- =====================================================================
-- 2026-10-15 更新（在 update_level6.sql 之後執行；可重複執行）
--   每一題做完就覆蓋那一題：作答紀錄帶 slot（第幾題，第 1～5 關 0～4、第 6 關 0～9），
--   同一人同一關同一題只保留最新一筆；其他題的舊紀錄保留
--   成績改由作答紀錄計算：每題分數由後端依「答對與否＋作答毫秒」算出（存在 payload.pts），
--   排行榜、我的成績都是加總每一題最新的分數；quiz_attempts 表不再使用（保留不刪）
--   ⚠ 執行時會清空所有測驗作答紀錄與闖關成績（舊紀錄沒有 slot，無法逐題覆蓋）
-- =====================================================================

-- ---------- 清空舊資料 ----------
delete from public.events where page like 'quiz%';
delete from public.quiz_attempts where true;

-- ---------- 每題分數：答對 20 分＋速度加分（秒數無條件進位，2 秒內 +10，之後每 2 秒少 1，超過 20 秒 0） ----------
create or replace function public._quiz_pts(ok boolean, ms bigint)
returns int language sql immutable set search_path = public as $$
  select case when ok then
    20 + greatest(0, 10 - floor((greatest(1, ceil(ms / 1000.0)) - 1) / 2))::int
  else 0 end;
$$;

-- ---------- 作答紀錄：同一人同一關同一題只留最新一筆 ----------
create or replace function public.log_event(tok text, pg text, k text, p jsonb default null, ok boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  dm boolean;
begin
  if sid is null and not public._is_admin() then
    raise exception '請重新登入' using errcode = 'P0001';
  end if;
  if p is not null and octet_length(p::text) > 8000 then
    raise exception '資料太大' using errcode = 'P0001';
  end if;
  if pg like 'quiz%' and (
       pg !~ '^quiz[1-6]$' or k <> 'answer' or p is null or ok is null
       or coalesce(p ->> 'level', '') !~ '^[1-6]$' or 'quiz' || (p ->> 'level') <> pg
       or coalesce(p ->> 'sig', '') = '' or jsonb_typeof(p -> 'choices') is distinct from 'array'
       or coalesce(p ->> 'answer', '') !~ '^[0-9]$'
       or coalesce(p ->> 'slot', '') !~ '^[0-9]$'
       or (p ->> 'slot')::int >= case when pg = 'quiz6' then 10 else 5 end
       or coalesce(p ->> 'ms', '') !~ '^[0-9]{1,9}$'
     ) then
    raise exception '作答紀錄格式不正確' using errcode = 'P0001';
  end if;
  dm := sid is null or public._is_admin();
  if pg like 'quiz%' then
    delete from public.events
      where page = pg and kind = 'answer' and student_id is not distinct from sid and demo = dm
        and payload ->> 'slot' = p ->> 'slot';
    p := p || jsonb_build_object('pts', public._quiz_pts(ok, (p ->> 'ms')::bigint));
  end if;
  insert into public.events (student_id, demo, page, kind, payload, correct)
  values (sid, dm, left(pg, 40), left(k, 40), p, ok);
end;
$$;

-- ---------- 每人每關的分數（內部用）：加總每一題最新的分數 ----------
create or replace function public._quiz_level_scores()
returns table (student_id text, demo boolean, level int, score bigint, ms bigint)
language sql stable security definer set search_path = public as $$
  select e.student_id, e.demo, (e.payload ->> 'level')::int,
         sum((e.payload ->> 'pts')::int)::bigint, sum((e.payload ->> 'ms')::bigint)::bigint
  from public.events e
  where e.page like 'quiz%' and e.kind = 'answer' and e.payload ? 'pts'
  group by e.student_id, e.demo, (e.payload ->> 'level')::int;
$$;

-- ---------- 排行榜計算（內部用）：各關分數加總；同總分比總時間 ----------
create or replace function public._quiz_ranking()
returns table (student_id text, nickname text, total bigint, levels bigint, ms bigint, rk bigint)
language sql stable security definer set search_path = public as $$
  with tot as (
    select s.student_id, sum(s.score)::bigint total, count(*)::bigint levels, sum(s.ms)::bigint ms
    from public._quiz_level_scores() s
    where not s.demo and s.student_id is not null
    group by s.student_id
  )
  select t.student_id, r.nickname, t.total, t.levels, t.ms,
         rank() over (order by t.total desc, t.ms asc) rk
  from tot t join public.roster r on r.student_id = t.student_id
  where r.active;
$$;

-- ---------- 我在每一關的分數 {"1": 120, "6": 260} ----------
create or replace function public.my_quiz_best(tok text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(level::text, score), '{}'::jsonb)
  from public._quiz_level_scores()
  where student_id = public._session_sid(tok) and not demo;
$$;

-- ---------- 結算：成績已經逐題記錄，這裡只回傳這一關目前的分數（參數 sc、cor、dur 保留但不使用） ----------
create or replace function public.submit_quiz(tok text, lv int, sc int, cor int, dur int)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  dm boolean := sid is null or public._is_admin();
begin
  if sid is null and not public._is_admin() then raise exception '請重新登入' using errcode = 'P0001'; end if;
  if lv not between 1 and 6 then raise exception '關卡不正確' using errcode = 'P0001'; end if;
  return coalesce((select s.score from public._quiz_level_scores() s
                   where s.level = lv and s.student_id is not distinct from sid and s.demo = dm), 0);
end;
$$;

revoke all on function public._quiz_pts(boolean, bigint), public._quiz_level_scores(), public._quiz_ranking()
  from public, anon, authenticated;
grant execute on function
  public.log_event(text, text, text, jsonb, boolean), public.submit_quiz(text, int, int, int, int),
  public.my_quiz_best(text)
to anon, authenticated;

-- ---------- 檢查（可選）：執行後應回傳 30、29、21、20、0 ----------
-- select public._quiz_pts(true, 1500), public._quiz_pts(true, 2001), public._quiz_pts(true, 20000),
--        public._quiz_pts(true, 20001), public._quiz_pts(false, 1000);
