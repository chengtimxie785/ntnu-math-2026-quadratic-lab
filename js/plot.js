// 互動專區①：描點變曲線（學習單第三部分）
// 對應課本 p.10～12：先描 7 個整數點，再逐步加密，最後連成平滑曲線

import { Plane, svgEl } from './graph.js';
import { fmt, fmtPoint } from './format.js';
import { taskHeader } from './desmos-core.js';
import { stepHTML, setStep, stepStates } from './steps.js';

const f = (x) => x * x;
const STEPS = [1, 0.5, 0.25, 0.1];   // 點距；最後一步之後畫出連續曲線
const XMAX = 3;

export function mountPlot(root) {
  root.innerHTML = `
    ${taskHeader('任務① 描點畫圖', 'y = x² 的點越來越多時，會連成什麼樣的圖形？', '三 1～3-(2)')}
    <div class="lab">
      <div class="stage" id="plot-stage"></div>
      <div class="panel">
        <p class="hint" style="margin:0">y = x<sup>2</sup>，x 從 −3 到 3，點距 <span class="num" id="plot-step">1</span>，目前有 <span class="num" id="plot-count">7</span> 個點。</p>
        ${stepHTML('pl-s1', 1, '用線段把 7 個點連起來', `
          <p class="hint" style="margin:0 0 .4rem">和學習單上描的點一樣。用線段連起來，看看是什麼形狀。</p>
          <button type="button" class="btn" id="plot-line" aria-pressed="false">用線段連起來</button>`)}
        ${stepHTML('pl-s2', 2, '加更多點，直到變成平滑曲線', `
          <p class="hint" style="margin:0 0 .4rem">每按一次，點距就變小、點變多。連成的線還有折角嗎？</p>
          <div class="row"><button type="button" class="btn primary" id="plot-more">加更多點</button>
          <button type="button" class="btn" id="plot-reset">重來</button></div>`)}
        ${stepHTML('pl-s3', 3, '找出最低點', `
          <p class="hint" style="margin:0">點一下圖形上「最低」的那個點，看它的坐標。</p>`)}
      </div>
    </div>`;

  const plane = new Plane(root.querySelector('#plot-stage'), {
    xmin: -4, xmax: 4, ymin: -1, ymax: 10, unit: 56, label: 'y = x² 的描點圖',
  });

  const st = { level: 0, curve: false, line: false, prev: new Set(), lineTried: false, foundMin: false };

  const points = () => {
    const h = STEPS[Math.min(st.level, STEPS.length - 1)];
    const out = [];
    for (let i = -Math.round(XMAX / h); i <= Math.round(XMAX / h); i++) {
      const x = Math.round(i * h * 1000) / 1000;
      out.push({ x, y: f(x) });
    }
    return out;
  };

  const scene = {
    fn: () => f,
    showCurve: () => st.curve,
    points: () => (st.curve ? [] : points()),
    label: () => 'y = x²',
    pick(m) {
      if (st.curve) {
        const x = Math.round(m.x * 2) / 2;
        const p = { x, y: f(x) };
        return Math.hypot(p.x - m.x, p.y - m.y) < 0.8 ? p : null;
      }
      let best = null, bd = 0.6;
      for (const p of points()) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    pickByX(x) {
      if (st.curve) return { x, y: f(x) };
      return points().find((p) => Math.abs(p.x - x) < 1e-9) || null;
    },
  };

  const $ = (s) => root.querySelector(s);
  let sel = null;

  // 點一下圖形上的點，顯示坐標
  plane.svg.addEventListener('pointerdown', (e) => {
    sel = scene.pick(plane.toMath(e));
    if (sel && st.curve && sel.x === 0) st.foundMin = true;
    drawSel();
    steps();
  });
  function drawSel() {
    plane.clear('marks');
    if (!sel) return;
    if (!st.curve && !points().some((p) => Math.abs(p.x - sel.x) < 1e-9)) { sel = null; return; }
    const u = plane.unit;
    svgEl('circle', { class: 'sel', cx: plane.X(sel.x), cy: plane.Y(sel.y), r: u * 0.2 }, plane.layers.marks);
    const t = svgEl('text', { class: 'lbl', x: plane.X(sel.x) + (sel.x < 0 ? -u * 0.25 : u * 0.25), y: plane.Y(sel.y) - u * 0.25, 'font-size': plane.fontSize, 'text-anchor': sel.x < 0 ? 'end' : 'start' }, plane.layers.marks);
    t.textContent = fmtPoint(sel);
  }

  function draw() {
    plane.clear('curve');
    plane.clear('points');
    const pts = points();
    if (st.curve) {
      svgEl('path', { class: 'curve', d: plane.pathForFn(f) }, plane.layers.curve);
    } else {
      if (st.line) svgEl('path', { class: 'polyline', d: plane.pathForPoints(pts) }, plane.layers.curve);
      const r = plane.unit * (st.level >= 3 ? 0.06 : 0.09);
      for (const p of pts) {
        const key = p.x.toFixed(3);
        svgEl('circle', { class: `pt${st.prev.has(key) ? '' : ' new'}`, cx: plane.X(p.x), cy: plane.Y(p.y), r }, plane.layers.points);
      }
      st.prev = new Set(pts.map((p) => p.x.toFixed(3)));
    }
    $('#plot-step').textContent = st.curve ? '無限小' : fmt(STEPS[st.level]);
    $('#plot-count').textContent = st.curve ? '無限多' : String(pts.length);
    const more = $('#plot-more');
    if (st.curve) { more.textContent = '已完成'; more.disabled = true; }
    else if (st.level === STEPS.length - 1) { more.textContent = '畫出平滑曲線'; more.disabled = false; }
    else { more.textContent = '加更多點'; more.disabled = false; }
    $('#plot-line').disabled = st.curve;
    $('#plot-line').setAttribute('aria-pressed', String(st.line && !st.curve));
    drawSel();
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
    else if (sel && st.curve) { h3 = `${fmtPoint(sel)} 不是最低點，再往下找找看。`; c3 = 'bad'; }
    setStep($('#pl-s3'), s3, h3, c3);
  }

  $('#plot-more').addEventListener('click', () => {
    if (st.level < STEPS.length - 1) st.level++;
    else st.curve = true;
    draw();
  });
  $('#plot-line').addEventListener('click', () => { st.line = !st.line; if (st.line) st.lineTried = true; draw(); });
  $('#plot-reset').addEventListener('click', () => {
    Object.assign(st, { level: 0, curve: false, line: false, prev: new Set(), lineTried: false, foundMin: false });
    sel = null;
    draw();
  });

  draw();
}
