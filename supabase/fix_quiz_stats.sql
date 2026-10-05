-- 修正：錯題統計查詢（原本的寫法 Postgres 不接受：subquery uses ungrouped column）
-- 到 Supabase SQL Editor 執行這份即可（只會重新建立 admin_quiz_stats 一個函式）

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
        where page like 'quiz%' and kind = 'answer' and not demo
        group by 1
      ) t), '[]'::jsonb),
    'mis', coalesce((
      select jsonb_agg(jsonb_build_object('level', lvl, 'mis', mis, 'count', n, 'students', s) order by n desc)
      from (
        select (payload ->> 'level')::int lvl, payload ->> 'mis' mis, count(*) n, count(distinct student_id) s
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo and correct = false
        group by 1, 2
      ) t), '[]'::jsonb),
    -- 錯題：同一題（sig 相同）合併；picks 是「選項文字 → 選的人次」；只取答錯人次最多的 80 題
    'wrong', coalesce((
      with ans as (
        select payload ->> 'sig' sig, payload, correct, student_id, created_at
        from public.events
        where page like 'quiz%' and kind = 'answer' and not demo
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

