// 大螢幕看板（#/board，只有管理員能開）：排行榜、迷思統計、錯題、學生動態
// 錯題畫面不顯示任何暱稱或學號，避免答錯的同學被認出來；學生動態只顯示各頁人數，不顯示名字或暱稱

import { session, rpc, loginGoogle } from './backend.js';
import { MIS, LEVELS } from './quiz/mis.js';
import { drawGraph } from './quiz/quiz.js';
import { ONLINE_SEC, countByPage } from './presence.js';

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
        <a href="#" data-tab="here">學生動態</a>
      </nav>
      <div id="bd-body"><div class="placeholder">載入中…</div></div>
    </div>`;
  const body = view.querySelector('#bd-body');
  let tab = 'rank', data = null, detail = null, reveal = false;
  let lvSel = 0;   // 迷思統計、錯題的關卡篩選（0 = 全部）；自動更新時保留
  let misSel = '';   // 錯題的迷思篩選（'' = 全部迷思）

  view.querySelector('#bd-tabs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a) return;
    e.preventDefault();
    tab = a.dataset.tab; detail = null; reveal = false;
    view.querySelectorAll('#bd-tabs a').forEach((x) => x.classList.toggle('active', x === a));
    if (tab === 'here') { body.innerHTML = '<div class="placeholder">載入中…</div>'; loadHere(); } else render();
  });

  // 只保留格式正確的錯題紀錄
  const validWrong = (w) => w && w.q && Array.isArray(w.q.choices) && Number.isInteger(+w.q.level) && +w.q.level >= 1 && +w.q.level <= 5
    && Number.isInteger(+w.q.answer) && w.picks && typeof w.picks === 'object';

  async function load() {
    try {
      data = await rpc('admin_quiz_stats');
      data.wrong = (data.wrong || []).filter(validWrong);
      render();
    }
    catch (e) { body.innerHTML = `<div class="msg bad">${esc(e.message)}</div>`; }
  }

  // 學生動態：只拿人數，不顯示名字
  let here = null;
  async function loadHere() {
    try { here = countByPage(await rpc('admin_presence')); if (tab === 'here') renderHere(); }
    catch (e) { if (tab === 'here') body.innerHTML = `<div class="msg bad">${esc(/admin_presence/.test(e.message) ? '尚未執行 update_presence.sql。' : e.message)}</div>`; }
  }
  function renderHere() {
    const max = Math.max(1, ...here.pages.map((p) => p.n));
    body.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="hint">在線</div><div class="stat-num">${here.online}</div><div class="hint">人</div></div>
        <div class="stat"><div class="hint">離線</div><div class="stat-num">${here.offline}</div><div class="hint">超過 ${ONLINE_SEC} 秒沒回報</div></div>
      </div>
      <h3 style="margin:1rem 0 .4rem">大家現在在哪一頁</h3>
      ${here.pages.length ? `<ul class="bars">${here.pages.map((p) => `
        <li><span class="bar-label">${esc(p.name)}</span>
          <span class="bar"><span style="width:${(p.n / max) * 100}%"></span></span>
          <span class="bar-num"><strong>${p.n} 人</strong></span></li>`).join('')}</ul>`
        : '<div class="placeholder">目前沒有學生在線。</div>'}`;
  }

  function render() {
    if (tab === 'here') { if (here) renderHere(); return; }
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
    body.querySelectorAll('.lvtab[data-lv]').forEach((b) => b.addEventListener('click', () => { lvSel = +b.dataset.lv; render(); }));
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

  // 一道錯題中，各迷思被選了幾次（依學生選的錯誤選項對應的迷思計算）
  function misCountsOf(w) {
    const out = {};
    for (const c of w.q.choices || []) {
      const n = +((w.picks || {})[c.text] || 0);
      if (c.mis && n > 0) out[c.mis] = (out[c.mis] || 0) + n;
    }
    return out;
  }

  function wrongItem(w, i, misKey) {
    const n = misKey ? misCountsOf(w)[misKey] : w.wrong;
    return `
      <li><button type="button" class="wrong-item" data-i="${i}">
        <span class="tag">${lvName(+w.q.level)}</span>
        <span class="wrong-prompt">${safeHTML(w.q.promptHtml)}${w.q.graph ? '<span class="hint">（看圖題）</span>' : ''}</span>
        <span class="wrong-n"><strong>${+n}</strong> 人次${misKey ? '選了這個錯誤' : '答錯'} / ${+w.answers}<span class="hint">　錯誤率 ${pct(w.wrong, w.answers)}</span></span>
      </button></li>`;
  }

  function renderWrongList() {
    const all = data.wrong || [];
    const inLevel = all.filter((w) => !lvSel || +w.q.level === lvSel);
    // 這個關卡範圍內出現過的迷思，依人次排序
    const misTotal = {};
    for (const w of inLevel) for (const [m, n] of Object.entries(misCountsOf(w))) misTotal[m] = (misTotal[m] || 0) + n;
    const misKeys = Object.keys(misTotal).sort((x, y) => misTotal[y] - misTotal[x]);
    if (misSel && !misTotal[misSel]) misSel = '';
    const misTabs = misKeys.length ? `<nav class="lvtabs mis-tabs" aria-label="選擇迷思">
        <button type="button" class="lvtab${!misSel ? ' active' : ''}" data-mis="">全部迷思</button>
        ${misKeys.map((m) => `<button type="button" class="lvtab${misSel === m ? ' active' : ''}" data-mis="${esc(m)}">${esc(MIS[m] || m)}<span class="lvtab-n">${misTotal[m]}</span></button>`).join('')}
      </nav>` : '';

    const shown = [];   // 依畫面順序記錄題目，給點擊用
    const listOf = (items, misKey) => `<ul class="wrong-list">${items.map((w) => { shown.push(w); return wrongItem(w, shown.length - 1, misKey); }).join('')}</ul>`;
    let content;
    if (!inLevel.length) content = `<div class="placeholder">${lvSel ? '這一關目前沒有錯題。' : '還沒有錯題。'}</div>`;
    else if (misSel) {
      const items = inLevel.filter((w) => misCountsOf(w)[misSel]).sort((x, y) => misCountsOf(y)[misSel] - misCountsOf(x)[misSel]);
      content = listOf(items, misSel);
    } else {
      // 全部迷思：依迷思分組；同一題可能出現在多個組（不同錯誤選項對應不同迷思）
      content = misKeys.map((m) => {
        const items = inLevel.filter((w) => misCountsOf(w)[m]).sort((x, y) => misCountsOf(y)[m] - misCountsOf(x)[m]);
        return `<section class="mis-group"><h3>${esc(MIS[m] || m)}<span class="hint">　共 ${misTotal[m]} 人次・${items.length} 題</span></h3>${listOf(items, m)}</section>`;
      }).join('');
    }
    body.innerHTML = `
      <p class="hint">先選關卡，再選迷思。點一題可以放大投影，先讓同學討論，再按「顯示正解」。</p>
      ${levelTabs((id) => all.filter((w) => +w.q.level === id).length)}
      ${misTabs}
      ${content}`;
    bindLevelTabs();
    body.querySelectorAll('[data-mis]').forEach((b) => b.addEventListener('click', () => { misSel = b.dataset.mis; render(); }));
    body.querySelectorAll('.wrong-item').forEach((b) => b.addEventListener('click', () => {
      detail = shown[+b.dataset.i]; reveal = false; render();
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
    if (tab === 'here') loadHere();
    else if (!detail) load();
  }, 5000);
}
