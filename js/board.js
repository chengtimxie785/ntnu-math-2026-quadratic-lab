// 大螢幕看板（#/board，只有管理員能開）：排行榜、迷思統計、錯題
// 錯題畫面不顯示任何暱稱或學號，避免答錯的同學被認出來

import { session, rpc, loginGoogle } from './backend.js';
import { MIS, LEVELS } from './quiz/mis.js';
import { drawGraph } from './quiz/quiz.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 作答紀錄是學生端送上來的，題目 HTML 不能直接信任：只保留題目會用到的 sup、br、span（只留 class），其餘一律轉成純文字
function safeHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const clean = (node) => {
    for (const el of [...node.childNodes]) {
      if (el.nodeType === Node.TEXT_NODE) continue;
      if (el.nodeType !== Node.ELEMENT_NODE || !['SUP', 'BR', 'SPAN'].includes(el.tagName)) {
        el.replaceWith(document.createTextNode(el.textContent || ''));
        continue;
      }
      for (const a of [...el.attributes]) {
        if (!(a.name === 'class' && /^[\w\s-]*$/.test(a.value))) el.removeAttribute(a.name);
      }
      clean(el);
    }
  };
  clean(tpl.content);
  const box = document.createElement('div');
  box.appendChild(tpl.content);
  return box.innerHTML;
}
// 圖形參數只接受數字
const safeGraph = (g) => (g && [g.a, g.k, g.mark?.x, g.mark?.y].every(Number.isFinite) ? g : null);

const lvName = (n) => `第 ${n} 關 ${LEVELS.find((l) => l.id === n)?.name || ''}`;

