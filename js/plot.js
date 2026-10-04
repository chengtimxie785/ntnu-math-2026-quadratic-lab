// 互動專區①：描點變曲線（學習單第三部分）
// 對應課本 p.10～12：先描 7 個整數點，再逐步加密，最後連成平滑曲線

import { Plane, svgEl } from './graph.js';
import { FoldTool } from './fold.js';
import { fmt } from './format.js';

const f = (x) => x * x;
const STEPS = [1, 0.5, 0.25, 0.1];   // 點距；最後一步之後畫出連續曲線
const XMAX = 3;

export function mountPlot(root) {
  root.innerHTML = `
    <div class="lab">
      <div class="stage" id="plot-stage"></div>
      <div class="panel">
        <div class="card">
          <div class="eq">y = x<sup>2</sup></div>
          <p class="hint">x 從 −3 到 3，點距 <span class="num" id="plot-step">1</span>，目前有 <span class="num" id="plot-count">7</span> 個點。</p>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn primary" id="plot-more">加更多點</button>
            <button type="button" class="btn" id="plot-line" aria-pressed="false">用線段連起來</button>
            <button type="button" class="btn" id="plot-reset">重來</button>
          </div>
          <div class="msg" id="plot-msg" aria-live="polite"></div>
        </div>
        <div class="card" id="plot-fold"></div>
      </div>
    </div>`;

  const plane = new Plane(root.querySelector('#plot-stage'), {
    xmin: -4, xmax: 4, ymin: -1, ymax: 10, unit: 56, label: 'y = x² 的描點圖',
  });

  const st = { level: 0, curve: false, line: false, prev: new Set() };

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

  const fold = new FoldTool(plane, root.querySelector('#plot-fold'), scene);
  const $ = (s) => root.querySelector(s);

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
    const msg = $('#plot-msg');
    if (st.curve) msg.textContent = '點多到數不完時，就連成一條平滑的曲線，這就是 y = x² 的圖形。';
    else if (st.line && st.level === 0) msg.textContent = '只有 7 個點時，用線段連起來會有明顯的折角。點變多之後會怎樣呢？';
    else msg.textContent = '';
    fold.render();
  }

  $('#plot-more').addEventListener('click', () => {
    if (st.level < STEPS.length - 1) st.level++;
    else st.curve = true;
    draw();
  });
  $('#plot-line').addEventListener('click', () => { st.line = !st.line; draw(); });
  $('#plot-reset').addEventListener('click', () => {
    Object.assign(st, { level: 0, curve: false, line: false, prev: new Set() });
    fold.clearAll();
    draw();
  });

  draw();
}
