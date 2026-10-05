// 測驗區：關卡列表、作答、結算、排行榜
//
// 計分：答對 100；連續答對第 2 題起每題 +20（最多 +80）；答對時 3 秒內 +50，15 秒以上 0，中間線性遞減
// 每一題的作答（含完整題目）都寫進後端 events，老師端可以看錯題與迷思統計

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
export function points(ok, streak, ms) {
  if (!ok) return { base: 0, combo: 0, speed: 0, total: 0 };
  const combo = Math.min(80, 20 * (streak - 1));
  const speed = ms <= 3000 ? 50 : ms >= 15000 ? 0 : Math.round(50 * (15000 - ms) / 12000);
  return { base: 100, combo, speed, total: 100 + combo + speed };
}

// ---------- 關卡列表 ----------
export async function renderQuizHub(view) {
  const avail = LEVELS.filter((l) => isUnlocked(`quiz${l.id}`));
  view.innerHTML = `
    <div class="task"><h2>測驗區</h2><p>每關 5 題。答對得 100 分，連續答對、答得快都有加分。每關可以重玩，取最高分。</p></div>
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
      if (el) el.textContent = `最高 ${sc}`;
    }
  } catch (_) { /* 顯示不出最高分不影響作答 */ }
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
  const st = { i: 0, score: 0, streak: 0, correct: 0, ms: 0, t0: 0, answered: false };

  view.innerHTML = `
    <div class="quiz">
      <div class="quiz-top">
        <a href="#/quiz" class="link">← 關卡列表</a>
        <strong>第 ${level} 關　${info.name}</strong>
      </div>
      <div class="quiz-bar">
        <span id="qz-prog" class="mono"></span>
        <span id="qz-combo"></span>
        <span class="mono">分數 <strong id="qz-score">0</strong></span>
      </div>
      <div class="progress"><span id="qz-pbar"></span></div>
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
    $('#qz-combo').textContent = st.streak >= 2 ? `🔥 連對 ${st.streak}` : '';
    $('#qz-prompt').innerHTML = q.prompt;
    const g = $('#qz-graph');
    g.innerHTML = '';
    if (q.graph) drawGraph(g, q.graph);
    $('#qz-choices').innerHTML = q.choices.map((c, i) => `<button type="button" class="btn choice" data-i="${i}">${c.html}</button>`).join('');
    $('#qz-fb').textContent = ''; $('#qz-fb').className = 'msg';
    $('#qz-next').hidden = true;
    st.t0 = performance.now();
  }

  $('#qz-choices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn || st.answered) return;
    st.answered = true;
    const q = qs[st.i];
    const picked = +btn.dataset.i;
    const ms = Math.round(performance.now() - st.t0);
    const ok = picked === q.answer;
    st.streak = ok ? st.streak + 1 : 0;
    const p = points(ok, st.streak, ms);
    st.score += p.total; st.correct += ok ? 1 : 0; st.ms += ms;
    $('#qz-score').textContent = st.score;
    $('#qz-combo').textContent = st.streak >= 2 ? `🔥 連對 ${st.streak}` : '';
    view.querySelectorAll('.choice').forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add('right');
      else if (i === picked) b.classList.add('wrong');
    });
    const fb = $('#qz-fb');
    fb.className = `msg ${ok ? 'ok' : 'bad'}`;
    fb.innerHTML = ok
      ? `<strong>答對了！+${p.total}</strong>　<span class="hint">（答對 100${p.combo ? `、連對 +${p.combo}` : ''}${p.speed ? `、速度 +${p.speed}` : ''}）</span><br>${esc(q.explain)}`
      : `<strong>答錯了</strong><br>${esc(q.explain)}`;
    $('#qz-next').textContent = st.i + 1 < qs.length ? '下一題' : '看結果';
    $('#qz-next').hidden = false;
    seen.add(q.sig);
    // 作答紀錄（含完整題目，老師端看錯題用）；送不出去也不影響作答
    if (!session.offline) {
      rpc('log_event', {
        tok: session.token, pg: `quiz${level}`, k: 'answer', ok,
        p: {
          sig: q.sig, level, type: q.type, prompt: q.promptText, promptHtml: q.prompt, graph: q.graph,
          choices: q.choices.map((c) => ({ text: c.text, html: c.html, mis: c.mis })),
          answer: q.answer, picked, pickedText: q.choices[picked].text,
          mis: ok ? null : (q.choices[picked].mis || 'other'), explain: q.explain, ms,
        },
      }).catch(() => {});
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
    try {
      const best = await rpc('submit_quiz', { tok: session.token, lv: level, sc: st.score, cor: st.correct, dur: st.ms });
      bestEl.textContent = session.token ? `這一關你的最高分是 ${best}。` : '（管理員示範：成績不列入排行榜）';
    } catch (e) { bestEl.textContent = `成績送出失敗：${e.message}`; }
    if (boardEl.isConnected) renderBoard(boardEl);
  }

  show();
}

// ---------- 第 5 關的圖 ----------
export function drawGraph(container, { a, k, mark }) {
  const top = a > 0 ? Math.max(k + 7, 2) : Math.max(k + 2, 2);
  const bottom = a > 0 ? Math.min(k - 2, -2) : Math.min(k - 7, -2);
  const plane = new Plane(container, { xmin: -5, xmax: 5, ymin: bottom, ymax: top, unit: 40, label: '函數圖形' });
  container.classList.add('quiz-graph');
  svgEl('path', { class: 'curve', d: plane.pathForFn((x) => a * x * x + k) }, plane.layers.curve);
  const u = plane.unit, fs = plane.fontSize;
  for (const p of [{ x: 0, y: k }, mark]) {
    svgEl('circle', { class: 'vertex', cx: plane.X(p.x), cy: plane.Y(p.y), r: u * 0.13 }, plane.layers.points);
    const t = svgEl('text', { class: 'lbl', x: plane.X(p.x) + u * 0.22, y: plane.Y(p.y) + (p === mark ? -u * 0.25 : u * 0.6), 'font-size': fs * 1.4 }, plane.layers.marks);
    t.textContent = `(${fmt(p.x)}, ${fmt(p.y)})`;
  }
}
