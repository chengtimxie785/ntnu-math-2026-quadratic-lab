// 互動專區②：拉桿實驗室（學習單第四、五部分）
// 拉動 a、k 觀察 y = ax² + k；可保留曲線比較開口大小、用對摺工具找對稱關係

import { Plane, svgEl } from './graph.js';
import { FoldTool } from './fold.js';
import { eqHTML, eqText, fmt, parseNum, approxEq } from './format.js';

// a 不可為 0（否則不是二次函數），所以拉桿跳過 0
const A_VALUES = [-3, -2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3];
const K_MIN = -6, K_MAX = 6;
const PIN_COLORS = ['var(--pin1)', 'var(--pin2)', 'var(--pin3)', 'var(--pin4)'];

export function mountSlider(root) {
  root.innerHTML = `
    <div class="lab">
      <div class="stage" id="sl-stage"></div>
      <div class="panel">
        <div class="card">
          <div class="eq" id="sl-eq"></div>
          <div class="slider-row">
            <label for="sl-a">a</label>
            <input type="range" id="sl-a" min="0" max="${A_VALUES.length - 1}" step="1" aria-describedby="sl-a-note">
            <input class="numbox" id="sl-a-in" inputmode="decimal" aria-label="輸入 a 的值">
          </div>
          <div class="slider-row">
            <label for="sl-k">k</label>
            <input type="range" id="sl-k" min="${K_MIN}" max="${K_MAX}" step="1">
            <input class="numbox" id="sl-k-in" inputmode="decimal" aria-label="輸入 k 的值">
          </div>
          <p class="hint" id="sl-a-note">a 可以輸入分數，例如 1/3。a 不能是 0（想想看為什麼）。</p>
          <div class="msg" id="sl-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="sl-pin">保留這條曲線</button>
            <button type="button" class="btn" id="sl-ref" aria-pressed="true">顯示 y = x² 參考線</button>
            <button type="button" class="btn" id="sl-reset">重設</button>
          </div>
          <div class="chips" id="sl-pins"></div>
        </div>
        <div class="card" id="sl-fold"></div>
      </div>
    </div>`;

  const plane = new Plane(root.querySelector('#sl-stage'), {
    xmin: -5, xmax: 5, ymin: -8, ymax: 8, unit: 48, label: 'y = ax² + k 的圖形',
  });

  const st = { a: 1, k: 0, ref: true, pins: [] };
  const $ = (s) => root.querySelector(s);

  const scene = {
    fn: () => { const { a, k } = st; return (x) => a * x * x + k; },
    showCurve: () => true,
    points: () => [],
    label: () => eqText(st.a, st.k),
    pick(m) {
      const f = scene.fn();
      let best = null, bd = 0.7;
      const base = Math.round(m.x * 2) / 2;
      for (let dx = -2; dx <= 2; dx += 0.5) {
        const x = base + dx;
        const d = Math.hypot(x - m.x, f(x) - m.y);
        if (d < bd) { bd = d; best = { x, y: f(x) }; }
      }
      return best;
    },
    pickByX(x) { return { x, y: scene.fn()(x) }; },
  };

  const fold = new FoldTool(plane, $('#sl-fold'), scene, {
    horizontalHint: '調整 a、k，讓實線和虛線完全重合，看看那是哪一個函數。',
  });

  function draw() {
    const { a, k } = st;
    const f = scene.fn();
    // 參考線與保留的曲線
    plane.clear('ref');
    if (st.ref) svgEl('path', { class: 'ref', d: plane.pathForFn((x) => x * x) }, plane.layers.ref);
    plane.clear('pins');
    st.pins.forEach((p, i) => {
      svgEl('path', { class: 'pin', d: plane.pathForFn((x) => p.a * x * x + p.k), style: `stroke:${PIN_COLORS[i % PIN_COLORS.length]}` }, plane.layers.pins);
    });
    // 目前的曲線與最高（低）點
    plane.clear('curve');
    svgEl('path', { class: 'curve', d: plane.pathForFn(f) }, plane.layers.curve);
    plane.clear('points');
    if (k >= plane.ymin && k <= plane.ymax) {
      svgEl('circle', { class: 'vertex', cx: plane.X(0), cy: plane.Y(k), r: plane.unit * 0.14 }, plane.layers.points);
    }
    // 面板
    $('#sl-eq').innerHTML = eqHTML(a, k);
    const idx = A_VALUES.findIndex((v) => approxEq(v, a));
    const aRange = $('#sl-a');
    aRange.value = idx >= 0 ? idx : nearestIndex(a);
    aRange.setAttribute('aria-valuetext', fmt(a));
    $('#sl-k').value = Math.max(K_MIN, Math.min(K_MAX, Math.round(k)));
    if (document.activeElement !== $('#sl-a-in')) $('#sl-a-in').value = fracStr(a);
    if (document.activeElement !== $('#sl-k-in')) $('#sl-k-in').value = fmt(k);
    $('#sl-ref').setAttribute('aria-pressed', String(st.ref));
    // 保留的曲線清單
    const chips = $('#sl-pins');
    chips.innerHTML = '';
    st.pins.forEach((p, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.style.color = PIN_COLORS[i % PIN_COLORS.length];
      c.innerHTML = `${eqText(p.a, p.k)}<button type="button" aria-label="移除 ${eqText(p.a, p.k)}">×</button>`;
      c.querySelector('button').addEventListener('click', () => { st.pins.splice(i, 1); draw(); });
      chips.appendChild(c);
    });
    $('#sl-pin').disabled = st.pins.length >= 4 || st.pins.some((p) => approxEq(p.a, a) && approxEq(p.k, k));
    fold.render();
  }

  function setMsg(t, cls = '') { const m = $('#sl-msg'); m.textContent = t; m.className = `msg ${cls}`; }

  $('#sl-a').addEventListener('input', (e) => { st.a = A_VALUES[+e.target.value]; setMsg(''); draw(); });
  $('#sl-k').addEventListener('input', (e) => { st.k = +e.target.value; setMsg(''); draw(); });
  $('#sl-a-in').addEventListener('change', (e) => {
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v)) { setMsg('請輸入數字，例如 2、-0.5 或 1/3。', 'bad'); e.target.value = fracStr(st.a); return; }
    if (approxEq(v, 0)) { setMsg('a = 0 時，y = 0·x² + k 化簡後沒有 x² 項，就不是二次函數了！', 'bad'); e.target.value = fracStr(st.a); return; }
    if (Math.abs(v) > 10) { setMsg('a 的絕對值請在 10 以內，圖形才看得清楚。', 'bad'); e.target.value = fracStr(st.a); return; }
    st.a = v; setMsg(''); draw();
  });
  $('#sl-k-in').addEventListener('change', (e) => {
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v) || Math.abs(v) > 7) { setMsg('k 請輸入 −7 到 7 之間的數。', 'bad'); e.target.value = fmt(st.k); return; }
    st.k = v; setMsg(''); draw();
  });
  for (const id of ['#sl-a-in', '#sl-k-in']) {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }
  $('#sl-pin').addEventListener('click', () => { st.pins.push({ a: st.a, k: st.k }); draw(); });
  $('#sl-ref').addEventListener('click', () => { st.ref = !st.ref; draw(); });
  $('#sl-reset').addEventListener('click', () => {
    Object.assign(st, { a: 1, k: 0, ref: true, pins: [] });
    fold.clearAll(); setMsg(''); draw();
  });

  draw();
}

function nearestIndex(a) {
  let bi = 0;
  A_VALUES.forEach((v, i) => { if (Math.abs(v - a) < Math.abs(A_VALUES[bi] - a)) bi = i; });
  return bi;
}

function fracStr(v) {
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v * d - n) < 1e-9) return (d === 1 ? String(n) : `${n}/${d}`).replace('-', '−');
  }
  return fmt(v);
}
