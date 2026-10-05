// 任務③ 拉拉看 a（學習單第四部分表格、比較開口大小）
// 任務⑤ 拉拉看 k（學習單第五部分）
// mode = 'a'：只拉 a，k 固定為 0；mode = 'k'：a、k 都可以拉（第五部分最後一題要把 a 改成 −2）

import { withDesmos, makeCalc, baseExpressions, fitSquare, neededHeight, watch, lifecycle, renderEq, slidersHTML, bindSliders, taskHeader, isPhone, COLORS, L } from './desmos-core.js';
import { eqText, approxEq, numHTML } from './format.js';
import { stepHTML, setStep, stepStates, checklistHTML, markChecks } from './steps.js';
import { mountSlider } from './slider.js';

const PIN_CSS = ['var(--pin1)', 'var(--pin2)', 'var(--pin3)', 'var(--pin4)'];

const TASKS = {
  a: {
    title: '任務③ 拉拉看 a',
    goal: '拉動 a，觀察開口方向、開口大小，以及最高點或最低點在哪裡，完成學習單的表格。',
    ref: '四（表格、比較開口大小）',
  },
  k: {
    title: '任務⑤ 拉拉看 k',
    goal: '拉動 k，觀察圖形怎麼移動，最低點（或最高點）跑到哪裡。',
    ref: '五',
  },
};
// 學習單表格要填的值（拉到時自動打勾）
const A_TABLE = [2, 1, 0.5, -0.5, -1, -2];
const K_TABLE = [1, 3, -2];

export function mountAK(root, mode = 'a') {
  return withDesmos(root, (r) => build(r, mode), mountSlider);
}

function build(root, mode) {
  const phone = isPhone();
  const t = TASKS[mode];
  const onlyA = mode === 'a';
  const tools = `
    <div class="row" style="margin-top:.6rem">
      <button type="button" class="btn" id="ak-pin">保留這條曲線</button>
      <button type="button" class="btn" id="ak-ref" aria-pressed="true">y = x² 參考線</button>
      <button type="button" class="btn" id="ak-reset">重設</button>
    </div>
    <div class="pins" id="ak-pinbox" hidden>
      <div class="pins-head">
        <strong>保留的曲線</strong>
        <button type="button" class="btn small" id="ak-clearpins">全部清除</button>
      </div>
      <ul class="pin-list" id="ak-pins"></ul>
    </div>`;
  const control = `
    <div class="eq" id="ak-eq"></div>
    ${phone ? slidersHTML('ak', { a: true, k: !onlyA }) : `<p class="hint">用左側 Desmos 的${onlyA ? ' a ' : ' a、k '}拉桿。</p>`}
    <div class="msg" id="ak-msg" aria-live="polite"></div>`;
  const steps = onlyA
    ? stepHTML('ak-s1', 1, '拉到學習單表格的 6 個 a 值', `
        <p class="hint" style="margin:0 0 .3rem">每拉到一個值，觀察開口方向、最高點或最低點，填進學習單的表格。</p>
        ${checklistHTML(A_TABLE.map((v) => ({ key: String(v), label: `a = ${numHTML(v)}` })))}
        ${control}`)
      + stepHTML('ak-s2', 2, '比較開口大小', `
        <p class="hint" style="margin:0">把 y = 2x²、y = x²、y = ½x² 三條都「保留」下來（或三條開口向下的），比較誰的開口比較大。</p>
        ${tools}`)
    : stepHTML('ak-s1', 1, 'a = 1 時，拉到 k = 1、3、−2', `
        <p class="hint" style="margin:0 0 .3rem">觀察最低點跑到哪裡、和 y = x² 比往哪裡移動了幾單位，填進學習單的表格。</p>
        ${checklistHTML(K_TABLE.map((v) => ({ key: String(v), label: `k = ${numHTML(v)}` })))}
        ${control}`)
      + stepHTML('ak-s2', 2, '把圖形改成 y = −2x² + 2', `
        <p class="hint" style="margin:0">把 a 改成 −2、k 改成 2。最高點在哪裡？是由 y = −2x² 怎麼移動來的？</p>`)
      + `<div class="card"><h3>工具</h3>${tools}</div>`;
  root.innerHTML = `
    ${taskHeader(t.title, t.goal, t.ref)}
    <div class="lab">
      <div class="stage desmos-stage"><div id="ak-calc" class="desmos-box"></div></div>
      <div class="panel">${steps}</div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#ak-calc'));
  calc.setExpressions(baseExpressions(D, { hideK: onlyA }));
  const st = { a: 1, k: 0, ref: true, pins: [], seq: 0, hy: 17, seen: new Set(), s2: false };
  lifecycle(root, calc, () => fitSquare(calc, 11, st.hy));
  fitSquare(calc);
  const setMsg = (m) => { const el = $('#ak-msg'); el.textContent = m; el.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'ak', calc, setMsg) : () => {};

  // 步驟進度
  function updateSteps() {
    if (onlyA) {
      if (A_TABLE.some((v) => approxEq(v, st.a))) st.seen.add(String(A_TABLE.find((v) => approxEq(v, st.a))));
      const has = (vals) => vals.every((v) => st.pins.some((p) => approxEq(p.a, v)));
      st.s2 = has([2, 1, 0.5]) || has([-2, -1, -0.5]);
    } else {
      if (approxEq(st.a, 1)) { const v = K_TABLE.find((x) => approxEq(x, st.k)); if (v !== undefined) st.seen.add(String(v)); }
      if (approxEq(st.a, -2) && approxEq(st.k, 2)) st.s2 = true;
    }
    markChecks($('#ak-s1'), st.seen);
    const s1done = st.seen.size === (onlyA ? A_TABLE : K_TABLE).length;
    const [s1, s2] = stepStates([s1done, st.s2]);
    setStep($('#ak-s1'), s1, s1done ? '✓ 表格的每一列都看過了，記得填進學習單。' : '', 'ok');
    const h2 = onlyA
      ? (st.s2 ? '✓ 三條都保留了。哪一條開口最大、哪一條最小？和 |a| 有什麼關係？把你的發現寫進學習單「我的歸納」。' : '')
      : (st.s2 ? '✓ 改好了。點一下最高點看坐標，想想它是由 y = −2x² 怎麼移動來的，寫進學習單。' : '');
    setStep($('#ak-s2'), s2, h2, 'ok');
  }

  function refresh() {
    renderEq($('#ak-eq'), $('#ak-msg'), st.a, st.k);
    sync(st.a, st.k);
    $('#ak-pin').disabled = approxEq(st.a, 0) || st.pins.length >= 4 || st.pins.some((p) => approxEq(p.a, st.a) && approxEq(p.k, st.k));
    $('#ak-ref').setAttribute('aria-pressed', String(st.ref));
    updateSteps();
  }
  watch(calc, 'a', (v) => { st.a = v; refresh(); });
  watch(calc, 'k', (v) => {
    st.k = v;
    const h = neededHeight(v);
    if (h !== st.hy) { st.hy = h; fitSquare(calc, 11, h); }
    refresh();
  });

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
