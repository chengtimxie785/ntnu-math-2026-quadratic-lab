// 管理頁（只有 admins 表中的 Google 帳號能用）
// 主畫面：開放控制、學生動態、測驗統計（上課時一直會看的）
// 彈出視窗：個人設定（PIN、email、暱稱、啟用、強制登出）、名單管理、課堂設定（顯示開關、登入模式、清除紀錄）、管理員帳號

import { session, rpc, loginGoogle } from './backend.js';
import { PAGE_NAMES, FLAGS } from './settings.js';
import { MIS, LEVELS } from './quiz/mis.js';
import { ONLINE_SEC, hereName, isOnline, countByPage, ago } from './presence.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { student: '學生', teacher: '老師／助教' };

// 開放控制的短名稱（完整名稱放在滑鼠提示）
const LAB_SHORT = { plot: '① 描點', axis: '② 對稱軸', a: '③ 拉 a', flip: '④ 上下翻', k: '⑤ 拉 k', free: '自由探索' };
const QUIZ_SHORT = { quiz1: '第 1 關', quiz2: '第 2 關', quiz3: '第 3 關', quiz4: '第 4 關', quiz5: '第 5 關' };

export function mountAdmin(view) {
  if (session.offline) {
    view.innerHTML = '<div class="placeholder"><h2>管理頁</h2><p>目前連不到伺服器（離線模式），無法使用管理功能。</p></div>';
    return;
  }
  if (!session.admin) {
    view.innerHTML = `
      <div class="auth">
        <h1>管理頁</h1>
        ${session.email ? `<div class="msg bad">目前登入的 Google 帳號（${esc(session.email)}）沒有管理權限。</div>` : ''}
        <p>請用有管理權限的 Google 帳號登入。</p>
        <button type="button" class="btn primary wide" id="ad-login">用 Google 帳號登入</button>
      </div>`;
    view.querySelector('#ad-login').addEventListener('click', () => loginGoogle().catch((e) => alert(e.message)));
    return;
  }

  view.innerHTML = `
    <div class="admin">
      <div class="admin-head">
        <h1>管理頁</h1>
        <span class="hint">${esc(session.email)}</span>
      </div>
      <div class="admin-tools">
        <a class="btn small primary" href="#/board">大螢幕看板</a>
        <button type="button" class="btn small" data-open="roster">名單管理</button>
        <button type="button" class="btn small" data-open="settings">課堂設定</button>
        <button type="button" class="btn small" data-open="admins">管理員帳號</button>
        <button type="button" class="btn small" id="ad-refresh">重新整理</button>
      </div>
      <div class="msg" id="ad-msg" aria-live="polite"></div>

      <section class="card">
        <div class="card-head">
          <h3>開放控制</h3>
          <span class="hint">切換後約 4 秒內同步到學生手機</span>
          <span class="card-actions">
            <button type="button" class="btn small" id="ad-all-on">全部開放</button>
            <button type="button" class="btn small" id="ad-all-off">全部關閉</button>
          </span>
        </div>
        <div class="open-grid" id="ad-pages"></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>學生動態</h3>
          <span class="hint" id="ad-here-count"></span>
        </div>
        <p class="hint">每 4 秒更新；超過 ${ONLINE_SEC} 秒沒有回報算離線。點頁面標籤只看那一頁的人，點一列可以開啟個人設定。</p>
        <div class="lvtabs" id="ad-here-chips"></div>
        <div class="table-wrap"><table class="roster" id="ad-here"></table></div>
      </section>

      <section class="card">
        <div class="card-head"><h3>測驗統計</h3><span class="hint">示範（管理員）作答不列入；完整的迷思與錯題請開大螢幕看板</span></div>
        <div id="ad-quiz" class="hint">載入中…</div>
      </section>
    </div>

    <dialog class="modal" id="ad-dlg" aria-labelledby="ad-dlg-title">
      <div class="modal-head">
        <button type="button" class="link" id="ad-dlg-back" hidden>← 回名單</button>
        <h2 id="ad-dlg-title"></h2>
        <button type="button" class="modal-x" id="ad-dlg-x" aria-label="關閉">✕</button>
      </div>
      <div class="msg" id="ad-dlg-msg" aria-live="polite"></div>
      <div id="ad-dlg-body"></div>
    </dialog>`;

  const $ = (s) => view.querySelector(s);
  const dlg = $('#ad-dlg');
  let data = null, here = [];
  let open = null;             // 目前開著的視窗：{ kind: 'person' | 'roster' | 'settings' | 'admins', sid, fromRoster }
  let search = '';             // 名單管理的搜尋字串（重畫時保留）
  const revealed = {};         // 這次產生的 PIN（只在本頁暫時顯示）

  // 訊息：視窗開著時顯示在視窗裡，否則顯示在主畫面
  const say = (t, cls = 'ok') => {
    const m = dlg.open ? $('#ad-dlg-msg') : $('#ad-msg');
    m.textContent = t; m.className = `msg ${cls}`;
  };
  const act = async (fn, okText) => {
    try { await fn(); if (okText) say(okText); await load(); }
    catch (e) { say(e.message, 'bad'); }
  };

  async function load() {
    try { data = await rpc('admin_overview'); renderMain(); if (dlg.open) renderDlg(); }
    catch (e) { say(e.message, 'bad'); }
    try { renderQuiz(await rpc('admin_quiz_stats')); }
    catch (e) { $('#ad-quiz').textContent = /admin_quiz_stats/.test(e.message) ? '尚未執行 update_quiz.sql。' : e.message; }
  }

  // ---------- 主畫面 ----------
  function sw(id, label, on, title = '') {
    return `<label class="switch small" ${title ? `title="${esc(title)}"` : ''}><input type="checkbox" data-id="${esc(id)}" ${on ? 'checked' : ''}><span class="track"></span><span>${esc(label)}</span></label>`;
  }

  function renderMain() {
    const unlocked = new Set(data.unlocked || []);
    const group = (title, short) => `<div class="open-row"><span class="open-label">${title}</span>${
      Object.entries(short).map(([id, n]) => sw(id, n, unlocked.has(id), PAGE_NAMES[id])).join('')}</div>`;
    $('#ad-pages').innerHTML = group('互動專區', LAB_SHORT) + group('測驗區', QUIZ_SHORT);
  }

  function renderQuiz(q) {
    const rows = LEVELS.map((l) => {
      const s = (q.levels || []).find((x) => x.level === l.id);
      const rate = s && s.answers ? `${Math.round((s.correct / s.answers) * 100)}%` : '—';
      return `<tr><td>第 ${l.id} 關 ${esc(l.name)}</td><td>${s ? s.players : 0}</td><td>${s ? s.answers : 0}</td><td>${rate}</td></tr>`;
    }).join('');
    const mis = (q.mis || []).slice(0, 5).map((m) => `<li>${esc(MIS[m.mis] || m.mis)}<span class="hint">　第 ${+m.level} 關・${+m.count} 次・${+m.students} 人</span></li>`).join('');
    $('#ad-quiz').className = 'quiz-stats';
    $('#ad-quiz').innerHTML = `
      <div class="table-wrap"><table class="roster"><thead><tr><th>關卡</th><th>作答人數</th><th>題次</th><th>答對率</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div><h4 style="margin:.5rem 0 .3rem">最常見的迷思</h4>
      ${mis ? `<ol style="margin:0;padding-left:1.4rem">${mis}</ol>` : '<p class="hint">還沒有錯誤紀錄。</p>'}</div>`;
  }

  // ---------- 學生動態 ----------
  let hereSel = '';   // 頁面篩選（'' = 全部，'off' = 離線）
  async function loadHere() {
    try { here = await rpc('admin_presence'); renderHere(); }
    catch (e) { $('#ad-here-count').textContent = /admin_presence/.test(e.message) ? '尚未執行 update_presence.sql。' : e.message; }
  }
  function renderHere() {
    const c = countByPage(here);
    if (hereSel && hereSel !== 'off' && !c.pages.some((p) => p.page === hereSel)) hereSel = '';
    $('#ad-here-count').textContent = `在線 ${c.online} 人，離線 ${c.offline} 人`;
    const chip = (id, label, n) => `<button type="button" class="lvtab${hereSel === id ? ' active' : ''}" data-here="${esc(id)}">${esc(label)}<span class="lvtab-n">${n}</span></button>`;
    $('#ad-here-chips').innerHTML = chip('', '全部', here.length)
      + c.pages.map((p) => chip(p.page, p.name, p.n)).join('')
      + (c.offline ? chip('off', '離線', c.offline) : '');
    const rows = here
      .filter((s) => !hereSel || (hereSel === 'off' ? !isOnline(s) : isOnline(s) && s.page === hereSel))
      .sort((x, y) => isOnline(y) - isOnline(x));
    $('#ad-here').innerHTML = `
      <thead><tr><th>學號</th><th>姓名</th><th>暱稱</th><th>所在頁面</th><th>最後回報</th></tr></thead>
      <tbody>${rows.map((s) => `
        <tr class="clickable${isOnline(s) ? '' : ' inactive'}" data-sid="${esc(s.student_id)}" tabindex="0">
          <td class="mono">${isOnline(s) ? '<span class="dot" title="在線"></span>' : ''}${esc(s.student_id)}${s.is_temp ? ' <span class="tag">臨時</span>' : ''}</td>
          <td>${esc(s.name)}</td>
          <td>${s.nickname ? esc(s.nickname) : '<span class="hint">未設定</span>'}</td>
          <td>${isOnline(s) ? esc(hereName(s.page)) : `<span class="hint">${s.page ? `離線（最後在 ${esc(hereName(s.page))}）` : s.login ? '已登入，還沒有回報' : '未登入'}</span>`}</td>
          <td class="hint">${ago(s.age)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="hint">沒有符合的學生。</td></tr>'}</tbody>`;
  }

  // ---------- 彈出視窗 ----------
  function openDlg(kind, extra = {}) {
    open = { kind, ...extra };
    $('#ad-dlg-msg').textContent = ''; $('#ad-dlg-msg').className = 'msg';
    renderDlg();
    if (!dlg.open) dlg.showModal();
  }

  function renderDlg() {
    if (!open || !data) return;
    $('#ad-dlg-back').hidden = !(open.kind === 'person' && open.fromRoster);
    const body = $('#ad-dlg-body');
    if (open.kind === 'person') body.innerHTML = personHTML();
    else if (open.kind === 'roster') { body.innerHTML = rosterHTML(); renderRosterRows(); }
    else if (open.kind === 'settings') body.innerHTML = settingsHTML();
    else if (open.kind === 'admins') body.innerHTML = adminsHTML();
  }

  // 個人設定
  function personHTML() {
    const r = data.roster.find((x) => x.student_id === open.sid);
    if (!r) { $('#ad-dlg-title').textContent = open.sid; return '<p class="hint">找不到這個人（可能已被刪除）。</p>'; }
    const p = here.find((x) => x.student_id === r.student_id);
    $('#ad-dlg-title').innerHTML = `<span class="mono">${esc(r.student_id)}</span>　${esc(r.name || '')}${r.is_temp ? ' <span class="tag">臨時</span>' : ''}`;
    const where = p && isOnline(p) ? `在線：${esc(hereName(p.page))}` : p?.page ? `離線（最後在 ${esc(hereName(p.page))}，${ago(p.age)}）` : r.online ? '已登入' : '未登入';
    return `
      <dl class="kv">
        <dt>身分</dt><dd>${ROLE[r.role] || esc(r.role)}</dd>
        <dt>目前狀態</dt><dd>${where}</dd>
        <dt>暱稱</dt><dd>${r.nickname ? `${esc(r.nickname)}　<button type="button" class="btn small" data-act="clear-nick">清除暱稱</button><span class="hint">　清除後對方下次換頁會被要求重取</span>` : '<span class="hint">未設定</span>'}</dd>
        <dt>Google email</dt><dd><form class="row" data-form="email"><input class="numbox" name="email" type="email" value="${esc(r.email)}" placeholder="（無）" style="max-width:18rem;text-align:left"><button type="submit" class="btn small">儲存</button></form></dd>
        <dt>PIN</dt><dd>${revealed[r.student_id] ? `<strong class="mono big-pin">${revealed[r.student_id]}</strong>　<span class="hint">只顯示這一次，請口頭告訴對方</span>` : r.has_pin ? '已設定' : '<span class="hint">無</span>'}　<button type="button" class="btn small" data-act="pin">${r.has_pin ? '重新產生' : '產生 PIN'}</button></dd>
        <dt>帳號</dt><dd><label class="switch small"><input type="checkbox" data-act="active" ${r.active ? 'checked' : ''}><span class="track"></span><span>${r.active ? '啟用中' : '已停用'}</span></label></dd>
      </dl>
      <div class="modal-foot">
        ${r.online ? '<button type="button" class="btn small" data-act="kick">強制登出</button>' : ''}
        ${r.is_temp ? '<button type="button" class="btn small danger" data-act="delete">刪除這個臨時帳號</button>' : ''}
      </div>`;
  }

  // 名單管理
  function rosterHTML() {
    $('#ad-dlg-title').textContent = '名單管理';
    return `
      <div class="row">
        <input class="numbox" id="ad-search" placeholder="搜尋學號、姓名、暱稱、email" value="${esc(search)}" style="max-width:18rem;text-align:left">
        <span class="hint" id="ad-count"></span>
      </div>
      <p class="hint">點一列可以設定 PIN、email、暱稱、啟用或強制登出。</p>
      <div class="table-wrap"><table class="roster" id="ad-roster"></table></div>
      <details class="modal-sub">
        <summary>新增人員或臨時帳號</summary>
        <form class="row" data-form="add" style="margin-top:.5rem">
          <input class="numbox" name="sid" placeholder="學號或代號，例 T06" required style="max-width:10rem">
          <input class="numbox" name="name" placeholder="姓名（可空白）" style="max-width:9rem">
          <input class="numbox" name="email" placeholder="Google email（可空白）" style="max-width:16rem">
          <select name="role" class="numbox" style="max-width:8rem"><option value="student">學生</option><option value="teacher">老師／助教</option></select>
          <label class="radio"><input type="checkbox" name="temp"> 臨時帳號</label>
          <button type="submit" class="btn small primary">新增</button>
        </form>
      </details>`;
  }
  function renderRosterRows() {
    const q = search.trim().toLowerCase();
    const all = data.roster || [];
    const rows = all.filter((r) => !q || [r.student_id, r.name, r.nickname, r.email].some((v) => (v || '').toLowerCase().includes(q)));
    $('#ad-count').textContent = `共 ${all.length} 人，登入中 ${all.filter((r) => r.online).length} 人`;
    $('#ad-roster').innerHTML = `
      <thead><tr><th>學號</th><th>姓名</th><th>暱稱</th><th>身分</th><th>PIN</th><th>帳號</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr class="clickable${r.active ? '' : ' inactive'}" data-sid="${esc(r.student_id)}" tabindex="0">
          <td class="mono">${r.online ? '<span class="dot" title="登入中"></span>' : ''}${esc(r.student_id)}${r.is_temp ? ' <span class="tag">臨時</span>' : ''}</td>
          <td>${esc(r.name)}</td>
          <td>${r.nickname ? esc(r.nickname) : '<span class="hint">未設定</span>'}</td>
          <td>${ROLE[r.role] || esc(r.role)}</td>
          <td>${revealed[r.student_id] ? `<strong class="mono">${revealed[r.student_id]}</strong>` : r.has_pin ? '已設定' : '<span class="hint">無</span>'}</td>
          <td>${r.active ? '啟用' : '<span class="hint">停用</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="hint">沒有符合的人。</td></tr>'}</tbody>`;
  }

  // 課堂設定
  function settingsHTML() {
    $('#ad-dlg-title').textContent = '課堂設定';
    const flags = data.flags || {};
    return `
      <section class="modal-sub">
        <h3>顯示開關</h3>
        <div class="toggles" data-form="flags">${Object.entries(FLAGS).map(([id, n]) => sw(id, n, !!flags[id])).join('')}</div>
      </section>
      <section class="modal-sub">
        <h3>登入模式</h3>
        <div class="row" role="radiogroup" data-form="mode">
          <label class="radio"><input type="radio" name="mode" value="normal" ${data.login_mode === 'normal' ? 'checked' : ''}> 一般：Google 或 學號＋PIN</label>
          <label class="radio"><input type="radio" name="mode" value="id_only" ${data.login_mode === 'id_only' ? 'checked' : ''}> 快速：只要輸入學號（緊急時用）</label>
        </div>
      </section>
      <section class="modal-sub">
        <h3>資料</h3>
        <p class="hint">正式試教前，可以清掉同學練習時留下的作答紀錄與闖關成績。</p>
        <button type="button" class="btn small danger" data-act="reset">清除所有作答紀錄</button>
      </section>`;
  }

  // 管理員帳號
  function adminsHTML() {
    $('#ad-dlg-title').textContent = '管理員帳號';
    return `
      <p class="hint">這些 Google 帳號可以進入管理頁與大螢幕看板。</p>
      <ul class="plain admin-list">${(data.admins || []).map((a) => `
        <li><span class="mono">${esc(a.email)}</span>${a.note ? `<span class="hint">${esc(a.note)}</span>` : ''}
        <button type="button" class="btn small" data-rm-admin="${esc(a.email)}">移除</button></li>`).join('')}</ul>
      <form class="row" data-form="add-admin">
        <input class="numbox" name="email" type="email" placeholder="新增管理員 Google email" required style="max-width:18rem;text-align:left">
        <button type="submit" class="btn small">新增</button>
      </form>`;
  }

  // ---------- 事件：主畫面 ----------
  $('#ad-refresh').addEventListener('click', () => { load(); loadHere(); });
  view.querySelector('.admin-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openDlg(b.dataset.open);
  });
  $('#ad-pages').addEventListener('change', () => {
    const ids = [...view.querySelectorAll('#ad-pages input:checked')].map((i) => i.dataset.id);
    act(() => rpc('admin_set_setting', { k: 'unlocked', v: ids }), '已更新開放設定');
  });
  $('#ad-all-on').addEventListener('click', () => act(() => rpc('admin_set_setting', { k: 'unlocked', v: Object.keys(PAGE_NAMES) }), '已全部開放'));
  $('#ad-all-off').addEventListener('click', () => act(() => rpc('admin_set_setting', { k: 'unlocked', v: [] }), '已全部關閉'));
  $('#ad-here-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-here]');
    if (b) { hereSel = b.dataset.here; renderHere(); }
  });
  // 點一列（或用鍵盤按 Enter）開啟個人設定
  const rowOpener = (fromRoster) => (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    const tr = e.target.closest('tr[data-sid]');
    if (tr) openDlg('person', { sid: tr.dataset.sid, fromRoster });
  };
  $('#ad-here').addEventListener('click', rowOpener(false));
  $('#ad-here').addEventListener('keydown', rowOpener(false));

  // ---------- 事件：視窗 ----------
  const closeDlg = () => dlg.close();
  $('#ad-dlg-x').addEventListener('click', closeDlg);
  $('#ad-dlg-back').addEventListener('click', () => openDlg('roster'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDlg(); });   // 點視窗外面關閉
  dlg.addEventListener('close', () => { open = null; });
  const body = $('#ad-dlg-body');

  body.addEventListener('input', (e) => {
    if (e.target.id === 'ad-search') { search = e.target.value; renderRosterRows(); }
  });
  body.addEventListener('keydown', (e) => { if (open?.kind === 'roster' && e.target.closest('#ad-roster')) rowOpener(true)(e); });

  body.addEventListener('click', async (e) => {
    if (open?.kind === 'roster' && e.target.closest('#ad-roster')) { rowOpener(true)(e); return; }
    const em = e.target.closest('[data-rm-admin]')?.dataset.rmAdmin;
    if (em) { if (confirm(`確定移除管理員 ${em}？`)) act(() => rpc('admin_remove_admin', { em }), `已移除 ${em}`); return; }
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const a = btn.dataset.act, sid = open?.sid;
    if (a === 'pin') {
      try {
        const pin = await rpc('admin_new_pin', { sid });
        revealed[sid] = pin;
        say(`${sid} 的新 PIN 是 ${pin}（關掉管理頁後就不再顯示，請口頭告訴對方）`);
        await load();
      } catch (err) { say(err.message, 'bad'); }
    } else if (a === 'clear-nick') act(() => rpc('admin_set_nickname', { sid, nick: '' }), `已清除 ${sid} 的暱稱`);
    else if (a === 'kick') act(() => rpc('admin_kick', { sid }), `已讓 ${sid} 登出`);
    else if (a === 'delete' && confirm(`確定要刪除 ${sid}？`)) {
      try { await rpc('admin_delete_person', { sid }); closeDlg(); say(`已刪除 ${sid}`); await load(); }
      catch (err) { say(err.message, 'bad'); }
    } else if (a === 'reset' && confirm('確定清除所有作答紀錄與闖關成績？這個動作無法復原。')) {
      act(() => rpc('admin_reset_events'), '已清除所有作答紀錄');
    }
  });

  body.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'active') {
      const sid = open.sid;
      act(() => rpc('admin_set_active', { sid, on_: el.checked }), `${sid} 已${el.checked ? '啟用' : '停用'}`);
    } else if (el.closest('[data-form="flags"]')) {
      const flags = Object.fromEntries([...body.querySelectorAll('[data-form="flags"] input')].map((i) => [i.dataset.id, i.checked]));
      act(() => rpc('admin_set_setting', { k: 'flags', v: flags }), '已更新顯示開關');
    } else if (el.closest('[data-form="mode"]')) {
      act(() => rpc('admin_set_setting', { k: 'login_mode', v: el.value }), el.value === 'id_only' ? '已切換成快速登入（只要學號）' : '已切換成一般登入');
    }
  });

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form), kind = form.dataset.form;
    if (kind === 'email') {
      const r = data.roster.find((x) => x.student_id === open.sid);
      act(() => rpc('admin_upsert_person', { sid: r.student_id, nm: r.name || '', em: f.get('email'), rl: r.role, tmp: r.is_temp }), `已更新 ${r.student_id} 的 email`);
    } else if (kind === 'add') {
      act(() => rpc('admin_upsert_person', {
        sid: f.get('sid'), nm: f.get('name'), em: f.get('email'), rl: f.get('role'), tmp: f.get('temp') === 'on',
      }), `已新增 ${String(f.get('sid')).toUpperCase()}`);
    } else if (kind === 'add-admin') {
      const em = f.get('email');
      act(() => rpc('admin_add_admin', { em, nt: null }), `已新增管理員 ${em}`);
    }
  });

  // ---------- 自動更新 ----------
  load();
  loadHere();
  const th = setInterval(() => {
    if (!view.contains(dlg)) { clearInterval(th); return; }
    if (!document.hidden) loadHere();
  }, 4000);
  // 每 10 秒更新名單與統計；視窗開著時暫停（避免蓋掉正在輸入的內容）
  const t = setInterval(() => {
    if (!view.contains(dlg)) { clearInterval(t); if (dlg.open) dlg.close(); return; }
    if (dlg.open || document.hidden) return;
    load();
  }, 10000);
}
