// 課堂設定：哪些頁面開放、各種顯示開關
//
// 目前是「本機開發模式」：預設全部開放、開關全關。
// 測試時可以在瀏覽器 console 執行，例如：
//   localStorage.setItem('qlab-dev-settings', JSON.stringify({ unlocked: ['plot', 'axis'], flags: { ghostEq: true } }))
// 接上 Supabase 後，改由老師端的管理頁控制（由後端推送設定，再呼叫 applySettings）。

// 所有可以開放／關閉的頁面
export const PAGES = ['plot', 'axis', 'a', 'flip', 'k', 'free', 'quiz'];

// 開關一覽（老師端管理頁會列出這些）
export const FLAGS = {
  ghostEq: '自由探索：水平對摺後顯示虛線的函數式',
};

const state = {
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

export const isUnlocked = (page) => state.unlocked.has(page);
export const flag = (name) => !!state.flags[name];

// 設定改變時通知；回傳取消訂閱的函數
export function onSettings(cb) { listeners.add(cb); return () => listeners.delete(cb); }

const dev = readDev();
if (dev) applySettings(dev);
