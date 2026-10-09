// 學生動態：頁面名稱與統計（管理頁、大螢幕看板共用）
// 學生端每 4 秒回報一次所在頁面；超過 ONLINE_SEC 秒沒回報就當成離線（關掉網頁、切到別的 App、螢幕關掉）

import { PAGE_NAMES } from './settings.js';

export const ONLINE_SEC = 15;

// 依課堂順序排列
export const HERE_NAMES = {
  nickname: '取暱稱',
  home: '首頁',
  ...Object.fromEntries(['plot', 'axis', 'a', 'flip', 'k', 'free'].map((id) => [id, PAGE_NAMES[id]])),
  quizhub: '測驗區 關卡列表',
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`quiz${n}`, PAGE_NAMES[`quiz${n}`]])),
};
export const hereName = (pg) => HERE_NAMES[pg] || pg || '—';

export const isOnline = (s) => s.age != null && s.age <= ONLINE_SEC;

// 各頁面的在線人數（依課堂順序，只列有人的頁面）與離線人數
export function countByPage(list) {
  const n = {};
  let offline = 0;
  for (const s of list) {
    if (isOnline(s)) n[s.page] = (n[s.page] || 0) + 1;
    else offline += 1;
  }
  const order = Object.keys(HERE_NAMES);
  const pages = Object.keys(n).sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99));
  return { pages: pages.map((pg) => ({ page: pg, name: hereName(pg), n: n[pg] })), offline, online: list.length - offline };
}

export function ago(sec) {
  if (sec == null) return '沒有紀錄';
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  return `${Math.floor(sec / 3600)} 小時前`;
}
