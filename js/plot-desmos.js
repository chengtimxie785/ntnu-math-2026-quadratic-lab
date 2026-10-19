// 互動專區①：描點變曲線（學習單第三部分），Desmos 版
// 對應課本 p.10～12：先描 7 個整數點，再逐步加密，最後連成平滑曲線；
// 步驟 3 在曲線上放一個只能沿著 y = x² 拖曳的點 P，拖到最低點 (0, 0) 就完成
// Desmos 載入失敗時改用內建 SVG 版（plot.js）

import { withDesmos, makeCalc, fitBox, watch, lifecycle, taskHeader, COLORS, L } from './desmos-core.js';
import { fmt, approxEq } from './format.js';
import { stepHTML, setStep, stepStates } from './steps.js';
import { mountPlot } from './plot.js';

const STEPS = [1, 0.5, 0.25, 0.1];   // 點距；最後一步之後畫出連續曲線
const XMAX = 3;
const T0 = 2;                         // P 點一開始的位置 (2, 4)
const VIEW = [-4.5, 4.5, -1, 10];     // 至少要看得到的範圍

export function mountPlotDesmos(root) {
  return withDesmos(root, build, mountPlot);
}

// 點距 h 時的 x 值
function xsOf(h) {
  const out = [];
  for (let i = -Math.round(XMAX / h); i <= Math.round(XMAX / h); i++) out.push(Math.round(i * h * 1000) / 1000);
  return out;
}
const listL = (xs) => `\\left[${xs.join(',')}\\right]`;

