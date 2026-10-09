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
  let misSel = '';   // 錯題的迷思篩選（'' = 全部迷思）；從迷思統計點進來時會帶入

  function setTab(name) {
    tab = name; detail = null; reveal = false;
    view.querySelectorAll('#bd-tabs a').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
    if (tab === 'here') { body.innerHTML = '<div class="placeholder">載入中…</div>'; loadHere(); } else render();
  }
  view.querySelector('#bd-tabs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-tab]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.tab === 'mis') misSel = '';
    setTab(a.dataset.tab);
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

  // ---------- 共用：百分比長條（百分比為主，人數為輔） ----------
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const pctRow = ({ label, sub, n, d, attrs = '', cls = '' }) => `
    <li class="pct-row ${cls}" ${attrs}>
      <div class="pct-text"><span class="pct-label">${label}</span>${sub ? `<span class="pct-sub">${sub}</span>` : ''}</div>
      <div class="pct-bar"><span style="width:${pctOf(n, d)}%"></span></div>
      <div class="pct-num"><strong>${d ? `${pctOf(n, d)}%` : '—'}</strong><span>${+n}／${+d} 人</span></div>
    </li>`;
  const levelStat = (id) => (data.levels || []).find((x) => x.level === id);
  const playersOf = (id) => levelStat(id)?.players || 0;

  // 關卡卡片：大字答對率＋細長條；點卡片篩選該關，再點一次回到全部
  function levelCards() {
    return `<div class="lv-cards">${LEVELS.map((l) => {
      const s = levelStat(l.id), r = s ? pctOf(s.correct, s.answers) : null;
      return `<button type="button" class="lv-card${lvSel === l.id ? ' active' : ''}" data-lv="${l.id}">
        <span class="lv-card-t">第 ${l.id} 關</span>
        <span class="lv-card-n">${r == null ? '—' : `${r}%`}</span>
        <span class="pct-bar ok"><span style="width:${r || 0}%"></span></span>
        <span class="lv-card-s">${s ? `答對率・${s.players} 人作答` : '還沒有人作答'}</span>
      </button>`;
    }).join('')}</div>`;
  }
  function bindLevelCards() {
    body.querySelectorAll('.lv-card[data-lv]').forEach((b) => b.addEventListener('click', () => {
      lvSel = lvSel === +b.dataset.lv ? 0 : +b.dataset.lv; misSel = ''; render();
    }));
  }

  // 迷思統計：每個迷思有百分之幾的作答學生犯過（犯過的人數 ÷ 該關作答人數）
  function renderMis() {
    const items = (data.mis || [])
      .filter((m) => !lvSel || +m.level === lvSel)
      .map((m) => ({ ...m, d: playersOf(+m.level) }))
      .sort((x, y) => pctOf(y.students, y.d) - pctOf(x.students, x.d) || y.students - x.students);
    body.innerHTML = `
      ${levelCards()}
      <h3 class="board-h">${lvSel ? esc(lvName(lvSel)) : '全部關卡'}：最常犯的迷思</h3>
      <p class="hint">百分比＝犯過這個迷思的人數 ÷ 這一關的作答人數。點一個迷思可以看相關的錯題。</p>
      ${items.length ? `<ul class="pct-list">${items.map((m) => pctRow({
        label: esc(MIS[m.mis] || m.mis), sub: lvSel ? '' : `第 ${+m.level} 關`, n: m.students, d: m.d,
        cls: 'clickable', attrs: `data-mis="${esc(m.mis)}" data-mlv="${+m.level}" tabindex="0"`,
      })).join('')}</ul>` : `<div class="placeholder">${lvSel ? '這一關目前沒有錯誤紀錄。' : '還沒有錯誤紀錄。'}</div>`}`;
    bindLevelCards();
    body.querySelectorAll('.pct-row[data-mis]').forEach((li) => {
      const go = () => { lvSel = +li.dataset.mlv; misSel = li.dataset.mis; setTab('wrong'); };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  }

  // 一道錯題中，各迷思被幾個人選了（依學生選的錯誤選項對應的迷思計算）
  function misCountsOf(w) {
    const out = {};
    for (const c of w.q.choices || []) {
      const n = +((w.picks || {})[c.text] || 0);
      if (c.mis && n > 0) out[c.mis] = (out[c.mis] || 0) + n;
    }
    return out;
  }
  const topMis = (w) => Object.entries(misCountsOf(w)).sort((x, y) => y[1] - x[1])[0]?.[0];

  // 錯題：題目為主，答錯率為輔；迷思用下拉選單篩選
  function renderWrongList() {
    const inLevel = (data.wrong || []).filter((w) => !lvSel || +w.q.level === lvSel);
    const misKeys = [...new Set(inLevel.flatMap((w) => Object.keys(misCountsOf(w))))];
    if (misSel && !misKeys.includes(misSel)) misSel = '';
    const items = inLevel
      .filter((w) => !misSel || misCountsOf(w)[misSel])
      .sort((x, y) => y.wrong - x.wrong || pctOf(y.wrong, y.answers) - pctOf(x.wrong, x.answers));
    body.innerHTML = `
      ${levelCards()}
      <div class="board-filter">
        <h3 class="board-h">${lvSel ? esc(lvName(lvSel)) : '全部關卡'}：錯題</h3>
        ${misKeys.length ? `<label class="hint">迷思
          <select class="numbox" id="bd-mis">
            <option value="">全部迷思</option>
            ${misKeys.map((m) => `<option value="${esc(m)}" ${misSel === m ? 'selected' : ''}>${esc(MIS[m] || m)}</option>`).join('')}
          </select></label>` : ''}
      </div>
      <p class="hint">依答錯人數排序。點一題可以放大投影，先讓同學討論，再按「顯示正解」。</p>
      ${items.length ? `<ul class="wrong-list">${items.map((w, i) => {
        const tm = topMis(w), r = pctOf(w.wrong, w.answers);
        return `<li><button type="button" class="wrong-item" data-i="${i}">
          <span class="wrong-main">
            <span class="wrong-prompt">${safeHTML(w.q.promptHtml)}${w.q.graph ? '<span class="hint">（看圖題）</span>' : ''}</span>
            <span class="pct-sub">${esc(lvName(+w.q.level))}${tm ? `・最多人選的錯誤：${esc(MIS[tm] || tm)}` : ''}</span>
          </span>
          <span class="wrong-pct">
            <strong>${r}%</strong>
            <span class="pct-bar bad"><span style="width:${r}%"></span></span>
            <span class="pct-sub">答錯 ${+w.wrong}／${+w.answers} 人</span>
          </span>
        </button></li>`;
      }).join('')}</ul>` : `<div class="placeholder">${lvSel ? '這一關目前沒有錯題。' : '還沒有錯題。'}</div>`}`;
    bindLevelCards();
    body.querySelector('#bd-mis')?.addEventListener('change', (e) => { misSel = e.target.value; render(); });
    body.querySelectorAll('.wrong-item').forEach((b) => b.addEventListener('click', () => {
      detail = items[+b.dataset.i]; reveal = false; render();
    }));
  }

  function renderDetail() {
    const w = detail, q = w.q;
    const total = w.answers || Object.values(w.picks || {}).reduce((s, n) => s + n, 0);
    body.innerHTML = `
      <div class="spot">
        <div class="row" style="justify-content:space-between">
          <button type="button" class="btn small" id="bd-back">← 回錯題列表</button>
          <span class="tag">${lvName(+q.level)}</span>
        </div>
        <div class="spot-prompt">${safeHTML(q.promptHtml)}</div>
        <div id="bd-graph"></div>
        <ul class="spot-choices">${q.choices.map((c, i) => {
          const n = +((w.picks || {})[c.text] || 0);
          const right = i === q.answer;
          return `<li class="${reveal ? (right ? 'right' : 'wrong') : ''}">
            <span class="spot-choice">${String.fromCharCode(65 + i)}．${safeHTML(c.html)}</span>
            <span class="bar"><span style="width:${pctOf(n, total)}%"></span></span>
            <span class="pct-num"><strong>${pctOf(n, total)}%</strong><span>${n} 人</span></span>
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
