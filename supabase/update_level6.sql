-- =====================================================================
-- 2026-10-15 更新（在 update_overwrite.sql 之後執行；可重複執行；不會清空資料）
--   新增第 6 關「綜合挑戰」：第 1～5 關各抽 2 題，共 10 題
--   每題答對 20 分＋速度加分最多 10 分，第 6 關最高 300 分
-- =====================================================================

-- ---------- 闖關成績：關卡 1～6、分數上限 300 ----------
-- 先刪掉舊的 level／score 檢查（不論當初的名稱），再建新的
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.quiz_attempts'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~ '\m(level|score)\M'
  loop
    execute format('alter table public.quiz_attempts drop constraint %I', c);
  end loop;
end $$;
alter table public.quiz_attempts add constraint quiz_attempts_level_check check (level between 1 and 6);
alter table public.quiz_attempts add constraint quiz_attempts_score_check check (score between 0 and 300);

-- ---------- 作答紀錄：關卡範圍改為 1～6（其餘同 update_overwrite.sql） ----------
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
       or coalesce(p ->> 'att', '') !~ '^[a-z0-9]{8,32}$'
     ) then
    raise exception '作答紀錄格式不正確' using errcode = 'P0001';
  end if;
  dm := sid is null or public._is_admin();
  if pg like 'quiz%' then
    delete from public.events
      where page = pg and student_id is not distinct from sid and demo = dm
        and coalesce(payload ->> 'att', '') <> p ->> 'att';
  end if;
  insert into public.events (student_id, demo, page, kind, payload, correct)
  values (sid, dm, left(pg, 40), left(k, 40), p, ok);
end;
$$;

-- ---------- 成績：第 6 關最多答對 10 題（其餘同 update_overwrite.sql） ----------
create or replace function public.submit_quiz(tok text, lv int, sc int, cor int, dur int)
returns int language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  dm boolean := sid is null or public._is_admin();
begin
  if sid is null and not public._is_admin() then raise exception '請重新登入' using errcode = 'P0001'; end if;
  if lv not between 1 and 6 or cor not between 0 and (case when lv = 6 then 10 else 5 end)
     or sc not between 20 * cor and 30 * cor then
    raise exception '成績格式不正確' using errcode = 'P0001';
  end if;
  delete from public.quiz_attempts where level = lv and student_id is not distinct from sid and demo = dm;
  insert into public.quiz_attempts (student_id, demo, level, score, correct, ms)
    values (sid, dm, lv, sc, cor, greatest(dur, 0));
  return sc;
end;
$$;

-- ---------- 老師用統計：人數為主 ----------
--   levels：每關作答人數、答對題數／作答題數（算答對率）
--   mis：每個迷思有幾個人犯過（同一人在同一關只算一次）
--   wrong：每一題的作答人數、答錯人數、各選項被幾個人選
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
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-6]$'
        group by 1
      ) t), '[]'::jsonb),
    'mis', coalesce((
      select jsonb_agg(jsonb_build_object('level', lvl, 'mis', mis, 'students', s) order by s desc)
      from (
        select (payload ->> 'level')::int lvl, payload ->> 'mis' mis, count(distinct student_id) s
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-6]$' and correct = false
        group by 1, 2
      ) t), '[]'::jsonb),
    'wrong', coalesce((
      with ans as (
        select payload ->> 'sig' sig, payload, correct, student_id, created_at
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and payload ->> 'level' ~ '^[1-6]$'
      ), pk as (
        select sig, jsonb_object_agg(pt, c) picks
        from (select sig, payload ->> 'pickedText' pt, count(distinct student_id) c from ans
              where payload ->> 'pickedText' is not null group by 1, 2) x
        group by sig
      ), grp as (
        select sig, (array_agg(payload order by created_at desc))[1] q,
               count(distinct student_id) answers_n,
               count(distinct student_id) filter (where not correct) wrong_n
        from ans
        group by sig
        having count(*) filter (where not correct) > 0
        order by 4 desc, 3 desc
        limit 80
      )
      select jsonb_agg(jsonb_build_object(
               'sig', g.sig, 'q', g.q, 'answers', g.answers_n, 'wrong', g.wrong_n,
               'picks', coalesce(p.picks, '{}'::jsonb))
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

grant execute on function
  public.log_event(text, text, text, jsonb, boolean), public.submit_quiz(text, int, int, int, int),
  public.admin_quiz_stats()
to anon, authenticated;
