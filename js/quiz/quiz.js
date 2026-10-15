// 測驗區：關卡列表、作答、結算、排行榜
//
// 計分：每題答對 20 分（第 1～5 關 5 題全對 100；第 6 關 10 題全對 200）；
//       速度加分（答對才有，每題各自計時）：1～2 秒 +10、3～4 秒 +9、5～6 秒 +8……19～20 秒 +1，超過 20 秒 0；第 1～5 關最高 150、第 6 關最高 300
// 每一題的作答（含完整題目、第幾題 slot）都寫進後端 events，老師端可以看錯題與迷思統計；
// 後端依 slot 逐題覆蓋（重玩時只換掉做過的那幾題），每題分數由後端計算，排行榜加總每一題最新的分數

import { makeLevel } from './gen.js';
import { LEVELS } from './mis.js';
import { session, rpc } from '../backend.js';
import { isUnlocked } from '../settings.js';
import { Plane, svgEl } from '../graph.js';
import { fmt } from '../format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 看過的題目（避免同一個人重複看到） ----------
const seenKey = (lv) => `qlab-seen-${session.me?.student_id || 'guest'}-${lv}`;
function loadSeen(lv) {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(lv)) || '[]')); } catch (_) { return new Set(); }
}
function saveSeen(lv, set) {
  try { localStorage.setItem(seenKey(lv), JSON.stringify([...set].slice(-300))); } catch (_) { /* 私密模式 */ }
}

// ---------- 計分 ----------
// 秒數無條件進位（2.3 秒算第 3 秒），每 2 秒少 1 分
export const BASE = 20, MAX_SPEED = 10, LIMIT_MS = 20000;
export function speedBonus(ms) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  return Math.max(0, MAX_SPEED - Math.floor((sec - 1) / 2));
}

// 送出一題的作答紀錄：失敗時隔 1、2、4 秒重試，全部失敗才回傳 false
const RETRY_MS = [1000, 2000, 4000];
async function sendAnswer(args) {
  for (let t = 0; ; t++) {
    try { await rpc('log_event', args); return true; }
    catch (_) {
      if (t >= RETRY_MS.length) return false;
      await new Promise((r) => setTimeout(r, RETRY_MS[t]));
    }
  }
}

export function points(ok, ms) {
  if (!ok) return { base: 0, speed: 0, total: 0 };
  const speed = speedBonus(ms);
  return { base: BASE, speed, total: BASE + speed };
}

// ---------- 關卡列表 ----------
export async function renderQuizHub(view) {
  const avail = LEVELS.filter((l) => isUnlocked(`quiz${l.id}`));
  view.innerHTML = `
    <div class="task"><h2>測驗區</h2><p>第 1～5 關每關 5 題，第 6 關是綜合挑戰，共 10 題。每題答對 20 分，答對時還有速度加分：2 秒內 +10，之後每 2 秒少 1 分，超過 20 秒就不加分。第 1～5 關最高 150 分，第 6 關最高 300 分。可以重玩，每一題都以最新一次作答為準。</p></div>
    <div class="quiz-levels" id="qz-levels">
      ${LEVELS.map((l) => {
        const open = isUnlocked(`quiz${l.id}`);
        return `<a class="level-card${open ? '' : ' is-locked'}" ${open ? `href="#/quiz/${l.id}"` : 'aria-disabled="true"'}>
          <span class="level-no">${open ? l.id : '🔒'}</span>
          <span class="level-body"><strong>第 ${l.id} 關　${l.name}</strong><span class="hint">${l.topic}${open ? '' : '｜老師還沒開放'}</span></span>
          <span class="level-best mono" data-best="${l.id}"></span>
        </a>`;
      }).join('')}
    </div>
    <section class="card" style="margin-top:12px">
      <h3>排行榜</h3>
      <div id="qz-board" class="hint">載入中…</div>
    </section>`;
  if (!avail.length && !session.offline) view.querySelector('.task p').textContent = '老師還沒有開放任何關卡，請等老師宣布。';
  const boardEl = view.querySelector('#qz-board');
  if (session.offline) { boardEl.textContent = '離線模式無法顯示排行榜。'; return; }
  try {
    const best = session.token ? await rpc('my_quiz_best', { tok: session.token }) : {};
    if (!boardEl.isConnected) return;   // 等待期間已切換到別的畫面
    for (const [lv, sc] of Object.entries(best || {})) {
      const el = view.querySelector(`[data-best="${lv}"]`);
      if (el) el.textContent = `成績 ${sc}`;
    }
  } catch (_) { /* 顯示不出成績不影響作答 */ }
  renderBoard(boardEl);
}

