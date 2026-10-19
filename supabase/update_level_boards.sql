-- =====================================================================
-- 2026-10-19 更新（在 update_per_question.sql 之後執行；可重複執行，不會清除任何資料）
--   排行榜改成「總排行」＋「第 1～6 關各一個」：新增 quiz_boards(tok)，一次回傳
--     all     總排行前 10 名（各關分數加總；同總分比總作答時間）
--     me      自己在總排行的名次
--     levels  {"1": [...], …, "6": [...]} 各關前 10 名（同分比這一關的作答時間）
--     mine    {"1": {"rank": 3, "total": 120}, …} 自己在各關的名次
--   學生與管理員（大螢幕看板）都可以呼叫；只回傳暱稱，不回傳學號
-- =====================================================================

create or replace function public.quiz_boards(tok text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
begin
  if sid is null and not public._is_admin() then raise exception '請重新登入' using errcode = 'P0001'; end if;
  return (
    with lv as (
      select s.level, s.student_id, r.nickname, s.score, s.ms,
             rank() over (partition by s.level order by s.score desc, s.ms asc) rk
      from public._quiz_level_scores() s
      join public.roster r on r.student_id = s.student_id
      where not s.demo and s.student_id is not null and r.active
    ),
    al as (select * from public._quiz_ranking())
    select jsonb_build_object(
      'all', coalesce((select jsonb_agg(jsonb_build_object(
                 'rank', rk, 'nickname', coalesce(nickname, '（未取暱稱）'), 'total', total, 'levels', levels,
                 'me', coalesce(student_id = sid, false)) order by rk, ms)
               from al where rk <= 10), '[]'::jsonb),
      'me', (select jsonb_build_object('rank', rk, 'total', total, 'levels', levels) from al where student_id = sid),
      'levels', coalesce((select jsonb_object_agg(level::text, rows) from (
                   select level, jsonb_agg(jsonb_build_object(
                     'rank', rk, 'nickname', coalesce(nickname, '（未取暱稱）'), 'total', score,
                     'me', coalesce(student_id = sid, false)) order by rk, ms) rows
                   from lv where rk <= 10 group by level) x), '{}'::jsonb),
      'mine', coalesce((select jsonb_object_agg(level::text, jsonb_build_object('rank', rk, 'total', score))
                        from lv where student_id = sid), '{}'::jsonb)
    )
  );
end;
$$;

grant execute on function public.quiz_boards(text) to anon, authenticated;
