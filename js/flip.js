// 任務④ 上下翻（學習單第四部分的對摺題、歸納第 4 點）
// 把 y = ax² 沿 x 軸翻下來，再拉 a 讓實線和虛線重合，找出 y = ax² 與 y = −ax² 的關係
//
// 兩步驟引導：步驟 1（翻下來）完成前，步驟 2 變暗、手機版 a 拉桿鎖住；
// 重合後出現「下一題」，換新圖形時步驟 1 會寫出新題目並提示先翻下來

import { withDesmos, makeCalc, baseExpressions, fitSquare, watch, lifecycle, renderEq, slidersHTML, bindSliders, taskHeader, isPhone } from './desmos-core.js';
import { DesmosFold } from './desmos-fold.js';
import { eqText, eqHTML, approxEq } from './format.js';
import { mountSlider } from './slider.js';

// 「下一題」時從這些 a 值挑
const CHALLENGES = [3, 1, 0.5, -1, -2, 1.5, -0.5, 2.5, -3];

export function mountFlip(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const phone = isPhone();
  root.innerHTML = `
    ${taskHeader('任務④ 上下翻', '把 y = ax² 沿著橫的那條座標軸翻下來，它會和哪一個函數的圖形重合？', '四（對摺題、歸納第 4 點）')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="fp-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card step" id="fp-step1">
          <h3><span class="step-no">1</span>沿著橫的座標軸翻下來<span class="step-done">✓ 完成</span></h3>
          <p class="step-target">要翻的圖形：<span class="eq-inline" id="fp-target"></span></p>
          <p class="hint" id="fp-hint1" style="margin-bottom:.4rem"></p>
        </div>
        <div class="card step" id="fp-step2">
          <h3><span class="step-no">2</span>拉 a，讓實線和虛線重合<span class="step-done">✓ 完成</span></h3>
          <div class="eq" id="fp-eq"></div>
          ${phone ? slidersHTML('fp', { a: true, k: false }) : '<p class="hint">用左側 Desmos 的 a 拉桿。</p>'}
          <div class="msg" id="fp-msg" aria-live="polite"></div>
          <div class="msg" id="fp-hint2" aria-live="polite"></div>
          <button type="button" class="btn primary wide" id="fp-next" hidden>下一題：換一個圖形</button>
          <p class="hint" id="fp-count" style="margin:.4rem 0 0"></p>
        </div>
        <div class="card" id="fp-sum" hidden>
          <h3>你發現了嗎？</h3>
          <p style="margin:0">y = ax² 的圖形沿著橫的座標軸翻下來，都會和 y = ＿＿＿ 的圖形重合。<br>把答案寫在學習單第四部分「我的歸納」第 4 點。</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#fp-calc'));
  calc.setExpressions(baseExpressions(D, { a: 2, hideK: true }).filter((e) => e.id !== 'ref'));

  const st = { a: 2, start: 2, done: 0, matched: false, counted: false, isNew: false };
  const setMsg = (m) => { const el = $('#fp-msg'); el.textContent = m; el.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'fp', calc, setMsg) : () => {};

  const fold = new DesmosFold(calc, {
    panel: $('#fp-step1'),
    orients: ['h'],
    lockC: 0,
    presets: false,
    goLabel: '翻下來',   // 按鈕不寫出「x 軸」：學習單四的對摺題要學生自己填
    onResult: (g) => {
      st.start = g.a; st.counted = false; st.isNew = false;
      setTimeout(update);
      return { text: '翻下來了！橘色虛線就是翻下來的圖形。接著做步驟 2。', cls: 'ok' };
    },
    onMatch: () => ({ text: '翻下來了！橘色虛線就是翻下來的圖形。', cls: 'ok' }),
    onClear: () => update(),
  });
  fold.setTop(fitSquare(calc));
  lifecycle(root, calc, () => fold.setTop(fitSquare(calc)));

  // 依目前進度更新兩個步驟的狀態與提示
  function update() {
    const folded = !!fold.st.ghost;
    // 沿 x 軸（y = 0）翻下來後，和 y = −ax² 重合
    const matched = folded && approxEq(st.a, -st.start);
    if (matched && !st.counted) {
      st.counted = true; st.done += 1;
      if (st.done >= 2) $('#fp-sum').hidden = false;
    }
    st.matched = matched;

    $('#fp-step1').className = `card step ${folded ? 'done' : 'active'}`;
    $('#fp-step2').className = `card step ${!folded ? 'waiting' : matched ? 'done' : 'active'}`;
    $('#fp-target').innerHTML = eqHTML(folded ? st.start : st.a, 0);
    $('#fp-hint1').textContent = folded ? '' : st.isNew
      ? '新題目！先按下面的「翻下來」。'
      : '先按下面的按鈕，看藍色的圖形沿著橫的座標軸翻下來，變成橘色虛線。';

    const h2 = $('#fp-hint2');
    if (!folded) { h2.textContent = '先完成步驟 1，再來拉 a。'; h2.className = 'msg'; }
    else if (matched) {
      h2.textContent = `✓ 重合了！${eqText(st.start, 0)} 沿著橫的座標軸翻下來，和 ${eqText(st.a, 0)} 的圖形完全重合。`;
      h2.className = 'msg ok';
    } else { h2.textContent = '拉動 a，讓藍色實線和橘色虛線完全重合。'; h2.className = 'msg mirror'; }

    $('#fp-next').hidden = !matched;
    $('#fp-count').textContent = st.done ? `已完成 ${st.done} 題` : '';
    // 手機版：步驟 1 完成前先鎖住 a 拉桿，避免學生在沒有虛線時亂拉
    for (const id of ['#fp-a', '#fp-a-in']) { const el = $(id); if (el) el.disabled = !folded; }
  }

  function refresh() {
    renderEq($('#fp-eq'), $('#fp-msg'), st.a, 0);
    sync(st.a, 0);
    update();
  }
  watch(calc, 'a', (v) => { st.a = v; refresh(); });

  $('#fp-next').addEventListener('click', () => {
    const pool = CHALLENGES.filter((v) => !approxEq(v, st.a) && !approxEq(v, -st.a));
    const a = pool[Math.floor(Math.random() * pool.length)];
    st.isNew = true;
    fold.clear();
    calc.setExpression({ id: 'a', latex: `a=${a}` });
    st.a = a;
    refresh();
    root.querySelector('#fp-step1').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  refresh();
  window.__fold = fold;   // 測試用
}
