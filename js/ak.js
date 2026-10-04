// 互動專區②：a 與 k（學習單第四部分表格與開口比較、第五部分）
// 拉動 a、k 觀察 y = ax² + k 的圖形；可保留曲線比較開口大小

import { withDesmos, makeCalc, baseExpressions, fitSquare, watch, lifecycle, renderEq, slidersHTML, bindSliders, isPhone, COLORS, L } from './desmos-core.js';
import { eqText, approxEq } from './format.js';
import { mountSlider } from './slider.js';

const PIN_CSS = ['var(--pin1)', 'var(--pin2)', 'var(--pin3)', 'var(--pin4)'];

export function mountAK(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const phone = isPhone();
  root.innerHTML = `
    <div class="lab">
      <div class="stage desmos-stage"><div id="ak-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card">
          <div class="eq" id="ak-eq"></div>
          ${phone ? slidersHTML('ak') : '<p class="hint">拉動左側 Desmos 的 a、k 拉桿，觀察圖形怎麼變化。</p>'}
          <div class="msg" id="ak-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="ak-pin">保留這條曲線</button>
            <button type="button" class="btn" id="ak-ref" aria-pressed="true">y = x² 參考線</button>
            <button type="button" class="btn" id="ak-reset">重設</button>
          </div>
          <div class="chips" id="ak-pins"></div>
          <p class="hint">先按「保留這條曲線」留下目前的圖形，再改變 a，就能比較開口大小。</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#ak-calc'));
  calc.setExpressions(baseExpressions(D));
  lifecycle(root, calc, () => fitSquare(calc));
  fitSquare(calc);

  const st = { a: 1, k: 0, ref: true, pins: [], seq: 0 };
  const setMsg = (t) => { const m = $('#ak-msg'); m.textContent = t; m.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'ak', calc, setMsg) : () => {};

  function refresh() {
    renderEq($('#ak-eq'), $('#ak-msg'), st.a, st.k);
    sync(st.a, st.k);
    $('#ak-pin').disabled = approxEq(st.a, 0) || st.pins.length >= 4 || st.pins.some((p) => approxEq(p.a, st.a) && approxEq(p.k, st.k));
    $('#ak-ref').setAttribute('aria-pressed', String(st.ref));
  }
  watch(calc, 'a', (v) => { st.a = v; refresh(); });
  watch(calc, 'k', (v) => { st.k = v; refresh(); });

  function drawPins() {
    const chips = $('#ak-pins');
    chips.innerHTML = '';
    st.pins.forEach((p, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.style.color = PIN_CSS[i % 4];
      c.innerHTML = `${eqText(p.a, p.k)}<button type="button" aria-label="移除 ${eqText(p.a, p.k)}">×</button>`;
      c.querySelector('button').addEventListener('click', () => {
        calc.removeExpression({ id: p.id });
        st.pins.splice(i, 1);
        st.pins.forEach((q, j) => calc.setExpression({ id: q.id, color: COLORS.pins[j % 4] }));
        drawPins(); refresh();
      });
      chips.appendChild(c);
    });
  }
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
    for (const p of st.pins) calc.removeExpression({ id: p.id });
    st.pins = []; st.ref = true;
    calc.setExpressions([{ id: 'a', latex: 'a=1' }, { id: 'k', latex: 'k=0' }, { id: 'ref', hidden: false }]);
    fitSquare(calc); drawPins(); refresh();
  });

  refresh();
}
