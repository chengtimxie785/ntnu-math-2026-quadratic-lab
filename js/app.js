// 路由與全域設定（登入檢查、深淺色、版面）

import { mountPlot } from './plot.js';
import { mountAK } from './ak.js';
import { mountAxis } from './axis.js';
import { mountFlip } from './flip.js';
import { mountFold } from './foldlab.js';
import { isUnlocked, isAdmin, onSettings } from './settings.js';
import { init, session, loggedIn, logout, startPolling } from './backend.js';
import { renderLogin, renderNickname } from './login.js';
import { mountAdmin } from './admin.js';

const view = document.getElementById('view');
const root = document.documentElement;

function store(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (_) { /* 私密模式 */ }
  return null;
}

// 深淺色：跟隨系統 → 淺 → 深
const theme = store('qlab-theme');
if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
document.getElementById('btn-theme').addEventListener('click', () => {
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = root.dataset.theme || (sysDark ? 'dark' : 'light');
  root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  store('qlab-theme', root.dataset.theme);
});

// 版面：手機版（單欄、圖在上）／電腦版（圖在左、操作在右，給觸控大螢幕用）
// 預設依螢幕寬度自動判斷，使用者切換後記住選擇
const layoutBtn = document.getElementById('btn-layout');
function applyLayout(mode, remount) {
  root.dataset.layout = mode;
  layoutBtn.textContent = mode === 'phone' ? '切換到電腦版' : '切換到手機版';
  if (remount) route();
}
const saved = store('qlab-layout');
applyLayout(saved === 'phone' || saved === 'desktop' ? saved : (window.innerWidth < 900 ? 'phone' : 'desktop'), false);
layoutBtn.addEventListener('click', () => {
  const next = root.dataset.layout === 'phone' ? 'desktop' : 'phone';
  store('qlab-layout', next);
  applyLayout(next, true);
});

const LAB_TABS = [
  { id: 'plot', name: '① 描點畫圖', mount: mountPlot },
  { id: 'axis', name: '② 找對稱軸', mount: mountAxis },
  { id: 'a', name: '③ 拉拉看 a', mount: (r) => mountAK(r, 'a') },
  { id: 'flip', name: '④ 上下翻', mount: mountFlip },
  { id: 'k', name: '⑤ 拉拉看 k', mount: (r) => mountAK(r, 'k') },
  { id: 'free', name: '自由探索', mount: mountFold },
];

function renderHome() {
  view.innerHTML = `
    <h1 style="font-size:1.4rem;margin:.2rem 0 .2rem">二次函數的意義與 y = ax² + k 的圖形</h1>
    <p style="color:var(--muted);margin:0 0 .6rem">康軒版 第 1 章 1-1 主題 1、主題 2</p>
    <div class="hub">
      <a class="hub-card" href="#/lab/plot"><h2>互動專區</h2><p>搭配學習單的五個任務：描點畫圖、找對稱軸、拉拉看 a、上下翻、拉拉看 k。</p></a>
      <a class="hub-card" href="#/quiz"><h2>測驗區</h2><p>分關卡挑戰，題目隨機出現。</p></a>
    </div>`;
}

// 尚未開放的頁面：分頁上加鎖頭，內容顯示提示
const lockedHTML = (name) => `<div class="placeholder locked"><div class="lock-icon" aria-hidden="true">🔒</div><h2>${name}</h2><p>老師還沒有開放這裡，請先完成已開放的部分，或等老師宣布。</p></div>`;

function tabsHTML(activeId) {
  return LAB_TABS.map((x) => {
    const lock = !isUnlocked(x.id);
    return `<a href="#/lab/${x.id}" class="${x.id === activeId ? 'active' : ''}${lock ? ' is-locked' : ''}">${lock ? '🔒 ' : ''}${x.name}</a>`;
  }).join('');
}

let current = { page: null, locked: null };

function renderLab(tab) {
  // 沒指定分頁時，進到第一個已開放的任務
  const t = LAB_TABS.find((x) => x.id === tab) || LAB_TABS.find((x) => isUnlocked(x.id)) || LAB_TABS[0];
  const locked = !isUnlocked(t.id);
  current = { page: t.id, locked };
  view.innerHTML = `
    <nav class="subtabs" aria-label="互動專區">${tabsHTML(t.id)}</nav>
    <div id="lab-root"></div>`;
  const root = view.querySelector('#lab-root');
  // 手機上分頁列可左右滑動：把目前的任務捲到看得到的位置
  const nav = view.querySelector('.subtabs'), act = nav.querySelector('a.active');
  if (act) nav.scrollLeft = act.offsetLeft - (nav.clientWidth - act.offsetWidth) / 2;
  if (locked) root.innerHTML = lockedHTML(t.name);
  else t.mount(root);
}

function renderQuiz() {
  current = { page: 'quiz', locked: !isUnlocked('quiz') };
  view.innerHTML = current.locked
    ? lockedHTML('測驗區')
    : '<div class="placeholder"><h2 style="margin-top:0">測驗區</h2><p>關卡內容討論中，之後開放。</p></div>';
}

// 右上角：暱稱與登出、管理頁連結
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderUserbox() {
  const box = document.getElementById('userbox');
  document.querySelector('[data-nav="admin"]').hidden = !isAdmin();
  if (session.offline) { box.innerHTML = '<span class="badge bad" title="連不到伺服器，所有內容暫時開放">離線模式</span>'; return; }
  if (!loggedIn()) { box.innerHTML = ''; return; }
  const name = session.me?.nickname || session.me?.student_id || session.email || '管理員';
  box.innerHTML = `<span class="badge" title="${esc(session.me?.student_id || session.email || '')}">${esc(name)}${isAdmin() ? '（管理）' : ''}</span>
    <button type="button" class="ghost-btn" id="btn-logout">登出</button>`;
  box.querySelector('#btn-logout').addEventListener('click', async () => { await logout(); renderUserbox(); route(); });
}

// 老師改變開放設定時：目前頁面的開放狀態有變就重新載入，否則只更新分頁上的鎖頭
onSettings(() => {
  renderUserbox();
  if (current.page && isUnlocked(current.page) === current.locked) { route(); return; }
  const nav = view.querySelector('.subtabs');
  if (nav) nav.innerHTML = tabsHTML(current.page);
});

let ready = false;

function route() {
  if (!ready) return;
  current = { page: null, locked: null };
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const nav = parts[0] || '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  renderUserbox();
  if (nav === 'admin') { mountAdmin(view); return; }               // 管理頁自己處理 Google 登入
  if (!loggedIn()) { renderLogin(view, afterLogin); return; }
  if (session.me && !session.me.nickname) { renderNickname(view, route); return; }
  if (nav === 'lab') renderLab(parts[1]);
  else if (nav === 'quiz') renderQuiz();
  else renderHome();
}

function afterLogin() {
  startPolling(() => route());
  route();
}

window.addEventListener('hashchange', route);

// 啟動：確認登入身分、取得老師端設定
view.innerHTML = '<div class="placeholder">載入中…</div>';
init().then(() => {
  ready = true;
  startPolling(() => route());
  route();
});
