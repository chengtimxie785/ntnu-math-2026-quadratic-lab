-- =====================================================================
-- 2026-10-09 更新（在 schema.sql、update_quiz.sql、fix_*.sql 之後執行；可重複執行）
--   1. 學生動態：記錄每位學生目前在哪一頁，給管理頁與大螢幕看板看
--   2. 新計分：每題 20 分（全對 100）＋速度加分（15 秒內 +10、30 秒內 +5），每關最高 150
--      舊規則的闖關成績全部清空
--   3. 暱稱不可重複（不分大小寫、忽略前後空白）
-- 注意：之後如果重新執行 schema.sql，它會收回所有函式權限，要再執行一次本檔
-- =====================================================================

-- ---------- 1. 學生動態 ----------
create table if not exists public.presence (
  student_id text primary key references public.roster(student_id) on delete cascade,
  page       text not null,
  updated_at timestamptz not null default now()
);
alter table public.presence enable row level security;

-- 學生端每次換頁、以及每 4 秒輪詢時呼叫：記下所在頁面，回傳內容與 get_state 相同
create or replace function public.ping(tok text, pg text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
begin
  if sid is not null and coalesce(pg, '') ~ '^[a-z0-9]{1,20}$' then
    insert into public.presence (student_id, page, updated_at) values (sid, pg, now())
    on conflict (student_id) do update set page = excluded.page, updated_at = excluded.updated_at;
  end if;
  return public.get_state(tok);
end;
$$;

-- 老師用：每位啟用中學生的所在頁面與最後回報距今秒數（以伺服器時間計算）
create or replace function public.admin_presence()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'student_id', r.student_id, 'name', r.name, 'nickname', r.nickname, 'is_temp', r.is_temp,
      'page', p.page,
      'age', case when p.updated_at is null then null else floor(extract(epoch from now() - p.updated_at))::int end,
      'login', exists (select 1 from public.sessions s where s.student_id = r.student_id and s.expires_at > now())
    ) order by r.is_temp, r.student_id)
    from public.roster r left join public.presence p on p.student_id = r.student_id
    where r.active and r.role = 'student'), '[]'::jsonb);
end;
$$;

-- 登出、被強制登出時一併清掉所在頁面
create or replace function public.logout(tok text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.presence where student_id = public._session_sid(tok);
  delete from public.sessions where token = tok;
end;
$$;

create or replace function public.admin_kick(sid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.sessions where student_id = sid;
  delete from public.presence where student_id = sid;
end;
$$;

-- ---------- 2. 新計分 ----------
-- 舊規則（最高 1150）的成績全部清空，再把上限改成 150
delete from public.quiz_attempts where true;
alter table public.quiz_attempts drop constraint if exists quiz_attempts_score_check;
alter table public.quiz_attempts add constraint quiz_attempts_score_check check (score between 0 and 150);

-- 送出一關的成績；回傳這一關的個人最高分
-- 分數不能超過「答對題數 × 30」（每題 20 ＋ 速度最多 10）
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

-- ---------- 3. 暱稱不可重複 ----------
create or replace function public.set_nickname(tok text, nick text)
returns text language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  n text := btrim(regexp_replace(coalesce(nick, ''), '\s+', ' ', 'g'));
begin
  if sid is null then raise exception '請重新登入' using errcode = 'P0001'; end if;
  if char_length(n) < 1 or char_length(n) > 8 then
    raise exception '暱稱請在 1 到 8 個字之間' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.roster where lower(btrim(nickname)) = lower(n) and student_id <> sid) then
    raise exception '這個暱稱已經有人用了，請換一個' using errcode = 'P0001';
  end if;
  begin
    update public.roster set nickname = n where student_id = sid;
  exception when unique_violation then   -- 兩個人同時搶同一個暱稱
    raise exception '這個暱稱已經有人用了，請換一個' using errcode = 'P0001';
  end;
  return n;
end;
$$;

create or replace function public.admin_set_nickname(sid text, nick text)
returns void language plpgsql security definer set search_path = public as $$
declare
  n text := nullif(btrim(regexp_replace(coalesce(nick, ''), '\s+', ' ', 'g')), '');
begin
  perform public._require_admin();
  if n is not null and exists (select 1 from public.roster where lower(btrim(nickname)) = lower(n) and student_id <> sid) then
    raise exception '這個暱稱已經有人用了' using errcode = 'P0001';
  end if;
  update public.roster set nickname = n where student_id = sid;
end;
$$;

-- 唯一索引：資料庫裡已經有重複暱稱時先不建立（上面的函式仍會擋新的重複），
-- 並在最後列出重複的帳號；在管理頁清除其中一人的暱稱後，再執行一次本檔即可
do $$
begin
  if exists (select 1 from public.roster where nickname is not null
             group by lower(btrim(nickname)) having count(*) > 1) then
    raise notice '有重複的暱稱，暫時沒有建立唯一索引，請看下方列出的帳號';
  else
    create unique index if not exists roster_nickname_unique
      on public.roster (lower(btrim(nickname))) where nickname is not null;
  end if;
end;
$$;

-- ---------- 權限 ----------
revoke all on function public.ping(text, text), public.admin_presence() from public;
grant execute on function
  public.ping(text, text), public.admin_presence(), public.logout(text), public.admin_kick(text),
  public.submit_quiz(text, int, int, int, int), public.set_nickname(text, text), public.admin_set_nickname(text, text)
to anon, authenticated;

-- 執行結果：列出重複的暱稱（沒有任何列＝沒有重複，唯一索引已建立）
select student_id, nickname from public.roster
where nickname is not null and lower(btrim(nickname)) in (
  select lower(btrim(nickname)) from public.roster where nickname is not null
  group by 1 having count(*) > 1)
order by lower(btrim(nickname)), student_id;
