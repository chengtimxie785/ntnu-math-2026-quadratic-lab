// 任務④ 上下翻（學習單第四部分的對摺題、歸納第 4 點）
// 把 y = ax² 沿 x 軸翻下來，再拉 a 讓實線和虛線重合，找出 y = ax² 與 y = −ax² 的關係

import { withDesmos, makeCalc, baseExpressions, fitSquare, watch, lifecycle, renderEq, slidersHTML, bindSliders, taskHeader, isPhone } from './desmos-core.js';
import { DesmosFold } from './desmos-fold.js';
import { eqText, approxEq } from './format.js';
import { mountSlider } from './slider.js';

// 「換一題」時從這些 a 值挑
const CHALLENGES = [3, 1, 0.5, -1, -2, 1.5, -0.5, 2.5, -3];

export function mountFlip(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const phone = isPhone();
  root.innerHTML = `
    ${taskHeader('任務④ 上下翻', '把 y = 2x² 沿著 x 軸翻下來，它會和哪一個函數的圖形重合？', '四（對摺題、歸納第 4 點）')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="fp-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card" id="fp-fold">
          <h3>步驟 1　沿 x 軸翻下來</h3>
          <p class="hint" style="margin-bottom:.4rem">按下按鈕，看藍色的圖形沿著 x 軸翻下來，變成橘色虛線。</p>
        </div>
        <div class="card">
          <h3>步驟 2　拉 a，讓實線和虛線重合</h3>
          <div class="eq" id="fp-eq"></div>
          ${phone ? slidersHTML('fp', { a: true, k: false }) : '<p class="hint">拉動左側 Desmos 的 a 拉桿。</p>'}
          <div class="msg" id="fp-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="fp-next" hidden>換一個圖形再挑戰</button>
            <span class="hint" id="fp-count"></span>
          </div>
        </div>
        <div class="card" id="fp-sum" hidden>
          <h3>你發現了嗎？</h3>
          <p style="margin:0">y = ax² 的圖形沿著 x 軸翻下來，都會和 y = ＿＿＿ 的圖形重合。<br>把答案寫在學習單第四部分「我的歸納」第 4 點。</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#fp-calc'));
  calc.setExpressions(baseExpressions(D, { a: 2, hideK: true }).filter((e) => e.id !== 'ref'));

  const st = { a: 2, start: 2, done: 0, counted: false };
  const setMsg = (m) => { const el = $('#fp-msg'); el.textContent = m; el.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'fp', calc, setMsg) : () => {};

  const fold = new DesmosFold(calc, {
    panel: $('#fp-fold'),
    orients: ['h'],
    lockC: 0,
    presets: false,
    goLabel: '沿 x 軸翻下來',
    onResult: (g) => {
      st.start = g.a;
      st.counted = false;
      return { text: `${eqText(g.a, 0)} 翻下來之後，變成橘色虛線。現在到步驟 2 拉動 a，讓藍色實線和虛線重合。`, cls: 'mirror' };
    },
    onMatch: () => {
      if (!st.counted) { st.done += 1; st.counted = true; }   // 每次翻摺只算一題
      $('#fp-next').hidden = false;
      $('#fp-count').textContent = `已完成 ${st.done} 題`;
      if (st.done >= 2) $('#fp-sum').hidden = false;
      return { text: `✓ 重合了！${eqText(st.start, 0)} 沿著 x 軸翻下來，和 ${eqText(fold.st.a, 0)} 的圖形完全重合。`, cls: 'ok' };
    },
  });
  fold.setTop(fitSquare(calc));
  lifecycle(root, calc, () => fold.setTop(fitSquare(calc)));

  function refresh() {
    renderEq($('#fp-eq'), $('#fp-msg'), st.a, 0);
    sync(st.a, 0);
  }
  watch(calc, 'a', (v) => { st.a = v; refresh(); });

  $('#fp-next').addEventListener('click', () => {
    const pool = CHALLENGES.filter((v) => !approxEq(v, st.a) && !approxEq(v, -st.a));
    const a = pool[Math.floor(Math.random() * pool.length)];
    fold.clear();
    calc.setExpression({ id: 'a', latex: `a=${a}` });
    $('#fp-next').hidden = true;
  });

  refresh();
  window.__fold = fold;   // 測試用
}
