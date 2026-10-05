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
      <div class="row" style="margin-bottom:.5rem"><a class="btn small" href="#/admin">← 回管理頁</a></div>
      <nav class="subtabs" id="bd-tabs">
        <a href="#" data-tab="rank" class="active">排行榜</a>
        <a href="#" data-tab="mis">迷思統計</a>
        <a href="#" data-tab="wrong">錯題</a>
      </nav>
      <div id="bd-body"><div class="placeholder">載入中…</div></div>
    </div>`;
  const body = view.querySelector('#bd-body');
  let tab = 'rank', data = null, detail = null, reveal = false;
  let lvSel = 0;   // 迷思統計、錯題的關卡篩選（0 = 全部）；自動更新時保留

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

  // 關卡小分頁：「全部」＋第 1～5 關，旁邊標出數量
  function levelTabs(countOf) {
    const btn = (id, label, n) => `<button type="button" class="lvtab${lvSel === id ? ' active' : ''}" data-lv="${id}">${label}${n ? `<span class="lvtab-n">${n}</span>` : ''}</button>`;
    return `<nav class="lvtabs" aria-label="選擇關卡">${btn(0, '全部', 0)}${LEVELS.map((l) => btn(l.id, `第 ${l.id} 關`, countOf(l.id))).join('')}</nav>`;
  }
  function bindLevelTabs() {
    body.querySelectorAll('.lvtab').forEach((b) => b.addEventListener('click', () => { lvSel = +b.dataset.lv; render(); }));
  }
  const levelStat = (id) => (data.levels || []).find((x) => x.level === id);
  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

  function renderMis() {
    const all = data.mis || [];
    const shown = LEVELS.filter((l) => !lvSel || l.id === lvSel);
    const groups = shown.map((l) => {
      const s = levelStat(l.id);
      // 同一關的迷思：先比犯錯人數，再比次數
      const items = all.filter((m) => +m.level === l.id).sort((x, y) => y.students - x.students || y.count - x.count);
      const max = Math.max(1, ...items.map((m) => m.students));
      return `
        <section class="mis-group">
          <h3>${esc(lvName(l.id))}<span class="hint">　答對率 ${s ? pct(s.correct, s.answers) : '—'}・${s ? `${s.players} 人作答` : '還沒有人作答'}</span></h3>
          ${items.length ? `<ul class="bars">${items.map((m) => `
            <li><span class="bar-label">${esc(MIS[m.mis] || m.mis)}</span>
              <span class="bar"><span style="width:${(m.students / max) * 100}%"></span></span>
              <span class="bar-num"><strong>${+m.students} 人</strong><span class="hint">${+m.count} 次・${s ? pct(m.count, s.answers) : '—'}</span></span></li>`).join('')}</ul>`
            : '<p class="hint">這一關目前沒有錯誤紀錄。</p>'}
        </section>`;
    }).join('');
    body.innerHTML = `
      <div class="stat-row">${LEVELS.map((l) => {
        const s = levelStat(l.id);
        return `<div class="stat"><div class="hint">第 ${l.id} 關</div><div class="stat-num">${s ? pct(s.correct, s.answers) : '—'}</div>
          <div class="hint">${s ? `${s.players} 人・${s.answers} 題次` : '還沒有人作答'}</div></div>`;
      }).join('')}</div>
      <h3 style="margin:1rem 0 .4rem">全班最常犯的迷思</h3>
      <p class="hint">依犯錯人數由多到少排列；百分比是佔該關所有作答題次的比例。</p>
      ${levelTabs((id) => all.filter((m) => +m.level === id).length)}
      ${groups}`;
    bindLevelTabs();
  }

  function renderWrongList() {
    const all = data.wrong || [];
    const list = all.filter((w) => !lvSel || +w.q.level === lvSel)
      .sort((x, y) => y.wrong - x.wrong || y.wrong / y.answers - x.wrong / x.answers);
    body.innerHTML = `
      <p class="hint">依答錯人次由多到少排列。點一題可以放大投影，先讓同學討論，再按「顯示正解」。</p>
      ${levelTabs((id) => all.filter((w) => +w.q.level === id).length)}
      ${list.length ? `<ul class="wrong-list">${list.map((w, i) => `
          <li><button type="button" class="wrong-item" data-i="${i}">
            <span class="tag">${lvName(+w.q.level)}</span>
            <span class="wrong-prompt">${safeHTML(w.q.promptHtml)}${w.q.graph ? '<span class="hint">（看圖題）</span>' : ''}</span>
            <span class="wrong-n"><strong>${+w.wrong}</strong> 人次答錯 / ${+w.answers}<span class="hint">　錯誤率 ${pct(w.wrong, w.answers)}</span></span>
          </button></li>`).join('')}</ul>`
        : `<div class="placeholder">${lvSel ? '這一關目前沒有錯題。' : '還沒有錯題。'}</div>`}`;
    bindLevelTabs();
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