function build(root) {
  root.innerHTML = `
    ${taskHeader('任務① 描點畫圖', 'y = x² 的點越來越多時，會連成什麼樣的圖形？', '三 1～3-(2)')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="pl-calc" class="desmos-box"></div></div>
      <div class="panel">
        <p class="hint" style="margin:0">y = x<sup>2</sup>，x 從 −3 到 3，點距 <span class="num" id="plot-step">1</span>，目前有 <span class="num" id="plot-count">7</span> 個點。點一下圖上的點可以看坐標。</p>
        ${stepHTML('pl-s1', 1, '用線段把 7 個點連起來', `
          <p class="hint" style="margin:0 0 .4rem">和學習單上描的點一樣。用線段連起來，看看是什麼形狀。</p>
          <button type="button" class="btn" id="plot-line" aria-pressed="false">用線段連起來</button>`)}
        ${stepHTML('pl-s2', 2, '加更多點，直到變成平滑曲線', `
          <p class="hint" style="margin:0 0 .4rem">每按一次，點距就變小、點變多。連成的線還有折角嗎？</p>
          <div class="row"><button type="button" class="btn primary" id="plot-more">加更多點</button>
          <button type="button" class="btn" id="plot-reset">重來</button></div>`)}
        ${stepHTML('pl-s3', 3, '找出最低點', `
          <p class="hint" style="margin:0">拖曳曲線上的黑點 P（它只會沿著曲線移動），找出圖形上「最低」的那個點，看它的坐標。</p>`)}
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  // 關掉自動標出的特殊點（否則點曲線時 Desmos 會直接標出最低點）
  const calc = makeCalc($('#pl-calc'), { pointsOfInterest: false });
  const fit = () => fitBox(calc, ...VIEW);
  lifecycle(root, calc, fit);
  fit();

  const st = { level: 0, curve: false, line: false, prev: [], lineTried: false, foundMin: false, t: T0, moved: false };

  // t：P 點的 x（每格 0.1），u：P 點的 y
  calc.setExpressions([
    { id: 't', latex: `t=${T0}`, secret: true, sliderBounds: { min: '-4', max: '4', step: '0.1' } },
    { id: 'u', latex: 'u=t^{2}', secret: true },
  ]);
  watch(calc, 't', (v) => {
    const t = Math.round(v * 10) / 10;
    if (t === st.t) return;
    st.t = t;
    if (st.curve) { st.moved = true; if (approxEq(t, 0)) st.foundMin = true; }
    steps();
  });

  function draw() {
    for (const id of ['po', 'pn', 'ln', 'cv', 'P']) calc.removeExpression({ id });
    if (st.curve) {
      calc.setExpressions([
        { id: 'cv', latex: 'y=x^{2}', color: COLORS.curve, lineWidth: 3.5, secret: true },
        { id: 'P', latex: '\\left(t,u\\right)', color: COLORS.point, pointSize: 20, dragMode: D.DragModes.X, showLabel: true, label: '(${t}, ${u})', secret: true },
      ]);
    } else {
      const xs = xsOf(STEPS[st.level]);
      const old = xs.filter((x) => st.prev.includes(x)), fresh = xs.filter((x) => !st.prev.includes(x));
      const size = st.level >= 3 ? 6 : st.level >= 2 ? 8 : 11;
      if (st.line) calc.setExpression({ id: 'ln', latex: `\\left(${listL(xs)},${listL(xs)}^{2}\\right)`, color: COLORS.curve, lines: true, points: false, lineWidth: 2.5, secret: true });
      if (old.length) calc.setExpression({ id: 'po', latex: `\\left(${listL(old)},${listL(old)}^{2}\\right)`, color: COLORS.point, pointSize: size, dragMode: D.DragModes.NONE, secret: true });
      // 新加入的點用另一個顏色，看得出哪些是這次加的
      if (fresh.length) calc.setExpression({ id: 'pn', latex: `\\left(${listL(fresh)},${listL(fresh)}^{2}\\right)`, color: st.level ? COLORS.pins[1] : COLORS.point, pointSize: size, dragMode: D.DragModes.NONE, secret: true });
      st.prev = xs;
    }
    const n = st.curve ? 0 : xsOf(STEPS[st.level]).length;
    $('#plot-step').textContent = st.curve ? '無限小' : fmt(STEPS[st.level]);
    $('#plot-count').textContent = st.curve ? '無限多' : String(n);
    const more = $('#plot-more');
    if (st.curve) { more.textContent = '已完成'; more.disabled = true; }
    else if (st.level === STEPS.length - 1) { more.textContent = '畫出平滑曲線'; more.disabled = false; }
    else { more.textContent = '加更多點'; more.disabled = false; }
    $('#plot-line').disabled = st.curve;
    $('#plot-line').setAttribute('aria-pressed', String(st.line && !st.curve));
    steps();
  }

  // 三個步驟的狀態與提示
  function steps() {
    const [s1, s2, s3] = stepStates([st.lineTried, st.curve, st.foundMin]);
    setStep($('#pl-s1'), s1, st.lineTried ? '只有 7 個點時，連起來有明顯的折角，不太像一條光滑的線。' : '', 'mirror');
    setStep($('#pl-s2'), s2, st.curve
      ? '點多到數不完時，就連成一條平滑的曲線，這就是 y = x² 的圖形。'
      : st.level > 0 ? `點距 ${fmt(STEPS[st.level])}：折角越來越不明顯了，再按看看。` : '', st.curve ? 'ok' : '');
    let h3 = '', c3 = '';
    if (st.foundMin) { h3 = '✓ 找到最低點了！把它的坐標寫進學習單，接著到「任務② 找對稱軸」。'; c3 = 'ok'; }
    else if (st.curve && st.moved) { h3 = `(${fmt(st.t)}, ${fmt(Math.round(st.t * st.t * 100) / 100)}) 不是最低點，再往下找找看。`; c3 = 'bad'; }
    setStep($('#pl-s3'), s3, h3, c3);
  }

  $('#plot-more').addEventListener('click', () => {
    if (st.level < STEPS.length - 1) st.level++;
    else st.curve = true;
    draw();
  });
  $('#plot-line').addEventListener('click', () => { st.line = !st.line; if (st.line) st.lineTried = true; draw(); });
  // 重來：只重設步驟 2（點距回到 1）；步驟 1 的線段保持原樣，步驟 3 要有曲線才能做，所以一起重設
  $('#plot-reset').addEventListener('click', () => {
    Object.assign(st, { level: 0, curve: false, prev: [], foundMin: false, t: T0, moved: false });
    calc.setExpression({ id: 't', latex: `t=${L(T0)}` });
    draw();
  });

  draw();
  window.__plot = calc;   // 測試用
}
