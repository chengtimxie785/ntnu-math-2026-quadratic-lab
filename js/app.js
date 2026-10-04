// 路由與全域設定（深淺色、大螢幕模式）

import { mountPlot } from './plot.js';
import { mountAK } from './ak.js';
import { mountAxis } from './axis.js';
import { mountFlip } from './flip.js';
import { mountFold } from './foldlab.js';

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

function renderLab(tab) {
  const t = LAB_TABS.find((x) => x.id === tab) || LAB_TABS[0];
  view.innerHTML = `
    <nav class="subtabs" aria-label="互動專區">
      ${LAB_TABS.map((x) => `<a href="#/lab/${x.id}" class="${x.id === t.id ? 'active' : ''}">${x.name}</a>`).join('')}
    </nav>
    <div id="lab-root"></div>`;
  t.mount(view.querySelector('#lab-root'));
}

function renderQuiz() {
  view.innerHTML = '<div class="placeholder"><h2 style="margin-top:0">測驗區</h2><p>關卡內容討論中，之後開放。</p></div>';
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const nav = parts[0] || '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  if (nav === 'lab') renderLab(parts[1]);
  else if (nav === 'quiz') renderQuiz();
  else renderHome();
}

window.addEventListener('hashchange', route);
route();