async function renderBoard(el) {
  try {
    const b = await rpc('quiz_leaderboard', { tok: session.token });
    if (!el.isConnected) return;
    if (!b.top.length) { el.textContent = '還沒有人完成關卡。'; return; }
    el.className = '';
    el.innerHTML = `<ol class="board">${b.top.map((r) => `
      <li class="${r.me ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.nickname)}</span>
      <span class="hint">${r.levels} 關</span><span class="sc mono">${r.total}</span></li>`).join('')}</ol>
      ${b.me ? `<p class="hint">你目前第 ${b.me.rank} 名，總分 ${b.me.total}。</p>` : ''}`;
  } catch (e) { if (el.isConnected) el.textContent = e.message; }
}

// ---------- 作答 ----------
export function playLevel(view, level) {
  const info = LEVELS.find((l) => l.id === level);
  if (!info) { location.hash = '#/quiz'; return; }
  const seen = loadSeen(level);
  const qs = makeLevel(level, seen);
  const st = { i: 0, score: 0, correct: 0, ms: 0, t0: 0, answered: false };
  // 送出中的作答紀錄（slot → Promise<是否成功>）與送出時的參數（重新送出用）
  const sending = new Map(), sent = new Map();

  view.innerHTML = `
    <div class="quiz">
      <div class="quiz-top">
        <a href="#/quiz" class="link">← 關卡列表</a>
        <strong>第 ${level} 關　${info.name}</strong>
      </div>
      <div class="quiz-bar">
        <span id="qz-prog" class="mono"></span>
        <span class="mono">分數 <strong id="qz-score">0</strong></span>
      </div>
      <div class="progress"><span id="qz-pbar"></span></div>
      <div class="speed" aria-hidden="true"><span class="speed-label">速度加分 <strong id="qz-spd">+10</strong></span><span class="speed-bar"><span id="qz-spdbar"></span></span></div>
      <section class="card quiz-q">
        <div class="quiz-prompt" id="qz-prompt"></div>
        <div id="qz-graph"></div>
        <div class="quiz-choices" id="qz-choices"></div>
        <div class="msg" id="qz-fb" aria-live="polite"></div>
        <button type="button" class="btn primary wide" id="qz-next" hidden>下一題</button>
      </section>
    </div>`;
  const $ = (s) => view.querySelector(s);

  function show() {
    const q = qs[st.i];
    st.answered = false;
    $('#qz-prog').textContent = `第 ${st.i + 1} / ${qs.length} 題`;
    $('#qz-pbar').style.width = `${(st.i / qs.length) * 100}%`;
    $('#qz-prompt').innerHTML = q.prompt;
    const g = $('#qz-graph');
    g.innerHTML = '';
    if (q.graph) drawGraph(g, q.graph);
    $('#qz-choices').innerHTML = q.choices.map((c, i) => `<button type="button" class="btn choice" data-i="${i}">${c.html}</button>`).join('');
    $('#qz-fb').textContent = ''; $('#qz-fb').className = 'msg';
    $('#qz-next').hidden = true;
    $('#qz-spdbar').classList.remove('is-off');
    st.t0 = performance.now();
    tick();
  }

  // 速度加分即時倒數（答題後停止）：+10 → 每 2 秒少 1 → 超過 20 秒 +0
  let timer = null;
  function tick() {
    cancelAnimationFrame(timer);
    const step = () => {
      if (!view.isConnected || st.answered) return;
      const ms = performance.now() - st.t0;
      const b = speedBonus(ms);
      const lbl = $('#qz-spd'), bar = $('#qz-spdbar');
      if (!lbl) return;
      lbl.textContent = `+${b}`;
      bar.style.width = `${(Math.max(0, LIMIT_MS - ms) / LIMIT_MS) * 100}%`;
      if (b > 0) timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  }

  $('#qz-choices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn || st.answered) return;
    st.answered = true;
    const q = qs[st.i];
    const picked = +btn.dataset.i;
    const ms = Math.round(performance.now() - st.t0);
    const ok = picked === q.answer;
    const p = points(ok, ms);
    // 速度條停在這一題實際拿到的速度分（答錯是 +0，條變灰）
    $('#qz-spd').textContent = `+${p.speed}`;
    $('#qz-spdbar').classList.toggle('is-off', !ok);
    st.score += p.total; st.correct += ok ? 1 : 0; st.ms += ms;
    $('#qz-score').textContent = st.score;
    view.querySelectorAll('.choice').forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add('right');
      else if (i === picked) b.classList.add('wrong');
    });
    const fb = $('#qz-fb');
    fb.className = `msg ${ok ? 'ok' : 'bad'}`;
    fb.innerHTML = ok
      ? `<strong>答對了！+${p.total}</strong>　<span class="hint">（答對 ${p.base}${p.speed ? `、速度 +${p.speed}` : ''}）</span><br>${esc(q.explain)}`
      : `<strong>答錯了</strong><br>${esc(q.explain)}`;
    $('#qz-next').textContent = st.i + 1 < qs.length ? '下一題' : '看結果';
    $('#qz-next').hidden = false;
    seen.add(q.sig);
    // 作答紀錄（含完整題目，老師端看錯題用）；在背景送出並自動重試，不影響作答
    if (!session.offline) {
      const args = {
        tok: session.token, pg: `quiz${level}`, k: 'answer', ok,
        p: {
          sig: q.sig, slot: st.i, level, src: q.src ?? level, type: q.type, prompt: q.promptText, promptHtml: q.prompt, graph: q.graph,
          choices: q.choices.map((c) => ({ text: c.text, html: c.html, mis: c.mis })),
          answer: q.answer, picked, pickedText: q.choices[picked].text,
          mis: ok ? null : (q.choices[picked].mis || 'other'), explain: q.explain, ms,
        },
      };
      sent.set(st.i, args);
      sending.set(st.i, sendAnswer(args));
    }
  });

  $('#qz-next').addEventListener('click', () => {
    st.i += 1;
    if (st.i < qs.length) show(); else finish();
  });

  async function finish() {
    saveSeen(level, seen);
    view.innerHTML = `
      <div class="quiz">
        <section class="card quiz-result">
          <h2>第 ${level} 關完成！</h2>
          <div class="big-score mono">${st.score}</div>
          <p>答對 ${st.correct} / ${qs.length} 題，用時 ${fmt(Math.round(st.ms / 100) / 10)} 秒</p>
          <p class="hint" id="qz-best">${session.offline ? '離線模式：成績不會記錄。' : '正在送出成績…'}</p>
          <div class="row" style="justify-content:center">
            <a class="btn primary" href="#/quiz/${level}" id="qz-again">再玩一次</a>
            <a class="btn" href="#/quiz">回關卡列表</a>
          </div>
        </section>
        <section class="card"><h3>排行榜</h3><div id="qz-board" class="hint">載入中…</div></section>
      </div>`;
    // 同一個網址重新進入：hash 不會改變，手動重新開始
    view.querySelector('#qz-again').addEventListener('click', (e) => { e.preventDefault(); playLevel(view, level); });
    if (session.offline) { view.querySelector('#qz-board').textContent = '離線模式無法顯示排行榜。'; return; }
    const bestEl = view.querySelector('#qz-best'), boardEl = view.querySelector('#qz-board');
    bestEl.textContent = '正在送出作答紀錄…';
    // 等所有作答紀錄送完；有送不出去的題目就顯示「重新送出」
    const settle = async () => {
      const slots = [...sending.keys()];
      const ok = await Promise.all(slots.map((i) => sending.get(i)));
      const failed = slots.filter((_, j) => !ok[j]);
      if (!bestEl.isConnected) return;
      if (failed.length) {
        bestEl.innerHTML = `有 ${failed.length} 題的作答沒有送出（網路不穩）。分數先以畫面為準，請按下面的按鈕再送一次。
          <br><button type="button" class="btn small primary" id="qz-resend">重新送出</button>`;
        bestEl.className = 'msg bad';
        bestEl.querySelector('#qz-resend').addEventListener('click', () => {
          for (const i of failed) sending.set(i, sendAnswer(sent.get(i)));
          bestEl.textContent = '正在重新送出…'; bestEl.className = 'hint';
          settle();
        });
        return;
      }
      try {
        const total = await rpc('submit_quiz', { tok: session.token, lv: level, sc: st.score, cor: st.correct, dur: st.ms });
        if (!bestEl.isConnected) return;
        bestEl.textContent = session.admin ? '（管理員示範：成績不列入排行榜）'
          : `已記錄。這一關目前的成績是 ${total} 分（每一題以最新一次作答為準）。`;
      } catch (e) { if (bestEl.isConnected) bestEl.textContent = `作答已送出，但讀取成績失敗：${e.message}`; }
      if (boardEl.isConnected) renderBoard(boardEl);
    };
    settle();
  }

  show();
}

// ---------- 第 5 關的圖 ----------
export function drawGraph(container, { a, k }) {
  const top = a > 0 ? Math.max(k + 7, 2) : Math.max(k + 2, 2);
  const bottom = a > 0 ? Math.min(k - 2, -2) : Math.min(k - 7, -2);
  const plane = new Plane(container, { xmin: -5, xmax: 5, ymin: bottom, ymax: top, unit: 40, label: '函數圖形' });
  container.classList.add('quiz-graph');
  svgEl('path', { class: 'curve', d: plane.pathForFn((x) => a * x * x + k) }, plane.layers.curve);
  const u = plane.unit, fs = plane.fontSize;
  // 只標頂點；坐標寫在左側，開口向下時寫在左上、開口向上時寫在左下，避開曲線
  svgEl('circle', { class: 'vertex', cx: plane.X(0), cy: plane.Y(k), r: u * 0.13 }, plane.layers.points);
  const t = svgEl('text', {
    class: 'lbl', x: plane.X(0) - u * 0.22, y: plane.Y(k) + (a < 0 ? -u * 0.3 : u * 0.75),
    'text-anchor': 'end', 'font-size': fs * 1.4,
  }, plane.layers.marks);
  t.textContent = `(0, ${fmt(k)})`;
}
