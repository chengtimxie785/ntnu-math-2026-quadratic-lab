// 登入頁與暱稱設定頁

import { session, loginPin, loginGoogle, setNickname, inAppBrowser } from './backend.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderLogin(view, onDone) {
  const idOnly = session.loginMode === 'id_only';
  const inApp = inAppBrowser();
  view.innerHTML = `
    <div class="auth">
      <h1>登入</h1>
      <p class="hint">二次函數互動平台｜康軒版 1-1 主題 1、主題 2</p>
      ${session.googleError ? `<div class="msg bad">${esc(session.googleError)}</div>` : ''}

      <section class="card">
        <h3>方法一：用學校 Google 帳號登入</h3>
        ${inApp ? `<div class="msg bad">你現在是在 LINE 或其他 App 裡開啟網頁，Google 不允許在這裡登入。<br>請按右上角「⋯」選「用瀏覽器開啟」（Chrome 或 Safari），或改用下面的方法二。</div>` : ''}
        <button type="button" class="btn primary wide" id="lg-google">用 Google 帳號登入</button>
        <p class="hint">請選擇「學號@gapps.ntnu.edu.tw」的帳號。</p>
      </section>

      <section class="card">
        <h3>方法二：${idOnly ? '輸入學號' : '學號＋PIN 碼'}</h3>
        <form id="lg-form" class="auth-form">
          <label>學號 <input id="lg-sid" class="numbox" autocomplete="username" autocapitalize="characters" placeholder="例如 41200000S" required></label>
          ${idOnly ? '' : '<label>PIN 碼 <input id="lg-pin" class="numbox" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="向老師拿 4 位數 PIN"></label>'}
          <button type="submit" class="btn primary wide">登入</button>
        </form>
        <p class="hint">${idOnly ? '目前是快速登入模式，輸入學號即可。' : '沒有 PIN 或忘記 PIN，請舉手找老師。'}</p>
      </section>
      <div class="msg" id="lg-msg" aria-live="polite"></div>
    </div>`;
  const msg = view.querySelector('#lg-msg');
  const show = (t, cls = 'bad') => { msg.textContent = t; msg.className = `msg ${cls}`; };

  view.querySelector('#lg-google').addEventListener('click', async () => {
    try { show('正在前往 Google 登入…', ''); await loginGoogle(); }
    catch (e) { show(e.message); }
  });
  view.querySelector('#lg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sid = view.querySelector('#lg-sid').value.trim();
    const pin = view.querySelector('#lg-pin')?.value.trim();
    if (!sid) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try { show('登入中…', ''); await loginPin(sid, pin); onDone(); }
    catch (err) { show(err.message); btn.disabled = false; }
  });
}

export function renderNickname(view, onDone) {
  view.innerHTML = `
    <div class="auth">
      <h1>取一個暱稱</h1>
      <p>暱稱會出現在排行榜等全班看得到的畫面上，請不要用本名，1 到 8 個字，不能和別人重複。</p>
      <form id="nk-form" class="card auth-form">
        <label>暱稱 <input id="nk-in" class="numbox" maxlength="8" required value="${esc(session.me?.nickname || '')}"></label>
        <button type="submit" class="btn primary wide">確定</button>
      </form>
      <div class="msg" id="nk-msg" aria-live="polite"></div>
    </div>`;
  view.querySelector('#nk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = view.querySelector('#nk-msg');
    try { await setNickname(view.querySelector('#nk-in').value); onDone(); }
    catch (err) { m.textContent = err.message; m.className = 'msg bad'; }
  });
}
