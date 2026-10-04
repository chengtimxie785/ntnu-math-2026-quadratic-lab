-- =====================================================================
-- 二次函數互動平台：Supabase 資料庫結構
-- 使用方式：Supabase Dashboard → SQL Editor → 貼上整份 → Run（可重複執行）
--
-- 安全設計：
--   * 所有資料表都開啟 RLS 且「不給任何 policy」，前端無法直接讀寫資料表。
--   * 前端只能呼叫下面的 RPC 函式（security definer），由函式檢查身分。
--   * 學生：用 Google 或「學號＋PIN」或「僅學號」（緊急模式）登入後，取得 app token。
--   * 管理員：必須用 Google 登入，且 email 在 admins 資料表中。
--   * 姓名只存在 roster 資料表，只有管理員函式會回傳。
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 資料表 ----------
create table if not exists public.roster (
  student_id   text primary key,                 -- 大寫學號，例如 41200000S；臨時帳號如 T01
  name         text,                             -- 姓名（只給管理員看）
  email        text unique,                      -- 小寫；Google 登入比對用
  role         text not null default 'student' check (role in ('student', 'teacher')),
  pin_hash     text,                             -- PIN 的雜湊（不存明碼）
  active       boolean not null default true,
  is_temp      boolean not null default false,
  nickname     text,
  fail_count   int not null default 0,           -- PIN 連續錯誤次數
  locked_until timestamptz,                      -- PIN 錯太多次暫時鎖住
  last_login   timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.admins (
  email      text primary key,                   -- 可以進管理頁的 Google 帳號（小寫）
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token      text primary key,
  student_id text not null references public.roster(student_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- 作答與操作紀錄（測驗區、即時統計用）
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  student_id text references public.roster(student_id) on delete set null,
  demo       boolean not null default false,     -- 老師示範時的紀錄，不列入統計
  page       text not null,
  kind       text not null,
  payload    jsonb,
  correct    boolean,
  created_at timestamptz not null default now()
);
create index if not exists events_page_idx on public.events (page, created_at);

alter table public.roster   enable row level security;
alter table public.admins   enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.events   enable row level security;

-- 預設設定：全部頁面關閉、開關全關、一般登入模式
insert into public.settings (key, value) values
  ('unlocked',   '[]'::jsonb),
  ('flags',      '{"ghostEq": false}'::jsonb),
  ('login_mode', '"normal"'::jsonb)      -- normal：Google 或 學號＋PIN；id_only：輸入學號即可
on conflict (key) do nothing;

-- ---------- 內部工具函式 ----------
create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then
    raise exception '需要管理員權限' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._setting(k text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.settings where key = k;
$$;

create or replace function public._new_session(sid text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  t text := encode(extensions.gen_random_bytes(24), 'hex');
  r public.roster;
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token, student_id, expires_at) values (t, sid, now() + interval '12 hours');
  update public.roster set last_login = now(), fail_count = 0, locked_until = null where student_id = sid
    returning * into r;
  return jsonb_build_object('token', t, 'student_id', r.student_id, 'role', r.role, 'nickname', r.nickname);
end;
$$;

create or replace function public._session_sid(tok text)
returns text language sql stable security definer set search_path = public as $$
  select s.student_id from public.sessions s
  join public.roster r on r.student_id = s.student_id
  where s.token = tok and s.expires_at > now() and r.active;
$$;

-- ---------- 公開函式（未登入也能呼叫） ----------

-- 登入頁要知道目前是哪種登入模式
create or replace function public.get_login_mode()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(public._setting('login_mode') #>> '{}', 'normal');
$$;

-- 學號＋PIN 登入（一般模式）；僅學號模式下 PIN 可省略
create or replace function public.login_pin(sid text, pin text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.roster;
  mode text := public.get_login_mode();
begin
  select * into r from public.roster where student_id = upper(trim(sid));
  if r.student_id is null or not r.active then
    raise exception '找不到這個學號，或帳號已停用' using errcode = 'P0001';
  end if;
  if mode = 'id_only' then
    return public._new_session(r.student_id);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    raise exception 'PIN 錯誤太多次，請 5 分鐘後再試，或找老師協助' using errcode = 'P0001';
  end if;
  if r.pin_hash is null then
    raise exception '這個帳號還沒有 PIN，請找老師拿 PIN 或改用 Google 登入' using errcode = 'P0001';
  end if;
  if r.pin_hash <> extensions.crypt(coalesce(pin, ''), r.pin_hash) then
    update public.roster
      set fail_count = fail_count + 1,
          locked_until = case when fail_count + 1 >= 5 then now() + interval '5 minutes' else null end
      where student_id = r.student_id;
    raise exception 'PIN 不正確' using errcode = 'P0001';
  end if;
  return public._new_session(r.student_id);
end;
$$;

-- Google 登入：先用 Supabase Auth 登入 Google，再呼叫這個函式換成 app token
create or replace function public.login_google()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  r public.roster;
  res jsonb;
begin
  if em = '' then
    raise exception '請先用 Google 登入' using errcode = 'P0001';
  end if;
  select * into r from public.roster where email = em;
  if r.student_id is null then
    -- 不在名單內：若是管理員，仍回傳管理員身分（可進管理頁、可用全部功能）
    if public._is_admin() then
      return jsonb_build_object('token', null, 'admin', true, 'email', em);
    end if;
    raise exception '這個 Google 帳號（%）不在名單內，請改用學號＋PIN 登入或找老師協助', em using errcode = 'P0001';
  end if;
  if not r.active then
    raise exception '帳號已停用，請找老師協助' using errcode = 'P0001';
  end if;
  res := public._new_session(r.student_id);
  return res || jsonb_build_object('admin', public._is_admin(), 'email', em);
end;
$$;

-- ---------- 學生函式（需要 app token） ----------

-- 取得目前狀態：自己的資料與課堂設定（前端每幾秒呼叫一次）
create or replace function public.get_state(tok text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
  me jsonb := null;
  adm boolean := public._is_admin();
begin
  if sid is not null then
    select jsonb_build_object('student_id', student_id, 'role', role, 'nickname', nickname)
      into me from public.roster where student_id = sid;
  end if;
  return jsonb_build_object(
    'me', me,
    'admin', adm,
    'unlocked', coalesce(public._setting('unlocked'), '[]'::jsonb),
    'flags', coalesce(public._setting('flags'), '{}'::jsonb),
    'login_mode', public.get_login_mode()
  );
end;
$$;

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
  update public.roster set nickname = n where student_id = sid;
  return n;
end;
$$;

create or replace function public.logout(tok text)
returns void language sql security definer set search_path = public as $$
  delete from public.sessions where token = tok;
$$;

-- 記錄作答或操作（測驗區用）
create or replace function public.log_event(tok text, pg text, k text, p jsonb default null, ok boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  sid text := public._session_sid(tok);
begin
  if sid is null and not public._is_admin() then
    raise exception '請重新登入' using errcode = 'P0001';
  end if;
  insert into public.events (student_id, demo, page, kind, payload, correct)
  values (sid, sid is null or public._is_admin(), left(pg, 40), left(k, 40), p, ok);
end;
$$;

-- ---------- 管理員函式（必須是 admins 表中的 Google 帳號） ----------

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'unlocked', public._setting('unlocked'),
    'flags', public._setting('flags'),
    'login_mode', public.get_login_mode(),
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', student_id, 'name', name, 'email', email, 'role', role,
        'active', active, 'is_temp', is_temp, 'nickname', nickname,
        'has_pin', pin_hash is not null, 'last_login', last_login,
        'online', exists (select 1 from public.sessions s where s.student_id = r.student_id and s.expires_at > now())
      ) order by is_temp, role desc, student_id)
      from public.roster r), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'note', note) order by created_at) from public.admins), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_setting(k text, v jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if k not in ('unlocked', 'flags', 'login_mode') then
    raise exception '未知的設定：%', k;
  end if;
  insert into public.settings (key, value) values (k, v)
    on conflict (key) do update set value = excluded.value;
end;
$$;

-- 新增或修改一位人員（學號、姓名、email、角色）
create or replace function public.admin_upsert_person(sid text, nm text, em text, rl text default 'student', tmp boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.roster (student_id, name, email, role, is_temp)
  values (upper(trim(sid)), nullif(trim(nm), ''), nullif(lower(trim(em)), ''), coalesce(rl, 'student'), coalesce(tmp, false))
  on conflict (student_id) do update
    set name = excluded.name, email = excluded.email, role = excluded.role, is_temp = excluded.is_temp;
end;
$$;

create or replace function public.admin_set_active(sid text, on_ boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.roster set active = on_ where student_id = sid;
  if not on_ then delete from public.sessions where student_id = sid; end if;
end;
$$;

-- 產生新的 4 位數 PIN，回傳明碼（只顯示這一次）
create or replace function public.admin_new_pin(sid text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  p text := lpad((floor(random() * 10000))::int::text, 4, '0');
begin
  perform public._require_admin();
  update public.roster
    set pin_hash = extensions.crypt(p, extensions.gen_salt('bf')), fail_count = 0, locked_until = null
    where student_id = sid;
  if not found then raise exception '找不到 %', sid; end if;
  return p;
end;
$$;

create or replace function public.admin_set_nickname(sid text, nick text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.roster set nickname = nullif(btrim(nick), '') where student_id = sid;
end;
$$;

create or replace function public.admin_delete_person(sid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.roster where student_id = sid;
end;
$$;

-- 讓某人登出（刪除他所有的 session）
create or replace function public.admin_kick(sid text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.sessions where student_id = sid;
end;
$$;

create or replace function public.admin_add_admin(em text, nt text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  insert into public.admins (email, note) values (lower(trim(em)), nt) on conflict (email) do update set note = excluded.note;
end;
$$;

create or replace function public.admin_remove_admin(em text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if lower(trim(em)) = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception '不能移除自己（避免把自己鎖在外面）';
  end if;
  delete from public.admins where email = lower(trim(em));
end;
$$;

-- 清除作答紀錄（正式試教前清掉練習時的資料）
create or replace function public.admin_reset_events()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.events where true;
end;
$$;

-- ---------- 權限：前端（anon、authenticated）只能執行公開函式 ----------
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.get_login_mode(), public.login_pin(text, text), public.login_google(),
  public.get_state(text), public.set_nickname(text, text), public.logout(text),
  public.log_event(text, text, text, jsonb, boolean),
  public.admin_overview(), public.admin_set_setting(text, jsonb),
  public.admin_upsert_person(text, text, text, text, boolean), public.admin_set_active(text, boolean),
  public.admin_new_pin(text), public.admin_set_nickname(text, text), public.admin_delete_person(text),
  public.admin_kick(text), public.admin_add_admin(text, text), public.admin_remove_admin(text),
  public.admin_reset_events()
to anon, authenticated;
