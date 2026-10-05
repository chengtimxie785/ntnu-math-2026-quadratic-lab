-- 修正 2：作答紀錄格式檢查＋統計查詢略過格式錯誤的紀錄
-- 到 Supabase SQL Editor 執行這份即可（只會重新建立 admin_quiz_stats 與 log_event 兩個函式，不會動到資料）

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
