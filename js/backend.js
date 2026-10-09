// 與 Supabase 溝通：登入、取得課堂設定、管理員功能
//
// 身分有兩層：
//   1. app token：學生用 Google 或「學號＋PIN」登入後取得，存在 localStorage，呼叫學生函式時帶上
//   2. Supabase Auth（Google）session：管理員進管理頁時需要；後端用它的 email 判斷是否為管理員

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { applySettings, applyDevSettings, setAdmin } from './settings.js';

const TOKEN_KEY = 'qlab-token';
const PENDING_KEY = 'qlab-google-pending';
const POLL_MS = 4000;

let sb = null;
export const session = {
  token: null,        // app token
  me: null,           // { student_id, role, nickname }
  admin: false,       // 目前的 Google 帳號是否為管理員
  email: null,        // Google 登入的 email
  offline: false,     // 連不到 Supabase 時為 true（全部開放、無法登入）
  loginMode: 'normal',
  here: null,         // 目前所在頁面（回報給老師端的學生動態）
};

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
  } catch (_) { /* 私密模式 */ }
  return null;
}

async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
  }
  return sb;
}

// 把資料庫丟出的錯誤轉成給人看的訊息
function niceError(error) {
  const m = error?.message || String(error);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '連不到伺服器，請檢查網路後再試一次。';
  return m.replace(/^.*?ERROR:\s*/, '');
}

export async function rpc(name, args = {}) {
  const c = await client();
  const { data, error } = await c.rpc(name, args);
  if (error) throw new Error(niceError(error));
  return data;
}

function applyState(st) {
  session.me = st.me || null;
  session.admin = !!st.admin;
  session.loginMode = st.login_mode || 'normal';
  setAdmin(session.admin);
  applySettings({ unlocked: st.unlocked || [], flags: st.flags || {}, loginMode: session.loginMode });
}

// 網頁載入時呼叫：處理 Google 登入回來的流程、確認目前身分、取得設定
export async function init() {
  session.token = store(TOKEN_KEY);
  let c;
  try {
    c = await client();
  } catch (_) {
    session.offline = true;
    applyDevSettings();
    return session;
  }
  try {
    const { data } = await c.auth.getSession();
    const auth = data?.session;
    session.email = auth?.user?.email || null;
    // 剛從 Google 登入回來：換成 app token
    if (auth && (store(PENDING_KEY) || !session.token)) {
      store(PENDING_KEY, null);
      try {
        const r = await rpc('login_google');
        if (r.token) { session.token = r.token; store(TOKEN_KEY, r.token); }
        session.googleError = null;
      } catch (e) {
        session.googleError = e.message;
        // 不在名單內也不是管理員：登出 Google，避免卡住
        await c.auth.signOut();
        session.email = null;
      }
    }
    // 移除網址上 Google 回傳的 ?code=
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    let st = await rpc('get_state', { tok: session.token });
    if (!st.me && session.token) { session.token = null; store(TOKEN_KEY, null); }
    if (!st.me && auth && !st.admin) {
      try {
        const r = await rpc('login_google');
        if (r.token) { session.token = r.token; store(TOKEN_KEY, r.token); st = await rpc('get_state', { tok: session.token }); }
      } catch (_) { /* 不在名單內：維持未登入 */ }
    }
    applyState(st);
  } catch (e) {
    session.offline = true;
    session.offlineReason = e.message;
    applyDevSettings();
  }
  return session;
}

export const loggedIn = () => session.offline || !!session.me || session.admin;

export async function loginPin(sid, pin) {
  const r = await rpc('login_pin', { sid, pin: pin || null });
  session.token = r.token;
  store(TOKEN_KEY, r.token);
  applyState(await rpc('get_state', { tok: session.token }));
  return r;
}

export async function loginGoogle() {
  const c = await client();
  store(PENDING_KEY, '1');
  const redirectTo = location.origin + location.pathname;
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new Error(niceError(error));
}

export async function setNickname(nick) {
  const n = await rpc('set_nickname', { tok: session.token, nick });
  if (session.me) session.me.nickname = n;
  return n;
}

export async function logout() {
  try { if (session.token) await rpc('logout', { tok: session.token }); } catch (_) { /* 已失效 */ }
  try { await (await client()).auth.signOut(); } catch (_) { /* 忽略 */ }
  store(TOKEN_KEY, null);
  Object.assign(session, { token: null, me: null, admin: false, email: null, here: null });
  setAdmin(false);
}

// 回報目前所在頁面（後端 ping 會記下頁面並回傳與 get_state 相同的內容）
// 後端還沒執行 update_presence.sql 時，自動改回只呼叫 get_state
let pingOK = true;
async function fetchState() {
  if (pingOK && session.token) {
    try { return await rpc('ping', { tok: session.token, pg: session.here }); }
    catch (e) { if (!/ping/.test(e.message)) throw e; pingOK = false; }
  }
  return rpc('get_state', { tok: session.token });
}

// 換頁時呼叫：頁面不同就立刻回報一次（只有學生 token 會被記錄）
export function reportPage(pg) {
  if (pg === session.here) return;
  session.here = pg;
  if (session.offline || !session.token || !pingOK) return;
  rpc('ping', { tok: session.token, pg }).catch((e) => { if (/ping/.test(e.message)) pingOK = false; });
}

// 定期取得設定；身分失效（被老師登出、帳號停用、逾時）時呼叫 onLost
let timer = null;
export function startPolling(onLost) {
  clearInterval(timer);
  if (session.offline) return;
  timer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const st = await fetchState();
      const wasIn = loggedIn();
      applyState(st);
      if (wasIn && !loggedIn()) { store(TOKEN_KEY, null); session.token = null; onLost(); }
    } catch (_) { /* 暫時連不上就下次再試 */ }
  }, POLL_MS);
}

// 偵測 LINE、Facebook、Instagram 等 App 內建瀏覽器（Google 不允許在裡面登入）
export const inAppBrowser = () => /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent);