export function mountBoard(view) {
  if (!session.admin) {
    view.innerHTML = `<div class="auth"><h1>大螢幕看板</h1><p>只有管理員可以開啟。</p>
      <button type="button" class="btn primary wide" id="bd-login">用 Google 帳號登入</button></div>`;
    view.querySelector('#bd-login').addEventListener('click', () => loginGoogle().catch((e) => alert(e.message)));
    return;
  }
  view.innerHTML = `
    <div class="boardview">
      <nav class="subtabs" id="bd-tabs">
        <a href="#" data-tab="rank" class="active">排行榜</a>
        <a href="#" data-tab="mis">迷思統計</a>
        <a href="#" data-tab="wrong">錯題</a>
      </nav>
      <div id="bd-body"><div class="placeholder">載入中…</div></div>
    </div>`;
  const body = view.querySelector('#bd-body');
  let tab = 'rank', data = null, detail = null, reveal = false;

  view.querySelector('#bd-tabs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a) return;
    e.preventDefault();
    tab = a.dataset.tab; detail = null; reveal = false;
    view.querySelectorAll('#bd-tabs a').forEach((x) => x.classList.toggle('active', x === a));
    render();
  });

  async function load() {
    try { data = await rpc('admin_quiz_stats'); render(); }
    catch (e) { body.innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
  }

  function render() {
    if (!data) return;
    if (tab === 'rank') renderRank();
    else if (tab === 'mis') renderMis();
    else if (detail) renderDetail();
    else renderWrongList();
  }

  function renderRank() {
    const rows = data.leaderboard || [];
    body.innerHTML = rows.length
      ? `<ol class="board big">${rows.slice(0, 10).map((r) => `
          <li><span class="rk">${r.rank}</span><span class="nm">${esc(r.nickname)}</span>
          <span class="hint">${r.levels} 關</span><span class="sc mono">${r.total}</span></li>`).join('')}</ol>`
      : '<div class="placeholder">還沒有人完成關卡。</div>';
  }

  function renderMis() {
    const lv = data.levels || [];
    const mis = (data.mis || []).slice(0, 10);
    const max = Math.max(1, ...mis.map((m) => m.count));
    body.innerHTML = `
      <div class="stat-row">${LEVELS.map((l) => {
        const s = lv.find((x) => x.level === l.id);
        const rate = s && s.answers ? Math.round((s.correct / s.answers) * 100) : null;
        return `<div class="stat"><div class="hint">第 ${l.id} 關</div><div class="stat-num">${rate === null ? '—' : `${rate}%`}</div>
          <div class="hint">${s ? `${s.players} 人・${s.answers} 題次` : '還沒有人作答'}</div></div>`;
      }).join('')}</div>
      <h3 style="margin:1rem 0 .4rem">全班最常犯的迷思</h3>
      ${mis.length ? `<ul class="bars">${mis.map((m) => `
        <li><span class="bar-label">${esc(MIS[m.mis] || m.mis)}<span class="hint">　第 ${m.level} 關・${m.students} 人</span></span>
        <span class="bar"><span style="width:${(m.count / max) * 100}%"></span></span><span class="mono">${m.count}</span></li>`).join('')}</ul>`
        : '<div class="placeholder">還沒有錯誤紀錄。</div>'}`;
  }

  function renderWrongList() {
    const list = data.wrong || [];
    body.innerHTML = list.length
      ? `<p class="hint">依答錯人次排序。點一題可以放大投影，先讓同學討論，再按「顯示正解」。</p>
         <ul class="wrong-list">${list.map((w, i) => `
          <li><button type="button" class="wrong-item" data-i="${i}">
            <span class="tag">${lvName(+w.q.level)}</span>
            <span class="wrong-prompt">${safeHTML(w.q.promptHtml)}${w.q.graph ? '<span class="hint">（看圖題）</span>' : ''}</span>
            <span class="wrong-n"><strong>${w.wrong}</strong> 人次答錯 / ${w.answers}</span>
          </button></li>`).join('')}</ul>`
      : '<div class="placeholder">還沒有錯題。</div>';
    body.querySelectorAll('.wrong-item').forEach((b) => b.addEventListener('click', () => {
      detail = list[+b.dataset.i]; reveal = false; render();
    }));
  }

  function renderDetail() {
    const w = detail, q = w.q;
    const total = Object.values(w.picks || {}).reduce((s, n) => s + n, 0) || 1;
    body.innerHTML = `
      <div class="spot">
        <div class="row" style="justify-content:space-between">
          <button type="button" class="btn small" id="bd-back">← 回錯題列表</button>
          <span class="tag">${lvName(+q.level)}</span>
        </div>
        <div class="spot-prompt">${safeHTML(q.promptHtml)}</div>
        <div id="bd-graph"></div>
        <ul class="spot-choices">${q.choices.map((c, i) => {
          const n = (w.picks || {})[c.text] || 0;
          const right = i === q.answer;
          return `<li class="${reveal ? (right ? 'right' : 'wrong') : ''}">
            <span class="spot-choice">${String.fromCharCode(65 + i)}．${safeHTML(c.html)}</span>
            <span class="bar"><span style="width:${(n / total) * 100}%"></span></span>
            <span class="mono">${n} 人次</span>
            ${reveal && !right && c.mis ? `<span class="spot-mis">選這個通常是因為：${esc(MIS[c.mis] || c.mis)}</span>` : ''}
          </li>`;
        }).join('')}</ul>
        ${reveal ? `<div class="msg ok">正解是 ${String.fromCharCode(65 + q.answer)}。${esc(q.explain)}</div>` : ''}
        <button type="button" class="btn primary" id="bd-reveal">${reveal ? '隱藏正解' : '顯示正解'}</button>
      </div>`;
    const g = safeGraph(q.graph);
    if (g) drawGraph(body.querySelector('#bd-graph'), g);
    body.querySelector('#bd-back').addEventListener('click', () => { detail = null; render(); });
    body.querySelector('#bd-reveal').addEventListener('click', () => { reveal = !reveal; render(); });
  }

  load();
  // 自動更新（看單一錯題時不更新，避免畫面跳動）
  const t = setInterval(() => {
    if (!view.contains(body)) { clearInterval(t); return; }
    if (!detail) load();
  }, 5000);
}
