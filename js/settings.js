// 課堂設定：哪些頁面開放、各種顯示開關
//
// 網站連上 Supabase 後，由 backend.js 定期取得老師端的設定並呼叫 applySettings。
// 無法連線（離線模式）時：預設全部開放、開關全關；本機測試可用 localStorage 覆寫，例如
//   localStorage.setItem('qlab-dev-settings', JSON.stringify({ unlocked: ['plot', 'axis'], flags: { ghostEq: true } }))

// 所有可以開放／關閉的頁面（名稱給管理頁顯示）
export const PAGE_NAMES = {
  plot: '任務① 描點畫圖',
  axis: '任務② 找對稱軸',
  a: '任務③ 拉拉看 a',
  flip: '任務④ 上下翻',
  k: '任務⑤ 拉拉看 k',
  free: '自由探索',
  quiz1: '測驗 第 1 關 是不是二次函數？',
  quiz2: '測驗 第 2 關 看式子想圖形',
  quiz3: '測驗 第 3 關 開口誰比較大',
  quiz4: '測驗 第 4 關 平移',
  quiz5: '測驗 第 5 關 看圖選式子',
};
export const PAGES = Object.keys(PAGE_NAMES);

// 開關一覽（老師端管理頁會列出這些）
export const FLAGS = {
  ghostEq: '自由探索：水平對摺後顯示虛線的函數式',
};

const state = {
  admin: false,            // 管理員（老師）看得到所有頁面，不受開放設定限制
  unlocked: new Set(PAGES),
  flags: Object.fromEntries(Object.keys(FLAGS).map((k) => [k, false])),
};
const listeners = new Set();

function readDev() {
  try {
    const raw = localStorage.getItem('qlab-dev-settings');
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// 套用新設定（之後由 Supabase 端呼叫）
export function applySettings({ unlocked, flags } = {}) {
  if (Array.isArray(unlocked)) state.unlocked = new Set(unlocked);
  if (flags) Object.assign(state.flags, flags);
  for (const cb of listeners) cb();
}

export const isUnlocked = (page) => state.admin || state.unlocked.has(page);
export const isAdmin = () => state.admin;
export function setAdmin(on) {
  if (state.admin === !!on) return;
  state.admin = !!on;
  for (const cb of listeners) cb();
}
// 取得目前的設定（管理頁顯示用）
export const currentSettings = () => ({ unlocked: [...state.unlocked], flags: { ...state.flags } });
export const flag = (name) => !!state.flags[name];

// 設定改變時通知；回傳取消訂閱的函數
export function onSettings(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// 離線模式才使用本機測試設定（連線時一律以老師端設定為準）
export function applyDevSettings() {
  const dev = readDev();
  if (dev) applySettings(dev);
}
