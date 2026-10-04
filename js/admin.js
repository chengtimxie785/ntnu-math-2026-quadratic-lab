// 管理頁（只有 admins 表中的 Google 帳號能用）
// 開放控制、顯示開關、登入模式、名單管理（含 PIN、臨時帳號）、管理員帳號、清除紀錄

import { session, rpc, loginGoogle } from './backend.js';
import { PAGE_NAMES, FLAGS } from './settings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { student: '學生', teacher: '老師／助教' };

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
        <span class="hint">登入身分：${esc(session.email)}</span>
        <button type="button" class="btn small" id="ad-refresh">重新整理</button>
      </div>
      <div class="msg" id="ad-msg" aria-live="polite"></div>

      <section class="card">
        <h3>開放控制</h3>
        <p class="hint">打開的頁面學生才看得到，切換後約 4 秒內同步到學生手機。管理員自己永遠看得到全部頁面。</p>
        <div class="toggles" id="ad-pages"></div>
        <div class="row" style="margin-top:.5rem">
          <button type="button" class="btn small" id="ad-all-on">全部開放</button>
          <button type="button" class="btn small" id="ad-all-off">全部關閉</button>
        </div>
      </section>

      <section class="card">
        <h3>顯示開關</h3>
        <div class="toggles" id="ad-flags"></div>
      </section>

      <section class="card">
        <h3>登入模式</h3>
        <div class="row" role="radiogroup" id="ad-mode">
          <label class="radio"><input type="radio" name="mode" value="normal"> 一般：Google 或 學號＋PIN</label>
          <label class="radio"><input type="radio" name="mode" value="id_only"> 快速：只要輸入學號（緊急時用）</label>
        </div>
      </section>

      <section class="card">
        <h3>名單 <span class="hint" id="ad-count"></span></h3>
        <div class="row">
          <input class="numbox" id="ad-search" placeholder="搜尋學號、姓名、暱稱" style="max-width:16rem;text-align:left">
        </div>
        <div class="table-wrap"><table class="roster" id="ad-roster"></table></div>
        <details style="margin-top:.6rem">
          <summary>新增人員或臨時帳號</summary>
          <form class="row" id="ad-add" style="margin-top:.5rem">
            <input class="numbox" name="sid" placeholder="學號或代號，例 T06" required style="max-width:10rem">
            <input class="numbox" name="name" placeholder="姓名（可空白）" style="max-width:9rem">
            <input class="numbox" name="email" placeholder="Google email（可空白）" style="max-width:16rem">
            <select name="role" class="numbox" style="max-width:8rem"><option value="student">學生</option><option value="teacher">老師／助教</option></select>
            <label class="radio"><input type="checkbox" name="temp"> 臨時帳號</label>
            <button type="submit" class="btn small primary">新增</button>
          </form>
        </details>
      </section>

      <section class="card">
        <h3>管理員帳號</h3>
        <p class="hint">這些 Google 帳號可以進入管理頁。</p>
        <ul class="plain" id="ad-admins"></ul>
        <form class="row" id="ad-add-admin">
          <input class="numbox" name="email" type="email" placeholder="新增管理員 Google email" required style="max-width:18rem;text-align:left">
          <button type="submit" class="btn small">新增</button>
        </form>
      </section>

      <section class="card">
        <h3>資料</h3>
        <p class="hint">正式試教前，可以清掉同學練習時留下的作答紀錄。</p>
        <button type="button" class="btn small mirror" id="ad-reset">清除所有作答紀錄</button>
      </section>
    </div>`;

  const $ = (s) => view.querySelector(s);
  let data = null;
  const revealed = {};   // 這次產生的 PIN（只在本頁暫時顯示）
  const say = (t, cls = 'ok') => { const m = $('#ad-msg'); m.textContent = t; m.className = `msg ${cls}`; };
  const act = async (fn, okText) => {
    try { await fn(); if (okText) say(okText); await load(); }
    catch (e) { say(e.message, 'bad'); }
  };

  async function load() {
    try { data = await rpc('admin_overview'); render(); }
    catch (e) { say(e.message, 'bad'); }
  }

  function toggle(id, label, on) {
    return `<label class="switch"><input type="checkbox" data-id="${esc(id)}" ${on ? 'checked' : ''}><span class="track"></span><span>${esc(label)}</span></label>`;
  }

  function render() {
    const unlocked = new Set(data.unlocked || []);
    $('#ad-pages').innerHTML = Object.entries(PAGE_NAMES).map(([id, n]) => toggle(id, n, unlocked.has(id))).join('');
    const flags = data.flags || {};
    $('#ad-flags').innerHTML = Object.entries(FLAGS).map(([id, n]) => toggle(id, n, !!flags[id])).join('');
    view.querySelectorAll('#ad-mode input').forEach((r) => { r.checked = r.value === data.login_mode; });
    renderRoster();
    $('#ad-admins').innerHTML = (data.admins || []).map((a) => `
      <li class="row"><span class="mono">${esc(a.email)}</span>${a.note ? `<span class="hint">${esc(a.note)}</span>` : ''}
      <button type="button" class="btn small" data-rm-admin="${esc(a.email)}">移除</button></li>`).join('');
  }

  function renderRoster() {
    const q = $('#ad-search').value.trim().toLowerCase();
    const rows = (data.roster || []).filter((r) => !q || [r.student_id, r.name, r.nickname, r.email].some((v) => (v || '').toLowerCase().includes(q)));
    const online = (data.roster || []).filter((r) => r.online).length;
    $('#ad-count').textContent = `共 ${data.roster.length} 人，目前登入中 ${online} 人`;
    $('#ad-roster').innerHTML = `
      <thead><tr><th>學號</th><th>姓名</th><th>暱稱</th><th>Google email</th><th>身分</th><th>PIN</th><th>狀態</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr class="${r.active ? '' : 'inactive'}" data-sid="${esc(r.student_id)}">
          <td class="mono">${r.online ? '<span class="dot" title="登入中"></span>' : ''}${esc(r.student_id)}${r.is_temp ? ' <span class="tag">臨時</span>' : ''}</td>
          <td>${esc(r.name)}</td>
          <td>${r.nickname ? `${esc(r.nickname)} <button type="button" class="link" data-act="clear-nick">清除</button>` : '<span class="hint">未設定</span>'}</td>
          <td><input class="numbox email" data-act="email" value="${esc(r.email)}" placeholder="（無）"></td>
          <td>${ROLE[r.role] || r.role}</td>
          <td><span class="pin-cell">${revealed[r.student_id] ? `<strong class="mono big-pin">${revealed[r.student_id]}</strong>` : r.has_pin ? '已設定' : '<span class="hint">無</span>'}</span> <button type="button" class="link" data-act="pin">${r.has_pin ? '重新產生' : '產生'}</button></td>
          <td><label class="switch small"><input type="checkbox" data-act="active" ${r.active ? 'checked' : ''}><span class="track"></span><span>${r.active ? '啟用' : '停用'}</span></label></td>
          <td class="row-actions">
            ${r.online ? '<button type="button" class="link" data-act="kick">強制登出</button>' : ''}
            ${r.is_temp ? '<button type="button" class="link danger" data-act="delete">刪除</button>' : ''}
          </td>
        </tr>`).join('')}</tbody>`;
  }

  // ---------- 事件 ----------
  $('#ad-refresh').addEventListener('click', load);
  $('#ad-search').addEventListener('input', () => data && renderRoster());

  $('#ad-pages').addEventListener('change', () => {
    const ids = [...view.querySelectorAll('#ad-pages input:checked')].map((i) => i.dataset.id);
    act(() => rpc('admin_set_setting', { k: 'unlocked', v: ids }), '已更新開放設定');
  });
  $('#ad-all-on').addEventListener('click', () => act(() => rpc('admin_set_setting', { k: 'unlocked', v: Object.keys(PAGE_NAMES) }), '已全部開放'));
  $('#ad-all-off').addEventListener('click', () => act(() => rpc('admin_set_setting', { k: 'unlocked', v: [] }), '已全部關閉'));
  $('#ad-flags').addEventListener('change', () => {
    const flags = Object.fromEntries([...view.querySelectorAll('#ad-flags input')].map((i) => [i.dataset.id, i.checked]));
    act(() => rpc('admin_set_setting', { k: 'flags', v: flags }), '已更新顯示開關');
  });
  $('#ad-mode').addEventListener('change', (e) => {
    act(() => rpc('admin_set_setting', { k: 'login_mode', v: e.target.value }), e.target.value === 'id_only' ? '已切換成快速登入（只要學號）' : '已切換成一般登入');
  });

  $('#ad-roster').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'INPUT') return;
    const sid = btn.closest('tr').dataset.sid;
    const a = btn.dataset.act;
    if (a === 'pin') {
      try {
        const pin = await rpc('admin_new_pin', { sid });
        revealed[sid] = pin;
        say(`${sid} 的新 PIN 是 ${pin}（離開這一頁後就不再顯示，請口頭告訴對方）`);
        await load();
      } catch (err) { say(err.message, 'bad'); }
    } else if (a === 'clear-nick') act(() => rpc('admin_set_nickname', { sid, nick: '' }), `已清除 ${sid} 的暱稱`);
    else if (a === 'kick') act(() => rpc('admin_kick', { sid }), `已讓 ${sid} 登出`);
    else if (a === 'delete' && confirm(`確定要刪除 ${sid}？`)) act(() => rpc('admin_delete_person', { sid }), `已刪除 ${sid}`);
  });
  $('#ad-roster').addEventListener('change', (e) => {
    const el = e.target;
    const sid = el.closest('tr')?.dataset.sid;
    if (!sid) return;
    const r = data.roster.find((x) => x.student_id === sid);
    if (el.dataset.act === 'active') act(() => rpc('admin_set_active', { sid, on_: el.checked }), `${sid} 已${el.checked ? '啟用' : '停用'}`);
    if (el.dataset.act === 'email') {
      act(() => rpc('admin_upsert_person', { sid, nm: r.name || '', em: el.value, rl: r.role, tmp: r.is_temp }), `已更新 ${sid} 的 email`);
    }
  });
  $('#ad-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    act(() => rpc('admin_upsert_person', {
      sid: f.get('sid'), nm: f.get('name'), em: f.get('email'), rl: f.get('role'), tmp: f.get('temp') === 'on',
    }), `已新增 ${String(f.get('sid')).toUpperCase()}`).then(() => e.target.reset());
  });
  $('#ad-admins').addEventListener('click', (e) => {
    const em = e.target.dataset.rmAdmin;
    if (em && confirm(`確定移除管理員 ${em}？`)) act(() => rpc('admin_remove_admin', { em }), `已移除 ${em}`);
  });
  $('#ad-add-admin').addEventListener('submit', (e) => {
    e.preventDefault();
    const em = new FormData(e.target).get('email');
    act(() => rpc('admin_add_admin', { em, nt: null }), `已新增管理員 ${em}`).then(() => e.target.reset());
  });
  $('#ad-reset').addEventListener('click', () => {
    if (confirm('確定清除所有作答紀錄？這個動作無法復原。')) act(() => rpc('admin_reset_events'), '已清除所有作答紀錄');
  });

  load();
  // 每 10 秒更新「登入中」人數（使用者正在輸入 email 時不更新，避免蓋掉）
  const t = setInterval(() => {
    if (!view.contains($('#ad-roster'))) { clearInterval(t); return; }
    if (document.activeElement?.closest?.('#ad-roster, #ad-add, #ad-add-admin')) return;
    load();
  }, 10000);
}
