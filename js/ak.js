// 任務③ 拉拉看 a（學習單第四部分表格、比較開口大小）
// 任務⑤ 拉拉看 k（學習單第五部分）
// mode = 'a'：只拉 a，k 固定為 0；mode = 'k'：a、k 都可以拉（第五部分最後一題要把 a 改成 −2）

import { withDesmos, makeCalc, baseExpressions, fitSquare, neededHeight, watch, lifecycle, renderEq, slidersHTML, bindSliders, taskHeader, isPhone, COLORS, L } from './desmos-core.js';
import { eqText, approxEq } from './format.js';
import { mountSlider } from './slider.js';

const PIN_CSS = ['var(--pin1)', 'var(--pin2)', 'var(--pin3)', 'var(--pin4)'];

const TASKS = {
  a: {
    title: '任務③ 拉拉看 a',
    goal: '拉動 a，觀察開口方向、開口大小，以及最高點或最低點在哪裡，完成學習單的表格。',
    ref: '四（表格、比較開口大小）',
    hint: '想比較開口大小時，先按「保留這條曲線」，再改變 a。',
  },
  k: {
    title: '任務⑤ 拉拉看 k',
    goal: '拉動 k，觀察圖形怎麼移動，最低點（或最高點）跑到哪裡。',
    ref: '五',
    hint: '先保留 y = x² 這條曲線，再改變 k，比較兩條曲線的位置。',
  },
};

export function mountAK(root, mode = 'a') {
  return withDesmos(root, (r) => build(r, mode), mountSlider);
}

function build(root, mode) {
  const phone = isPhone();
  const t = TASKS[mode];
  const onlyA = mode === 'a';
  root.innerHTML = `
    ${taskHeader(t.title, t.goal, t.ref)}
    <div class="lab">
      <div class="stage desmos-stage"><div id="ak-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card">
          <div class="eq" id="ak-eq"></div>
          ${phone ? slidersHTML('ak', { a: true, k: !onlyA }) : `<p class="hint">拉動左側 Desmos 的${onlyA ? ' a ' : ' a、k '}拉桿。</p>`}
          <div class="msg" id="ak-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="ak-pin">保留這條曲線</button>
            <button type="button" class="btn" id="ak-ref" aria-pressed="true">y = x² 參考線</button>
            <button type="button" class="btn" id="ak-reset">重設</button>
          </div>
          <p class="hint">${t.hint}</p>
          <div class="pins" id="ak-pinbox" hidden>
            <div class="pins-head">
              <strong>保留的曲線</strong>
              <button type="button" class="btn small" id="ak-clearpins">全部清除</button>
            </div>
            <ul class="pin-list" id="ak-pins"></ul>
          </div>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#ak-calc'));
  calc.setExpressions(baseExpressions(D, { hideK: onlyA }));
  const st = { a: 1, k: 0, ref: true, pins: [], seq: 0, hy: 17 };
  lifecycle(root, calc, () => fitSquare(calc, 11, st.hy));
  fitSquare(calc);
  const setMsg = (m) => { const el = $('#ak-msg'); el.textContent = m; el.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'ak', calc, setMsg) : () => {};

  function refresh() {
    renderEq($('#ak-eq'), $('#ak-msg'), st.a, st.k);
    sync(st.a, st.k);
    $('#ak-pin').disabled = approxEq(st.a, 0) || st.pins.length >= 4 || st.pins.some((p) => approxEq(p.a, st.a) && approxEq(p.k, st.k));
    $('#ak-ref').setAttribute('aria-pressed', String(st.ref));
  }
  watch(calc, 'a', (v) => { st.a = v; refresh(); });
  watch(calc, 'k', (v) => {
    st.k = v;
    const h = neededHeight(v);
    if (h !== st.hy) { st.hy = h; fitSquare(calc, 11, h); }
    refresh();
  });

  // 保留的曲線清單：每條一列（色線＋函數式＋移除），可單獨移除或全部清除
  function drawPins() {
    const list = $('#ak-pins');
    list.innerHTML = '';
    $('#ak-pinbox').hidden = st.pins.length === 0;
    st.pins.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'pin-row';
      li.innerHTML = `<span class="pin-swatch" style="background:${PIN_CSS[i % 4]}"></span>
        <span class="mono pin-eq">${eqText(p.a, p.k)}</span>
        <button type="button" class="btn small">移除</button>`;
      li.querySelector('button').setAttribute('aria-label', `移除 ${eqText(p.a, p.k)}`);
      li.querySelector('button').addEventListener('click', () => {
        calc.removeExpression({ id: p.id });
        st.pins.splice(i, 1);
        st.pins.forEach((q, j) => calc.setExpression({ id: q.id, color: COLORS.pins[j % 4] }));
        drawPins(); refresh();
      });
      list.appendChild(li);
    });
  }
  function clearPins() {
    for (const p of st.pins) calc.removeExpression({ id: p.id });
    st.pins = [];
  }
  $('#ak-clearpins').addEventListener('click', () => { clearPins(); drawPins(); refresh(); });
  $('#ak-pin').addEventListener('click', () => {
    const id = `pin${st.seq++}`;
    calc.setExpression({ id, latex: `y=${L(st.a)}x^{2}+${L(st.k)}`, color: COLORS.pins[st.pins.length % 4], lineWidth: 2.5, secret: true });
    st.pins.push({ id, a: st.a, k: st.k });
    drawPins(); refresh();
  });
  $('#ak-ref').addEventListener('click', () => {
    st.ref = !st.ref;
    calc.setExpression({ id: 'ref', hidden: !st.ref });
    refresh();
  });
  $('#ak-reset').addEventListener('click', () => {
    clearPins(); st.ref = true;
    calc.setExpressions([{ id: 'a', latex: 'a=1' }, { id: 'k', latex: 'k=0' }, { id: 'ref', hidden: false }]);
    st.hy = 17; fitSquare(calc); drawPins(); refresh();
  });

  refresh();
}
